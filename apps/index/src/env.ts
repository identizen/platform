import type { ChallengeSession } from './do/challenge-session';
import type { RequestGuard } from './do/request-guard';

/** Worker bindings and configuration. Secrets come from `wrangler secret` / `.dev.vars`. */
export interface Env {
  /** Public issuer URL of this index, e.g. https://index.identizen.com */
  INDEX_URL: string;
  /** Public URL of the web app (deep links), e.g. https://app.identizen.com */
  APP_URL: string;
  /** Hex-encoded 32-byte Ed25519 private key that signs challenges and pairings. */
  INDEX_SIGNING_KEY: string;
  /** JSON array of OIDC signing keys (JWK, private). Two active keys for rotation. Set in M4. */
  OIDC_SIGNING_KEYS?: string;
  /** noop | fcm | apns | web */
  PUSH_PROVIDER?: string;
  /** "true" allows unauthenticated POST /sites (dev / self-host). Otherwise SITE_REGISTRATION_TOKEN is required. */
  OPEN_SITE_REGISTRATION?: string;
  SITE_REGISTRATION_TOKEN?: string;
  /** Comma-separated client ids allowed to call /me with a bearer token; "*" allows any (dev only). */
  DASHBOARD_CLIENT_IDS?: string;
  /** Push provider credentials (optional). */
  APNS_KEY_ID?: string;
  APNS_TEAM_ID?: string;
  APNS_PRIVATE_KEY?: string;
  APNS_TOPIC?: string;
  APNS_SANDBOX?: string;
  FCM_PROJECT_ID?: string;
  FCM_SERVICE_ACCOUNT?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;

  HYPERDRIVE: Hyperdrive;
  CHALLENGE_SESSION: DurableObjectNamespace<ChallengeSession>;
  REQUEST_GUARD: DurableObjectNamespace<RequestGuard>;
}
