# Identizen Protocol — v1

**Status:** Draft, frozen at tag `v0.1.0`. Changes after that tag require an explicit decision (see `CLAUDE.md`).
**Reference implementation:** `packages/protocol` (`@identizen/protocol`). Every other package imports it; nothing re-implements it.
**Test vectors:** `spec/vectors/*.json`, generated from a fixed seed by `packages/protocol`. They are the interop contract for the mobile app and any third-party implementation.

Identizen is a device-based identity protocol. The user's phone holds an Ed25519 identity; the private key never leaves the device. An **index** is a directory and relay (a phonebook, not a vault): it stores public keys, push tokens, rotating BLE identifiers, revocation state, and audit events, and it never stores a secret. A **site** (relying party) integrates the index as a standard OpenID Connect provider.

The protocol serves two modes that share one challenge/assertion shape:

- **Path A — primary login.** `acr = idz:login`. The site receives an `id_token` with a per-site `sub`.
- **Path B — step-up / MFA / transaction approval.** `acr = idz:mfa`. The site keeps its own login and calls the index for the factor, over OIDC step-up (`acr_values=idz:mfa`, `login_hint=<sub>`) or the Verification API (`POST /v1/verify { sub, reason }`). An optional `reason` string is displayed on the phone and bound into the signed assertion.

## 1. Keys and identifiers

| Name                | Derivation                                                                                        | Purpose                                                                                                                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seed                | 256 bits of on-device randomness, encoded as 24 BIP39 English words                               | Root of the personal identity. Shown once at setup; the only recovery path.                                                                                                                                                                               |
| Master key          | `HKDF-SHA256(ikm = seed, salt = "identizen/v1/master", info = "", L = 32)` → Ed25519 private key  | Anchors the identity in the index.                                                                                                                                                                                                                        |
| Identity ID (`idz`) | `base64url(SHA-256(masterPublicKey))[0:32]`                                                       | Stable, cross-site identifier held by the index. **Never sent to sites by default.**                                                                                                                                                                      |
| Per-site key        | `HKDF-SHA256(ikm = seed, salt = "identizen/v1/site", info = rp_id, L = 32)` → Ed25519 private key | Signs assertions for one site. `rp_id` is the site's registered origin host (e.g. `app.example.com`).                                                                                                                                                     |
| `sub`               | `base64url(SHA-256(perSitePublicKey))[0:32]`                                                      | The site's stable identifier for the user. Two sites cannot correlate a user by `sub`.                                                                                                                                                                    |
| Device key          | Fresh Ed25519 keypair per install; **not derived**                                                | Identifies the _install_, not the person. Signs device registration, the `device_sig` on assertions, and `Idz-Signature` request headers. Wrapped at rest by the Secure Enclave / StrongBox on native, by a non-extractable WebCrypto AES-GCM key on web. |
| Device BLE key      | 32 random bytes per install, registered with the index                                            | HMAC key for rotating BLE identifiers (§6.3).                                                                                                                                                                                                             |

HKDF is RFC 5869 with SHA-256. `salt` and `info` are UTF-8 strings. The 32-byte HKDF output is used directly as the Ed25519 seed (RFC 8032 private key); the public key is derived per RFC 8032.

All byte strings in JSON are encoded as **base64url without padding** (RFC 4648 §5).

## 2. Canonical encoding and signatures

All signed payloads are JSON canonicalized per **JCS (RFC 8785)**: object keys sorted by UTF-16 code units, no insignificant whitespace, UTF-8, numbers in ES6 shortest form. `packages/protocol` exports `canonicalize(value): string`.

A signature over a payload of `type` T is:

```
sig = Ed25519.sign(privateKey, UTF8("identizen/v1/" + T + "\n" + canonicalize(payload)))
```

The domain-separation prefix is part of the signed bytes. Signatures are 64 bytes, base64url-encoded, and transmitted **outside** the payload they cover (the payload never contains its own signature).

