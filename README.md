# Identizen

**Login with your phone.** No password, no email, no Google/Microsoft account. One tap, Face ID, in.

Identizen is an open-source, device-based identity system. The user's phone holds an Ed25519 identity; sites integrate a standard OpenID Connect provider. It works as a site's primary login (Path A) or as push-to-phone MFA / transaction approval layered on an existing login (Path B).

| Path                | What it is                                                                |
| ------------------- | ------------------------------------------------------------------------- |
| `spec/`             | Protocol specification, threat model, test vectors                        |
| `packages/protocol` | `@identizen/protocol`: keys, canonical encoding, sign/verify              |
| `packages/sdk`      | `@identizen/sdk`: browser core + server helpers                           |
| `packages/react`    | `@identizen/react`: Provider, Button, hook, StepUp                        |
| `packages/cli`      | `identizen` CLI: `init`, `dev`, `register-site`                           |
| `packages/ui`       | Design system: Tailwind v4 tokens, Inter, shadcn primitives, theme toggle |
| `apps/index`        | Index / relay / OIDC provider on Cloudflare Workers + Durable Objects     |
| `apps/web`          | PWA dashboard and console (React 19 + Vite)                               |
| `apps/marketing`    | identizen.com (Astro)                                                     |
| `apps/docs`         | docs.identizen.com (Astro Starlight)                                      |
| `apps/mobile`       | Expo / React Native authenticator                                         |
| `apps/fake-phone`   | Scriptable "phone" for local dev and e2e                                  |
| `db/`               | Drizzle schema and migrations                                             |
| `e2e/`              | Playwright end-to-end suite with a sample relying party                   |

## Develop

```bash
npm install
docker compose up -d postgres   # local Postgres for db/index tests
npm run gate                    # lint + typecheck + unit + e2e
```

## Run it

- **Hosted index:** https://index.identizen.com with OIDC discovery at `/.well-known/openid-configuration`. Register a site with `npx identizen init --index https://index.identizen.com`. Dashboard: https://app.identizen.com. Site and playground: https://identizen.com. Docs: https://docs.identizen.com.
- **Local index:** `docker compose up -d postgres`, `npm run migrate -w @identizen/db`, `npm run dev -w @identizen/index` (uses the test keys in `apps/index/.dev.vars.dev`).
- **Self-host anywhere with Docker:** `INDEX_SIGNING_KEY=… OIDC_SIGNING_KEYS=… INDEX_URL=https://index.example.com docker compose --profile selfhost up` runs the same Worker inside workerd next to Postgres, configured by environment only. Generate keys with `npm run keys -w @identizen/index`.
- **Cloudflare:** `npm run deploy -w @identizen/index` after `wrangler hyperdrive create` and `wrangler secret put INDEX_SIGNING_KEY` / `OIDC_SIGNING_KEYS`. The static apps deploy with `wrangler deploy` from `apps/web`, `apps/marketing`, and `apps/docs`.

See `planning/` for the PRD, architecture one-pager, and implementation plan. `TASKS.md` is the milestone checklist.

License: Apache-2.0.
