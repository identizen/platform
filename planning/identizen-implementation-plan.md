# Identizen — Implementation Plan for Claude Code

**Companion to:** `identizen-prd.md`, `identizen-architecture-onepager.md`
**Scope:** PRD roadmap Phases 0–2.5 — personal identity, index, OIDC (Path A and Path B), SDK, pairing, QR, deep link, BLE-on-Chromium, on-device passkey provider, desktop companion. Enterprise (Phase 3) is stubbed at the schema level only and gets its own plan before 1.0.
**Working style:** one milestone at a time, one task per commit, every milestone ends green and tagged. Do not start milestone N+1 until the gate for N passes.

---

## 0. Honest boundary: what Claude Code can and cannot do here

**Can do end to end:** monorepo, index/relay on Workers, OIDC provider incl. step-up and the Verification API, Postgres schema and migrations, SDK + React bindings, CLI, local dev mode with a fake phone, marketing site, docs, playground, PWA dashboard, Expo app UI and logic, the browser extension, all unit/integration/e2e tests that run in CI.

**Can scaffold but a human must finish:**

- Expo native modules (Swift) for Secure Enclave key wrapping, BLE peripheral, and the credential-provider extension — Claude Code can write the Swift and the config plugin, but building, signing, running on a physical iPhone, and iterating on Apple's APIs needs you at a Mac with a device and a developer account.
- Apple Developer account, App Store Connect, TestFlight, APNs keys, associated-domains entitlement for universal links.
- Any test that requires two physical devices near each other (BLE).

**Cannot do:** App Store review, FIDO conformance submission, third-party security audit.

Every task below is tagged `[cc]` (Claude Code alone), `[cc+human]` (Claude Code writes, human runs on device / configures accounts), or `[human]`.

---

## 1. Repository layout

Single Bun monorepo (Bun workspaces), Turborepo for task orchestration.

```
identizen/
├── CLAUDE.md                     # working rules for Claude Code (section 10)
├── KICKOFF.md                    # the starter prompt (identizen-kickoff.md)
├── TASKS.md                      # green-gated task list, mirrors section 5; Claude Code checks boxes here
├── package.json  bunfig.toml  turbo.json
├── planning/                     # this plan, the PRD, the one-pager, dx-benchmark.md
├── packages/
│   ├── protocol/                 # @identizen/protocol — types, canonical encoding, sign/verify, test vectors. Zero deps beyond @noble/*
│   ├── sdk/                      # @identizen/sdk — browser core: discovery, challenge session, OIDC client helpers
│   ├── react/                    # @identizen/react — <IdentizenProvider>, <IdentizenButton>, useIdentizen
│   ├── cli/                      # identizen — init, dev, register-site
│   └── ui/                       # design system: Tailwind v4 @theme tokens, Inter, shadcn primitives, theme toggle (web + mobile-shared where possible)
├── apps/
│   ├── index/                    # Hono on Workers: index API, relay, OIDC provider. Durable Object: ChallengeSession
│   ├── marketing/                # Astro static, Tailwind v4, React islands; playground island uses @identizen/react; modern look and feel - clean aesthetics
│   ├── web/                      # React 19 + Vite + shadcn: PWA dashboard (app.identizen.com) and console routes
│   ├── docs/                     # Astro Starlight
│   ├── mobile/                   # Expo app; native Expo modules under apps/mobile/modules/
│   ├── fake-phone/               # Bun/browser "phone" for local dev and e2e
│   ├── companion-mac/            # Phase 2.5: Swift menu-bar app, BLE central, native-messaging host
│   └── extension/                # Phase 2.5: WebExtension + Safari App Extension, intercepts navigator.credentials
├── db/
│   ├── schema.ts                 # Drizzle schema (section 3 is the reference SQL)
│   └── migrations/               # drizzle-kit generated
├── spec/
│   ├── PROTOCOL.md
│   ├── THREAT-MODEL.md
│   └── vectors/*.json
└── e2e/                          # Playwright: browser + fake-phone full logins
    └── site/                     # sample Next.js relying party used by e2e and the DX benchmark
```

---

## 2. Protocol (the part that must not be improvised)

Lives in `spec/PROTOCOL.md` and is implemented once in `packages/protocol`, consumed by everything else. Claude Code writes the spec first, then the package, then test vectors, and every other package imports the package rather than re-implementing.

### 2.1 Keys and identifiers

