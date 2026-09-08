---
title: Embedding the index
description: Build on @identizen/index instead of forking it. Per-request bindings for multi-tenant hosts, policy hooks, extra routes, and host migrations.
---

The hosted index and a self-hosted one are the same Worker: `createApp()` with no options. A host
that needs more, an organization running several tenants or a product that adds its own policy,
embeds the index as a library and keeps every route, check and protocol behavior it ships with.

```bash
npm install @identizen/index @identizen/db hono
```

```ts
// src/index.ts of your Worker
import { ApiError, ChallengeSession, RequestGuard, createApp, forbidden } from '@identizen/index';

export { ChallengeSession, RequestGuard }; // the two Durable Objects; bind them in wrangler.jsonc

const app = createApp({
  // One Worker, one issuer per hostname.
  resolveEnv: (request, env) => {
    const host = new URL(request.url).hostname;
    const tenant = host.split('.')[0] ?? '';
    if (!host.endsWith('.index.example.com') || tenant === '')
      throw new ApiError(404, 'tenant_not_found', 'no such tenant');
    return { ...env, INDEX_URL: `https://${host}`, TENANT_KEY: tenant };
  },
  hooks: {
    onChallengeStart: ({ site }) => {
      if (site.rpId === 'payroll.example.com')
        throw forbidden('workforce_only', 'this site only accepts org identities');
    },
    onTokenClaims: () => ({ idz_role: 'member' }),
  },
  extend: (app) => app.get('/orgs/ping', (c) => c.text('pong')),
});

export default app;
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

| Hook               | Runs                                                        | Typical use                                     |
| ------------------ | ----------------------------------------------------------- | ----------------------------------------------- |
| `onChallengeStart` | before a challenge is created, with the site and the target | workforce-only sites, login windows             |
| `onAssert`         | after the assertion verified, before approval               | attestation or device-policy checks             |
| `onEnroll`         | before a device (and possibly its identity) is written      | closed enrollment, org-issued enrollment tokens |
| `onSessionCreate`  | before the OIDC session row at code exchange                | session limits per site or org                  |
| `onTokenClaims`    | for the id_token and `/userinfo`                            | `idz_role` and other org claims                 |

Extra claims from `onTokenClaims` never override the standard ones: `sub`, `sid`, `amr`, `acr`,
`auth_time`, `idz_device`, `idz_handle`, `idz_org` and `at_hash` are always the index's.

## Extra routes (`extend`)

`extend(app)` receives the Hono app after the built-in routers are mounted. Routes you add see
the same `services` (`c.get('services')`) and can reuse the exported middleware: `meAuth` for a
dashboard bearer or a signed device request, `deviceAuth` for the phone, `ipRateLimit` for
public endpoints.

## Stores (`stores`)

The index keeps two things outside Postgres while a login is in flight: the challenge session
(the signed challenge and its state until it is approved, denied or expired) and the request
guard (a device's replay window, rate limits and challenge inbox; also the per-client and per-IP
rate buckets). On Cloudflare those are the `ChallengeSession` and `RequestGuard` Durable Objects,
and `createApp()` uses them through `defaultStores(env)`. A host that runs the index where
Durable Objects do not exist, several replicas on-prem over one database for example, passes
`stores` and the two bindings are never read:

```ts
import { createApp, type ChallengeStore, type GuardStore, type Stores } from '@identizen/index';

declare function postgresChallengeStore(name: string): ChallengeStore;
declare function postgresGuardStore(name: string): GuardStore;

const stores: Stores = {
  challenge: (name) => postgresChallengeStore(name),
  guard: (name) => postgresGuardStore(name),
};

export const app = createApp({ stores: () => stores });
```

`stores(env)` is called once per request with the resolved bindings and returns a `Stores`:
`challenge(name)` and `guard(name)` take names that are already namespaced with `TENANT_KEY`
(`nsName`), so a multi-tenant host keeps its isolation. `ChallengeStore` has the session's
methods (`create`, `getState`, `approve`, `redeemCode`, `websocket`, …) and `GuardStore` the
guard's (`check`, `allowPush`, `allowRate`, `enqueue`, `drain`); their doc comments spell out
what the Durable Object alarms do today and an implementation must reproduce: expiry at the
challenge's `exp`, keeping a resolved session for `CODE_TTL_MS`, the two-minute replay window,
per-minute rate windows, and an inbox that drains atomically. A store without a WebSocket bridge
returns `426` from `websocket` and the login page polls `/challenge/:id/state` instead.

`GuardState` is exported and reusable as is: give it a `GuardStorage` over your database and every
`GuardStore` method is one call on it. For sessions, `StoredSession` is the persisted shape and
`ChallengeSession` in `@identizen/index` is the reference for every transition; call
`expireVerification` when you expire a session that carries a `verificationId`.

## Host migrations

`@identizen/db` applies migrations from several folders in one run, ordered by their journal
timestamp:

```ts
import { createDb, migrateDb, resolveMigrationsDir } from '@identizen/db';

const databaseUrl = 'postgres://…'; // the index database
const { db, close } = createDb(databaseUrl);
await migrateDb(db, [resolveMigrationsDir(), './migrations']);
await close();
```

Keep host tables in your own folder; never edit the index's. Audit events accept host kinds
(`org.member_invited`, for example) next to the built-in ones.

## What a host cannot do

Nothing here hands a host a private key or lets it sign for a person. Hooks can refuse; they
cannot approve. The index still stores public keys, push tokens, revocation state and audit
events, and nothing that could produce an assertion.
