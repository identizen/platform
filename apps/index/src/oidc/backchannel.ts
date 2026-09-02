import type { Session } from '@identizen/db';
import type { Env } from '../env';
import type { Services } from '../lib/services';

/** Implemented in M4 (OIDC provider): signs and POSTs logout tokens. */
export function sendLogoutTokens(
  _services: Services,
  _env: Env,
  sessions: Session[],
): Promise<void> {
  console.info(`sendLogoutTokens: ${sessions.length} session(s) (M4)`);
  return Promise.resolve();
}
