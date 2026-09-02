# Identizen — Product Requirements Document

**Version:** 0.2 (draft)
**Owner:** George Rios
**Date:** August 31, 2026
**Status:** For review

---

## 1. Summary

Identizen is an open-source, device-based identity system. The user's phone holds their identity; the private key is generated on-device and never leaves it. Sites integrate a standard OpenID Connect provider and get one-tap biometric login with no passwords, no emails, and no dependency on Google, Microsoft, Apple, or any other identity broker.

The product has two audiences with two success criteria:

- **Developers:** integrate in under five minutes using tools they already know.
- **End users:** one tap, Face ID, in. Nothing to type, nothing to remember.

It works in two modes: as a site's primary login (Path A), or as a push-to-phone MFA and transaction-approval factor layered on the site's existing login (Path B) — the easier first sale for security-conscious SaaS that want device biometrics over standard protocols without building any of it or depending on big tech.

Everything is open source. Revenue comes from the enterprise tier (org-controlled identities, hosted infrastructure, SSO bridging, support) and professional services.

## 2. Problem

**For users.** Every site wants an account. The choices are a password (reused, leaked, forgotten), a magic link (slow, lands in spam), or "Sign in with Google" (hands one company a map of everywhere you go). Passkeys fix the password problem but are synced through Apple, Google, and Microsoft — the identity still lives with big tech.

**For site owners.** Running auth means running a password database, which means being one breach away from a very bad week. Delegating to Google means every user must have a Google account and Google can see your user base. Existing hosted IdPs (Auth0, Clerk) are excellent for DX but are yet another third party holding your users.

**For organizations.** Offboarding is a checklist across dozens of SaaS tools. Lost devices are a scramble. MFA is a second app with codes nobody likes.

## 3. Goals and non-goals

### Goals

1. Login UX that beats "Sign in with Google": fewer steps, no account required with anyone.
2. Developer integration on par with Clerk: `npm install`, one component, done.
3. Zero shared secrets. Nothing in any Identizen-hosted system can be used to impersonate a user.
4. Works everywhere: every browser and OS via layered discovery (paired browser, Bluetooth, QR, deep link), plus a desktop companion for plain-WebAuthn sites.
5. Fully self-hostable. A site or org can run the entire stack with no Identizen-operated service in the path.
6. Enterprise: instant device revocation with session logout everywhere.

### Non-goals (v1)

- Replacing Okta/Entra as a workforce IdP. Identizen bridges into them; it does not replace them.
- Verifiable credentials / attribute sharing (age, employment). Designed for, not built.
- Social recovery. Personal recovery is passphrase-only in v1.
- Web3 / blockchain anchoring. Not needed; adds nothing.
- Desktop apps as authenticators. The phone is the authenticator; the desktop companion (Phase 2.5) only relays to it and never holds keys.

## 4. Users and personas

| Persona                                                        | What they want                                             | What they'll tolerate                             |
| -------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------- |
| **Indie developer / small SaaS**                               | Login that works, looks modern, takes an afternoon         | Will not read a spec. Will copy the quickstart.   |
| **Privacy-native builder** (Fediverse, self-hosters, EU indie) | No big tech in the chain, self-hostable, open license      | Will read the spec and file issues                |
| **Enterprise IT / security**                                   | Device control, revocation, audit, SSO into what they have | Procurement, compliance questionnaires, SLA       |
| **End user (personal)**                                        | Tap, Face ID, done. Never think about it again.            | Will lose the passphrase and be angry             |
| **End user (employee)**                                        | Same, plus "IT set it up for me"                           | Will call the help desk when they get a new phone |

## 5. Product principles

1. **The phone is the identity.** The keypair on the device is the user. Even in Path B, where a site uses Identizen as its second factor, the phone signs as an identity — it is never a code generator or a companion to something else.
2. **The index is a phonebook, not a vault.** Anything Identizen hosts must be safe to leak.
3. **Standard on the outside.** Sites see OIDC. Browsers see WebAuthn. No custom protocol at the integration boundary.
4. **DX is the product.** If integration takes more than five minutes or the docs need a "concepts" chapter before the quickstart, it's a bug.
5. **The phone screen is the whole UX.** Site name, match code, Face ID — plus the `reason` when a site supplies one for step-up or transaction approval. Nothing else.
6. **Everything ships open.** The enterprise tier is hosting, control, and support — not withheld features that make the OSS version worse.

