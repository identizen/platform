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
  /** noop, or anything else to enable real senders (web inbox, Expo relay, APNs/FCM when configured). */
  PUSH_PROVIDER?: string;
  /**
   * Optional Expo access token (https://expo.dev/settings/access-tokens) sent as a bearer to the
   * Expo push service. Expo push tokens (`ExponentPushToken[...]`) are relayed there regardless
   * of the platform they were registered under.
   */
  EXPO_ACCESS_TOKEN?: string;
  /** "true" allows unauthenticated POST /sites (dev / self-host). Otherwise SITE_REGISTRATION_TOKEN is required. */
  OPEN_SITE_REGISTRATION?: string;
  /**
   * "true" lets confidential clients (those with a client_secret) omit PKCE on /authorize, which
   * the OpenID Foundation's Basic OP conformance plan needs (it predates PKCE). Public clients
   * always need S256. Leave unset on any index that serves real sites; the hosted index never sets it.
   */
  OIDC_PKCE_OPTIONAL?: string;
  SITE_REGISTRATION_TOKEN?: string;
  /**
   * "required" (default): a live site must prove control of its rp_id (DNS TXT or the
   * well-known file, PROTOCOL.md §8.2) before it can start logins; re-checked every 30 days.
   * "off": local development and the test suites, where hosts cannot be verified.
   */
  SITE_VERIFICATION?: string;
  /**
   * Comma-separated rp_ids that never need verification: a host's own surfaces (its dashboard
   * and admin portal hostnames), which it controls by construction. Anything else on the list
   * would be a hole, so hosts list exactly their own hostnames.
   */
  SITE_VERIFICATION_EXEMPT_HOSTS?: string;
  /**
   * "true" lets the index send webhooks, logout tokens and web pushes to plain-http, loopback,
   * private and link-local destinations. Local development and the test suites only; the
   * hosted index never sets it and a self-hosted index next to internal services must not.
   */
  OUTBOUND_ALLOW_LOCAL?: string;
  /** Per-minute abuse limits (M10.2); defaults in middleware/rate-limit.ts. */
  RATE_LIMIT_CHALLENGES_PER_CLIENT?: string;
  RATE_LIMIT_REQUESTS_PER_IP?: string;
  /**
   * "true" when a reverse proxy the operator controls sits in front of the index and sets
   * `X-Forwarded-For`; only then is that header believed for rate limits and pairing records.
   * On Cloudflare the edge's `CF-Connecting-IP` is used and this is unnecessary (F09).
   */
  TRUST_PROXY_HEADERS?: string;
  /**
   * How many active BLE-advertising devices, most recently seen first, a `/discover/ble` lookup
   * scans (default 5000): the work one public request can cause is bounded, and a phone that
   * has not been seen in longer than that falls back to the QR or the deep link (F09).
   */
  BLE_LOOKUP_LIMIT?: string;
  /**
   * Comma-separated web origins allowed to call the bearer-authenticated `/me/*` routes from a
   * browser, in addition to `APP_URL`'s origin. Everything else is refused CORS there; the
   * public login endpoints keep answering any origin, as OIDC public clients need (F08).
   */
  CORS_ALLOWED_ORIGINS?: string;
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

  /**
   * Optional namespace for Durable Object names and rate-limit buckets. Unset on a
   * single-tenant index. A multi-tenant host sets it per request via createApp({ resolveEnv })
   * so tenants never share a challenge session, a request guard or a bucket.
   */
  TENANT_KEY?: string;

  HYPERDRIVE: Hyperdrive;
  CHALLENGE_SESSION: DurableObjectNamespace<ChallengeSession>;
  REQUEST_GUARD: DurableObjectNamespace<RequestGuard>;
}
