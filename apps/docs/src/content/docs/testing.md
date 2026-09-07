---
title: Testing and CI with the fake phone
description: Run a scriptable phone locally, choose its policy, drive it from a test over HTTP or in-process, start Postgres and the index in GitHub Actions, and assert on an approval, a denial, or a timeout.
---

`@identizen/fake-phone` is everything a real Identizen phone does, minus the biometrics and the UI: it registers a device and identity with an index, receives challenges by push or by polling its inbox, verifies the index signature, and approves, denies, or ignores each one according to a policy. `identizen dev` wraps it for local development; the repository's own Playwright suite drives it over HTTP. This page shows both.

## Running it locally

```bash
npx identizen dev [--index <url>] [--port 4400] [--policy approve|deny|manual|ignore] [--local]
```

- `--index` defaults to `IDENTIZEN_INDEX_URL` from `.env.local` or `.env` in the current directory, then `http://localhost:8787`.
- `--port` defaults to `4400`. The phone's HTTP server binds `127.0.0.1`; open `http://localhost:4400` for the browser UI, which shows pending challenges, the log, and a policy selector (auto-approve, auto-deny, ask me, ignore).
- `--policy` defaults to `approve`.
- `--local` also starts a local index with `wrangler dev` from `apps/index`; it needs the monorepo checkout and fails with a message otherwise.
- The command waits up to 60 seconds for `GET <index>/health` to answer, then registers. Against an index on `localhost` the phone receives web pushes at `http://localhost:<port>/push`. Against any other host it polls `GET /devices/:id/inbox` once a second instead, so no inbound connectivity is needed.

The standalone binary has the same surface plus a few flags `identizen dev` does not expose:

```bash
npx identizen-fake-phone --index http://localhost:8787 --port 4400 --policy approve \
  [--state ./phone.json] [--url http://localhost:4400] [--host 127.0.0.1] [--issuer <url>] [--handle alice] [--poll]
```

`--state` saves the seed, device key, and registration to a file and reloads it next time, so the same identity survives restarts. `--url` is the public URL the index will push to. `--host` is the interface the HTTP server binds (`127.0.0.1` by default; `0.0.0.0` when a container has to reach it). `--issuer` is the name the index uses for itself in its challenges when that differs from the URL the phone reaches it at, for example `http://host.docker.internal:8787` while `--index` stays `http://localhost:8787`; without it the phone rejects the challenge as `wrong_index`. `--amr` is what the simulated approval claims verified the person (comma-separated, default `face`). `--handle` sets a handle at registration. `--poll` forces inbox polling. Each flag has an environment fallback: `INDEX_URL`, `FAKE_PHONE_PORT`, `FAKE_PHONE_POLICY`, `FAKE_PHONE_STATE`, `FAKE_PHONE_URL`, `FAKE_PHONE_HOST`, `FAKE_PHONE_ISSUER`, `FAKE_PHONE_AMR`, `FAKE_PHONE_HANDLE`, `FAKE_PHONE_POLL=true`.

## Policies

| Policy    | What happens when a challenge arrives                                                                                                                             |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `approve` | Signs the assertion with the configured `amr` (default `["face"]`, `--amr face,pin` to change it; a simulator never asserts `hwk`) and posts it at once. Default. |
| `deny`    | Posts `POST /challenge/:id/deny` at once. The browser is sent back with `error=access_denied`; a verification resolves as `denied`.                               |
| `manual`  | Leaves the challenge pending. Approve or deny it from the UI or with `POST /approve/:id` and `POST /deny/:id`.                                                    |
| `ignore`  | Leaves the challenge pending and expects nobody to act. The challenge expires after 60 seconds; a verification resolves as `timeout`.                             |

`manual` and `ignore` behave the same in code; the name states the intent. Every policy still fetches and verifies the challenge, so a challenge signed by a key other than the one pinned at registration is rejected before the policy runs. The policy can be changed at any time with `POST /policy`.

## The HTTP API

