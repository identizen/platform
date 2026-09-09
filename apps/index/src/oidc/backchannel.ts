/**
 * OpenID Connect Back-Channel Logout 1.0 sender. Since the outbox (services/deliveries.ts) the
 * logout token is queued per revoked session, sent once right away and retried by the scheduled
 * sweep; this module keeps the historical import path.
 */
export { sendLogoutTokens } from '../services/deliveries';
