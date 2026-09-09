# @identizen/index

## 0.5.0

### Minor Changes

- e53dcbb: Approval side effects can no longer outrun a denial, a revocation cannot race session issuance, and a device key is enrolled once even under concurrent registration (F02–F04, 2026-09-08 review).

  - `ChallengeStore` gains `reserve()` and `release()`: the assertion route claims the session before writing the binding, pairing and success audit, `deny()` throws `ReservedError` (`isReservedError`) while the claim is held and the route answers `409 approval_in_progress`, expiry waits `RESERVE_GRACE_MS`, and a failed write releases the claim and revokes a pairing already written. A host that supplies its own stores must implement both methods.
  - `/token` inserts the session with `createSessionForActiveDevice`; `/userinfo` and `/me/*` refuse a bearer whose device is no longer active.
  - `POST /devices` uses `enrollDevice`, so the second of two racing registrations gets the first one's row (`200`) instead of a duplicate; migration 0003 in `@identizen/db` must be applied.

### Patch Changes

- Updated dependencies [e53dcbb]
  - @identizen/db@0.2.0

## 0.4.4

### Patch Changes

- 15c9d2f: Domain verification is decided by the host alone. An `idz_test_` client for a real host must prove the domain like a live one, and test registrations that were auto-passed before now read as `pending` until they verify (F01, 2026-09-08 review).

## 0.4.3

### Patch Changes

- f065934: US English everywhere: error descriptions, OpenAPI descriptions, user-facing copy, README and doc comments now use US spellings (enroll, organization, license, canceled, behavior). Error codes, JSON fields and the SDK's `'cancelled'` session status are unchanged.

## 0.4.2

### Patch Changes

- Push payloads carry `index` and the `/l/<id>` deep links carry `?index=`, so a phone registered on several indexes knows which one issued a challenge. Older phones ignore both.

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
  implementation must honor (expiry at `exp`, code retention, replay and rate windows, inbox
  draining); `GuardState`, `GuardStorage`, `GuardRecord`, the session types (`StoredSession`,
  `SessionInit`, `SessionState`, `RedeemCodeInput`, `RedeemCodeResult`, `BrowserMeta`,
  `OidcParams`), `CODE_TTL_MS` and `expireVerification` are exported so a database-backed store can
  reuse the reference logic. `checkClientRate` and `createPushSender` take the request's stores.
  Without the option nothing changes.

## 0.3.0

### Minor Changes

- ec00d81: `hooks.onSessionCreate` may return `{ ttlSeconds }` to shorten a session (never beyond the index default), so an embedder can enforce an organization's session maximum age.

## 0.2.0

### Minor Changes

- 6eca6c8: `SITE_VERIFICATION_EXEMPT_HOSTS` lists a host's own hostnames (its dashboard, its admin portal) that never need domain verification; `fireBackchannelLogout`, `verificationRequired`, `verificationStatus` and `exemptHosts` are exported for embedders.

## 0.1.0

### Minor Changes

- 59f9011: The index, the schema package and the design system are published so a host can embed the
  index instead of forking it. `createApp(options)` gains `resolveEnv` (per-request bindings, for
  multi-tenant hosts), `extend` (extra routers) and `hooks` (challenge start, assertion,
  enrollment, session creation, token claims). `TENANT_KEY` namespaces Durable Object names and
  rate-limit buckets. `migrateDb` accepts several migration folders and orders them by journal
  time. Audit kinds accept host-registered values. Without options nothing changes.

### Patch Changes

- Updated dependencies [59f9011]
  - @identizen/db@0.1.0