Wire form of a signed object is `{ payload: <object>, sig: <base64url> }`, or with two signatures `{ payload, site_sig, device_sig }`.

## 3. Challenge

Issued by the index's `ChallengeSession` Durable Object when a site starts a login (`/authorize`, Path A and step-up) or a verification (`/v1/verify`). The shape is identical in every case.

```json
{
  "type": "challenge",
  "id": "ch_01J6Y0Q2R1WZ6Z6Z6Z6Z6Z6Z6Z",
  "rp_id": "app.example.com",
  "rp_name": "Example App",
  "nonce": "<32 bytes, base64url>",
  "code": "47",
  "iat": 1756560000,
  "exp": 1756560060,
  "index": "https://index.identizen.com",
  "acr": "idz:login",
  "reason": null
}
```

| Field        | Rule                                                                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`       | Literal `"challenge"`.                                                                                                                       |
| `id`         | `"ch_"` + ULID (26 chars, Crockford base32).                                                                                                 |
| `rp_id`      | The site's registered origin host. Lower-case, no scheme, no port.                                                                           |
| `rp_name`    | Display name of the site, shown on the phone. ≤ 64 chars.                                                                                    |
| `nonce`      | 32 random bytes, base64url. Echoed in the assertion.                                                                                         |
| `code`       | 2-digit match code (`"00"`–`"99"`), shown in the browser **and** on the phone. Number matching defeats push-bombing.                         |
| `iat`, `exp` | Unix seconds. `exp - iat = 60`. Expired challenges are rejected by both phone and index.                                                     |
| `index`      | Issuer URL of the index that created the challenge. The phone only honours challenges from indexes whose public key it has pinned.           |
| `acr`        | `"idz:login"` (Path A) or `"idz:mfa"` (Path B step-up and Verification API). The phone chooses its approval UI from it.                      |
| `reason`     | `null` for plain logins, else a site-supplied string ≤ 140 chars. Displayed verbatim on the phone. Its hash is echoed in the assertion (§4). |

The challenge is signed by the **index signing key** (type `"challenge"`, §2) so the phone can verify it came from an index it trusts. Index public keys are pinned in the app at device registration.

## 4. Assertion

Produced by the phone after biometric approval.

```json
{
  "type": "assertion",
  "challenge_id": "ch_01J6Y0Q2R1WZ6Z6Z6Z6Z6Z6Z6Z",
  "nonce": "<echoed from the challenge>",
  "rp_id": "app.example.com",
  "sub": "<per-site pubkey hash>",
  "site_pubkey": "<per-site Ed25519 public key, base64url>",
  "device_id": "dev_01J6Y0Q2R1WZ6Z6Z6Z6Z6Z6Z6Z",
  "iat": 1756560012,
  "amr": ["face", "hwk"],
  "acr": "idz:login",
  "reason_hash": null
}
```

| Field                            | Rule                                                                                                                                                  |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `challenge_id`, `nonce`, `rp_id` | Must match the challenge exactly.                                                                                                                     |
| `sub`                            | `base64url(SHA-256(site_pubkey))[0:32]`.                                                                                                              |
| `site_pubkey`                    | The per-site public key for `rp_id`.                                                                                                                  |
| `device_id`                      | `"dev_"` + ULID, assigned by the index at registration.                                                                                               |
| `iat`                            | Unix seconds. Must satisfy `challenge.iat ≤ iat ≤ challenge.exp` (with 5 s clock skew).                                                               |
| `amr`                            | Authentication methods, per RFC 8176 plus `"hwk"` (hardware key). Typical: `["face","hwk"]`, `["fingerprint","hwk"]`, `["pin","hwk"]`.                |
| `acr`                            | Echoes the challenge `acr`.                                                                                                                           |
| `reason_hash`                    | `base64url(SHA-256(UTF8(reason)))` when the challenge carried a `reason`, else `null`. Binds the approval to what the user saw (transaction signing). |

The assertion is **signed twice** (type `"assertion"`, §2):

- `site_sig` by the per-site key — proves identity for this site.
- `device_sig` by the device key — proves the assertion came from a registered, non-revoked install.

### 4.1 Verification order (index)

1. Parse and validate the assertion against the schema.
2. Load the challenge by `challenge_id`; reject if unknown, already resolved, or expired.
3. Check `nonce`, `rp_id`, and `acr` equal the challenge's. Check `reason_hash` equals the hash of the challenge's `reason` (both `null` for no reason).
4. Look up `device_id`; reject if unknown or `status ≠ active`.
5. Verify `device_sig` against the device's registered public key.
6. Verify `site_sig` against `site_pubkey`; verify `sub == hash(site_pubkey)`.
7. **TOFU binding.** Look up `(rp_id, sub)` in `site_bindings`. If absent, create it with `site_pubkey` and the device's `idz`. If present, require `site_pubkey` and `idz` to match; otherwise reject.
8. Resolve the challenge as `approved` and record an audit event. Every failure branch records `login.denied` with the reason.

A phone that receives a challenge for a `rp_id` it does not recognise still signs with the derived key for that `rp_id`; the site domain is inside the signed payload, so a phished login on a lookalike domain produces a signature the real site's `rp_id` will never match.

## 5. OIDC output

The index is an OpenID Provider implementing Authorization Code flow with PKCE (S256 required). `sub` in the `id_token` is the assertion `sub`.

`id_token` claims:

| Claim                                          | Value                                                   |
| ---------------------------------------------- | ------------------------------------------------------- |
| `iss`, `aud`, `iat`, `exp`, `nonce`, `at_hash` | Standard OIDC.                                          |
| `sub`                                          | Per-site identifier (assertion `sub`).                  |
| `sid`                                          | Session ID; used for back-channel logout.               |
| `idz_handle`                                   | Optional human handle, only if the user released it.    |
| `idz_device`                                   | Opaque device ID (`dev_…`).                             |
| `idz_org`                                      | Org identifier for org identities; absent for personal. |
| `amr`                                          | From the assertion.                                     |
| `acr`                                          | `"idz:login"` or `"idz:mfa"`.                           |

No email claim. Back-channel logout per OpenID Connect Back-Channel Logout 1.0; `sid` identifies the session.

### 5.1 Step-up and enrollment

- **Step-up:** `GET /authorize?…&acr_values=idz:mfa&login_hint=<sub>`. The index resolves `(rp_id, sub)` through `site_bindings` to a device and pushes the challenge with `acr = idz:mfa`. If no binding exists, the response is the OIDC error `login_required`.
- **Enrollment:** `GET /authorize?…&prompt=enroll`. Runs normal discovery; on approval the TOFU binding is created and the resulting `id_token` carries the new `sub`. The site's existing session is its proof of who the user is.
- **Verification API:** `POST /v1/verify { sub, reason?, ttl? }` (bearer = site client secret) creates a ChallengeSession with `acr = idz:mfa` and pushes to the bound device. Results are polled at `GET /v1/verify/:id` or delivered by webhook as a signed JWT.

## 6. Discovery

Discovery finds the phone; it never changes what the phone shows (site name, code, optional reason, biometric prompt).

### 6.1 Deep link (phone)

`https://app.identizen.com/l/<challenge_id>` is a universal / app link into the app. The app fetches `GET <index>/challenge/<id>`, verifies the index signature, shows the challenge, and on approval `POST`s the assertion. The OIDC flow completes by opening the site's `redirect_uri` (`?code=…&state=…`) in the system browser.

