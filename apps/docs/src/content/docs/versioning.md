---
title: Versioning, stability, and changelog
description: What "protocol v1" freezes, what may still change before 1.0, how the npm packages are versioned, and where breaking changes are announced.
---

Two things carry a version: the protocol and the npm packages. The protocol is `v1`. The packages are `0.1.x`. This page says what each number promises and where to look when something changes.

## What "protocol v1" means

The protocol is [`spec/PROTOCOL.md`](https://github.com/identizen/platform/blob/main/spec/PROTOCOL.md), rendered on the [Protocol v1](/protocol/) page. Its status line reads "Draft, frozen at tag `v0.1.0`". The string `v1` is part of the wire format, so a change to any of the following is a new protocol version, not an edit of v1:

| Fixed in v1            | Value                                                                                                                                                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Key derivation         | HKDF-SHA256 over the 32-byte seed with salt `identizen/v1/master` (info empty) and `identizen/v1/site` (info = `rp_id`); the 32-byte output is the Ed25519 private key                                                             |
| Identifiers            | `idz` and `sub` are `base64url(SHA-256(publicKey))[0:32]`; `sub` hashes the per-site key, so the same seed gives the same `sub` for a host on any index                                                                            |
| Canonical encoding     | JCS (RFC 8785); byte strings as base64url without padding                                                                                                                                                                          |
| Signature domain       | `Ed25519.sign(key, UTF8("identizen/v1/" + type + "\n" + canonicalize(payload)))` for the types `challenge`, `assertion`, `pairing`, `identity`, and `request`                                                                      |
| Challenge              | Fields `type, id, rp_id, rp_name, nonce, code, iat, exp, index, acr, reason`; `exp - iat = 60`; signed by the index key                                                                                                            |
| Assertion              | Fields `type, challenge_id, nonce, rp_id, sub, site_pubkey, device_id, iat, amr, acr, reason_hash`; signed twice (`site_sig`, `device_sig`); the verification order in section 4.1                                                 |
| Request authentication | `Idz-Signature: v1,d=<device_id>,t=<unix seconds>,s=<sig>` over `identizen/v1/request\n` + method, path, body hash, and time; ±60 s window with replay rejection                                                                   |
| Browser pairing        | ECDSA P-256 over `identizen/v1/paired\n` + `challenge_id`; the pairing record signed by the index key                                                                                                                              |
| BLE                    | Service UUID `f1d0e1a2-1d2e-4b0c-9c0d-1d3e2f4a5b6c`, characteristic `…5b6d`, `HMAC-SHA256(ble_key, floor(now / 900))[0:16]`                                                                                                        |
| Push payload           | `{ "challenge_id": "ch_…" }` and nothing else; the device inbox is the delivery of record                                                                                                                                          |
| Identifier prefixes    | `ch_`, `dev_`, `pr_`, `vf_`, `idz_live_` / `idz_test_`, all ULIDs                                                                                                                                                                  |
| Index metadata         | `GET /.well-known/identizen` returns `"protocol": "identizen/v1"` with the pinned `index_pubkey`                                                                                                                                   |
| OIDC surface           | Authorization Code with PKCE S256 only, no refresh tokens; the id_token claims in section 5 (`iss, sub, aud, iat, exp, nonce, sid, amr, acr, auth_time, at_hash, idz_device`, optional `idz_handle` and `idz_org`); no email claim |

The test vectors in [`spec/vectors`](https://github.com/identizen/platform/tree/main/spec/vectors) (`keys`, `canonicalize`, `challenge`, `assertion`, `pairing`, `request`, `ble`) are the interoperability contract. `@identizen/protocol` is the only implementation; every other package imports it. A protocol change regenerates the vectors and updates `PROTOCOL.md` in the same pull request.

## What may still change before 1.0

The spec and the [threat model](/protocol/threat-model/) mark these as planned or open. Build on them with care:

- **Planned, not in v1.** The passkey provider (section 6.5), the desktop companion (section 6.6), Secure Enclave / StrongBox wrapping of the phone's keys (section 1), and identities registered with more than one index at a time.
- **`hwk` in `amr`.** Reserved for hardware-isolated key storage, which has not shipped; no Identizen client asserts it today, and `amr` always describes what actually verified the person (`face`, `fingerprint`, `iris`, `pin`, `user`, or `swk`). The array shape does not change when `hwk` starts to appear.
- **`ttl` on `POST /v1/verify`.** Accepted and reserved. v1 always uses the 60-second challenge lifetime. A later release may honour it.
- **`idz_org`.** The claim is in the id_token and `/userinfo` for identities with an `org_id`, and nothing assigns an `org_id` yet. Org enrollment, the fleet console, policy, SSO bridging, and SCIM are on the [enterprise roadmap](/enterprise/), not built. Treat `idz_org` as optional and absent.
- **Attestation.** `POST /devices` stores an `attestation` object and nothing enforces it. Enforcement will add a policy surface.
- **Index key rotation.** Phones pin the index signing key at registration and there is no re-pin flow. Threat model open item 1 says a rotation needs a signed cross-certification of the new key; that adds a message type when it lands. See [Running an index in production](/self-hosting-production/).
- **External review.** The threat model has not been reviewed independently; that review is planned before 1.0 and may change details.

Everything outside `PROTOCOL.md` is product surface, not protocol: the `/me` responses, the hosted login page, the dashboard, the CLI's scaffolding output. Those follow the package rules below.

## npm packages

| Package                 | Version | What it is                                                                                                |
| ----------------------- | ------- | --------------------------------------------------------------------------------------------------------- |
| `@identizen/protocol`   | 0.1.0   | Keys, canonicalization, signing, verification, test-vector generator                                      |
| `@identizen/sdk`        | 0.1.1   | Browser client, `@identizen/sdk/server` (code exchange, token and webhook verification, Verification API) |
| `@identizen/react`      | 0.1.1   | Button, hooks, provider                                                                                   |
| `identizen`             | 0.1.0   | CLI: `init`, `dev`, `register-site`                                                                       |
| `@identizen/fake-phone` | 0.1.0   | Scriptable phone for tests; see [Testing and CI](/testing/)                                               |

The index, the dashboard, the apps, and `@identizen/db` are deployed from `main` and are not published packages. Repository tags `v0.<milestone>.0` (so far `v0.0.0` through `v0.8.0`) mark a milestone whose gate was green; they are not package releases.

### Semver while the major is 0

- A **patch** release (`0.1.1` → `0.1.2`) adds or fixes and breaks nothing: no renamed or removed export, no changed default, no narrower type.
- A **minor** release (`0.1.x` → `0.2.0`) may contain breaking changes. Every breaking change is listed in that package's `CHANGELOG.md` with the migration.
- `^0.1.1` in `package.json` already means `>=0.1.1 <0.2.0`, so the default range npm writes is the right one. Do not widen it to `>=0.1`.
- `@identizen/protocol`, `@identizen/sdk`, `@identizen/react`, and `identizen` are a linked changeset group: packages released together share a version number. `@identizen/fake-phone` is published but sits outside the group; its version moves by hand.
- The index is deployed from the same repository as the packages, so a package release never depends on a separate index release. Self-hosters upgrade the index by pulling `main`; see [Running an index in production](/self-hosting-production/#upgrades).

At 1.0 the rules become plain semver: breaking changes bump the major.

### How releases are made

Each change to a published package carries a changeset (`npx changeset`, see `CONTRIBUTING.md`). `npm run version-packages` (`changeset version`) applies them, bumps versions, and writes the per-package `CHANGELOG.md`. `npm run release` builds `packages/*` and runs `changeset publish`. The `gate` workflow (lint, typecheck, unit, e2e, audit) runs on every pull request, on `main`, and on `v*` tags; nothing is published from a red gate.

Security fixes go to the latest published version of each package and the current app store builds, per [`SECURITY.md`](https://github.com/identizen/platform/blob/main/SECURITY.md).

## How breaking changes are announced

A breaking change in a package minor or in the protocol is announced in three places:

1. A GitHub release on the tag, carrying the changeset notes.
2. A post on the [blog](https://identizen.com/blog/), which has an RSS feed at `https://identizen.com/rss.xml`.
3. An entry in the changelog section of this page.

There are no GitHub releases yet; the `v0.x` tags so far are milestone markers without release notes.

## Changelog

Per-package `CHANGELOG.md` files do not exist yet. Changesets writes them on the next `version-packages` run, and from then on they are the record. What has shipped so far:

### 0.1.1 — `@identizen/sdk`, `@identizen/react`

- The QR code is shown immediately when a login starts.
- Web Bluetooth discovery is an explicit user action: `session.useBluetooth()` in the SDK and `findPhoneOverBluetooth` in `@identizen/react`, behind a button. Chromium's `requestDevice` needs a user gesture, so it is never automatic.

### 0.1.0 — all packages

### 0.2.0 (2026-09-07)

`@identizen/protocol`, `@identizen/sdk`, `@identizen/react`, `identizen` 0.2.0 and `@identizen/fake-phone` 0.2.0, from the 6 September security review. Protocol: `amr` gains `iris` and `USER_VERIFYING_AMR`, `hwk` is reserved and never asserted, the identity proof binds `index` and `nonce` (§8.1). SDK: `verifyIdToken` accepts only an id_token (ES256, `typ: JWT`, every documented claim, no `events`), `auth_time` in `IdentizenIdToken`. CLI: scaffolds use a `revocations` store, a generated `IDENTIZEN_SESSION_SECRET`, `Secure` transaction cookies, day-long sessions, and session regeneration on Express. Fake phone: nonce-bound registration, `--issuer`, `--host`, `--amr`, `GET /l/:id`. `@identizen/react` moves to 0.2.0 with the group (dependency bump only). Per-package details are in each package's `CHANGELOG.md`.

### 0.1.0 (September 2026)

First publish of `@identizen/protocol`, `@identizen/sdk`, `@identizen/react`, `identizen`, and `@identizen/fake-phone`, September 2026. Protocol v1 as frozen at tag `v0.1.0`.
