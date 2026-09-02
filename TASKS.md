# TASKS — Identizen

Generated from `planning/identizen-implementation-plan.md` section 5. A box is checked only when the task's acceptance test passes in CI. `[human]` boxes are never checked by Claude Code; `[cc+human]` boxes stay unchecked until the human confirms.

Gate command: `npm run gate` = lint + typecheck + unit + e2e (e2e is a no-op until M5).

## M0 — Scaffold `[cc]` — tag `v0.0.0`

- [x] **M0.1** `[cc]` npm workspaces + Turborepo monorepo, TS 5.x strict, ESLint flat config (no default exports, no `any`, ≤250 lines/component, no cross-feature imports), Prettier, Vitest, Changesets, `npm run gate`. — Gate: `npm run gate` passes on the empty workspace.
- [x] **M0.2** `[cc]` `CLAUDE.md` from plan §10, `TASKS.md` from plan §5, GitHub Actions running `npm run gate` on PR. — Gate: workflow file present and valid; runs on PR.
- [x] **M0.3** `[cc]` `packages/ui`: Tailwind v4 `@theme` tokens (neutral surfaces, one accent, Inter), light/dark via `prefers-color-scheme` + persisted `data-theme` override, shadcn/ui restyled through tokens only, `<ThemeToggle>`. — Gate: Playwright visual snapshot of the token sheet in both themes; axe passes.
- [ ] **M0.4** `[cc+human]` `spec/PROTOCOL.md` written from plan §2 (incl. `acr`/`reason` on the challenge, `acr`/`reason_hash` on the assertion). — Gate: human review.

## M1 — Protocol package `[cc]` — tag `v0.1.0`

- [x] **M1.1** `[cc]` Seed generation + BIP39 encode/decode, HKDF derivation, Ed25519, `canonicalize()` (JCS). — Gate: BIP39 round-trip; RFC 8785 known-answer tests.
- [x] **M1.2** `[cc]` `Challenge`/`Assertion` types + Zod schemas; `signChallenge/verifyChallenge`, `signAssertion/verifyAssertion`. — Gate: sign→verify; tamper any field→fail; expired→fail; wrong rp_id→fail.
- [x] **M1.3** `[cc]` Rotating BLE ID function. — Gate: same key+window → same ID; adjacent window differs; ±1 window resolution.
- [x] **M1.4** `[cc]` `spec/vectors/*.json` generated from a fixed seed and committed. — Gate: package reproduces vectors byte-for-byte.
- [x] **M1 gate** coverage ≥ 95% on `packages/protocol`.

## M2 — Database `[cc]` — tag `v0.2.0`

- [x] **M2.1** `[cc]` `db/schema.ts` in Drizzle matching plan §3 (incl. `pairings`); generated migration committed. — Gate: migrate up on fresh Postgres in CI; SQL diffed against §3; migrate idempotent.
- [x] **M2.2** `[cc]` Typed query module: identities, devices, sites, bindings, pairings, verifications, sessions, audit. — Gate: integration tests for every function incl. revocation transitions and TOFU binding conflict.

## M3 — Index API `[cc]` — tag `v0.3.0`

- [x] **M3.1** `[cc]` Hono app skeleton on Workers; Hyperdrive binding; `wrangler dev` + local Postgres. — Gate: health endpoint.
- [x] **M3.2** `[cc]` Device registration + `Idz-Signature` auth middleware. — Gate: valid sig passes; replayed timestamp fails; wrong key fails.
- [x] **M3.3** `[cc]` Identity registration, handle uniqueness, WebFinger. — Gate: register, resolve, duplicate handle 409.
- [x] **M3.4** `[cc]` `ChallengeSession` Durable Object: create, serve signed challenge, accept assertion, notify WebSocket, expire at 60s. — Gate: DO unit tests with Miniflare; expiry uses fake timers.
- [x] **M3.5** `[cc]` `/challenge/:id/assert` full verification (device sig → revocation → site sig → TOFU). — Gate: every failure branch returns the right 4xx and writes an audit event.
- [x] **M3.6** `[cc]` Push abstraction: `PushSender` with `apns`, `fcm`, `web`, `noop`. Real APNs/FCM wiring `[cc+human]`. — Gate: tests use `noop`.
- [x] **M3.7** `[cc]` `/discover/ble`. — Gate: resolves current and ±1 window; unknown → 404; disabled device → 404.
- [x] **M3.8** `[cc]` Pairings: issuance on approval, `/discover/paired`, revoke endpoints, cascade on device revoke. — Gate: paired login pushes without discovery; revoked pairing → 401; revoked device → pairings inactive.
- [x] **M3 gate** all integration tests against Miniflare + Postgres.

## M4 — OIDC provider `[cc]` — tag `v0.4.0`

- [ ] **M4.1** `[cc]` Discovery + JWKS with key rotation (two active keys). — Gate: conforms to discovery schema.
- [ ] **M4.2** `[cc]` `/authorize` with PKCE, state, nonce; ties to a ChallengeSession; issues code on `approved`. — Gate: full code flow with a scripted assertion.
- [ ] **M4.3** `[cc]` `/token`, `/userinfo`, id_token claims per PRD 8.3. — Gate: id_token validates with `jose` against JWKS; claims exact.
- [ ] **M4.4** `[cc]` Step-up and enrollment: `acr_values=idz:mfa` + `login_hint`; `prompt=enroll`. — Gate: step-up on unbound sub → `login_required`; enroll then step-up succeeds; `acr`/`amr` exact.
- [ ] **M4.5** `[cc]` Verification API: `/v1/verify`, poll, webhook with signed JWT + retry; `reason` shown and signed. — Gate: approved/denied/timeout; webhook signature validates; reason tamper → fail.
- [ ] **M4.6** `[cc]` Sessions + back-channel logout. — Gate: mock site receives valid logout JWT within 1s.
- [ ] **M4.7** `[cc+human]` OIDC conformance Basic OP profile via the certification suite in Docker. — Gate: Basic OP profile passes (human confirms).

