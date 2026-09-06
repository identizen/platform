import { DurableObject } from 'cloudflare:workers';
import {
  CHALLENGE_TTL_SECONDS,
  sha256,
  toBase64Url,
  utf8Encode,
  type Acr,
  type Assertion,
  type SignedChallenge,
  type SignedPairing,
} from '@identizen/protocol';
import type { Env } from '../env';
import { expireVerification } from '../services/verification';

export type SessionStatus = 'pending' | 'approved' | 'denied' | 'expired';

/** An authorization code can be redeemed this long after approval, then it is gone. */
export const CODE_TTL_MS = CHALLENGE_TTL_SECONDS * 1000 * 5;

/** OIDC authorization request parameters carried through the session (used by M4). */
export interface OidcParams {
  client_id: string;
  redirect_uri?: string;
  state?: string;
  nonce?: string;
  code_challenge?: string;
  code_challenge_method?: 'S256';
  scope?: string;
  prompt?: string;
  login_hint?: string;
}

export interface SessionInit {
  signed: SignedChallenge;
  clientId: string;
  /** Device targeted by push (paired / MFA), if known at creation. */
  targetDeviceId?: string | null;
  /**
   * The identity and per-site sub this challenge was issued for (step-up, Verification API).
   * Immutable: only a device of this identity may approve or deny it, and the assertion's sub
   * must be this one. Null for an untargeted login, where whoever scans the QR is the person.
   */
  expectedIdz?: string | null;
  expectedSub?: string | null;
  /** Browser P-256 public key (base64url raw) for pairing on approval. */
  browserPubkey?: string | null;
  /** The browser that supplied the key (its User-Agent and IP), for the pairing record. */
  browser?: BrowserMeta | null;
  oidc?: OidcParams | null;
  /** Verification API id when created by /v1/verify. */
  verificationId?: string | null;
}

export interface BrowserMeta {
  ua: string | null;
  ip: string | null;
}

export interface SessionState {
  status: SessionStatus;
  challengeId: string;
  clientId: string;
  acr: Acr;
  targetDeviceId: string | null;
  /** See SessionInit: the principal this challenge is for, fixed at creation. */
  expectedIdz: string | null;
  expectedSub: string | null;
  browserPubkey: string | null;
  browser: BrowserMeta | null;
  oidc: OidcParams | null;
  verificationId: string | null;
  assertion: Assertion | null;
  pairing: SignedPairing | null;
  /** OIDC authorization code, once issued (M4). */
  code: string | null;
  /** Redirect for the waiting browser after approval (code + state), or null. */
  redirect: string | null;
  codeUsed: boolean;
  /** Session (sid) the code was exchanged for, so a reuse of the code can revoke it. */
  sid?: string | null;
  resolvedAt: number | null;
}

interface Stored extends SessionState {
  signed: SignedChallenge;
}

export interface RedeemCodeInput {
  code: string;
  clientId: string;
  /** The site's redirect URIs as registered now. */
  registeredRedirectUris: string[];
  redirectUri: string | undefined;
  codeVerifier: string | undefined;
  /** Milliseconds since the epoch. */
  now: number;
}

export type RedeemCodeResult =
  | { ok: true; state: SessionState }
  | {
      ok: false;
      error: 'invalid_grant' | 'invalid_request';
      description: string;
      /** Set when the code had already been exchanged: the session that exchange created. */
      reusedSid?: string | null;
    };

export type SessionEvent =
  | {
      type: 'approved';
      challenge_id: string;
      pairing: SignedPairing | null;
      redirect: string | null;
    }
  | { type: 'denied'; challenge_id: string }
  | { type: 'expired'; challenge_id: string };

/**
 * One in-flight login. Holds the signed challenge for ~60 s, bridges the waiting browser
 * (WebSocket, hibernatable) and the phone (assertion via the Worker), and expires via alarm.
 * Nothing persists beyond the login.
 */
export class ChallengeSession extends DurableObject<Env> {
  private cache: Stored | null = null;

