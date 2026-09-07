# @identizen/index

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
