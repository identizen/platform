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

See `planning/` for the PRD, architecture one-pager, and implementation plan. `TASKS.md` is the milestone checklist.

License: Apache-2.0.
