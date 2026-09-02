# KICKOFF — Identizen

Paste this as the first message to Claude Code in an empty `identizen/` directory that contains `planning/identizen-prd.md`, `planning/identizen-architecture-onepager.md`, and `planning/identizen-implementation-plan.md`.

---

You are building **Identizen**, an open-source, device-based identity system: the user's phone holds an Ed25519 identity, sites integrate a standard OIDC provider, and login is one tap plus Face ID. It ships in two modes that share one protocol and one index:

- **Path A — primary auth.** "Continue with Identizen" replaces password and social login. OIDC Authorization Code + PKCE; the site gets an `id_token` with a per-site `sub`, `acr: idz:login`.
- **Path B — step-up / MFA.** The site keeps its own login and calls Identizen for the factor: OIDC step-up (`acr_values=idz:mfa`, `login_hint=<sub>`) or the server-to-server Verification API (`POST /v1/verify { sub, reason }` with poll/webhook). Enrollment (`prompt=enroll`) binds a device to an existing account. The `reason` string is displayed on the phone and included in the signed assertion (transaction signing).

Both modes are in scope from M4 onward and both are exercised by the M5 e2e suite. Read these three documents completely before writing anything:

1. `planning/identizen-architecture-onepager.md` — what and why
2. `planning/identizen-prd.md` — product requirements, UX, DX, enterprise, security
3. `planning/identizen-implementation-plan.md` — repo layout, protocol, schema, API, milestones, gates

The implementation plan is authoritative for structure and sequencing. The PRD is authoritative for behavior. If they conflict, stop and ask.

## How we work

- **Milestones, one at a time.** M0 through M10 are defined in plan section 5. Execute only the current milestone. When its gate is green, tag it and stop; I will tell you to proceed.
- **TASKS.md is the checklist.** In M0 you generate it from plan section 5: every task as a checkbox, its `[cc]` / `[cc+human]` / `[human]` tag, and its acceptance test as the gate criterion. You check a box only when that test passes in CI. Never check a `[human]` box; for `[cc+human]` do the scaffolding, write the exact commands the human must run in the PR description, and leave the box unchecked.
- **One PR per task**, conventional commits, squash-merge to `main`. Branch per milestone (`m1-protocol`).
- **Green gate.** `bun gate` = lint, typecheck, unit tests, e2e (no-op until M5). Never merge red. Tag `v0.<milestone>.0` when a milestone's gate is green.
- **Every task ships with its test.** No test, not done.
- **Stop and ask** before: changing anything in `spec/PROTOCOL.md` after M1 is tagged; changing `id_token` claims; adding a table or column; adding a dependency to `packages/protocol`; deviating from the stack; touching `modules/` (native) without a device to test on.

## Stack (fixed)

TypeScript strict everywhere. Bun workspaces + Turborepo.

- **Index / OIDC / relay:** Hono on Cloudflare Workers. Postgres (Neon) via Hyperdrive with Drizzle ORM. Durable Objects for in-flight challenge sessions only.
- **Web app** (`app.identizen.com`, PWA + enterprise console): React 19, Vite, Tailwind v4, shadcn/ui, TanStack Query v5 + TanStack Router, React Hook Form + Zod, Lucide.
- **Marketing** (`identizen.com`): Astro static, Tailwind v4, React islands only where interaction demands it. The playground is a React island that uses `@identizen/react` — we dogfood our own SDK.
- **Docs** (`docs.identizen.com`): Astro Starlight.
- **Mobile:** Expo / React Native, expo-router, NativeWind. iOS first; Android is a later build of the same app. Native Expo modules (Swift) for Secure Enclave key wrapping, BLE peripheral, and the on-device passkey credential-provider extension (cross-device hybrid transport is assumed closed to third parties; browser pairing and a later desktop companion cover that).
- **Protocol:** `packages/protocol` — `@noble/ed25519`, `@scure/bip39`, `zod`, nothing else. Everything imports it; nothing re-implements it.
- **Testing:** Vitest + Testing Library + MSW; Playwright (with axe) for e2e; Maestro for mobile; Lighthouse CI on marketing and docs.

## Design system (packages/ui, built in M0)

Modern, developer-grade, calm. Inter everywhere (`@fontsource-variable/inter`), monospace for anything a developer will copy. Tailwind v4 CSS-first `@theme` tokens in one file: neutral surface scale, one confident accent, semantic tokens for success/warning/danger. Light and dark themes — system preference by default, persistent toggle, `data-theme` override — on every surface: marketing, docs, app, mobile. shadcn/ui initialized and restyled **only through tokens**; no per-component overrides. WCAG 2.1 AA; axe runs in tests. Marketing and docs must score ≥ 95 on Lighthouse. The marketing site should feel like the docs site's older sibling, not a SaaS template.

## Frontend rules (enforced by ESLint config committed in M0)

- Feature folders: `src/features/<feature>/{routes,components,hooks,api,types}`; `src/components/ui` is shadcn primitives only; `src/components/shared` is cross-feature presentational.
- Every component is **primitive**, **presentational** (props in, JSX out, no fetching, no router), or **route/container** (composition + hooks).
- No default exports. No `any`. ≤ 250 lines per component file. ≤ 6 props before requiring a typed object. No importing another feature's internals — public `index.ts` only.
- Server state lives only in TanStack Query hooks. No global mutable stores.

## The two things that matter most

**DX.** A developer goes from `bunx create-next-app` to a working login via `identizen init` + `identizen dev` in under five minutes, without reading a concepts page. If a quickstart step needs explaining, fix the step.

**UX.** One click on the site, Face ID on the phone, logged in — and for step-up, the phone shows the site name, the match code, and the `reason` if there is one, nothing else. After the first login a browser is paired, so repeat logins on any browser push straight to the phone with no QR and no Bluetooth. The phone screen shows the site name, a match code, and a biometric prompt — nothing else.

## Security invariant

The index stores no secrets. Public keys, push tokens, rotating BLE IDs, revocation state, audit events. If you find yourself persisting a private key, a seed, or a plaintext token, stop.

## Now

Execute **M0** per plan section 5:

1. Bun + Turborepo monorepo per plan section 1, with ESLint flat config enforcing the frontend rules above, Prettier, Vitest, Changesets, and a `bun gate` script.
2. `CLAUDE.md` from plan section 10, `TASKS.md` generated from plan section 5, and GitHub Actions running `bun gate` on every PR.
3. `packages/ui` with the token sheet, Inter, theme toggle, and shadcn initialized; Playwright visual snapshot in both themes; axe green.
4. `spec/PROTOCOL.md` transcribed from plan section 2 — including `acr` and `reason` on the challenge and `acr`/`reason_hash` on the assertion.

Stop when `bun gate` is green on `main`, tag `v0.0.0`, and give me a short summary plus the list of anything you had to decide that the documents didn't specify. Do not start M1.
