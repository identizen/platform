---
title: Self-hosting
description: Run your own index on Cloudflare Workers or in Docker. Configuration is environment variables only.
---

The index is one Worker plus Postgres. It stores public keys, push tokens, BLE HMAC keys, revocation state, and audit events — nothing an attacker can log in with. Two supported deployments run the same code.

## Cloudflare Workers

Requirements: a Cloudflare account, `wrangler` logged in, and any Postgres (Neon, RDS, your own) reachable through [Hyperdrive](https://developers.cloudflare.com/hyperdrive/).

```bash
git clone https://github.com/identizen/platform && cd identizen
npm install
npx wrangler hyperdrive create identizen --connection-string "postgres://…"   # note the id
```

Put the Hyperdrive id in `apps/index/wrangler.jsonc` (`hyperdrive[0].id`) and set the public URLs in `vars`:

| Variable                 | Meaning                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------- |
| `INDEX_URL`              | Public issuer URL, e.g. `https://index.example.com`                                     |
| `APP_URL`                | Where deep links point (`https://app.example.com/l/<id>`); the dashboard PWA            |
| `PUSH_PROVIDER`          | `noop` (dev), or `web` / `apns` / `fcm` routing by device platform                      |
| `OPEN_SITE_REGISTRATION` | `true` lets anyone `POST /sites`; otherwise set `SITE_REGISTRATION_TOKEN`               |
| `DASHBOARD_CLIENT_IDS`   | Comma-separated client ids allowed to call `/me` with a bearer token (`*` for dev only) |

Secrets:

```bash
npm run keys -w @identizen/index                 # prints two ES256 JWKs
npx wrangler secret put OIDC_SIGNING_KEYS        # paste the JSON array
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npx wrangler secret put INDEX_SIGNING_KEY        # the 32-byte hex Ed25519 key that signs challenges
npx wrangler secret put SITE_REGISTRATION_TOKEN  # if registration is closed
```

Push credentials (optional): `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY` (p8 PEM), `APNS_TOPIC`, `APNS_SANDBOX`; `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT` (service-account JSON). Without them phones fall back to polling their inbox (`push_token: "poll"`).

Migrate the database and deploy:

```bash
DATABASE_URL="postgres://…" npm run migrate -w @identizen/db
npx wrangler deploy -c apps/index/wrangler.jsonc
```

Rotate OIDC keys by prepending a new JWK to `OIDC_SIGNING_KEYS` (`npm run keys -w @identizen/index -- rotate < current.json`), deploying, and dropping the old key after an hour (token lifetime). Both keys are published in the JWKS meanwhile.

## Docker

`docker compose up` runs Postgres and the index (the Worker runs in `workerd` inside the container via `wrangler dev`, so Durable Objects and the Hyperdrive binding behave exactly as on Cloudflare). Configuration is the same environment variables, passed to the `index` service; the Hyperdrive binding is pointed at the compose Postgres with `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`.

```bash
cp apps/index/.dev.vars.example apps/index/.dev.vars   # INDEX_SIGNING_KEY, OIDC_SIGNING_KEYS, …
docker compose up
curl http://localhost:8787/health
```

Durable Object state (in-flight logins, 60 seconds each) lives on the container's disk and needs no backup. Postgres is the only persistent store.

## Registering your first site

```bash
npx identizen register-site --index https://index.example.com --name "My App" \
  --rp-id app.example.com --redirect-uri https://app.example.com/api/auth/callback --live
```

Or run `npx identizen init --index https://index.example.com` inside the app.

## Federation

Handles resolve across indexes with WebFinger (`/.well-known/webfinger?resource=acct:name@host`), and `/.well-known/identizen` publishes the index's pinned signing key. Sites always talk to one index (the one they registered with); phones can hold identities on several.
