# JT Merlin Bank (demo)

A fictional bank that shows how a site integrates Identizen: passwordless login with the phone,
browser pairing, and transaction approval with the exact reason shown on the phone. Every
account, balance, payee, and transfer is a constant in the bundle. The login and the approvals are
real, against the hosted index.

- Live: https://jtmerlin.com (workers.dev fallback: https://jtmerlin-demo.noundry.workers.dev)
- Developer pages inside the site: `/docs`, which render this app's own source files.

## Run locally

```bash
npm run dev -w @identizen/demo-bank        # http://localhost:4500, against the hosted index
```

`.env.production` holds the hosted index URL and the demo's public client id. For a local index,
create `.env.local` with `VITE_IDENTIZEN_INDEX_URL=http://localhost:8787` and a client id from
`POST /sites` (or `npx identizen register-site`), with `http://localhost:4500/callback` as a
redirect URI.

## Deploy

```bash
npx turbo run build --filter=@identizen/demo-bank && npm run deploy -w @identizen/demo-bank
```

The Worker serves the static build. `wrangler.jsonc` attaches `jtmerlin.com` and `www` as custom
domains once that zone is active on the account.
