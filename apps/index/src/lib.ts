/**
 * @identizen/index as a library. The hosted Worker (src/index.ts) is `createApp()` with no
 * options; a host that embeds the index builds it with options and re-exports the two Durable
 * Object classes from its own Worker entry. Docs: "Embedding the index".
 */
export { createApp, type AppEnv, type AppVariables } from './app';
export type { Env } from './env';
export {
  defaultHooks,
  type AppOptions,
  type AssertContext,
  type ChallengeStartContext,
  type EnrollContext,
  type IndexHooks,
  type SessionCreateContext,
  type TokenClaimsContext,
} from './hooks';
export { ChallengeSession } from './do/challenge-session';
export { RequestGuard } from './do/request-guard';
export {
  ApiError,
  badRequest,
  conflict,
  errorToResponse,
  forbidden,
  gone,
  notFound,
  tooMany,
  unauthorized,
} from './lib/errors';
export type { Services } from './lib/services';
export { nsName } from './lib/names';
export { bearer, hashSecret, randomToken, safeEqual } from './lib/util';
export {
  DestinationBlockedError,
  destinationProblem,
  fetchOutbound,
  outboundPolicy,
  type OutboundPolicy,
} from './lib/outbound';
export {
  meAuth,
  type MeAuthOptions,
  type Principal,
  type PrincipalVariables,
} from './middleware/principal';
export {
  deviceAuth,
  type DeviceAuthOptions,
  type DeviceAuthVariables,
} from './middleware/idz-signature';
export { checkClientRate, ipRateLimit, limits } from './middleware/rate-limit';
export { OIDC_ALG, loadKeyring, publicJwks, type OidcKey, type OidcKeyring } from './oidc/keys';
export { verifyAccessToken } from './oidc/tokens';
export { pairwiseDeviceId } from './oidc/pairwise';
export {
  DNS_RECORD_PREFIX,
  VERIFICATION_TTL_MS,
  WELL_KNOWN_PATH,
  checkVerification,
  lookupTxt,
  recordMatches,
  verificationInstructions,
  zoneCandidates,
  type VerificationCheck,
  type VerificationInstructions,
} from './services/site-verification';
export { backchannelLogout } from './services/backchannel';
export { fireBackchannelLogout } from './services/sessions';
export {
  exemptHosts,
  verificationRequired,
  verificationStatus,
  type VerificationEnv,
} from './services/site-verification';
