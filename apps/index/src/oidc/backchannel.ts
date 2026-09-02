import { getSite, listBindingsForIdentity, type Session } from '@identizen/db';
import type { Env } from '../env';
import type { Services } from '../lib/services';
import { loadKeyring } from './keys';
import { mintLogoutToken } from './tokens';

const RETRY_DELAYS_MS = [0, 500, 2000];

/**
 * OpenID Connect Back-Channel Logout 1.0: POST `logout_token=<jwt>` (form-encoded) to each
 * site's `backchannel_logout_uri`, once per revoked session, with retries.
 */
export async function sendLogoutTokens(
  services: Services,
  env: Env,
  sessions: Session[],
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (sessions.length === 0) return;
  const ring = await loadKeyring(env);
  await Promise.all(
    sessions.map(async (session) => {
      const site = await getSite(services.db, session.clientId);
      if (!site?.backchannelLogoutUri) return;
      const token = await mintLogoutToken(ring, {
        issuer: services.indexUrl,
        clientId: site.clientId,
        sub: await subForSession(services, session),
        sid: session.sid,
        now: services.now(),
      });
      await postWithRetry(fetchImpl, site.backchannelLogoutUri, token);
    }),
  );
}

/** Sessions store idz, not the per-site sub; recover it from the binding for the site. */
async function subForSession(services: Services, session: Session): Promise<string> {
  const site = await getSite(services.db, session.clientId);
  const bindings = await listBindingsForIdentity(services.db, session.idz);
  return bindings.find((b) => b.rpId === site?.rpId)?.sub ?? session.idz;
}

async function postWithRetry(
  fetchImpl: typeof fetch,
  url: string,
  token: string,
): Promise<boolean> {
  for (const delay of RETRY_DELAYS_MS) {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'cache-control': 'no-store',
        },
        body: new URLSearchParams({ logout_token: token }),
      });
      if (res.ok) return true;
      if (res.status >= 400 && res.status < 500 && res.status !== 429) return false;
    } catch {
      /* retry */
    }
  }
  return false;
}