## 6. Core concepts

### 6.1 Identity

An identity is an Ed25519 keypair. The public key (or a hash of it) is the identifier. Optionally mapped to a human handle: `george@identizen.com` or `george@my-own-index.example`.

**Personal identity** — derived from a BIP39-style 24-word seed generated on-device at setup. The seed is encrypted at rest under a Secure Enclave / StrongBox key gated by biometrics. Daily use looks hardware-bound; recovery regenerates the identical identity from the phrase.

**Org identity** — issued by an org. Keys still generated on-device (the org never sees the private key). The org's index decides whether the device is currently allowed. No user-held recovery; the admin re-enrolls.

Per-site derived keys are supported so that two sites cannot correlate a user without the user's consent. Default on for personal identities.

### 6.2 Device

A device is an installed Identizen app holding one or more identities. Devices register with an index and hold:

- Public key(s)
- Rotating BLE identifier (rotates every ~15 minutes; resolvable only by the index)
- Push token
- Device attestation (App Attest / Play Integrity) at enrollment

### 6.3 Browser pairing

A pairing is a browser profile bound to a device after a successful QR or BLE login. It holds a signed binding token (device ID, browser key, issued-at) and lets later logins from that browser push directly to the phone. Pairings are first-class objects: listed, named ("Safari on MacBook"), and revocable. They exist so the zero-typing flow works on browsers without Web Bluetooth.

### 6.4 Index

The directory. Maps handle → public key → current device reachability. Stateless with respect to secrets. Federated: an index can resolve handles on other indexes via WebFinger-style discovery on the handle's domain.

Roles: relay login challenges to devices, serve public keys to sites, store revocation state, fire back-channel logout.

### 6.5 Site (Relying Party)

Any web app or service that has integrated the SDK. Registered with an index (or self-hosts its own). Receives a standard OIDC `id_token` containing the user's public-key identifier and, optionally, a handle.

### 6.6 Organization

A tenant in the enterprise tier. Owns an index (hosted or self-hosted), a device fleet, and a set of org identities. Admins can enroll, disable, and re-enroll devices, and bridge to an existing IdP.

## 7. User experience

### 7.1 First-time setup (personal)

1. Install app. Open.
2. "Create your identity." One button.
3. Face ID / Touch ID to protect it.
4. Recovery passphrase shown once. Copy-to-clipboard disabled by default; screenshot detection warns. User must re-enter 3 randomly chosen words to continue.
5. Optional: choose a handle.
6. Done. Total time under 60 seconds.

Design note: frame the passphrase as _your identity_, not a password. "If you lose this, no one — including us — can get it back." This is the only place the app is allowed to be serious.

### 7.2 Login from a desktop browser

1. User clicks **Continue with Identizen** on a site.
2. Browser attempts discovery in order:
   a. **Paired browser:** a device-binding token from a previous login is present; the index pushes straight to that phone. Skip to step 3. This is the steady-state path on every browser.
   b. Web Bluetooth (Chromium): finds the nearby phone; skip to step 3.
   c. QR code displayed; user scans with the app. On approval the browser is paired for next time.
3. Phone buzzes. Screen shows: site name, site favicon, a 2-digit match code that the browser is also showing, the `reason` if this is a step-up or transaction approval, and a Face ID prompt.
4. User approves. Browser is logged in. Total user actions: one click, one biometric.

**Pairing.** The device-binding token is a long-lived, signed credential tied to that browser profile and the user's device ID, stored by the SDK. It skips discovery, not approval: the phone still shows the site name and match code. Pairings are listed and revocable in the dashboard like devices, and are revoked automatically when the device is.

### 7.3 Login from the phone itself

1. User taps **Continue with Identizen** in mobile Safari / Chrome.
2. Universal link opens the app with the challenge.
3. Face ID.
4. App returns to the browser via callback URL. Logged in.

No Bluetooth, no push, no relay. This is the most common flow and the simplest to build.

### 7.4 Login when the phone is not present

Not supported for personal identities in v1. The site shows "Your Identizen device is required." A user with a second enrolled device can use that. This is a deliberate constraint, not a gap — it's the security model.

### 7.5 New phone (personal)

1. Install app. "Restore an identity."
2. Enter 24 words.
3. Face ID to protect it.
4. Identity is identical. Old device can be revoked from the new one.