- Seed: 256-bit, encoded as 24 BIP39 English words. Generated on device.
- Master key: `HKDF-SHA256(seed, salt="identizen/v1/master", info="")` → Ed25519 private key.
- Identity ID (`idz`): `base64url(SHA-256(masterPublicKey))[0:32]`. This is the stable, cross-site identifier held in the index. Never sent to sites by default.
- Per-site key: `HKDF-SHA256(seed, salt="identizen/v1/site", info=rp_id)` → Ed25519. `rp_id` is the site's registered origin host (e.g. `app.example.com`). The per-site public key hash is the site's `sub`.
- Device key: fresh Ed25519 per install, not derived. Wrapped at rest by the enclave on native, by a WebCrypto AES-GCM key on web. Used for device registration and rotation of BLE IDs; identifies the _install_, not the person.

### 2.2 Canonical encoding

All signed payloads are JSON with keys sorted, no whitespace, UTF-8 (JCS, RFC 8785). `packages/protocol` exports `canonicalize()`. Signatures are Ed25519 over `"identizen/v1/" + type + "\n" + canonical_json`.

### 2.3 Challenge

Issued by the index's ChallengeSession DO when a site starts a login.

```json
{
  "type": "challenge",
  "id": "ch_<ulid>",
  "rp_id": "app.example.com",
  "rp_name": "Example App",
  "nonce": "<32 bytes base64url>",
  "code": "47",
  "iat": 1756560000,
  "exp": 1756560060,
  "index": "https://index.identizen.com",
  "acr": "idz:login",
  "reason": null
}
```

- `code` is a 2-digit match code shown in both browser and phone.
- `acr` is `idz:login` (Path A) or `idz:mfa` (Path B step-up and Verification API); the phone chooses its approval UI from it.
- `reason` is optional (≤ 140 chars, site-supplied, null for plain logins). It is displayed on the phone and its SHA-256 is echoed in the assertion, so the approval is bound to what the user saw (transaction signing).
- A ChallengeSession is created by `/authorize` (Path A and step-up) and by `/v1/verify` (Verification API); the challenge shape is the same.
- `exp - iat` is 60 seconds. Expired challenges are rejected.
- The DO signs the challenge with the index's key so the phone can verify it came from an index it trusts (index public keys are pinned in the app at registration).

### 2.4 Assertion

Produced by the phone after biometric approval.

```json
{
  "type": "assertion",
  "challenge_id": "ch_<ulid>",
  "nonce": "<echoed>",
  "rp_id": "app.example.com",
  "sub": "<per-site pubkey hash>",
  "site_pubkey": "<per-site Ed25519 pubkey, base64url>",
  "device_id": "dev_<ulid>",
  "iat": 1756560012,
  "amr": ["face", "hwk"],
  "acr": "idz:login",
  "reason_hash": null
}
```

`acr` echoes the challenge; `reason_hash` is `base64url(SHA-256(reason))` when the challenge carried a reason, else null. Both are inside the signed payload.

Signed twice: `site_sig` by the per-site key (proves identity), `device_sig` by the device key (proves it came from a registered, non-revoked install). The index verifies `device_sig` against its device record, checks revocation, then verifies `site_sig` against `site_pubkey`, then binds `site_pubkey` → `sub` for that `rp_id` on first login (TOFU per site; subsequent logins must match).

### 2.5 OIDC output

Standard OIDC Authorization Code flow with PKCE. The index is the OP. `id_token` claims per PRD section 8.3. `sub` = assertion `sub`. Back-channel logout per OIDC spec, `sid` = session ID.

### 2.6 Discovery

- **Deep link (phone):** `https://app.identizen.com/l/<challenge_id>` → universal link → app. Callback: `<site redirect_uri>?code=...&state=...` via the OIDC flow; the app hands off to the system browser.
- **QR:** encodes the same URL.
- **BLE (Chromium desktop):** phone advertises service UUID `<fixed>` with a 16-byte rotating ID = `HMAC-SHA256(device_ble_key, floor(now/900))[0:16]`. SDK scans, sends rotating ID to index, index resolves to device (it holds `device_ble_key`) within a ±1 window and pushes the challenge.
- **Pairing (all browsers):** after a successful QR or BLE login, the browser generates a P-256 key in WebCrypto (non-extractable) and the index issues a `pairing` record `{ pairing_id, device_id, browser_pubkey, issued_at }` signed by the index. On later logins the SDK signs the challenge ID with the browser key; the index verifies, checks the pairing and device are active, and pushes the challenge straight to the device. Pairing skips discovery only — the phone still shows rp_name and code. Pairings are revoked explicitly or when the device is.
- **Passkey provider:** on-device only (iOS 17+ credential provider extension, Android Credential Manager). Cross-device hybrid transport is assumed unavailable to third parties; the Phase 0 spike records the answer but no milestone depends on it.
- **Desktop companion (Phase 2.5):** Mac app + Safari App Extension / WebExtension intercepting `navigator.credentials`, relaying via the index, with CoreBluetooth proximity from the Mac app. Reuses `packages/protocol` and the same ChallengeSession path.

