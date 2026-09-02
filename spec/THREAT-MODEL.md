# Identizen — Threat Model (v1 draft)

**Status:** M10.1 draft from PRD section 12 plus what the M0–M7 build taught us. Reviewed by: nobody yet (M10.6, external review, is pending).
**Scope:** the index (Cloudflare Worker + Durable Objects + Postgres), the hosted login page, the SDKs, the CLI, the fake phone, and the protocol as implemented in `packages/protocol`. The native modules (M9) and the desktop companion (M9.5) are out of scope until they exist.

## 1. Assets and trust boundaries

| Asset                                                            | Where                                                                | Who may hold it                                            |
| ---------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------- |
| Seed / master key / per-site keys                                | Phone only (Secure Enclave-wrapped in M9; `expo-secure-store` in M8) | The user. Never the index, never a site.                   |
| Device key                                                       | Phone only                                                           | The install.                                               |
| Index signing key (`INDEX_SIGNING_KEY`)                          | Worker secret                                                        | The index operator. Signs challenges and pairings.         |
| OP signing keys (`OIDC_SIGNING_KEYS`)                            | Worker secret                                                        | The index operator. Signs id/access/logout/webhook tokens. |
| Site client secret                                               | The site's server; only its SHA-256 in `sites.client_secret_hash`    | The site.                                                  |
| Browser pairing key (P-256, non-extractable)                     | Browser IndexedDB, per origin                                        | That browser profile.                                      |
| Public keys, push tokens, BLE HMAC keys, revocation state, audit | Postgres                                                             | The index. **Nothing here lets anyone log in.**            |
| In-flight challenge, OIDC params, one authorization code         | `ChallengeSession` DO, ≤ 5 min                                       | The index.                                                 |

Trust boundaries: phone ↔ index (TLS, Idz-Signature), browser ↔ index (TLS, WebSocket), site ↔ index (TLS, OIDC / client secret), index ↔ push provider (APNs/FCM/Web Push; payload is only a challenge id).

## 2. Attackers considered

- **Phisher:** controls a lookalike site and can start logins.
- **Network attacker:** can observe / inject on the user's network but not break TLS.
- **Push bomber:** can trigger many challenges toward a device.
- **Index breach:** reads the entire database and Worker secrets.
- **Malicious site:** a legitimately registered relying party acting badly.
- **Lost / stolen phone** (locked), and **rogue second device** (attacker enrolls on a stolen passphrase).
- **Malicious paired browser** (malware on a paired laptop).

## 3. Guarantees and how they hold

| Threat                                       | Mitigation in the code                                                                                                                                                                                                                                                                                      |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phishing on a lookalike domain               | `rp_id` is inside the signed assertion; the index verifies `rp_id == challenge.rp_id`, the site key is derived per `rp_id`, and the OIDC code is bound to the registered `redirect_uri` + PKCE. A signature for `evil.example` never verifies for `app.example.com` (`verifyAssertion` → `rp_id_mismatch`). |
| Replay of an assertion or a request          | Assertions carry the challenge nonce, are accepted once (DO state `pending` → terminal), and expire at 60 s. `Idz-Signature` includes method, path, body hash, and timestamp; the `RequestGuard` DO rejects any `(timestamp, sig)` seen before within ±60 s.                                                |
| Push bombing / fatigue                       | Every approval shows the 2-digit match code and the site name; `RequestGuard.allowPush` limits pushes per device per minute; challenge issuance is limited per site client and per source IP (M10.2).                                                                                                       |
| Index database breach                        | Stores only public keys, push tokens, BLE HMAC keys, revocation state, audit. No private keys, no secrets in plaintext (client and webhook secrets are hashed). A breach yields nothing that produces a valid `site_sig` or `device_sig`.                                                                   |
| Index secret compromise (Worker secrets)     | Attacker could sign challenges and pairings (index key) and mint tokens (OP keys). Mitigations: secrets live only in Cloudflare; rotation is supported for OP keys (two active keys); the index key is pinned by phones at registration, so rotating it requires a re-pin flow (open item, see section 5).  |
| Malicious site correlating users             | `sub` is a hash of a per-site key; `idz` is never released to sites. Handle release is opt-in through the `handle` scope.                                                                                                                                                                                   |
| Site enumerating other users' state          | `/me/*` bearer access is restricted to clients in `DASHBOARD_CLIENT_IDS`; ordinary sites only ever see their own `sub`. Verification API records are readable only by the owning client.                                                                                                                    |
| Stolen locked phone                          | Keys are behind biometrics/passcode (`expo-secure-store` now, enclave in M9). The user revokes from another device or the dashboard; revocation invalidates `device_sig`, all pairings, and fires back-channel logout.                                                                                      |
| Rogue second device from a leaked passphrase | Same identity, new device: audit shows `device.enrolled`; the legitimate user can revoke it. Passphrase custody is the user's (PRD 7.1). Shamir / second-device recovery is a v2 item.                                                                                                                      |
| Malicious paired browser                     | A pairing only skips discovery. Approval still requires the phone and the match code. Pairings are listed and revocable, and die with the device.                                                                                                                                                           |
| BLE tracking                                 | Rotating identifiers (HMAC over a 15-minute window) resolvable only by the index.                                                                                                                                                                                                                           |
| Token theft (access token)                   | Access tokens are 1 h JWTs bound to a session; `/userinfo` and `/me` check session liveness, so revocation takes effect immediately.                                                                                                                                                                        |
| Webhook forgery                              | Verification results are signed JWTs (`typ: idz-webhook+jwt`, ES256, audience = client id) plus an HMAC header derived from the webhook secret.                                                                                                                                                             |
| Open site registration abuse                 | `OPEN_SITE_REGISTRATION` is for dev/self-host; hosted indexes should set `SITE_REGISTRATION_TOKEN`. Client ids are unguessable ULIDs.                                                                                                                                                                       |

## 4. Residual risks (accepted for now)

- **Index operator trust.** The operator can issue challenges for any site to any device (the user still has to approve on the phone with the code displayed) and can mint tokens for any `sub` (a site cannot detect a forged approval unless it also checks the double-signed assertion via the Verification API). Self-hosting removes this trust for regulated deployments.
- **Device time skew.** ±5 s (assertion) / ±60 s (request) windows; badly skewed phones fail closed.
- **APNs/FCM as a dependency.** Transport only; payload is `{ challenge_id }`.
- **Code in the front channel.** Standard OIDC; PKCE + single-use + client binding limit the blast radius.
- **Hosted login page and pairing on the index origin.** The pairing key in IndexedDB is per origin; XSS on the index origin would be catastrophic — the page is static HTML with no third-party scripts and `X-Frame-Options: DENY`.

## 5. Open items

1. Index key rotation protocol (phones pin the key at registration; a rotation needs a signed cross-certification of the new key).
2. Attestation (App Attest / Play Integrity) is stored but not enforced.
3. Per-IP limits use `CF-Connecting-IP`; behind another proxy this must be configured.
4. External review (M10.6) before 1.0.
