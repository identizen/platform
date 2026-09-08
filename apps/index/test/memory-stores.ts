import { sha256, toBase64Url, utf8Encode, type SignedChallenge } from '@identizen/protocol';
import { CODE_TTL_MS, type StoredSession } from '../src/do/challenge-session';
import { GuardState, type GuardRecord } from '../src/do/guard-state';
import type { ChallengeStore, GuardStore, Stores } from '../src/stores';

/**
 * A `Stores` over two Maps: what a host without Durable Objects would write over its database,
 * reduced to a test double. It honors the semantics documented on `ChallengeStore` and
 * `GuardStore` (lazy expiry, single-use codes, the guard's sliding windows via `GuardState`)
 * and never touches a Durable Object namespace.
 */
export class MemoryStores implements Stores {
  readonly sessions = new Map<string, StoredSession>();
  readonly guards = new Map<string, GuardRecord>();

  challenge(name: string): ChallengeStore {
    return new MemoryChallengeStore(this.sessions, name);
  }

  guard(name: string): GuardStore {
    return new GuardState({
      get: (key) => Promise.resolve(this.guards.get(`${name}:${key}`)),
      put: (key, value) => {
        this.guards.set(`${name}:${key}`, value);
        return Promise.resolve();
      },
      delete: (key) => {
        this.guards.delete(`${name}:${key}`);
        return Promise.resolve();
      },
    });
  }
}

class MemoryChallengeStore implements ChallengeStore {
  constructor(
    private readonly sessions: Map<string, StoredSession>,
    private readonly name: string,
  ) {}

  private load(): StoredSession | null {
    const s = this.sessions.get(this.name) ?? null;
    if (!s) return null;
    // Lazy expiry: what the Durable Object alarm does at `exp`.
    if (s.status === 'pending' && Date.now() >= s.signed.payload.exp * 1000) {
      s.status = 'expired';
      s.resolvedAt = Date.now();
    }
    if (s.resolvedAt !== null && Date.now() - s.resolvedAt >= CODE_TTL_MS) {
      this.sessions.delete(this.name);
      return null;
    }
    return s;
  }

  private require(): StoredSession {
    const s = this.load();
    if (!s) throw new Error('unknown session');
    return s;
  }

  private publicState(s: StoredSession) {
    const { signed: _signed, ...rest } = s;
    return rest;
  }

  create(init: Parameters<ChallengeStore['create']>[0]) {
    if (this.load()) throw new Error('session already exists');
    const stored: StoredSession = {
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
    this.sessions.set(this.name, stored);
    return Promise.resolve(this.publicState(stored));
  }

  getSigned(): Promise<SignedChallenge | null> {
    return Promise.resolve(this.load()?.signed ?? null);
  }

  getState() {
    const s = this.load();
    return Promise.resolve(s ? this.publicState(s) : null);
  }

  setBrowserPubkey(key: string, browser: Parameters<ChallengeStore['setBrowserPubkey']>[1]) {
    const s = this.require();
    if (s.status !== 'pending' || s.browserPubkey) return Promise.resolve(false);
    s.browserPubkey = key;
    s.browser = browser ?? null;
    return Promise.resolve(true);
  }

  setTargetDevice(deviceId: string, idz: string) {
    const s = this.require();
    if (s.status !== 'pending') return Promise.resolve('not_pending' as const);
    if (s.expectedIdz !== null) {
      if (idz !== s.expectedIdz) return Promise.resolve('wrong_identity' as const);
    } else if (s.targetDeviceId !== null && s.targetDeviceId !== deviceId) {
      return Promise.resolve('already_targeted' as const);
    }
    s.targetDeviceId = deviceId;
    return Promise.resolve('ok' as const);
  }

  approve(...[assertion, pairing, code, redirect]: Parameters<ChallengeStore['approve']>) {
    const s = this.require();
    if (s.status !== 'pending') throw new Error(`session is ${s.status}`);
    Object.assign(s, { status: 'approved', assertion, pairing, code, redirect });
    s.resolvedAt = Date.now();
    return Promise.resolve(this.publicState(s));
  }

  deny() {
    const s = this.require();
    if (s.status !== 'pending') throw new Error(`session is ${s.status}`);
    s.status = 'denied';
    s.resolvedAt = Date.now();
    return Promise.resolve(this.publicState(s));
  }

  redeemCode(input: Parameters<ChallengeStore['redeemCode']>[0]) {
    const s = this.load();
    const fail = (error: 'invalid_grant' | 'invalid_request', description: string) =>
      Promise.resolve({ ok: false as const, error, description });
    const invalid = 'code is invalid, expired, or already used';
    if (!s || s.code === null || s.code !== input.code || !s.oidc)
      return fail('invalid_grant', invalid);
    if (s.codeUsed)
      return Promise.resolve({
        ok: false as const,
        error: 'invalid_grant' as const,
        description: invalid,
        reusedSid: s.sid ?? null,
      });
    if (s.status !== 'approved' || !s.assertion) return fail('invalid_grant', invalid);
    if (s.resolvedAt !== null && input.now - s.resolvedAt > CODE_TTL_MS)
      return fail('invalid_grant', 'code has expired');
    if (s.clientId !== input.clientId)
      return fail('invalid_grant', 'code was issued to another client');
    if (s.oidc.redirect_uri !== undefined && input.redirectUri !== s.oidc.redirect_uri)
      return fail('invalid_grant', 'redirect_uri does not match the authorization request');
    if (s.oidc.code_challenge !== undefined) {
      if (input.codeVerifier === undefined)
        return fail('invalid_request', 'code_verifier is required');
      if (toBase64Url(sha256(utf8Encode(input.codeVerifier))) !== s.oidc.code_challenge)
        return fail('invalid_grant', 'PKCE verification failed');
    } else if (input.codeVerifier !== undefined) {
      return fail('invalid_grant', 'code was issued without PKCE');
    }
    s.codeUsed = true;
    return Promise.resolve({ ok: true as const, state: this.publicState(s) });
  }

  markExchanged(sid: string): Promise<void> {
    const s = this.load();
    if (s) s.sid = sid;
    return Promise.resolve();
  }

  /** No socket bridge: the login page falls back to polling `/challenge/:id/state`. */
  websocket(): Promise<Response> {
    return Promise.resolve(new Response('no websocket bridge; poll /state', { status: 426 }));
  }
}