### 2.7 Push

Challenge push payload is `{ "challenge_id": "ch_..." }` only. The phone fetches the full signed challenge from the index over TLS. Nothing sensitive transits APNs/FCM.

---

## 3. Data model (Postgres)

```sql
create table identities (
  idz            text primary key,            -- hash of master pubkey
  master_pubkey  bytea not null,
  handle         text unique,                 -- nullable, "george" at this index's domain
  kind           text not null check (kind in ('personal','org')),
  org_id         text references orgs(id),
  created_at     timestamptz not null default now()
);

create table devices (
  id             text primary key,            -- dev_<ulid>
  idz            text not null references identities(idz),
  device_pubkey  bytea not null,
  ble_key        bytea,                        -- HMAC key for rotating BLE IDs
  push_token     text,
  push_platform  text check (push_platform in ('apns','fcm','web')),
  attestation    jsonb,
  status         text not null default 'active' check (status in ('active','disabled','revoked')),
  last_seen_at   timestamptz,
  created_at     timestamptz not null default now()
);

create table sites (
  client_id      text primary key,            -- idz_live_...
  client_secret_hash text,                    -- null for public/PKCE clients
  rp_id          text not null unique,
  name           text not null,
  redirect_uris  text[] not null,
  backchannel_logout_uri text,
  webhook_url    text,                        -- Path B verification results
  webhook_secret_hash text,
  org_id         text references orgs(id),    -- null = public
  created_at     timestamptz not null default now()
);

create table site_bindings (                  -- TOFU per-site identity
  rp_id          text not null,
  sub            text not null,
  idz            text not null references identities(idz),
  site_pubkey    bytea not null,
  first_seen_at  timestamptz not null default now(),
  primary key (rp_id, sub)
);

create table pairings (
  id             text primary key,            -- pr_<ulid>
  device_id      text not null references devices(id),
  browser_pubkey bytea not null,
  label          text,                        -- "Safari on MacBook", set by SDK from UA
  status         text not null default 'active' check (status in ('active','revoked')),
  last_used_at   timestamptz,
  created_at     timestamptz not null default now()
);

create table verifications (                  -- Path B Verification API
  id             text primary key,            -- vf_<ulid>
  client_id      text not null references sites(client_id),
  sub            text not null,
  reason         text,
  status         text not null default 'pending' check (status in ('pending','approved','denied','timeout')),
  assertion      jsonb,                       -- signed assertion on approval
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz
);

create table sessions (
  sid            text primary key,
  idz            text not null references identities(idz),
  device_id      text not null references devices(id),
  client_id      text not null references sites(client_id),
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  revoked_at     timestamptz
);

create table orgs (                            -- Phase 3; created now so FKs exist
  id             text primary key,
  name           text not null,
  created_at     timestamptz not null default now()
);

create table audit_events (
  id             bigserial primary key,
  at             timestamptz not null default now(),
  idz            text,
  device_id      text,
  client_id      text,
  org_id         text,
  kind           text not null,               -- login.success, login.denied, device.enrolled, device.disabled, ...
  detail         jsonb
);
create index on audit_events (idz, at desc);
```

Schema is declared in Drizzle (`db/schema.ts`); the SQL above is the reference and the generated migration must match it. Migrations via `drizzle-kit generate` + `drizzle-kit migrate`. Queries in `apps/index/src/db/*.ts` as typed functions over Drizzle; no raw SQL outside that folder.

---

## 4. API surface (Hono, `apps/index`)

### Public / SDK