| Method | Path                                                  | Body                            | Does                                                                                                                                                                                                                                         |
| ------ | ----------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/health`                                             |                                 | `{ ok, registered }`                                                                                                                                                                                                                         |
| `GET`  | `/state`                                              |                                 | `registered`, `device_id`, `idz`, `handle`, `policy`, `index`, and the pending challenges                                                                                                                                                    |
| `GET`  | `/pending`                                            |                                 | Pending challenges with `challenge_id`, `rp_name`, `code`, `acr`, `reason`, `via`                                                                                                                                                            |
| `GET`  | `/log`                                                |                                 | Events in order: `registered`, `challenge`, `approved`, `approve_failed`, `denied`, `reset`, `device_revoked`                                                                                                                                |
| `GET`  | `/mnemonic`                                           |                                 | The 24 words of this identity                                                                                                                                                                                                                |
| `POST` | `/push`                                               | `{ challenge_id }`              | What the index calls; you can call it too                                                                                                                                                                                                    |
| `POST` | `/scan`                                               | `{ url }` or `{ challenge_id }` | Simulate scanning the QR or opening the deep link; returns `code`, `rp_name`, `acr`, `reason`                                                                                                                                                |
| `GET`  | `/l/:id`                                              |                                 | What a deep link does on a real phone: verify the challenge, apply the policy, then `302` to the site's redirect once the index has resolved the login (`409` with the state if it was denied or expired, `202` if still pending after 15 s) |
| `POST` | `/approve/:id`                                        |                                 | Sign and submit the assertion; returns the index's response and status                                                                                                                                                                       |
| `POST` | `/deny/:id`                                           |                                 | Deny                                                                                                                                                                                                                                         |
| `POST` | `/policy`                                             | `{ policy }`                    | Switch policy                                                                                                                                                                                                                                |
| `POST` | `/reset`                                              | `{ handle? }`                   | Forget everything, become a new identity, register again                                                                                                                                                                                     |
| `POST` | `/revoke-self`                                        |                                 | Enrol a second device on the same seed and revoke this one from it (tests back-channel logout)                                                                                                                                               |
| `GET`  | `/me`, `/me/pairings`, `/me/sessions`                 |                                 | The identity's view from the index                                                                                                                                                                                                           |
| `POST` | `/me/pairings/:id/revoke`, `/me/sessions/:sid/revoke` |                                 | Revoke a paired browser or a session                                                                                                                                                                                                         |

## Driving it from a test

Over HTTP, from any language:

```bash
curl -s -X POST localhost:4400/policy -H 'content-type: application/json' -d '{"policy":"manual"}'
curl -s -X POST localhost:4400/scan -H 'content-type: application/json' \
  -d '{"url":"http://localhost:8787/l/ch_01K3ZB2N9G0000000000000000"}'
curl -s -X POST localhost:4400/approve/ch_01K3ZB2N9G0000000000000000
curl -s localhost:4400/log
```

In Playwright, the pattern the repository uses: read the deep link and the match code from the hosted login page, hand the link to the phone, and check the codes agree.

```ts title="e2e/tests/helpers.ts (excerpt)"
import { expect, type Page } from '@playwright/test';

const PHONE_URL = 'http://localhost:4400';

export async function scanFromPage(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/authorize/);
  await expect(page.locator('body[data-ready="1"]')).toBeAttached();
  const href = await page.locator('a', { hasText: 'Open in Identizen' }).getAttribute('href');
  const pageCode = (await page.locator('.code').textContent())?.trim();
  const res = await fetch(`${PHONE_URL}/scan`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: href }),
  });
  const result = (await res.json()) as { ok: boolean; code: string };
  expect(result.ok).toBe(true);
  expect(result.code).toBe(pageCode);
}
```

Read `href` before you scan: with policy `approve` the page can navigate away within milliseconds. For a pushed login (a paired browser, step-up with `login_hint`, or a verification) there is nothing to scan; poll `GET /log` until an event with `event: "challenge"` appears after the index you noted, then check `detail.via === "push"`, `detail.acr`, and `detail.reason`.

In-process, from Node or Vitest, without the HTTP server:

```ts
import { FakePhone, startPhoneServer } from '@identizen/fake-phone';

const phone = new FakePhone({
  indexUrl: 'http://localhost:8787',
  pushUrl: 'http://localhost:4400', // where the index posts { challenge_id }
  policy: 'manual',
});
const server = startPhoneServer({ phone, port: 4400 });
await phone.register();

const waiting = phone.waitForChallenge(10_000);
// ...start a login or a verification...
const pending = await waiting;
const result = await phone.approve(pending.challenge.id); // or phone.deny(...)
console.info(result.status, result.body.sub);