### 7.6 New phone (org)

1. Admin sends enrollment link (email, MDM, QR at the help desk).
2. User installs app, taps link.
3. Device attests. Admin approves (or auto-approves per policy).
4. Old device disabled; all sessions logged out.

### 7.7 Revocation

**Personal:** from any enrolled device, or from a recovery flow using the passphrase.
**Org:** admin console, one switch. Index marks the device disabled; back-channel logout fires to every site with a live session for that identity. Target: sessions dead within 5 seconds.

## 8. Developer experience

### 8.1 Integration target

```bash
npm install @identizen/sdk
```

```tsx
import { IdentizenProvider, IdentizenButton, useIdentizen } from '@identizen/react';

<IdentizenProvider clientId="idz_live_...">
  <IdentizenButton onSuccess={(user) => router.push('/dashboard')} />
</IdentizenProvider>;
```

Server side is standard OIDC. Any existing library works: NextAuth/Auth.js, Passport, Spring Security, ASP.NET Core Identity, Django allauth. Identizen publishes adapters only where the framework needs a one-line provider config.

### 8.2 Requirements

- **Quickstart to working login in under five minutes**, measured from a fresh Next.js app. This is the primary DX metric.
- **Framework quickstarts on day one:** Next.js, Remix, SvelteKit, Nuxt, plain HTML, Express, ASP.NET Core, Django, Rails.
- **Local dev mode:** `identizen dev` runs a local index and a fake phone in the terminal (or a browser tab) that auto-approves. No real phone needed to develop.
- **CLI:** `identizen init` registers a site, writes the client ID to `.env`, and scaffolds the callback route.
- **Playground:** identizen.com/playground — try a login with your real phone against a demo site before writing any code.
- **Self-host in one command:** `docker run identizen/index` or a single Cloudflare Worker deploy. Configuration by environment variables only.
- **Typed SDK:** full TypeScript types; the `user` object is documented and stable.
- **Errors that say what to do:** every SDK error has a code, a one-line cause, and a link to the fix.
- **Docs structure:** Quickstart (Path A) → Add MFA to your existing login (Path B) → Framework guides → Verification API → Self-hosting → Enterprise → Protocol spec. Concepts live in the spec, not in front of the quickstart. Starlight, with the same Inter/token theme as the product so docs and app feel like one thing.

### 8.3 What a site receives

`id_token` claims:

| Claim        | Value                                                  |
| ------------ | ------------------------------------------------------ |
| `sub`        | Stable per-site identifier (derived key hash)          |
| `idz_handle` | Optional human handle, if the user released it         |
| `idz_device` | Opaque device ID, for the site's own session/device UI |
| `idz_org`    | Org identifier, for org identities                     |
| `amr`        | `["face", "hwk"]` or similar, per OIDC                 |
| `acr`        | `idz:login` (primary) or `idz:mfa` (step-up)           |

No email. If a site needs an email, it asks the user after login like any app. Attribute release is a v2 feature.

### 8.4 Look and feel

Developer-grade and modern: neutral surface palette with one confident accent, Inter throughout, generous whitespace, monospace for anything a developer will copy, dense but calm. Light and dark themes with system-preference default and a persistent toggle, on every surface including the phone app. No marketing gloss; the marketing site should look like the docs site's older sibling. Lighthouse ≥ 95 on marketing and docs.

### 8.5 Path B — Identizen as MFA / step-up for existing logins

The first sale for most SaaS is not "replace your login," it's "replace your SMS codes and authenticator apps with a push to the user's phone, approved with Face ID, without building any of it and without Google or Microsoft in the chain." Path B is the same product invoked in a second mode.

#### 8.5.1 Two integration styles

**OIDC step-up (recommended).** After the site's own primary auth (password, magic link, SSO), it redirects to Identizen's `/authorize` with `acr_values=idz:mfa` and `login_hint=<bound sub>`. Identizen pushes to the bound device, the user approves with biometrics, and the site receives an `id_token` with `acr: "idz:mfa"` and `amr: ["face","hwk"]` (or `["fingerprint","hwk"]`), proving possession plus biometric. Works with any OIDC library the site already has.