  async create(init: SessionInit): Promise<SessionState> {
    const existing = await this.load();
    if (existing) throw new Error('session already exists');
    const stored: Stored = {
      status: 'pending',
      challengeId: init.signed.payload.id,
      clientId: init.clientId,
      acr: init.signed.payload.acr,
      targetDeviceId: init.targetDeviceId ?? null,
      expectedIdz: init.expectedIdz ?? null,
      expectedSub: init.expectedSub ?? null,
      browserPubkey: init.browserPubkey ?? null,
      browser: init.browserPubkey ? (init.browser ?? null) : null,
      oidc: init.oidc ?? null,
      verificationId: init.verificationId ?? null,
      assertion: null,
      pairing: null,
      code: null,
      redirect: null,
      codeUsed: false,
      sid: null,
      resolvedAt: null,
      signed: init.signed,
    };
    await this.save(stored);
    await this.ctx.storage.setAlarm(init.signed.payload.exp * 1000);
    return this.publicState(stored);
  }

  async getSigned(): Promise<SignedChallenge | null> {
    const s = await this.load();
    return s?.signed ?? null;
  }

  async getState(): Promise<SessionState | null> {
    const s = await this.load();
    return s ? this.publicState(s) : null;
  }

  /** The hosted page registers its P-256 key after render; only while pending and unset. */
  async setBrowserPubkey(key: string, browser: BrowserMeta | null = null): Promise<boolean> {
    const s = await this.require();
    if (s.status !== 'pending' || s.browserPubkey) return false;
    s.browserPubkey = key;
    s.browser = browser;
    await this.save(s);
    return true;
  }

  /**
   * Record the device a push went to (BLE / paired discovery after creation). A challenge
   * issued for an identity can only be routed to that identity's devices; an untargeted
   * challenge is routed once, to the first device that discovers it.
   */
  async setTargetDevice(
    deviceId: string,
    idz: string,
  ): Promise<'ok' | 'not_pending' | 'wrong_identity' | 'already_targeted'> {
    const s = await this.require();
    if (s.status !== 'pending') return 'not_pending';
    if (s.expectedIdz !== null) {
      if (idz !== s.expectedIdz) return 'wrong_identity';
    } else if (s.targetDeviceId !== null && s.targetDeviceId !== deviceId) {
      return 'already_targeted';
    }
    s.targetDeviceId = deviceId;
    await this.save(s);
    return 'ok';
  }

  async approve(
    assertion: Assertion,
    pairing: SignedPairing | null,
    code: string | null,
    redirect: string | null,
  ): Promise<SessionState> {
    const s = await this.require();
    if (s.status !== 'pending') throw new Error(`session is ${s.status}`);
    s.status = 'approved';
    s.assertion = assertion;
    s.pairing = pairing;
    s.code = code;
    s.redirect = redirect;
    s.resolvedAt = Date.now();
    await this.save(s);
    this.broadcast({ type: 'approved', challenge_id: s.challengeId, pairing, redirect });
    return this.publicState(s);
  }

  async deny(): Promise<SessionState> {
    const s = await this.require();
    if (s.status !== 'pending') throw new Error(`session is ${s.status}`);
    s.status = 'denied';
    s.resolvedAt = Date.now();
    await this.save(s);
    this.broadcast({ type: 'denied', challenge_id: s.challengeId });
    return this.publicState(s);
  }

  /**
   * Redeem the OIDC authorization code exactly once (RFC 6749 §4.1.3, RFC 7636 §4.6). Every
   * check runs here, against the authoritative copy of the request, before the code is marked
   * used: a wrong verifier or redirect does not burn the code, and a second presentation of a
   * code that was exchanged reports the session it produced so the caller can revoke it.
   */
  async redeemCode(input: RedeemCodeInput): Promise<RedeemCodeResult> {
    const s = await this.load();
    const fail = (error: 'invalid_grant' | 'invalid_request', description: string) => ({
      ok: false as const,
      error,
      description,
    });
    if (!s || s.code === null || s.code !== input.code || !s.oidc) {
      return fail('invalid_grant', 'code is invalid, expired, or already used');
    }
    if (s.codeUsed) {
      return {
        ...fail('invalid_grant', 'code is invalid, expired, or already used'),
        reusedSid: s.sid ?? null,
      };
    }
    if (s.status !== 'approved' || !s.assertion) {
      return fail('invalid_grant', 'code is invalid, expired, or already used');
    }
    if (s.resolvedAt !== null && input.now - s.resolvedAt > CODE_TTL_MS) {
      return fail('invalid_grant', 'code has expired');
    }
    if (s.clientId !== input.clientId) {
      return fail('invalid_grant', 'code was issued to another client');
    }
    // Defence in depth: the redirect must still be one the site registered, and the one the
    // authorization request used.
    if (
      s.oidc.redirect_uri !== undefined &&
      !input.registeredRedirectUris.includes(s.oidc.redirect_uri)
    ) {
      return fail('invalid_grant', 'redirect_uri is no longer registered for this client');
    }
    if (s.oidc.redirect_uri !== undefined && input.redirectUri !== s.oidc.redirect_uri) {
      return fail('invalid_grant', 'redirect_uri does not match the authorization request');
    }
    // RFC 7636 §4.6: a code issued against a code_challenge needs the matching verifier. A code
    // issued without one (only possible with OIDC_PKCE_OPTIONAL) must not be exchanged with one.
    if (s.oidc.code_challenge !== undefined) {
      if (input.codeVerifier === undefined)
        return fail('invalid_request', 'code_verifier is required');
      if (toBase64Url(sha256(utf8Encode(input.codeVerifier))) !== s.oidc.code_challenge)
        return fail('invalid_grant', 'PKCE verification failed');
    } else if (input.codeVerifier !== undefined) {
      return fail('invalid_grant', 'code was issued without PKCE');
    }
    s.codeUsed = true;
    await this.save(s);
    return { ok: true, state: this.publicState(s) };
  }

