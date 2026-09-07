---
title: Embedding the index
description: Build on @identizen/index instead of forking it. Per-request bindings for multi-tenant hosts, policy hooks, extra routes, and host migrations.
---

The hosted index and a self-hosted one are the same Worker: `createApp()` with no options. A host
that needs more, an organisation running several tenants or a product that adds its own policy,
embeds the index as a library and keeps every route, check and protocol behaviour it ships with.

```bash
npm install @identizen/index @identizen/db hono
```

```ts
// src/index.ts of your Worker
import { createApp, ChallengeSession, RequestGuard, type Env } from '@identizen/index';

export { ChallengeSession, RequestGuard }; // the two Durable Objects; bind them in wrangler.jsonc

const app = createApp({
  resolveEnv,
  hooks: { onChallengeStart, onTokenClaims },
  extend: (app) => app.get('/orgs/ping', (c) => c.text('pong')),
});

export default {
  fetch: (req: Request, env: Env, ctx: ExecutionContext) => app.fetch(req, env, ctx),
};
```

Nothing changes without options: an embedded index with none behaves exactly like the hosted one
and passes the same conformance suite.

## Per-request bindings (`resolveEnv`)

`resolveEnv(request, env)` returns the bindings the rest of the request uses. A multi-tenant host
maps the `Host` header to the tenant's issuer URL, signing keys, database and `TENANT_KEY`, and
throws an `ApiError` (404 `tenant_not_found`) for a hostname it does not serve. The database
still comes from the `HYPERDRIVE` binding's connection string; a host with one database per
tenant supplies an object with a `connectionString` for that tenant.

`TENANT_KEY` namespaces every Durable Object name and rate-limit bucket, so two tenants that
share a Worker never share a challenge session, a request guard or a quota.

## Policy hooks

Every hook runs inside the request that triggers it and receives the request's `services` (the
database, the index keys, the push sender). Throwing an `ApiError` refuses that request with the
error's status and code, which is how a policy says no; the refusal is audited like any other
denial.

| Hook               | Runs                                                        | Typical use                                   |
| ------------------ | ----------------------------------------------------------- | --------------------------------------------- |
| `onChallengeStart` | before a challenge is created, with the site and the target | workforce-only sites, login windows           |
| `onAssert`         | after the assertion verified, before approval               | attestation or device-policy checks           |
| `onEnroll`         | before a device (and possibly its identity) is written      | closed enrolment, org-issued enrolment tokens |
| `onSessionCreate`  | before the OIDC session row at code exchange                | session limits per site or org                |
| `onTokenClaims`    | for the id_token and `/userinfo`                            | `idz_role` and other org claims               |

Extra claims from `onTokenClaims` never override the standard ones: `sub`, `sid`, `amr`, `acr`,
`auth_time`, `idz_device`, `idz_handle`, `idz_org` and `at_hash` are always the index's.

## Extra routes (`extend`)

`extend(app)` receives the Hono app after the built-in routers are mounted. Routes you add see
the same `services` (`c.get('services')`) and can reuse the exported middleware: `meAuth` for a
dashboard bearer or a signed device request, `deviceAuth` for the phone, `ipRateLimit` for
public endpoints.

## Host migrations

`@identizen/db` applies migrations from several folders in one run, ordered by their journal
timestamp:

```ts
import { createDb, migrateDb, resolveMigrationsDir } from '@identizen/db';

const { db, close } = createDb(connectionString);
await migrateDb(db, [resolveMigrationsDir(), './migrations']);
await close();
```

Keep host tables in your own folder; never edit the index's. Audit events accept host kinds
(`org.member_invited`, for example) next to the built-in ones.

## What a host cannot do

Nothing here hands a host a private key or lets it sign for a person. Hooks can refuse; they
cannot approve. The index still stores public keys, push tokens, revocation state and audit
events, and nothing that could produce an assertion.
