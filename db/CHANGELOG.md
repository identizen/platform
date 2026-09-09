# @identizen/db

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
