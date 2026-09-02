/** The dashboard session: an OIDC access token plus the verified-by-index id_token claims. */

export interface SessionClaims {
  sub: string;
  sid: string;
  acr: string;
  amr: string[];
  idz_handle?: string;
}

export interface DashboardSession {
  accessToken: string;
  /** Unix seconds. */
  expiresAt: number;
  claims: SessionClaims;
}

const KEY = 'idz:session';
const listeners = new Set<() => void>();

export function getSession(): DashboardSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as DashboardSession;
    if (!s.accessToken || s.expiresAt * 1000 < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

export function setSession(session: DashboardSession | null): void {
  try {
    if (session) sessionStorage.setItem(KEY, JSON.stringify(session));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
  for (const l of listeners) l();
}

export function clearSession(): void {
  setSession(null);
}

/** For useSyncExternalStore. */
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

export function sessionSnapshot(): string {
  try {
    return sessionStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}
