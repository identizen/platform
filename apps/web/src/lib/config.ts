/** Runtime configuration: index URL and this dashboard's OIDC public client id. */

const CLIENT_ID_KEY = 'idz:dashboard-client-id';

export const INDEX_URL: string = (
  (import.meta.env.VITE_IDENTIZEN_INDEX_URL as string | undefined) ?? 'http://localhost:8787'
).replace(/\/+$/, '');

export const MOCK_MODE: boolean = import.meta.env.VITE_IDENTIZEN_MOCK === '1';

export function appOrigin(): string {
  return typeof location === 'undefined' ? 'http://localhost:4300' : location.origin;
}

export function redirectUri(): string {
  return `${appOrigin()}/callback`;
}

interface RegisteredSite {
  client_id: string;
}

/**
 * Resolve the client id: env first, then a cached self-registration (dev), else register
 * this origin as a public PKCE client with the index and cache the result.
 */
export async function resolveClientId(
  fetchImpl: typeof fetch = (i, init) => fetch(i, init),
): Promise<string> {
  const fromEnv = import.meta.env.VITE_IDENTIZEN_CLIENT_ID as string | undefined;
  if (fromEnv) return fromEnv;
  const cached = safeGet(CLIENT_ID_KEY);
  if (cached) return cached;
  const host = typeof location === 'undefined' ? 'localhost' : location.hostname;
  const res = await fetchImpl(`${INDEX_URL}/sites`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Identizen Dashboard',
      rp_id: host,
      redirect_uris: [redirectUri()],
      public: true,
      environment: 'test',
    }),
  });
  if (!res.ok)
    throw new Error(`could not register the dashboard with ${INDEX_URL} (${res.status})`);
  const site = (await res.json()) as RegisteredSite;
  safeSet(CLIENT_ID_KEY, site.client_id);
  return site.client_id;
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}
