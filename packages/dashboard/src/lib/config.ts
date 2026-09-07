/** Runtime configuration: index URL and this dashboard's OIDC public client id. */

/** Values an HTML shell can set before the bundle runs, so one build serves many hosts. */
export interface RuntimeConfig {
  indexUrl?: string;
  clientId?: string;
}

declare global {
  interface Window {
    __IDZ_CONFIG__?: RuntimeConfig;
  }
}

const CLIENT_ID_KEY = 'idz:dashboard-client-id';
const LOCAL_INDEX_URL = 'http://localhost:8787';

function runtimeConfig(): RuntimeConfig {
  return typeof window === 'undefined' ? {} : (window.__IDZ_CONFIG__ ?? {});
}

function viteEnv(name: string): string | undefined {
  // Vite (and Vitest) replace `import.meta.env`; other bundlers may leave it undefined.
  const env = import.meta.env as Record<string, unknown> | undefined;
  const value = env?.[name];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** `<tenant>.app.<domain>` names the tenant's index `<tenant>.index.<domain>`; anything else, null. */
export function indexUrlFromHost(hostname: string): string | null {
  const m = /^([a-z0-9-]+)\.app\.([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/i.exec(hostname);
  return m ? `https://${m[1]}.index.${m[2]}` : null;
}

export interface IndexUrlSources {
  /** `window.__IDZ_CONFIG__.indexUrl` */
  runtime?: string | undefined;
  /** `VITE_IDENTIZEN_INDEX_URL` */
  env?: string | undefined;
  /** `location.hostname` */
  hostname?: string | undefined;
}

/** Resolution order: runtime config, build-time env, tenant host rule, local dev index. */
export function resolveIndexUrl(sources: IndexUrlSources): string {
  const fromHost = sources.hostname ? indexUrlFromHost(sources.hostname) : null;
  const url = sources.runtime ?? sources.env ?? fromHost ?? LOCAL_INDEX_URL;
  return url.replace(/\/+$/, '');
}

export const INDEX_URL: string = resolveIndexUrl({
  runtime: runtimeConfig().indexUrl,
  env: viteEnv('VITE_IDENTIZEN_INDEX_URL'),
  hostname: typeof location === 'undefined' ? undefined : location.hostname,
});

export const MOCK_MODE: boolean = viteEnv('VITE_IDENTIZEN_MOCK') === '1';

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
 * Resolve the client id: runtime config, then env, then a cached self-registration (dev), else
 * register this origin as a public PKCE client with the index and cache the result.
 */
export async function resolveClientId(
  fetchImpl: typeof fetch = (i, init) => fetch(i, init),
): Promise<string> {
  const fromRuntime = runtimeConfig().clientId;
  if (fromRuntime) return fromRuntime;
  const fromEnv = viteEnv('VITE_IDENTIZEN_CLIENT_ID');
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
