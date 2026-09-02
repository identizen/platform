import { pairedSignatureBytes } from '@identizen/protocol';
import { readRotatingIdViaBluetooth } from './ble.js';
import { IdentizenError, errorFromResponse } from './errors.js';
import { qrSvg } from './qr.js';
import { browserStorage } from './storage.js';
import type {
  DiscoveryOptions,
  IdentizenConfig,
  LoginSession,
  LoginState,
  StartLoginOptions,
  StoredPairing,
  Transports,
} from './types.js';

const MOBILE_UA = /Android|iPhone|iPad|iPod/i;

interface StartResponse {
  challenge_id: string;
  code: string;
  exp: number;
  acr: string;
  rp_name: string;
  deep_link: string;
  ws_url: string;
  pushed: boolean;
}

interface WsEvent {
  type: 'pending' | 'approved' | 'denied' | 'expired';
  challenge_id: string;
  pairing?: { payload: StoredPairing } | null;
  redirect?: string | null;
}

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The browser-side Identizen client. Create one per site; call `startLogin` per attempt. */
export class Identizen {
  readonly indexUrl: string;
  readonly clientId: string;
  readonly pairingEnabled: boolean;
  private readonly t: Transports;

  constructor(config: IdentizenConfig) {
    if (!config.indexUrl) throw new IdentizenError('config_index_url', 'indexUrl is required');
    if (!config.clientId) throw new IdentizenError('config_client_id', 'clientId is required');
    this.indexUrl = config.indexUrl.replace(/\/+$/, '');
    this.clientId = config.clientId;
    this.pairingEnabled = config.pairing ?? true;
    const g = globalThis as typeof globalThis & {
      navigator?: Navigator & { bluetooth?: Bluetooth };
    };
    this.t = {
      fetch: config.transports?.fetch ?? ((input, init) => fetch(input, init)),
      WebSocket:
        config.transports?.WebSocket ?? (typeof WebSocket === 'undefined' ? null : WebSocket),
      bluetooth: config.transports?.bluetooth ?? g.navigator?.bluetooth ?? null,
      storage:
        config.transports?.storage ??
        (typeof indexedDB === 'undefined' ? memoryFallback() : browserStorage()),
      userAgent: config.transports?.userAgent ?? g.navigator?.userAgent ?? '',
      crypto: config.transports?.crypto ?? crypto,
    };
  }

  /** Start a login. Discovery order: paired browser -> Web Bluetooth -> QR; deep link on mobile. */
  startLogin(options: StartLoginOptions = {}): LoginSession {
    const listeners = new Set<(s: LoginState) => void>();
    let resolveDone: (s: LoginState) => void = () => undefined;
    const done = new Promise<LoginState>((r) => (resolveDone = r));
    let ws: WebSocket | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const state: LoginState = {
      status: 'starting',
      challengeId: '',
      code: '',
      deepLink: '',
      qrSvg: '',
      expiresAt: 0,
      method: null,
      useDeepLink: MOBILE_UA.test(this.t.userAgent),
      redirect: null,
      error: null,
    };
    const emit = () => {
      for (const l of listeners) l({ ...state });
    };
    const finish = (status: LoginState['status'], patch: Partial<LoginState> = {}) => {
      if (isTerminal(state.status)) return;
      Object.assign(state, patch, { status });
      cleanup();
      emit();
      resolveDone({ ...state });
    };
    const fail = (err: unknown) => {
      const e =
        err instanceof IdentizenError
          ? err
          : new IdentizenError('unexpected', String(err), { cause: err });
      finish('error', { error: { code: e.code, message: e.message } });
    };
    const cleanup = () => {
      if (ws) {
        try {
          ws.close();
        } catch {
          /* closed */
        }
        ws = null;
      }
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = null;
    };

    const session: LoginSession = {
      get state() {
        return { ...state };
      },
      subscribe: (cb) => {
        listeners.add(cb);
        cb({ ...state });
        return () => listeners.delete(cb);
      },
      done,
      cancel: () => {
        cancelled = true;
        finish('cancelled');
      },
    };

    void this.run(
      options,
      state,
      emit,
      finish,
      fail,
      (socket) => (ws = socket),
      (timer) => (pollTimer = timer),
      () => cancelled,
    );
    return session;
  }

