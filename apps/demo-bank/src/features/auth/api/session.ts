/**
 * The bank's session: what the id_token said about the customer. In a real bank this lives in
 * an httpOnly cookie set by the server; this demo has no server, so it lives in sessionStorage.
 */

export interface SessionClaims {
  /** Stable per-site identifier. The only thing Identizen tells a site about a person. */
  sub: string;
  /** Identizen session id, the handle for back-channel logout. */
  sid: string;
  /** 'idz:login', or 'idz:mfa' after a step-up. */
  acr: string;
  /** How the phone authenticated the person: ['face', 'hwk'] and the like. */
  amr: string[];
  idz_handle?: string;
}

export interface BankSession {
  accessToken: string;
  /** Unix seconds. */
  expiresAt: number;
  claims: SessionClaims;
}

const KEY = 'jtm:session';
const listeners = new Set<() => void>();

export function getSession(): BankSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as BankSession;
    if (!s.accessToken || s.expiresAt * 1000 < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

export function setSession(session: BankSession | null): void {
  try {
    if (session) sessionStorage.setItem(KEY, JSON.stringify(session));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
  for (const l of listeners) l();
}

export function subscribeSession(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) cb();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}

/** Stable snapshot for useSyncExternalStore. */
export function sessionSnapshot(): string {
  try {
    return sessionStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}