**Verification API (for non-OIDC or server-driven flows).** `POST /v1/verify { sub, reason }` (the site is identified by its client credentials) → Identizen pushes to the device and returns a verification ID; the site polls or receives a webhook with `approved | denied | timeout` plus the signed assertion. This is the Duo Auth API shape: a backend, a CLI, an SSH login, or a transaction-signing step can all use it. Same signed-assertion guarantees, no browser required.

#### 8.5.2 Enrollment (binding an Identizen device to an existing account)

1. User is logged in to the site by its existing means.
2. Site calls the SDK's `enroll()` or redirects with `prompt=enroll`. Identizen runs the normal discovery (deep link, BLE, QR) and the user approves on the phone.
3. Identizen issues a `sub` for that `rp_id` (TOFU per-site binding as in section 6.1) and returns it; the site stores `sub` on the user record.
4. From then on, step-up and verification target that `sub`.

The site's existing session is the proof of identity at enrollment; Identizen does not need to know who the user is beyond the per-site `sub`.

#### 8.5.3 Transaction signing

`reason` in the verification request is displayed on the phone: "Approve wire transfer of $12,000 to Acme?" The user's approval signs a hash of the reason along with the challenge, so the site holds non-repudiable evidence of what was approved. This is the feature security-conscious apps ask for and SMS cannot provide.

#### 8.5.4 What Path B gives a security-conscious SaaS

- Phishing-resistant second factor: the site origin is inside what the phone signs; a push generated by a lookalike domain fails verification.
- No SMS, no TOTP secrets to store, no authenticator-app onboarding.
- Standard protocols only: OIDC, JWT, WebAuthn-style assertions. Nothing proprietary at the integration boundary.
- Device revocation kills the second factor immediately; in the enterprise tier the org does it, not the user.
- Number matching and rate limiting by default, so push fatigue attacks fail.
- Self-hostable, so a regulated app can run the whole MFA path inside its own boundary with no third party.

#### 8.5.5 Fallback

Sites keep their own recovery path (email, recovery codes) for users who lose the phone and lack a second device or passphrase. Identizen does not attempt to own account recovery in Path B; it owns the factor.

## 9. Enterprise tier

### 9.1 What the org gets

- **Hosted org index** with SLA, or a supported self-host.
- **Device fleet console:** enroll, disable, re-enroll, see last-seen, see attestation status.
- **Instant revocation** with back-channel logout to every connected site.
- **SSO bridging:** Identizen as an OIDC/SAML IdP into Okta, Entra ID, Google Workspace, or directly into SaaS apps. This is how it fits into what the org already runs instead of replacing it.
- **Policy:** require attestation, require biometric class, geo/time rules, auto-approve enrollment from MDM.
- **Audit log:** every login, approval, denial, enrollment, and revocation. Exportable. SIEM-friendly.
- **SCIM** for user lifecycle from the HR system.
- **Compliance packaging:** SOC 2 report, DPA, pen-test summary, data residency (EU/US).

### 9.2 What the org does not get

The org never holds a private key and cannot log in as a user. Revocation is the org's power; impersonation is not. This is a selling point, and it's also what makes the security story simple.

### 9.3 Pricing model (to validate)

Per active device per month. Free tier for the first N devices so the OSS self-host story and the hosted story start in the same place. Professional services quoted separately: migration, custom adapters, on-site implementation.

## 10. What Identizen hosts

| Property                             | Purpose                                                                                                                           | Open source?                 |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **identizen.com**                    | Marketing, positioning, pricing, blog — Astro static, Tailwind v4, Very modern, clean aesthetics, React islands only where needed | Yes                          |
| **identizen.com/playground**         | Try a login with your real phone — a React island using the public SDK, dogfooding the integration                                | Yes                          |
| **docs.identizen.com**               | All documentation, spec, quickstarts — Astro Starlight                                                                            | Yes                          |
| **index.identizen.com**              | Default public index/relay for personal identities; federates with self-hosted indexes — Hono on Workers                          | Yes (same code as self-host) |
| **app.identizen.com**                | Installable PWA: manage devices, handle, sessions, revoke — React 19 + Vite + shadcn/ui                                           | Yes                          |
| **console.identizen.com**            | Enterprise console (hosted) — same React app, org routes                                                                          | Core yes; hosted ops no      |
| **App Store / Play Store**           | Expo / React Native authenticator app                                                                                             | Yes                          |
| **Mac App Store / extension stores** | Desktop companion + browser extension (Phase 2.5)                                                                                 | Yes                          |
| **npm: @identizen/\***               | SDK, React/Vue/Svelte bindings, CLI                                                                                               | Yes                          |
| **status.identizen.com**             | Uptime                                                                                                                            | —                            |

