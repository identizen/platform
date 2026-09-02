import type { Session } from '@identizen/db';
import type { Env } from '../env';
import type { Services } from '../lib/services';
import { sendLogoutTokens } from '../oidc/backchannel';

/**
 * OIDC Back-Channel Logout dispatcher. Posts a signed logout token to each site's
 * `backchannel_logout_uri` for every revoked session. The OP signing keys arrive in M4;
 * until then this records intent and returns.
 */
export async function backchannelLogout(
  services: Services,
  env: Env,
  sessions: Session[],
): Promise<void> {
  if (!env.OIDC_SIGNING_KEYS) {
    console.info(`backchannel logout pending OIDC keys for ${sessions.length} session(s)`);
    return;
  }
  await sendLogoutTokens(services, env, sessions);
}