  /** Path B enrollment: same as a login with `prompt=enroll`; the site stores the resulting sub. */
  enroll(options: Omit<StartLoginOptions, 'prompt'> = {}): LoginSession {
    return this.startLogin({ ...options, prompt: 'enroll' });
  }

  /** Path B step-up: pushes straight to the device bound to `sub`. */
  stepUp(sub: string, options: Omit<StartLoginOptions, 'acr' | 'loginHint'> = {}): LoginSession {
    return this.startLogin({ ...options, acr: 'idz:mfa', loginHint: sub });
  }

  /** Forget this browser's pairing (the phone keeps its record until revoked there). */
  async unpair(): Promise<void> {
    await this.t.storage.setPairing(null);
  }

  private async run(
    options: StartLoginOptions,
    state: LoginState,
    emit: () => void,
    finish: (status: LoginState['status'], patch?: Partial<LoginState>) => void,
    fail: (err: unknown) => void,
    setWs: (ws: WebSocket) => void,
    setTimer: (t: ReturnType<typeof setTimeout>) => void,
    isCancelled: () => boolean,
  ): Promise<void> {
    try {
      const discovery: DiscoveryOptions = {
        paired: this.pairingEnabled,
        bluetooth: true,
        ...options.discovery,
      };
      const pairing = discovery.paired ? await this.t.storage.getPairing() : null;
      const wantsPairing = this.pairingEnabled && !pairing && !options.loginHint;
      const browserPubkey = wantsPairing ? await this.browserPublicKey() : null;

      const res = await this.t.fetch(`${this.indexUrl}/challenge`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: this.clientId,
          acr: options.acr ?? 'idz:login',
          ...(options.reason !== undefined && { reason: options.reason }),
          ...(options.loginHint !== undefined && { login_hint: options.loginHint }),
          ...(browserPubkey !== null && { browser_pubkey: browserPubkey }),
          ...(options.redirectUri !== undefined && { redirect_uri: options.redirectUri }),
          ...(options.state !== undefined && { state: options.state }),
          ...(options.nonce !== undefined && { nonce: options.nonce }),
          ...(options.codeChallenge !== undefined && {
            code_challenge: options.codeChallenge,
            code_challenge_method: 'S256',
          }),
          ...(options.scope !== undefined && { scope: options.scope }),
          ...(options.prompt !== undefined && { prompt: options.prompt }),
        }),
      });
      if (!res.ok) throw await errorFromResponse(res, 'challenge_failed');
      const started = (await res.json()) as StartResponse;
      if (isCancelled()) return;

      Object.assign(state, {
        status: 'discovering',
        challengeId: started.challenge_id,
        code: started.code,
        deepLink: started.deep_link,
        qrSvg: qrSvg(started.deep_link),
        expiresAt: started.exp,
        method: started.pushed ? 'push' : null,
      });
      emit();

      // Listen first so an early approval is never missed.
      this.listen(started, state, emit, finish, fail, setWs, setTimer, isCancelled);

      if (!started.pushed) {
        if (pairing && (await this.tryPaired(started.challenge_id, pairing))) {
          state.method = 'paired';
        } else if (state.useDeepLink) {
          state.method = 'deeplink';
        } else if (
          discovery.bluetooth &&
          this.t.bluetooth &&
          (await this.tryBluetooth(started.challenge_id))
        ) {
          state.method = 'bluetooth';
        } else {
          state.method = 'qr';
        }
      }
      if (isCancelled()) return;
      state.status = 'waiting';
      emit();
    } catch (err) {
      fail(err);
    }
  }

  private listen(
    started: StartResponse,
    state: LoginState,
    emit: () => void,
    finish: (status: LoginState['status'], patch?: Partial<LoginState>) => void,
    fail: (err: unknown) => void,
    setWs: (ws: WebSocket) => void,
    setTimer: (t: ReturnType<typeof setTimeout>) => void,
    isCancelled: () => boolean,
  ): void {
    const onEvent = (ev: WsEvent) => {
      if (ev.type === 'approved') {
        if (ev.pairing?.payload && this.pairingEnabled)
          void this.t.storage.setPairing(ev.pairing.payload);
        finish('approved', { redirect: ev.redirect ?? null });
      } else if (ev.type === 'denied') finish('denied');
      else if (ev.type === 'expired') finish('expired');
    };
    const poll = async () => {
      if (isCancelled() || isTerminal(state.status)) return;
      try {
        const res = await this.t.fetch(`${this.indexUrl}/challenge/${started.challenge_id}/state`, {
          cache: 'no-store',
        });
        if (res.status === 404) return finish('expired');
        const s = (await res.json()) as {
          status: string;
          pairing?: { payload: StoredPairing } | null;
          redirect?: string | null;
        };
        if (s.status === 'approved')
          onEvent({
            type: 'approved',
            challenge_id: started.challenge_id,
            pairing: s.pairing ?? null,
            redirect: s.redirect ?? null,
          });
        else if (s.status === 'denied' || s.status === 'expired')
          onEvent({ type: s.status, challenge_id: started.challenge_id });
        else setTimer(setTimeout(() => void poll(), 1500));
      } catch (err) {
        if (Date.now() / 1000 > started.exp + 5) fail(err);
        else setTimer(setTimeout(() => void poll(), 2500));
      }
    };

    const WS = this.t.WebSocket;
    if (WS) {
      try {
        const ws = new WS(started.ws_url);
        setWs(ws);
        ws.onmessage = (m: MessageEvent) => {
          try {
            onEvent(JSON.parse(String(m.data)) as WsEvent);
          } catch {
            /* ignore non-JSON frames */
          }
        };
        ws.onerror = () => void poll();
        ws.onclose = () => {
          if (!isTerminal(state.status)) setTimer(setTimeout(() => void poll(), 500));
        };
        return;
      } catch {
        /* fall through to polling */
      }
    }
    void poll();
    emit();
  }

  private async tryPaired(challengeId: string, pairing: StoredPairing): Promise<boolean> {
    const key = await this.t.storage.getKey();
    if (!key) return false;
    try {
      const sig = new Uint8Array(
        await this.t.crypto.subtle.sign(
          { name: 'ECDSA', hash: 'SHA-256' },
          key.privateKey,
          new Uint8Array(pairedSignatureBytes(challengeId)),
        ),
      );
      const res = await this.t.fetch(`${this.indexUrl}/discover/paired`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          challenge_id: challengeId,
          pairing_id: pairing.pairing_id,
          sig: b64url(sig),
        }),
      });
      if (res.status === 202) return true;
      if (res.status === 401) await this.t.storage.setPairing(null);
      return false;
    } catch {
      return false;
    }
  }

  private async tryBluetooth(challengeId: string): Promise<boolean> {
    if (!this.t.bluetooth) return false;
    const rotatingId = await readRotatingIdViaBluetooth(this.t.bluetooth);
    if (!rotatingId) return false;
    try {
      const res = await this.t.fetch(`${this.indexUrl}/discover/ble`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ challenge_id: challengeId, rotating_id: rotatingId }),
      });
      return res.status === 202;
    } catch {
      return false;
    }
  }

  private async browserPublicKey(): Promise<string | null> {
    try {
      let key = await this.t.storage.getKey();
      if (!key) {
        key = await this.t.crypto.subtle.generateKey(
          { name: 'ECDSA', namedCurve: 'P-256' },
          false,
          ['sign', 'verify'],
        );
        await this.t.storage.setKey(key);
      }
      const raw = new Uint8Array(await this.t.crypto.subtle.exportKey('raw', key.publicKey));
      return b64url(raw);
    } catch {
      return null;
    }
  }
}

function isTerminal(status: LoginState['status']): boolean {
  return (
    status === 'approved' ||
    status === 'denied' ||
    status === 'expired' ||
    status === 'error' ||
    status === 'cancelled'
  );
}

function memoryFallback() {
  let key: CryptoKeyPair | null = null;
  let pairing: StoredPairing | null = null;
  return {
    getKey: () => Promise.resolve(key),
    setKey: (k: CryptoKeyPair) => {
      key = k;
      return Promise.resolve();
    },
    getPairing: () => Promise.resolve(pairing),
    setPairing: (p: StoredPairing | null) => {
      pairing = p;
      return Promise.resolve();
    },
  };
}

/** Convenience factory. */
export function createIdentizen(config: IdentizenConfig): Identizen {
  return new Identizen(config);
}