**A note on the PWA.** The web app is installable and handles account management, device listing, and revocation. It cannot be the authenticator: a PWA cannot advertise over Bluetooth, cannot act as a passkey/credential provider, and cannot hold enclave-backed keys. The authenticator is an Expo / React Native app with native modules for those three capabilities. The PWA and the app share React components and the core crypto/OIDC logic; the split is capability, not codebase.

## 11. Open source

**License:** Apache 2.0 across the board.

**Repository:** one monorepo, `identizen/identizen`, laid out per the implementation plan:

- `spec/` — protocol specification, threat model, test vectors
- `packages/protocol`, `packages/sdk`, `packages/react`, `packages/cli`, `packages/ui`
- `apps/index` — index/relay server and OIDC provider
- `apps/mobile` — Expo / React Native authenticator (iOS first, Android second) with native modules for enclave key wrapping, BLE peripheral, and the credential provider
- `apps/web` (dashboard + console), `apps/marketing`, `apps/docs`
- `apps/companion-mac`, `apps/extension` (Phase 2.5)

Splitting into separate repos is a later decision, taken only if external contributors need it.

**Governance:** BDFL initially; a lightweight RFC process for spec changes once there are external implementers. Conformance test suite so third-party indexes and apps can prove interop.

**The enterprise hook** is not a feature gate. It is: we run it for you, we support you, we sign the DPA, we bridge it into your IdP, and we're on the phone when something breaks. Everything a customer pays for can be reproduced by a capable team running the OSS — they pay because they'd rather not.

## 12. Security requirements

- Private keys are never exportable in normal operation; the seed is encrypted at rest under an enclave-protected key with biometric gating.
- Every challenge includes the site origin, a nonce, and a short TTL (60s). Signatures over a mismatched origin are rejected. This is the anti-phishing guarantee.
- Number matching on every push approval. Approval without the code displayed is not possible.
- BLE identifiers rotate; the index resolves them only in response to a registered site's challenge. A passive observer cannot track a user by BLE.
- Device attestation (App Attest / Play Integrity) at enrollment; policy can require it for every login in the org tier.
- The index stores no secrets. Public keys, push tokens, rotating IDs, revocation state, and audit events only.
- Back-channel logout per OIDC spec; sites must implement the logout endpoint to be listed as "enterprise-ready."
- Rate limiting on challenge issuance per device to blunt push-bombing even with number matching.
- Published threat model in the spec repo. Third-party audit before 1.0.

## 13. Discovery and platform support matrix

| Browser / OS          | Paired push | BLE via SDK | QR  | Deep link | Desktop companion                    |
| --------------------- | ----------- | ----------- | --- | --------- | ------------------------------------ |
| Chrome / Edge desktop | ✅          | ✅          | ✅  | —         | ✅ (Phase 2.5)                       |
| Safari macOS          | ✅          | ❌          | ✅  | —         | ✅ (Phase 2.5, with BLE via Mac app) |
| Firefox desktop       | ✅          | ❌          | ✅  | —         | ✅ (Phase 2.5)                       |
| Safari iOS            | —           | —           | —   | ✅        | —                                    |
| Chrome Android        | —           | —           | —   | ✅        | —                                    |

**Passkeys.** Third-party passkey providers are supported on-device on iOS (17+, AuthenticationServices credential provider extension) and Android (Credential Manager); this is confirmed and is how 1Password and Bitwarden work. The app being a passkey provider therefore covers logins made _on the phone itself_ to any passkey-enabled site. The FIDO cross-device (hybrid) role — a laptop shows a QR, the phone answers — appears reserved for the platform's own keychain on both iOS and Android; assume it is unavailable to third parties. The Phase 0 spike confirms the on-device provider inside the Expo-hosted extension and records the hybrid answer, but nothing in the roadmap depends on hybrid being open.

**Desktop companion (Phase 2.5).** For plain-WebAuthn sites that have not integrated Identizen, a small Mac app plus Safari App Extension (and a WebExtension for Chrome/Firefox, with a lighter companion on Windows/Linux) intercepts `navigator.credentials` calls, relays the challenge to the phone through the index, and returns the assertion. The Mac app supplies CoreBluetooth proximity even in Safari. Same protocol package, same relay. This is the 1Password architecture and closes the last gap.

