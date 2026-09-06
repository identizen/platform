# Contributing to Identizen

Thanks for looking. Identizen is built in the open and every part of it, from the protocol to the phone apps, lives in this repository. This page is how to get a change in.

## Before you start

- **Security problems:** do not open an issue. Follow [SECURITY.md](SECURITY.md).
- **Protocol changes** (anything under `spec/` or `packages/protocol`) need a discussion first. Open an issue describing the change and why; signing, canonical encoding, and key derivation have test vectors that every implementation depends on.
- **Everything else:** an issue is welcome but not required for small fixes. For a larger change, a short issue saves everyone a rewrite.

## Setting up

```bash
git clone https://github.com/identizen/platform.git
cd platform
npm install
docker compose up -d postgres   # local Postgres for the db and index tests
npm run gate                    # lint, typecheck, unit tests, end-to-end
```

Node 22 and npm 10 are what CI uses. The mobile app needs Expo tooling; see `apps/mobile/README.md`.

## Making a change

1. Branch from `main`.
2. Keep the change to one thing. One pull request per task.
3. Ship the test with the change. A fix without a test that would have caught it is not finished.
4. Run `npm run gate` before you push. CI runs the same gate and a red gate does not merge.
5. Use [Conventional Commits](https://www.conventionalcommits.org/) for the commit message: `fix(index): …`, `feat(mobile): …`, `docs: …`.
6. If the change alters the protocol, regenerate the vectors (`npm run vectors -w @identizen/protocol`) and update `spec/PROTOCOL.md` in the same pull request.
7. If the change alters a published package, add a changeset (`npx changeset`).

## What the reviewer checks

- The change does what the title says and nothing else.
- Tests cover the new behaviour and the gate is green.
- Nothing secret is persisted or logged: the index stores no private keys, seeds, or plaintext tokens, ever.
- Frontend rules hold: feature folders, no default exports, no `any`, components under 250 lines, cross-feature imports only through a feature's `index.ts`.
- Docs and copy match the code. If you change behaviour that a docs page describes, change the page.

## Repository map

| Path                | What it is                                               |
| ------------------- | -------------------------------------------------------- |
| `spec/`             | Protocol specification, threat model, test vectors       |
| `packages/protocol` | Keys, canonical encoding, sign and verify                |
| `packages/sdk`      | Browser core and server helpers                          |
| `packages/react`    | Provider, Button, hook, StepUp                           |
| `packages/cli`      | The `identizen` CLI                                      |
| `packages/ui`       | Design system shared by every surface                    |
| `apps/index`        | The index: OIDC provider and relay on Cloudflare Workers |
| `apps/web`          | The dashboard                                            |
| `apps/mobile`       | The iOS and Android app (Expo)                           |
| `apps/marketing`    | identizen.com                                            |
| `apps/docs`         | docs.identizen.com                                       |
| `apps/demo-bank`    | jtmerlin.com, the demonstration bank                     |
| `db/`               | Drizzle schema and migrations                            |
| `e2e/`              | Playwright end-to-end suite with a sample relying party  |

## Code of conduct

Participation is governed by the [code of conduct](CODE_OF_CONDUCT.md).

## Licence

By contributing you agree that your contribution is licensed under the [Apache License 2.0](LICENSE), the same as the project.
