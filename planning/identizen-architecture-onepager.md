# Identizen — Architecture & Positioning

**One line:** Login with your phone. No password, no email, no Google/Microsoft account. One tap, Face ID, in.

**Two lines for site owners:** Standard OIDC. Five-line integration. Your users' identities live on their devices, not in a database you have to protect.

**Or keep your login and add the factor:** push-to-phone MFA and transaction approval with Face ID, over standard OIDC or a Duo-style verification API — no SMS, no TOTP secrets, no big tech, nothing to build.

---

## What it is

Identizen is an open-source identity protocol and product where the user's phone _is_ the identity provider. A keypair is generated on-device at install; the private key never leaves the device. Sites integrate a standard OpenID Connect provider. Logging in means a site discovers the user's phone (paired browser, Bluetooth, QR, or deep link), sends it a challenge, and the user approves with biometrics.

No shared secrets exist anywhere. The index that Identizen hosts is a phonebook, not a vault — a breach yields public keys and nothing an attacker can log in with.

## Two modes

**Path A — primary login.** Identizen replaces "Sign in with Google." First login creates the account from the per-site identifier; no email required.

**Path B — MFA / step-up.** The site keeps its own login and calls Identizen for the second factor: OIDC step-up (`acr_values=idz:mfa`) or a server-to-server Verification API with a displayed, signed `reason` for transaction approval. Enrollment binds a device to an existing account using the site's session as proof. This is the easier first sale.

## Two identity types, one app

|             | Personal                                                           | Org                                     |
| ----------- | ------------------------------------------------------------------ | --------------------------------------- |
| Who owns it | The user                                                           | The organization                        |
| Recovery    | 24-word passphrase shown once at setup; lose it, lose the identity | Admin re-enrolls a replacement device   |
| Revocation  | User-initiated only                                                | Admin can disable any device instantly  |
| Directory   | Any federated index (self-hosted or identizen.com)                 | The org's index (hosted or self-hosted) |

A phone can hold both, like a personal and a work profile. Sites don't care which one signs.

## Login flow

```
Browser (site + SDK)          Index / Relay              Phone (Identizen app)
        │                            │                            │
        │ 1. discover device          │                            │
        │   (paired browser / BLE /   │                            │
        │    QR / deep link on phone) │                            │
        │─────────────────────────────►                            │
        │ 2. resolve ID → public key  │                            │
        │◄─────────────────────────────                            │
        │ 3. challenge {origin, nonce, code, acr, reason?}         │
        │─────────────────────────────►──────── push ─────────────►│
        │                            │        4. show site + code, │
        │                            │           Face ID / Touch ID│
        │                            │◄──── signed assertion ──────│
        │◄─────────────────────────────                            │
        │ 5. verify sig vs public key, OIDC provider issues id_token
```

The site domain is inside the signed challenge, so a phished login on a lookalike domain produces a signature the real site won't accept. Number matching on the phone defeats push-bombing.

## Discovery, by browser

| Situation                                    | Method                                                                | Coverage                             |
| -------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------ |
| Any browser, after first login               | Paired browser — push straight to the phone                           | Zero-typing, steady state everywhere |
| Desktop Chromium (Chrome, Edge), first login | Web Bluetooth scan for nearby phone                                   | Zero-typing                          |
| Safari / Firefox, first login                | QR code shown on screen, phone scans; browser pairs on approval       | Universal fallback                   |
| Logging in from the phone itself             | Universal link into the app, return via callback                      | Simplest and most common case        |
| Plain-WebAuthn sites on a desktop            | Desktop companion + browser extension relays to the phone (Phase 2.5) | Closes the last gap                  |

Passkey support is not optional — it's the cold-start solution. The app is an on-device passkey provider (confirmed possible on iOS 17+ and Android), so on day one it works on every passkey-enabled site the user visits from their phone. The FIDO cross-device role is assumed closed to third parties; browser pairing and the desktop companion cover that case instead. Identizen's own OIDC flow is the upgrade for sites that want push-approve, portable identity, and no big tech.

## Revocation

Disabling a device removes it from the index _and_ fires OIDC back-channel logout to every site with a live session. "We offboarded him Friday" means he's out Friday.

## What Identizen the company hosts

- **identizen.com** — marketing (Astro) with the playground as a React island on the public SDK
- **docs.identizen.com** — Starlight
- **index.identizen.com** — default index/relay; federates with self-hosted indexes
- **app.identizen.com** — PWA dashboard and enterprise console (React 19, Vite, shadcn/ui): devices, sessions, revocation, org fleet, audit, SSO bridging
- **SDK on npm, app on the stores**

## What is open source (everything)

Protocol spec, phone app, index/relay server (single-container self-host), SDKs, OIDC provider incl. step-up and the Verification API, admin console core, desktop companion and browser extension. Apache 2.0. One monorepo.

## Where the money is

- **Enterprise:** per-seat for the org tier — hosted index, fleet management, SSO bridging, audit, compliance packaging, SLA. The Duo playbook.
- **Professional services:** implementation, migration from existing IdPs, custom SDK work.
- **Support contracts** for self-hosters.

## Positioning

Lead with UX ("one tap, Face ID, in") and DX ("five lines, standard OIDC"). Sovereignty — no Google, no Microsoft, no password database — is the second sentence. It closes the privacy-native niche and regulated/EU enterprises; it won't move the average SaaS shop, and it doesn't need to.

## Build order (mirrors the PRD roadmap)

0. Spike, in parallel: on-device passkey provider inside an Expo-hosted extension; record the hybrid-transport answer without depending on it
1. Personal identity, mobile-first: protocol, index, OIDC (Path A and Path B), SDK, e2e harness, Expo app (iOS) with passphrase recovery and deep-link login
2. Desktop and everywhere: QR, browser pairing on by default, Web Bluetooth, on-device passkey provider, self-host + federation, Android build
   2.5. Desktop companion + extension for plain-WebAuthn sites
3. Enterprise: org identity, console, back-channel logout, SSO bridging, SCIM
4. 1.0: audit, conformance suite, pricing

## Stack

TypeScript end to end, on Cloudflare, Bun for tooling. Hono on Workers for the index API and OIDC provider; Postgres (Neon via Hyperdrive, Drizzle) for index state — identities, devices, sites, orgs, revocation, audit. Durable Objects only for the live part of a login: the short-lived challenge session that bridges a waiting browser and a phone (WebSocket to the browser, push to the phone). React 19 + Vite + Tailwind v4 + shadcn/ui for the app; Astro for marketing, Starlight for docs; one Inter-based token set in `packages/ui` with light/dark across every surface. Ed25519 keys, BIP39-style seed derivation, Secure Enclave / StrongBox for at-rest protection. Expo / React Native for the authenticator, iOS first, sharing components with the web; three native Expo modules (enclave key wrapping, BLE peripheral, passkey credential-provider extension) are the only Swift/Kotlin, and Android follows once iOS is proven.