## M5 — Fake phone + e2e harness `[cc]` — tag `v0.5.0`

- [ ] **M5.1** `[cc]` `apps/fake-phone`: registers device+identity, receives challenges, auto-approves/denies/ignores per config; browser UI variant.
- [ ] **M5.2** `[cc]` Playwright e2e: sample site + local index + fake phone → login, logout, revoke-device-kills-session, pairing reuse, revoke-pairing forces QR; Path B enroll → step-up → `acr: idz:mfa`; Verification API round-trip with reason. — Gate: e2e green in CI.

## M6 — SDK, React, CLI `[cc]` — tag `v0.6.0`

- [ ] **M6.1** `[cc]` `@identizen/sdk` `startLogin()`; WebSocket to DO; discovery order paired → BLE → QR; deep link on mobile UA; pairing on by default. — Gate: unit with mocked transports; e2e via M5.
- [ ] **M6.2** `[cc]` Server helpers `verify()` + webhook verification; client `enroll()`. — Gate: unit with MSW.
- [ ] **M6.3** `[cc]` `@identizen/react`: Provider, Button, hook, `<IdentizenStepUp />`; accessible. — Gate: RTL + visual snapshot.
- [ ] **M6.4** `[cc]` `identizen` CLI: `init`, `dev`, `register-site`. — Gate: `init` on fresh Next.js produces a working login under e2e.
- [ ] **M6.5** `[cc]` Web Bluetooth discovery behind feature detection. — Gate: unit with mocked `navigator.bluetooth`; real test `[human]`.
- [ ] **M6.6** `[cc+human]` DX gate: fresh `create-next-app` to logged-in < 5 min; recorded in `planning/dx-benchmark.md`.

## M7 — Web surfaces `[cc]` — tag `v0.7.0`

- [ ] **M7.1** `[cc]` `apps/web` PWA dashboard: devices, paired browsers, sessions, revoke, handle; manifest + SW; feature folders. — Gate: Playwright per flow; axe on every route; light/dark snapshots.
- [ ] **M7.2** `[cc]` `apps/marketing`: Home, Developers, Pricing, Blog, About, Legal, Contact, Playground island. — Gate: Playwright smoke; Lighthouse ≥ 95; theme persists.
- [ ] **M7.3** `[cc]` `apps/docs`: Quickstart (A), Add MFA (B), framework guides, Verification API, self-hosting, enterprise, protocol spec. — Gate: `docs:verify` compiles every sample; Lighthouse ≥ 95.
- [ ] **M7.4** `[cc+human]` Self-host: `docker-compose.yml` + Cloudflare deploy button. — Gate: compose up → e2e passes.

## M8 — Expo app, JS side `[cc]` — tag `v0.8.0`

- [ ] **M8.1** `[cc]` Expo + expo-router + NativeWind using `packages/ui` tokens; Inter; light/dark. Screens: onboarding, passphrase + 3-word re-entry, restore, home, approve (login/MFA/transaction), devices, pairings, settings.
- [ ] **M8.2** `[cc]` Key storage via `expo-secure-store`; biometric gate via `expo-local-authentication`.
- [ ] **M8.3** `[cc]` Deep link `app.identizen.com/l/:id` → fetch challenge, verify index sig, approve → assert → callback.
- [ ] **M8.4** `[cc]` QR scanning; push receive → fetch challenge.
- [ ] **M8.5** `[cc]` Jest + RNTL screens; protocol vectors on Hermes. — Gate: app reproduces `spec/vectors` on Hermes.
- [ ] **M8.6** `[cc+human]` Maestro Simulator e2e.

## M9 — Native modules `[cc+human]` — tag `v0.9.0`

- [ ] **M9.1** `[cc+human]` `modules/idz-enclave` (Swift).
- [ ] **M9.2** `[cc+human]` `modules/idz-ble-peripheral` (Swift).
- [ ] **M9.3** `[cc+human]` `modules/idz-credential-provider` (Swift) + `spec/PASSKEY-PROVIDER.md`.
- [ ] **M9.4** `[cc+human]` Android Kotlin twins + Credential Manager provider.

## M9.5 — Desktop companion `[cc+human]` — tag `v0.9.5`

- [ ] **M9.5.1** `[cc+human]` `apps/companion-mac` (Swift).
- [ ] **M9.5.2** `[cc+human]` `apps/extension` (WebExtension).
- [ ] **M9.5.3** `[cc]` Windows companion (native-messaging host, QR fallback).

## M10 — Hardening `[cc+human]` — tag `v0.10.0`

- [ ] **M10.1** `[cc]` `spec/THREAT-MODEL.md`.
- [ ] **M10.2** `[cc]` Rate limits on challenge issuance and `/discover/ble`; abuse tests.
- [ ] **M10.3** `[cc]` Dependency audit, SBOM, audit gate.
- [ ] **M10.4** `[cc+human]` k6 load test of the DO path.
- [ ] **M10.5** `[human]` TestFlight, APNs live, universal links live.
- [ ] **M10.6** `[human]` External security review.