## 14. Stack

| Layer                   | Choice                                                                                             | Notes                                                                                                                                                                                                                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime                 | Cloudflare Workers                                                                                 | Index API, OIDC provider, relay, back-channel logout dispatcher                                                                                                                                                                                                                                                       |
| API                     | Hono                                                                                               | Routes, middleware, OIDC endpoints (`/.well-known/openid-configuration`, `/authorize`, `/token`, `/jwks`, `/backchannel-logout`)                                                                                                                                                                                      |
| Database                | Postgres (Neon) via Hyperdrive, Drizzle ORM                                                        | Identities, devices, sites, orgs, revocation state, audit log. One schema; multi-tenant by org ID. Self-hosters bring any Postgres.                                                                                                                                                                                   |
| Live login coordination | Durable Objects                                                                                    | One DO per in-flight challenge: browser holds a WebSocket, phone answers via push/deep link, DO verifies and resolves. 60s TTL, no persistence beyond the login.                                                                                                                                                      |
| Push                    | APNs / FCM                                                                                         | The one unavoidable big-tech dependency, transport only; payload is just a challenge ID                                                                                                                                                                                                                               |
| Web app                 | React 19, Vite, Tailwind v4, shadcn/ui, TanStack Query + Router, React Hook Form + Zod, Lucide     | PWA dashboard and enterprise console, one app                                                                                                                                                                                                                                                                         |
| Marketing               | Astro (static), Tailwind v4, React islands                                                         | identizen.com; playground is a React island on the public SDK                                                                                                                                                                                                                                                         |
| Docs                    | Astro Starlight                                                                                    | docs.identizen.com; every code sample compiled in CI                                                                                                                                                                                                                                                                  |
| Design system           | Inter, Tailwind v4 CSS-first `@theme` tokens in `packages/ui`, shadcn restyled through tokens only | Shared by marketing, docs, app, and mobile; light/dark with system default + persistent toggle; WCAG 2.1 AA                                                                                                                                                                                                           |
| Tooling                 | Bun, Turborepo, Vitest + Testing Library + MSW, Playwright, Changesets                             | `bun gate` is the merge gate                                                                                                                                                                                                                                                                                          |
| SDK                     | TypeScript, framework-agnostic core + `@identizen/react`                                           | Vite library build; CLI in the same monorepo                                                                                                                                                                                                                                                                          |
| Mobile apps             | Expo / React Native, iOS first                                                                     | Authenticator UI and logic shared with the web dashboard. Three pieces stay native (Swift, then Kotlin): BLE peripheral advertising, the passkey credential-provider extension, and Secure Enclave / StrongBox key wrapping — each exposed to JS as an Expo module. Android follows the same path once iOS is proven. |
| Crypto                  | Ed25519, BIP39 seed → HKDF per-site derivation                                                     | Test vectors in the spec repo                                                                                                                                                                                                                                                                                         |
| Self-host               | Single Worker deploy + Postgres, or Docker (Bun + Hono node adapter + Postgres) for non-Cloudflare | Same codebase; adapter layer for DO vs. in-process session store                                                                                                                                                                                                                                                      |

## 15. Metrics

**DX**

- Time from `npm install` to first successful login on a fresh Next.js app (target: < 5 min)
- Quickstart completion rate (instrumented in the playground)
- GitHub stars, forks, external PRs, third-party index deployments

**UX**

- Login success rate on first attempt (target: > 97%)
- Median login time, click to logged-in (target: < 4s with BLE, < 10s with QR)
- Passphrase re-entry pass rate at setup; support tickets citing lost passphrase

**Business**

- Sites integrated (OSS, hosted)
- Enterprise pilots → paid; devices under management; net revenue retention
- Revocation-to-logout latency (target: < 5s p99)

## 16. Roadmap

### Phase 0 — Feasibility spike (weeks 1–4)

- Expo app skeleton with three native modules: enclave key wrapping, BLE peripheral advertising, credential-provider extension (Swift, via config plugin)
- On-device passkey registration and assertion for a test site from the Expo-hosted extension (confirmed possible on iOS 17+; the spike is about doing it from Expo)
- Record whether the extension can participate in FIDO hybrid transport (expected: no) in `spec/PASSKEY-PROVIDER.md`; nothing depends on the answer
- Confirm Expo prebuild + EAS can ship an app with an extension target without ejecting
- Android deferred; scope the Credential Manager equivalent only after iOS is go

