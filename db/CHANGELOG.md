# @identizen/db

## 0.5.0

### Minor Changes

- d54c84e: Retention and deletion: `purgeSessions`, `purgeVerifications`, `purgeAuditEvents`, `purgeStalePendingSites`; `deleteIdentityData` (everything about an identity in one transaction, returning its live sessions) and `identity_tombstones` (migration 0006) with `getTombstone`.

## 0.4.0

### Minor Changes

- 246bcc9: `deliveries` table (migration 0005) and queries: the outbox for webhooks and back-channel logout tokens, with `claimDueDeliveries` (leased, `FOR UPDATE SKIP LOCKED`), `recordDeliveryAttempt`, `listDeliveriesForSite` and `purgeDeliveries`; audit kind `delivery.failed`.

## 0.3.0

### Minor Changes

- bbd3a20: Header and request-cost hardening from the 2026-09-08 review (F08, F09, F11).

  - Every response carries `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` and, over https, HSTS; the hosted login page gets a per-response nonce CSP and the root page a static one.
  - CORS is per route: the login, discovery and token endpoints still answer any origin, while `/me/*` answers only `APP_URL`'s origin and the new `CORS_ALLOWED_ORIGINS` list. A host whose dashboard lives on another origin must list it.
  - Signed request bodies are capped at 64 KiB (`readBodyCapped`, `413 payload_too_large`) and any declared body over 1 MiB is refused before a route runs.
  - `X-Forwarded-For` is believed only with `TRUST_PROXY_HEADERS=true` (`clientIp`); `/discover/ble` scans at most `BLE_LOOKUP_LIMIT` recently seen advertisers, served by the partial index in `@identizen/db` migration 0004.
  - The Worker compatibility date moves to 2026-09-01.

## 0.2.0

### Minor Changes

- e53dcbb: Migration 0003 makes `devices.device_pubkey` unique (duplicates from concurrent enrollment are tombstoned first: revoked, key replaced by the md5 of the row id, sessions and pairings ended). New `enrollDevice` inserts idempotently on that index and returns the existing row on conflict; `createSessionForActiveDevice` inserts a session inside a transaction that share-locks the device row and checks it is active; `IdentityExistsError` replaces the misleading `HandleTakenError` when the identity's own row already exists (F02, F04, 2026-09-08 review).

## 0.1.0

### Minor Changes

- 59f9011: The index, the schema package and the design system are published so a host can embed the
  index instead of forking it. `createApp(options)` gains `resolveEnv` (per-request bindings, for
  multi-tenant hosts), `extend` (extra routers) and `hooks` (challenge start, assertion,
  enrollment, session creation, token claims). `TENANT_KEY` namespaces Durable Object names and
  rate-limit buckets. `migrateDb` accepts several migration folders and orders them by journal
  time. Audit kinds accept host-registered values. Without options nothing changes.