phone.stopPolling();
server.close();
```

`FakePhone` also accepts `state` (a saved snapshot), `amr`, `handle`, `poll`, `pollIntervalMs`, and `fetchImpl` for a unit test that fakes the index. `phone.snapshot`, `phone.mnemonic`, and `phone.reset()` give you a second phone on the same seed or a fresh identity.

## Asserting on the outcome

**Path A, browser login.** After an approval the browser lands on your `redirect_uri` with `code` and `state`; exchange the code as usual and check `sub`, `acr`, and `amr` in the id_token. After a denial the browser is sent to the `redirect_uri` with `error=access_denied`. The phone's log has `approved` with `detail.sub`, which must equal the `sub` your site received, or `denied`.

**Path B, Verification API.** Poll `GET /v1/verify/:id` with your client credentials; `status` moves from `pending` to `approved`, `denied`, or `timeout` (after 60 seconds). On `approved`, `assertion.payload.reason_hash` equals `base64url(SHA-256(reason))`, so a test that sends a reason should compare the two. `@identizen/sdk/server` wraps the loop: `waitForVerification(id, { timeoutMs: 65_000 })`. If a webhook URL is registered, the same result arrives as a signed JWT; the sample site records it and the suite checks that too.

**Revocation.** `POST /revoke-self` enrolls a second device on the same seed and revokes the first. Your site's back-channel logout endpoint receives a logout token, and the next request with the old session should be rejected.

Between tests, `POST /reset` gives a fresh identity so bindings from an earlier test do not leak in. The repository suite calls it in `beforeAll` and sets the policy explicitly.

## GitHub Actions

The repository's own gate is the template. It runs Postgres as a service on port `5433` (the port the repo defaults to), builds, and runs `npm run gate`, whose e2e step starts the index, the fake phone, and a sample Next.js site through Playwright's `webServer`.

```yaml
jobs:
  gate:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: identizen
          POSTGRES_PASSWORD: identizen
          POSTGRES_DB: identizen
        ports: ['5433:5432']
        options: >-
          --health-cmd "pg_isready -U identizen"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    env:
      DATABASE_URL: postgres://identizen:identizen@localhost:5433/identizen
      CI: 'true'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run build
      - run: npm run e2e -w @identizen/e2e
```

What the e2e step does, so you can copy it for your own site:

1. `globalSetup` runs `e2e/reset-db.ts`, which drops and recreates the `public` schema and applies the migrations. Never point it at a database you care about.
2. Playwright starts three servers and waits for their health URLs:
   - the index: `npm run dev:e2e -w @identizen/index -- --port 8787`, with `WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` set to `DATABASE_URL`. The `e2e` environment in `wrangler.jsonc` sets `INDEX_URL` and `APP_URL` to `http://localhost:8787`, opens site registration, and allows any client on `/me`. Its signing keys are the committed test-only values in `apps/index/.dev.vars.e2e`.
   - the fake phone: `npm run dev -w @identizen/fake-phone -- --index http://localhost:8787 --port 4400 --url http://localhost:4400`.
   - the sample site: `npm run dev -w @identizen/e2e-site -- --port 3000` with `IDENTIZEN_INDEX_URL=http://localhost:8787`. On first use it registers itself with `POST /sites` when no `IDENTIZEN_CLIENT_ID` is set.
3. `e2e/tests/path-a.spec.ts` covers QR login, logout, paired repeat login, pairing revocation, device revocation with back-channel logout, and denial. `e2e/tests/path-b.spec.ts` covers password login, enrollment with `prompt=enroll`, step-up with `acr_values=idz:mfa`, a verification with a reason, and a verification denial.

To test your own application in CI, keep steps 1 and 2 for the index and the phone, and replace the sample site with yours. The repository publishes no container image; the index runs from a checkout with `wrangler dev`, or from an image you build with `apps/index/Dockerfile`. There is no separate hosted test index.

## The index's own suite

`npm run test:unit -w @identizen/index` runs vitest twice on purpose: once for everything except `test/oidc-conformance-*`, then once for the three conformance files. The Workers test pool keeps one runtime for a whole invocation and reloads the worker module for each test file; if an invocation runs longer than the five-minute retention of a resolved challenge session, the sessions' wipe alarms fire on Durable Object instances whose module has been reloaded and the pool's wrapper fails with `Maximum call stack size exceeded`, hanging the rest of the run. Two invocations of about 80 s each stay clear of it. For the same reason, tests should drive Durable Objects through their RPC methods or the HTTP API rather than `runInDurableObject`, which slows every Durable Object call for the rest of the run.