### Phase 1 — Personal identity, mobile-first (months 1–3)

- Expo app (iOS): create identity, passphrase recovery, Face ID / Touch ID
- Deep-link login from the phone's own browser
- Index/relay on Cloudflare Workers + Durable Objects
- OIDC provider (Path A), JS SDK, React binding, CLI, local dev mode
- Path B: OIDC step-up (`acr_values=idz:mfa`), enrollment for existing accounts, Verification API with webhooks, transaction signing
- Docs and playground live
- Ship to the privacy-native niche and gather issues

### Phase 2 — Desktop and everywhere (months 3–6)

- QR login
- Browser pairing: pair once on QR/BLE, push-only thereafter, on every browser
- Web Bluetooth discovery in Chromium
- On-device passkey provider shipped in the app
- Self-host index in one command; federation via WebFinger
- Framework quickstarts complete; per-site derived keys default on
- Android build of the same Expo app; Kotlin equivalents of the three native modules

### Phase 2.5 — Desktop companion (months 5–7, overlaps Phase 3)

- Mac companion app (Swift, CoreBluetooth) + Safari App Extension intercepting WebAuthn
- WebExtension for Chrome/Firefox using native messaging to the companion
- Windows companion (lighter; no BLE in v1) or QR-only

### Phase 3 — Enterprise (months 6–10)

- Org identities, enrollment, attestation policy
- Console: fleet, revocation, audit
- Back-channel logout
- SSO bridging (OIDC/SAML out), SCIM in
- First design-partner pilots; SOC 2 process starts

### Phase 4 — 1.0 (months 10–12)

- Third-party security audit
- Conformance suite for external indexes/apps
- Pricing live; support contracts; professional services offer

## 17. Questions and Answers

1. **Hybrid transport** — on-device passkey provider is confirmed; assume the cross-device role stays closed. Is it worth filing Apple feedback and tracking CXP/FIDO developments, or just treating the desktop companion as the permanent answer? Answer: lets leave desktop but may not be permanent answer.
2. **Handle namespace** — do personal identities default to `@identizen.com`, or is the default handle-less (public key only) to avoid making identizen.com look like a required central account? Answer: I want to skip anything that 'looks or feels' like an Identizen account email, then it's not much different than gmail.com/live.com/etc account.
3. **Passphrase loss rate** — what is acceptable for the niche, and at what point do we add a second-device or Shamir-share recovery for personal identities? Answer: Yes, open to Sharmir-share
4. **Free tier boundary** for the hosted org index. Answer: Yes; path for business-dev and growth
5. **Should sites be able to require an org identity** (workforce-only login) via a client-side flag, and does that belong in v1? Answer: Yes.
6. **Naming of the button** — "Continue with Identizen" vs "Sign in with your phone." The second explains itself; the first builds the brand. Answer: Lets test both in the playground.

## 18. Risks

| Risk                                                               | Impact                                                              | Mitigation                                                                                                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Cold start (no sites, no users)                                    | Fatal if unaddressed                                                | Passkey provider gives users value on day one; enterprise gives sites value without needing consumer adoption                       |
| Passkeys make "passwordless" table stakes                          | Erodes the UX headline                                              | Lead with portable, sovereign identity and push-approve UX; passkeys are a feature, not the competitor                              |
| Cross-device passkey role stays closed to third parties (expected) | No zero-typing passkey flow in Safari/Firefox without extra install | Browser pairing gives zero-typing on the Identizen flow everywhere after first login; desktop companion covers plain-WebAuthn sites |
| Apple restricts background BLE advertising                         | BLE discovery unreliable when app is backgrounded                   | Pairing removes the need for BLE on repeat logins; QR always available                                                              |
| Passphrase loss hurts the brand                                    | Support burden, bad reviews                                         | Forced re-entry at setup; clear framing; second-device recovery in v2                                                               |
| Enterprise sales cycle                                             | Slow revenue                                                        | Design partners from existing network (insurance-tech agencies with many carrier portals)                                           |
| OSS competitors add device-based login                             | Commoditization                                                     | Own the phone app and the user relationship; that's the part they can't copy by adding a feature                                    |
