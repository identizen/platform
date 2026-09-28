# JT Merlin Bank (demo)

A fictional demo bank. It shows how a site integrates two products: Identizen for passwordless
login with the phone, browser pairing, and transaction approval with the exact reason shown on the
phone; and [Fromenance](https://fromenance.com) for the `/verify` page, where a customer pastes an
email and learns whether the bank really sent it. The site's own copy presents itself as a demo
bank, not as a showcase for either product. Every
account, balance, payee, and transfer is a constant in the bundle. The login and the approvals are
real, against the hosted index.

- Live: https://jtmerlin.com (workers.dev fallback: https://jtmerlin-demo.noundry.workers.dev)
- Developer pages inside the site: `/docs`, which render this app's own source files.
- Verify page: `/verify`. The Fromenance widget (`cdn.fromenance.com/verify.js`) is loaded once and
  mounted through `window.Fromenance.mount`, with the public site key from `.env.production`. The
  key is bound to jtmerlin.com, www, the workers.dev fallback, and localhost:4500/4501 on the JT
  Merlin demo tenant, so the page works locally without extra setup. The identity code under
  `src/features/auth` is untouched by this feature; see `src/features/verify`.

## Send me a demo email

`/verify` can also email the visitor a JT Merlin alert, and the visitor picks which one. The Worker
(`src/worker`) answers `POST /api/demo-email { email, kind }`: `kind: "registered"` (the default) is
the real alert, registered with Fromenance at send time (recipient hash, subject and content
fingerprints, `Idempotency-Key` = message id) and carrying the returned code, so pasting it on
/verify comes back Verified; `kind: "lure"` is never registered and carries a code that passes the
checksum but was never issued, with a link on the reserved `.example` TLD, so it comes back Not
verified. Both end with a demo disclaimer. The page fills the widget's address field with the
address the demo went to and remembers it in the browser, because the registry matches a code to
the address that received the message: a paste without that address cannot come back Verified. Mail goes out through Resend from
`alerts@jtmerlin.com`; the endpoint is same-origin only and rate limited (3 per minute per IP,
1 per minute per recipient) with the Workers rate limiting binding. The fingerprint pipeline is a
port of the sample on docs.fromenance.com and is unit tested against its own invariants.

Secrets on the Worker: `RESEND_API_KEY` (sending access, jtmerlin.com only), `FROMENANCE_API_KEY`
(live, register scope), `FROMENANCE_TENANT_SECRET`. Locally, copy `.dev.vars.example` to
`.dev.vars`, build, then `npm run dev:worker` and open http://localhost:4502 (the Vite dev server
has no Worker, so `/api/demo-email` answers 404 there).

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