| Method | Path                                       | Purpose                                                                                                                                                                        |
| ------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/.well-known/openid-configuration`        | OIDC discovery                                                                                                                                                                 |
| GET    | `/.well-known/jwks.json`                   | OP signing keys                                                                                                                                                                |
| GET    | `/.well-known/webfinger?resource=acct:...` | Handle → index resolution (federation)                                                                                                                                         |
| GET    | `/authorize`                               | OIDC authorize; creates a ChallengeSession. `acr_values=idz:mfa` + `login_hint=<sub>` = step-up against a bound device; `prompt=enroll` = bind a device to an existing account |
| POST   | `/token`                                   | OIDC token endpoint (PKCE)                                                                                                                                                     |
| GET    | `/userinfo`                                | OIDC userinfo                                                                                                                                                                  |
| GET    | `/challenge/:id`                           | Phone fetches signed challenge                                                                                                                                                 |
| POST   | `/challenge/:id/assert`                    | Phone submits assertion                                                                                                                                                        |
| GET    | `/challenge/:id/ws`                        | Browser WebSocket to the DO; receives `approved`/`denied`/`expired`                                                                                                            |
| POST   | `/discover/ble`                            | `{ rotating_id }` → pushes challenge to matching device, returns 202 or 404                                                                                                    |
| POST   | `/discover/paired`                         | `{ pairing_id, sig }` (browser-key signature over challenge_id) → pushes challenge to the paired device, 202; 401 if pairing/device inactive                                   |
| POST   | `/pairings`                                | Called by the DO on approval when the browser supplied a `browser_pubkey`; returns signed pairing record                                                                       |

### Device

| Method | Path                                          | Purpose                                                                                          |
| ------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| POST   | `/devices`                                    | Register device (device pubkey, attestation, push token); returns `device_id`, pins index pubkey |
| POST   | `/identities`                                 | Register identity (master pubkey, optional handle) signed by device key                          |
| POST   | `/devices/:id/push-token`                     | Update                                                                                           |
| POST   | `/devices/:id/revoke`                         | Self-revoke from another device or via passphrase proof                                          |
| GET    | `/me/devices`, `/me/sessions`, `/me/pairings` | Dashboard                                                                                        |
| POST   | `/me/sessions/:sid/revoke`                    | Triggers back-channel logout                                                                     |
| POST   | `/me/pairings/:id/revoke`                     | Removes a paired browser                                                                         |

### Verification API (Path B, server-to-server, bearer = site client secret)

| Method | Path                        | Purpose                                                                              |
| ------ | --------------------------- | ------------------------------------------------------------------------------------ |
| POST   | `/v1/verify`                | `{ sub, reason?, ttl? }` → pushes to the bound device; returns `{ verification_id }` |
| GET    | `/v1/verify/:id`            | Poll: `pending                                                                       | approved | denied | timeout`, with the signed assertion when approved |
| POST   | `/sites/:client_id/webhook` | Register webhook URL; verification results are POSTed as signed JWTs                 |

### Site management

| Method    | Path                | Purpose                         |
| --------- | ------------------- | ------------------------------- |
| POST      | `/sites`            | Register a site (CLI uses this) |
| GET/PATCH | `/sites/:client_id` | Manage                          |

All device/identity endpoints authenticate with a signed request header (`Idz-Signature`: device-key signature over method+path+body hash+timestamp). No bearer tokens for devices.

---

## 5. Milestones, tasks, and gates

How milestones map to the PRD roadmap:

| PRD phase                                 | Milestones                                                                                      | Note                                                                                          |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Phase 0 — spike                           | runs in parallel with M0–M3 as a human-driven track; its code lands in M9 task 3                | Claude Code assists; the answer is recorded in `spec/PASSKEY-PROVIDER.md`                     |
| Phase 1 — personal identity, mobile-first | M0–M5 (backend, protocol, e2e) then M8 (Expo app JS)                                            | The plan builds the index and harness before the app so the app has something real to talk to |
| Phase 2 — desktop and everywhere          | M6 (SDK, pairing, BLE), M7 (web surfaces), M9 (native modules, Android)                         |                                                                                               |
| Phase 2.5 — desktop companion             | M9.5                                                                                            |                                                                                               |
| Phase 3 — enterprise                      | not in this plan; `orgs` table and `kind='org'` exist so it can be added without a schema break |                                                                                               |
| Phase 4 — 1.0                             | M10 hardening is the on-ramp; 1.0 itself follows the enterprise plan                            |                                                                                               |

Conventions:

- Branch per milestone (`m1-protocol`), PR per task, squash on merge to `main`, tag `v0.<milestone>.0` when the gate passes.
- Conventional commits.
- Gate command is always `bun gate` = `bun lint && bun typecheck && bun test:unit && bun e2e` (e2e is a no-op until M5). Gate must be green on `main` at every tag.
- `TASKS.md` mirrors the task list below as checkboxes with gate criteria; Claude Code checks a box only when the task's test passes.
- Each task lists its acceptance test. No task is done without its test passing.

### M0 — Scaffold `[cc]`

Tag: `v0.0.0`

1. Bun workspaces + Turborepo monorepo, TS 5.x strict, ESLint (flat config, rules from section 10: no default exports, no `any`, ≤250 lines/component), Prettier, Vitest, Changesets. Test: `bun gate` passes on an empty workspace.
2. `CLAUDE.md` from section 10, `TASKS.md` generated from section 5. GitHub Actions running `bun gate` on PR.
3. `packages/ui`: Tailwind v4 CSS-first `@theme` tokens (neutral surfaces, one accent, Inter via `@fontsource-variable/inter`), light/dark via `prefers-color-scheme` default + `data-theme` override persisted, shadcn/ui initialized and restyled through tokens only, `<ThemeToggle>`. Test: Playwright visual snapshot of the token sheet in both themes; axe passes.
4. `spec/PROTOCOL.md` written from section 2 above, verbatim where possible. Test: reviewed by human; that's the one human gate in M0.

### M1 — Protocol package `[cc]`

Tag: `v0.1.0`

1. `packages/protocol`: seed generation + BIP39 encode/decode (`@scure/bip39`), HKDF derivation, Ed25519 via `@noble/ed25519`, `canonicalize()` (JCS). Test: BIP39 round-trip; known-answer tests against RFC 8785 examples.
2. `Challenge`, `Assertion` types + Zod schemas; `signChallenge/verifyChallenge`, `signAssertion/verifyAssertion`. Test: sign→verify, tamper any field→fail, expired→fail, wrong rp_id→fail.
3. Rotating BLE ID function. Test: same key+window → same ID; adjacent window differs; ±1 window resolution.
4. Generate `spec/vectors/*.json` from a fixed seed; commit them. Test: package reproduces vectors byte-for-byte. **These vectors are the interop contract for the mobile app.**
   Gate: coverage ≥ 95% on `packages/protocol`.

### M2 — Database `[cc]`

Tag: `v0.2.0`

1. `db/schema.ts` in Drizzle matching section 3 (including `pairings`); `drizzle-kit generate` migration committed. Test: migrate up on a fresh Postgres in CI (Docker service); generated SQL diffed against section 3; migrate is idempotent.
2. Typed query module over Drizzle: identities, devices, sites, bindings, pairings, verifications, sessions, audit. Test: integration tests against CI Postgres for every function, including revocation state transitions and TOFU binding conflict.

### M3 — Index API `[cc]`

Tag: `v0.3.0`

1. Hono app skeleton on Workers; Hyperdrive binding; local dev via `wrangler dev` + local Postgres. Test: health endpoint.
2. Device registration + `Idz-Signature` auth middleware. Test: valid sig passes, replayed timestamp fails, wrong key fails.
3. Identity registration, handle uniqueness, WebFinger. Test: register, resolve, duplicate handle 409.
4. `ChallengeSession` Durable Object: create, serve signed challenge, accept assertion, notify WebSocket, expire at 60s. Test: DO unit tests with Miniflare; expiry uses fake timers.
5. `/challenge/:id/assert` full verification path (device sig → revocation → site sig → TOFU). Test: every failure branch returns the right 4xx and writes an audit event.
6. Push abstraction: `PushSender` interface with `apns`, `fcm`, `web`, and `noop` (dev) implementations. Real APNs/FCM wiring is `[cc+human]` (needs keys); tests use `noop`.
7. `/discover/ble`. Test: resolves current and ±1 window; unknown → 404; disabled device → 404.
8. Pairings: `/pairings` issuance from the DO on approval, `/discover/paired` verification, revoke endpoints, cascade on device revoke. Test: paired login pushes without discovery; revoked pairing → 401; revoked device → all its pairings inactive.
   Gate: all integration tests against Miniflare + Postgres.

### M4 — OIDC provider `[cc]`

Tag: `v0.4.0`

1. Discovery + JWKS with key rotation support (two active keys). Test: conforms to the discovery schema.
2. `/authorize` with PKCE, state, nonce; ties to a ChallengeSession; issues code on `approved`. Test: full code flow with a scripted assertion.
3. `/token`, `/userinfo`, id_token claims per PRD 8.3. Test: id_token validates with `jose` against JWKS; claims exact.
4. Step-up and enrollment: `acr_values=idz:mfa` with `login_hint` pushes to the bound device and issues `acr: idz:mfa`; `prompt=enroll` runs discovery and returns a new per-site `sub`. Test: step-up on unbound sub → `login_required` error; enroll then step-up succeeds; `acr`/`amr` exact.
5. Verification API: `/v1/verify`, poll, webhook delivery with signed JWT and retry; `reason` shown and signed. Test: approved/denied/timeout paths; webhook signature validates; reason tamper → verify fails.
6. Sessions + back-channel logout: revoke session → POST logout token to site's `backchannel_logout_uri`. Test: mock site receives a valid logout JWT within 1s.
7. Run the `oidc-conformance` basic profile locally via the certification suite in Docker. `[cc+human]` — Claude Code sets it up, human confirms the run. Gate: Basic OP profile passes.

### M5 — Fake phone + e2e harness `[cc]`

Tag: `v0.5.0`

1. `apps/fake-phone`: Node process that registers a device+identity against the local index, polls/receives challenges, and auto-approves (or denies, or ignores) per config. Also a browser UI variant for the playground.
2. Playwright e2e: sample site (Next.js in `e2e/site`) + local index + fake phone → full login, logout, revoke-device-kills-session, second login uses pairing (no QR shown), revoke-pairing forces QR again; Path B: password login on the sample site → enroll → step-up push → `acr: idz:mfa`; Verification API round-trip with a reason string. Test: this _is_ the test. Gate: e2e green in CI.
   From here on, `bun gate` includes e2e.

### M6 — SDK, React, CLI `[cc]`

Tag: `v0.6.0`

1. `@identizen/sdk`: `startLogin({ clientId })` → returns `{ challengeUrl, qrSvg, code, status$ }`; WebSocket to DO; discovery orchestration in order: paired (browser key present) → BLE if `navigator.bluetooth` → QR; deep link on mobile UA. Pairing is on by default: the SDK generates the browser key on first login and stores the pairing ID; `pairing: false` opts out. Test: unit with mocked transports covering the fallback order; e2e via M5.
2. `@identizen/sdk` server helpers: `verify({ sub, reason })` and webhook verification for Node/Bun/Workers; `@identizen/sdk` client: `enroll()` for Path B binding. Test: unit with MSW.
3. `@identizen/react`: Provider, Button, hook, `<IdentizenStepUp />`; Button renders code + QR + "waiting on your phone" states; accessible. Test: RTL + visual snapshot.
4. `identizen` CLI: `init` (register site, write `.env`, scaffold callback route for Next.js/Express), `dev` (spins local index + fake phone), `register-site`. Test: `init` on a fresh Next.js template produces a working login under e2e.
5. Web Bluetooth discovery in SDK, behind feature detection. Test: unit with a mocked `navigator.bluetooth`; real test is `[human]` with a phone.
6. **DX gate `[cc+human]`:** time from a fresh `create-next-app` to logged-in via `identizen init` + `identizen dev`. Target < 5 min. Record it in `planning/dx-benchmark.md`.

### M7 — Web surfaces `[cc]`

Tag: `v0.7.0`

1. `apps/web` (React 19, Vite, Tailwind v4, shadcn, TanStack Query + Router, RHF + Zod): PWA dashboard — devices, paired browsers, sessions, revoke, handle; installable manifest + service worker; feature-folder structure per section 10. Test: Playwright per flow; axe on every route; light and dark snapshots.
2. `apps/marketing` (Astro, Tailwind v4, tokens from `packages/ui`): Home (hero, how it works, DX snippet, sovereignty section), Developers, Pricing (OSS free / Enterprise contact), Blog (content collections, one starter post), About, Legal, Contact (Turnstile → Resend). Playground page with a React island using `@identizen/react` against the demo site + fake phone. Test: Playwright smoke; Lighthouse ≥ 95 in CI; theme toggle persists.
3. `apps/docs` (Astro Starlight, same tokens): Quickstart (Path A), "Add MFA to your existing login" (Path B), framework guides (Next.js, Express, ASP.NET Core, Django at minimum), Verification API reference, self-hosting, enterprise, protocol spec rendered from `spec/`. Test: every code sample extracted and compiled/linted in CI (`docs:verify`); Lighthouse ≥ 95.
4. Self-host: `docker-compose.yml` (Bun + Hono node adapter + Postgres) and a Cloudflare `deploy` button. `[cc+human]` for the Cloudflare side. Test: compose up → e2e suite passes against it.

### M8 — Expo app, JS side `[cc]`

Tag: `v0.8.0`

1. Expo (SDK latest), TypeScript, expo-router, NativeWind (Tailwind v4 on RN) using the same `packages/ui` tokens; Inter loaded via `expo-font`; light/dark follows system with in-app override. Screens: onboarding, passphrase display + 3-word re-entry, restore, home, approve challenge (login, MFA, and transaction variants showing `reason`), devices, paired browsers, settings. Shares `packages/protocol`.
2. Key storage: `expo-secure-store` for the wrapped seed in M8; enclave wrapping replaces it in M9. Biometric gate via `expo-local-authentication`.
3. Deep link handling for `app.identizen.com/l/:id` (`expo-linking`, associated domains config plugin). Fetch challenge, verify index sig, show rp_name + code, approve → sign → POST assertion → open callback in system browser.
4. QR scanning (`expo-camera`). Push receive (`expo-notifications`) → fetch challenge.
5. Tests: Jest + RNTL for screens; protocol package vectors run inside the RN JS runtime (Hermes) to prove crypto parity. **This is the interop gate: the app must reproduce `spec/vectors` on Hermes.**
6. iOS Simulator e2e with Maestro against local index + real browser flow (deep link works in Simulator). `[cc+human]` — human runs it the first time, then CI on a macOS runner.

### M9 — Native modules `[cc+human]`

Tag: `v0.9.0`

1. `modules/idz-enclave` (Swift): generate Secure Enclave P-256 key, wrap/unwrap seed with biometric policy. Claude Code writes module + config plugin + JS API; human builds and validates on device.
2. `modules/idz-ble-peripheral` (Swift, CoreBluetooth): advertise service UUID with rotating ID from `packages/protocol`; background modes entitlement. Human validates against a Chromium laptop running the SDK.
3. `modules/idz-credential-provider` (Swift, AuthenticationServices extension): **Phase 0 spike lives here.** Scaffold the extension target via config plugin; on-device passkey registration and assertion for a test site (confirmed possible on iOS 17+; the spike is about doing it from an Expo-hosted extension). Record the hybrid-transport answer in `spec/PASSKEY-PROVIDER.md` (expected: unavailable; nothing depends on it). Human-driven; Claude Code assists.
4. Android: Kotlin twins of 1 and 2 after iOS is green, plus a Credential Manager provider.
   Gate: human sign-off per module on device; JS-side contract tests pass in CI with mocked modules.

### M9.5 — Desktop companion `[cc+human]`

Tag: `v0.9.5`

1. `apps/companion-mac` (Swift): menu-bar app; CoreBluetooth central to find the phone; native-messaging host; relays via the index. Protocol: run `packages/protocol` in a bundled JavaScriptCore, or a Swift port validated against `spec/vectors` — decide in the PR.
2. `apps/extension` (WebExtension, TypeScript, Vite): intercepts `navigator.credentials.create/get`, forwards to the companion via native messaging, returns the assertion. Safari App Extension built from the same code via `safari-web-extension-converter`.
3. Windows companion: same native-messaging host as a Bun-compiled binary, no BLE, QR fallback. `[cc]`
   Gate: Playwright with the extension loaded against a plain-WebAuthn test site → assertion returned from fake phone; human validates Safari + real phone.

### M10 — Hardening `[cc+human]`

Tag: `v0.10.0` (enterprise — PRD Phase 3 — follows in a separate plan; 1.0 is PRD Phase 4)

1. `spec/THREAT-MODEL.md` written from PRD section 12 plus everything learned. `[cc]`
2. Rate limits on challenge issuance and `/discover/ble`; abuse tests. `[cc]`
3. Dependency audit, SBOM, `bun audit` gate. `[cc]`
4. Load test the DO path (k6): 1k concurrent logins. `[cc+human]` for Cloudflare account limits.
5. TestFlight build, APNs live, universal links live on `app.identizen.com`. `[human]`
6. External security review. `[human]`

---

## 6. Testing strategy summary

| Layer            | Tool                                    | What's gated                                                               |
| ---------------- | --------------------------------------- | -------------------------------------------------------------------------- |
| Protocol         | Vitest, known-answer vectors            | Byte-exact interop; 95% coverage                                           |
| DB               | Vitest + CI Postgres                    | Every query fn; migrations idempotent                                      |
| Index            | Vitest + Miniflare                      | Every endpoint's success and failure branches; DO lifecycle                |
| OIDC             | `jose` validation + conformance suite   | Basic OP profile                                                           |
| SDK/React        | Vitest, Testing Library, MSW, snapshots | Transport fallback order; UI states                                        |
| Web app          | Playwright + axe                        | Every route, both themes                                                   |
| Marketing / docs | Playwright smoke, Lighthouse CI ≥ 95    | Theme persistence, samples compile                                         |
| E2E              | Playwright + fake phone                 | Full login, pairing, logout, revoke → logout, Path B enroll/step-up/verify |
| Mobile JS        | Jest/RNTL + vectors on Hermes           | Screens; crypto parity                                                     |
| Mobile e2e       | Maestro on Simulator                    | Deep-link login end to end                                                 |
| Extension        | Playwright with extension loaded        | WebAuthn interception → assertion via fake phone                           |
| Native           | Human on device                         | Enclave, BLE, extension                                                    |
| Docs             | `docs:verify`                           | Every sample compiles                                                      |

---

## 7. Definition of done (per task)

1. Code + test in the same PR.
2. `bun gate` green.
3. Public API has TSDoc; any protocol change updates `spec/PROTOCOL.md` and regenerates vectors in the same PR.
4. If the task touches a user-visible flow, the docs page for that flow is updated in the same PR.
5. Conventional commit; PR description states which milestone task number it closes.

---

## 8. Things Claude Code must ask before deciding

- Anything that changes `spec/PROTOCOL.md` after M1 is tagged.
- Adding a dependency to `packages/protocol` (keep it to `@noble/*`, `@scure/*`, `zod`).
- Any change to what a site receives in `id_token`.
- Storing anything in the index beyond the schema in section 3.
- Any deviation from the stack (Bun, Hono on Workers, Postgres + Drizzle, React 19 + Vite + Tailwind v4 + shadcn, Astro, Starlight, Expo).

---

## 9. Suggested first prompt to Claude Code

See `identizen-kickoff.md` — that is the starter prompt and lives in the repo as `KICKOFF.md`.

Then, per milestone: "Execute M<n>. One PR per task. Stop at the gate."

---

## 10. `CLAUDE.md` (drop into repo root)

```markdown
# Identizen — working rules

- Source of truth for the protocol is spec/PROTOCOL.md and packages/protocol. Never re-implement signing, canonicalization, or key derivation elsewhere; import it.
- Stack is fixed: TypeScript strict, Bun, Turborepo. Index: Hono on Cloudflare Workers, Postgres (Neon via Hyperdrive) with Drizzle, Durable Objects for in-flight challenges only. Web app: React 19, Vite, Tailwind v4, shadcn/ui, TanStack Query + Router, React Hook Form + Zod, Lucide. Marketing: Astro + Tailwind v4 + React islands. Docs: Astro Starlight. Mobile: Expo/React Native + NativeWind. Ask before deviating.
- Design system lives in packages/ui: Inter, Tailwind v4 CSS-first @theme tokens, neutral surfaces + one accent, light/dark with system default and persistent toggle, WCAG 2.1 AA. shadcn components are restyled through tokens only, never per-component overrides. Every surface — marketing, docs, app, mobile — uses the same tokens.
- Frontend rules: feature folders src/features/<feature>/{routes,components,hooks,api,types}; components are primitive (shadcn), presentational (props in, JSX out, no fetching/router), or route/container. ESLint enforces: no default exports, no any, ≤250 lines per component file, no cross-feature imports except via a feature's index.ts. Server state only in TanStack Query hooks; no global stores.
- One milestone at a time, from identizen-implementation-plan.md; TASKS.md is the checklist. One PR per task. Conventional commits.
- Gate: `bun gate` (lint, typecheck, unit, e2e). Never merge red. Tag `v0.<milestone>.0` when a milestone's gate is green.
- Every task ships with its test. Every protocol change regenerates spec/vectors and updates PROTOCOL.md in the same PR.
- The index stores no secrets. If you find yourself persisting a private key, seed, or plaintext token, stop.
- Tasks tagged [cc+human] or [human]: do the scaffolding, write clear instructions in the PR for what the human must run, and do not mark the task done.
- Ask before: changing id_token claims, adding deps to packages/protocol, adding tables/columns, or touching anything under modules/ without a device to test on.
- DX is the product. If a quickstart step feels like it needs explanation, fix the step, not the docs.
```
