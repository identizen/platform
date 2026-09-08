# @identizen/index

## 0.4.1

### Patch Changes

- The `stores` factory receives the request database (`(env, db) => Stores`) so a database-backed store shares the request pool and is closed with the request.

## 0.4.0

### Minor Changes

- `createApp({ stores })` makes the in-flight state pluggable. `Stores` resolves a `ChallengeStore`
  (one login's session) and a `GuardStore` (one device's replay guard, rate limits and inbox) by
  name; the default, `defaultStores(env)`, is the two Durable Objects, and every route now goes
  through `services.stores` instead of the `CHALLENGE_SESSION` and `REQUEST_GUARD` bindings. A
  host running the index without Durable Objects (several replicas over one database) supplies its
  own stores and the bindings are never read. The interfaces document the alarm semantics an
  implementation must honour (expiry at `exp`, code retention, replay and rate windows, inbox
  draining); `GuardState`, `GuardStorage`, `GuardRecord`, the session types (`StoredSession`,
  `SessionInit`, `SessionState`, `RedeemCodeInput`, `RedeemCodeResult`, `BrowserMeta`,
  `OidcParams`), `CODE_TTL_MS` and `expireVerification` are exported so a database-backed store can
  reuse the reference logic. `checkClientRate` and `createPushSender` take the request's stores.
  Without the option nothing changes.

## 0.3.0

### Minor Changes

- ec00d81: `hooks.onSessionCreate` may return `{ ttlSeconds }` to shorten a session (never beyond the index default), so an embedder can enforce an organisation's session maximum age.

## 0.2.0

### Minor Changes

- 6eca6c8: `SITE_VERIFICATION_EXEMPT_HOSTS` lists a host's own hostnames (its dashboard, its admin portal) that never need domain verification; `fireBackchannelLogout`, `verificationRequired`, `verificationStatus` and `exemptHosts` are exported for embedders.

## 0.1.0

### Minor Changes

- 59f9011: The index, the schema package and the design system are published so a host can embed the
  index instead of forking it. `createApp(options)` gains `resolveEnv` (per-request bindings, for
  multi-tenant hosts), `extend` (extra routers) and `hooks` (challenge start, assertion,
  enrolment, session creation, token claims). `TENANT_KEY` namespaces Durable Object names and
  rate-limit buckets. `migrateDb` accepts several migration folders and orders them by journal
  time. Audit kinds accept host-registered values. Without options nothing changes.

### Patch Changes

- Updated dependencies [59f9011]
  - @identizen/db@0.1.0