  /** Record the session the code was exchanged for (see `exchangedSessionFor`). */
  async markExchanged(sid: string): Promise<void> {
    const s = await this.load();
    if (!s) return;
    s.sid = sid;
    await this.save(s);
  }

  override async alarm(): Promise<void> {
    const s = await this.load();
    if (!s) return;
    if (s.status === 'pending') {
      s.status = 'expired';
      s.resolvedAt = Date.now();
      await this.save(s);
      this.broadcast({ type: 'expired', challenge_id: s.challengeId });
      if (s.verificationId) await expireVerification(this.env, s.verificationId);
    }
    // Keep resolved sessions briefly so /token (M4) and pollers can read them, then wipe.
    const age = Date.now() - (s.resolvedAt ?? Date.now());
    if (age >= CHALLENGE_TTL_SECONDS * 1000 * 5) {
      await this.ctx.storage.deleteAll();
      this.cache = null;
    } else {
      await this.ctx.storage.setAlarm(Date.now() + CHALLENGE_TTL_SECONDS * 1000 * 5);
    }
  }

  /** WebSocket upgrade for the waiting browser: `GET /challenge/:id/ws`. */
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    const s = await this.load();
    if (!s) return new Response('unknown challenge', { status: 404 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    // Late joiner: replay the terminal state immediately.
    if (s.status !== 'pending') {
      server.send(JSON.stringify(this.terminalEvent(s)));
    } else {
      server.send(
        JSON.stringify({ type: 'pending', challenge_id: s.challengeId, exp: s.signed.payload.exp }),
      );
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  override webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    if (message === 'ping') ws.send('pong');
  }

  override webSocketClose(ws: WebSocket): void {
    try {
      ws.close();
    } catch {
      /* already closed */
    }
  }

  private broadcast(event: SessionEvent): void {
    const data = JSON.stringify(event);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(data);
        ws.close(1000, event.type);
      } catch {
        /* socket already gone */
      }
    }
  }

  private terminalEvent(s: Stored): SessionEvent {
    if (s.status === 'approved') {
      return {
        type: 'approved',
        challenge_id: s.challengeId,
        pairing: s.pairing,
        redirect: s.redirect,
      };
    }
    if (s.status === 'denied') return { type: 'denied', challenge_id: s.challengeId };
    return { type: 'expired', challenge_id: s.challengeId };
  }

  private async load(): Promise<Stored | null> {
    if (this.cache) return this.cache;
    const s = await this.ctx.storage.get<Stored>('session');
    if (s) {
      // Sessions stored before these fields existed.
      s.expectedIdz ??= null;
      s.expectedSub ??= null;
    }
    this.cache = s ?? null;
    return this.cache;
  }

  private async require(): Promise<Stored> {
    const s = await this.load();
    if (!s) throw new Error('unknown session');
    return s;
  }

  private async save(s: Stored): Promise<void> {
    await this.ctx.storage.put('session', s);
    this.cache = s;
  }

  private publicState(s: Stored): SessionState {
    const { signed: _signed, ...rest } = s;
    return rest;
  }
}
