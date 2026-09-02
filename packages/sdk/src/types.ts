import type { Acr } from '@identizen/protocol';

export interface IdentizenConfig {
  /** Index / OIDC issuer URL, e.g. https://index.identizen.com */
  indexUrl: string;
  /** Site client id (idz_live_… / idz_test_…). */
  clientId: string;
  /** Browser pairing on first login (default true). `false` opts out. */
  pairing?: boolean;
  /** Injectable transports for tests and non-browser hosts. */
  transports?: Partial<Transports>;
}

export interface Transports {
  fetch: typeof fetch;
  WebSocket: typeof WebSocket | null;
  /** `navigator.bluetooth` or null when unavailable. */
  bluetooth: Bluetooth | null;
  /** Where the browser key and pairing id live. */
  storage: PairingStorage;
  /** User agent, for the deep-link-on-mobile decision. */
  userAgent: string;
  /** WebCrypto for the browser key. */
  crypto: Crypto;
}

export interface StoredPairing {
  pairing_id: string;
  device_id: string;
  issued_at: number;
}

export interface PairingStorage {
  getKey(): Promise<CryptoKeyPair | null>;
  setKey(key: CryptoKeyPair): Promise<void>;
  getPairing(): Promise<StoredPairing | null>;
  setPairing(p: StoredPairing | null): Promise<void>;
}

export interface StartLoginOptions {
  /** OIDC redirect_uri registered for the site. When set, approval yields a `redirect` URL with `code` and `state`. */
  redirectUri?: string;
  state?: string;
  nonce?: string;
  /** PKCE S256 code challenge (the verifier stays with the caller / server). */
  codeChallenge?: string;
  scope?: string;
  acr?: Acr;
  /** Step-up / repeat login: the bound per-site sub. Pushes straight to the phone. */
  loginHint?: string;
  prompt?: 'enroll' | 'login';
  /** Shown on the phone and bound into the assertion (transaction signing). ≤ 140 chars. */
  reason?: string;
  /** Override discovery for this call. */
  discovery?: Partial<DiscoveryOptions>;
}

export interface DiscoveryOptions {
  paired: boolean;
  bluetooth: boolean;
}

export type LoginStatus =
  | 'starting'
  | 'discovering'
  | 'waiting'
  | 'approved'
  | 'denied'
  | 'expired'
  | 'error'
  | 'cancelled';

export type DiscoveryMethod = 'paired' | 'bluetooth' | 'qr' | 'deeplink' | 'push';

export interface LoginState {
  status: LoginStatus;
  challengeId: string;
  /** 2-digit match code, shown to the user. */
  code: string;
  /** Deep link (`https://app.identizen.com/l/<id>`). Same content as the QR. */
  deepLink: string;
  /** Inline SVG of the deep link. */
  qrSvg: string;
  expiresAt: number;
  /** How the phone was reached, once known. */
  method: DiscoveryMethod | null;
  /** True on mobile: the caller should navigate to `deepLink`. */
  useDeepLink: boolean;
  /** Set when approved and an OIDC redirect_uri was given. */
  redirect: string | null;
  /** Set on `error`. */
  error: { code: string; message: string } | null;
}

export interface LoginSession {
  readonly state: LoginState;
  /** Subscribe to state changes; returns an unsubscribe. The callback fires immediately with the current state. */
  subscribe(cb: (state: LoginState) => void): () => void;
  /** Resolves with the terminal state (approved / denied / expired / error / cancelled). */
  readonly done: Promise<LoginState>;
  cancel(): void;
}