### 6.2 QR

Encodes the same URL as §6.1. On approval the browser is paired (§6.4) unless the SDK opted out.

### 6.3 BLE (Chromium desktop)

The phone advertises service UUID `f1d0e1a2-1d2e-4b0c-9c0d-1d3e2f4a5b6c` with a 16-byte rotating identifier:

```
rotating_id = HMAC-SHA256(device_ble_key, UTF8(decimal(floor(now / 900))))[0:16]
```

The window is 900 s. The SDK scans, sends `{ rotating_id }` to `POST /discover/ble`, and the index resolves it to a device by evaluating the current window and ±1 neighbouring windows for every active device's `ble_key`. On a match the index pushes the challenge. A passive observer cannot track a device by BLE: identifiers rotate and only the index holds the key.

### 6.4 Browser pairing (all browsers)

After a successful QR or BLE login, the browser generates a non-extractable P-256 ECDSA key in WebCrypto and sends the public key (raw, base64url) with its approval acknowledgement. The index issues a **pairing** record:

```json
{
  "type": "pairing",
  "pairing_id": "pr_<ulid>",
  "device_id": "dev_<ulid>",
  "browser_pubkey": "<base64url>",
  "issued_at": 1756560000
}
```

signed by the index signing key (type `"pairing"`, §2). The SDK stores the pairing ID and keeps the key in IndexedDB.

