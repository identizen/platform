import { DurableObject } from 'cloudflare:workers';
import {
  CHALLENGE_TTL_SECONDS,
  type Acr,
  type Assertion,
  type SignedChallenge,
  type SignedPairing,
} from '@identizen/protocol';
import type { Env } from '../env';
import { expireVerification } from '../services/verification';

export type SessionStatus = 'pending' | 'approved' | 'denied' | 'expired';

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
  /** Browser P-256 public key (base64url raw) for pairing on approval. */
  browserPubkey?: string | null;
  oidc?: OidcParams | null;
  /** Verification API id when created by /v1/verify. */
  verificationId?: string | null;
}

export interface SessionState {
  status: SessionStatus;
  challengeId: string;
  clientId: string;
  acr: Acr;
  targetDeviceId: string | null;
  browserPubkey: string | null;
  oidc: OidcParams | null;
  verificationId: string | null;
  assertion: Assertion | null;
  pairing: SignedPairing | null;
  /** OIDC authorization code, once issued (M4). */
  code: string | null;
  /** Redirect for the waiting browser after approval (code + state), or null. */
  redirect: string | null;
  codeUsed: boolean;
  resolvedAt: number | null;
}

interface Stored extends SessionState {
  signed: SignedChallenge;
}

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
      browserPubkey: init.browserPubkey ?? null,
      oidc: init.oidc ?? null,
      verificationId: init.verificationId ?? null,
      assertion: null,
      pairing: null,
      code: null,
      redirect: null,
      codeUsed: false,
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
  async setBrowserPubkey(key: string): Promise<boolean> {
    const s = await this.require();
    if (s.status !== 'pending' || s.browserPubkey) return false;
    s.browserPubkey = key;
    await this.save(s);
    return true;
  }

  /** Record the device a push went to (BLE / paired discovery after creation). */
  async setTargetDevice(deviceId: string): Promise<void> {
    const s = await this.require();
    s.targetDeviceId = deviceId;
    await this.save(s);
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

  /** Redeem the OIDC authorization code exactly once (M4). */
  async redeemCode(code: string, clientId: string): Promise<SessionState | null> {
    const s = await this.load();
    if (!s || s.status !== 'approved' || s.code === null || s.codeUsed || s.code !== code)
      return null;
    if (s.clientId !== clientId) return null;
    s.codeUsed = true;
    await this.save(s);
    return this.publicState(s);
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