On later logins the SDK signs the challenge ID with the browser key (ECDSA P-256, SHA-256, over `UTF8("identizen/v1/paired\n" + challenge_id)`) and calls `POST /discover/paired { pairing_id, sig }`. The index verifies, checks that both the pairing and its device are `active`, and pushes the challenge straight to the device. Pairing skips discovery only; the phone still shows `rp_name` and the code. Pairings are revoked explicitly or automatically when their device is.

### 6.5 Passkey provider

On-device only (iOS 17+ credential provider extension, Android Credential Manager). Cross-device (hybrid) transport is assumed unavailable to third parties; nothing in the protocol depends on it.

### 6.6 Desktop companion

A Mac app plus browser extension intercepts `navigator.credentials` on plain-WebAuthn sites, relays through the index using the same ChallengeSession path, and returns the assertion. It never holds keys.

## 7. Push

The push payload is `{ "challenge_id": "ch_…" }` and nothing else. The phone fetches the full signed challenge from the index over TLS. Nothing sensitive transits APNs / FCM / Web Push.

## 8. Device-authenticated requests (`Idz-Signature`)

Device and identity endpoints authenticate with a signed request header instead of bearer tokens:

```
Idz-Signature: v1,d=<device_id>,t=<unix seconds>,s=<base64url sig>
```

where

```
sig = Ed25519.sign(deviceKey, UTF8("identizen/v1/request\n" + METHOD + "\n" + PATH + "\n" + base64url(SHA-256(body)) + "\n" + t))
```

`METHOD` is upper-case, `PATH` is the request path including query string, `body` is the raw request body (empty string for none). The index rejects `t` outside ±60 s of its clock and rejects any `(device_id, t, sig)` seen before within that window (replay protection). Device registration (`POST /devices`) is the one unsigned request; it carries the device public key in the body and returns the assigned `device_id` plus the index's pinned public key.

## 9. Identifiers summary

| Prefix                    | Object         |
| ------------------------- | -------------- |
| `ch_`                     | Challenge      |
| `dev_`                    | Device         |
| `pr_`                     | Pairing        |
| `vf_`                     | Verification   |
| `idz_live_` / `idz_test_` | Site client ID |

ULIDs are 26 characters, Crockford base32, upper-case.

## 10. Security invariants

- The index stores no secrets: public keys, push tokens, BLE HMAC keys (resolvable only by the index), revocation state, and audit events.
- Every challenge carries the site origin, a nonce, and a 60 s TTL. Signatures over a mismatched origin are rejected.
- Number matching on every push approval. Approval without the displayed code is not possible.
- `reason`, when present, is inside what the user approved and inside what the site can verify.
- Revoking a device invalidates its `device_sig`, all of its pairings, and fires back-channel logout for every live session.
