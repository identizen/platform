---
title: Index API
description: The non-OIDC surface of the index — device registration, challenges, discovery, account management, and Idz-Signature request authentication.
---

Everything a phone, the SDK, or the dashboard calls that is not plain OIDC. Sites normally never call these directly; the SDK and the app do. Bodies are JSON; errors are `{ "error": "<code>", "error_description": "…" }` (see [Errors](/errors/)).

## Device and identity

### `POST /devices` — register an install

The one unsigned request. Creates the identity on first sight of a master key.

```json
{
  "device_pubkey": "<Ed25519, base64url>",
  "master_pubkey": "<Ed25519, base64url>",
  "master_sig": "<Ed25519 over {\"device_pubkey\": …}, type identity>",
  "handle": "george",
  "kind": "personal",
  "ble_key": "<32 bytes, base64url>",
  "push_token": "<APNs / FCM token, a URL, or \"poll\">",
  "push_platform": "apns | fcm | web",
  "attestation": {},
  "label": "iPhone"
}
```

Returns `201 { device_id, idz, handle, index, index_pubkey }`. The phone pins `index_pubkey` and only honours challenges signed by it. `409 handle_taken` if the handle exists; `400 bad_identity_proof` if `master_sig` does not verify.

Push tokens: `apns` and `fcm` tokens go to the respective services (transport only; the payload is `{ "challenge_id" }`). Platform `web` accepts an HTTP(S) URL that receives a JSON POST (used by the fake phone) or the literal `poll`, in which case challenge ids are queued for `GET /devices/:id/inbox`.

### Signed device endpoints

| Method | Path                      | Purpose                                                                         |
| ------ | ------------------------- | ------------------------------------------------------------------------------- |
| `POST` | `/identities`             | `{ "handle": "george" \| null }` — set or clear the handle (`409 handle_taken`) |
| `POST` | `/devices/:id/push-token` | `{ push_token, push_platform }` for the calling device                          |
| `GET`  | `/devices/:id/inbox`      | Drain queued challenge ids (`{ challenge_ids: [] }`) for polling devices        |
| `POST` | `/devices/:id/revoke`     | Revoke another device of the same identity                                      |
| `POST` | `/challenge/:id/assert`   | Submit the double-signed assertion                                              |
| `POST` | `/challenge/:id/deny`     | Decline a challenge                                                             |

### `Idz-Signature` request authentication

Device endpoints authenticate with a signed header, never a bearer token (PROTOCOL.md §8):

```http
Idz-Signature: v1,d=<device_id>,t=<unix seconds>,s=<base64url Ed25519 signature>
```

The signature covers `"identizen/v1/request\n" + METHOD + "\n" + PATH (with query) + "\n" + base64url(SHA-256(body)) + "\n" + t`. The index rejects timestamps outside ±60 s and any `(device_id, t, signature)` it has already seen (`401 replayed_request`). Disabled or revoked devices get `403 device_inactive`, except on `GET /me`, which answers so a revoked phone can learn its state. `@identizen/protocol` exports `signRequest`, `parseIdzSignature`, and `verifyRequestSignature`.

## Challenges

| Method | Path                         | Purpose                                                                                                                                                                                                                                                                                                                                         |
| ------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/challenge`                 | Start a login without the hosted page (what the SDK calls). Body: `client_id`, `acr?`, `reason?`, `login_hint?`, `browser_pubkey?`, and the OIDC parameters `redirect_uri`, `state`, `nonce`, `code_challenge`, `code_challenge_method`, `scope`, `prompt`. Returns `201 { challenge_id, code, exp, acr, rp_name, deep_link, ws_url, pushed }`. |
| `GET`  | `/challenge/:id`             | The signed challenge `{ payload, sig, status }` (public; the phone verifies `sig` against the pinned index key)                                                                                                                                                                                                                                 |
| `GET`  | `/challenge/:id/state`       | `{ status, pairing, redirect }` for pollers                                                                                                                                                                                                                                                                                                     |
| `GET`  | `/challenge/:id/ws`          | WebSocket; receives `pending`, then `approved` (with `pairing` and `redirect`), `denied`, or `expired`                                                                                                                                                                                                                                          |
| `POST` | `/challenge/:id/browser-key` | `{ browser_pubkey }` — the hosted page attaches its P-256 key after render so approval issues a pairing                                                                                                                                                                                                                                         |

Challenges live 60 seconds. `acr` is `idz:login` or `idz:mfa`; `reason` (≤ 140 chars) is displayed on the phone and hashed into the assertion.

## Discovery

| Method | Path               | Purpose                                                                                                                                                                                                              |
| ------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/discover/ble`    | `{ challenge_id, rotating_id }` — resolves the 16-byte rotating BLE id (current window ±1) and pushes; `202`, `404 no_device`, `429 push_rate_limited`                                                               |
| `POST` | `/discover/paired` | `{ challenge_id, pairing_id, sig }` — ECDSA P-256 signature over `"identizen/v1/paired\n" + challenge_id`; pushes straight to the paired device; `202`, `401 pairing_inactive` / `device_inactive` / `bad_signature` |

Pairings are issued on approval when the browser supplied a public key and are returned in the `approved` event as a signed pairing record `{ payload: { type, pairing_id, device_id, browser_pubkey, issued_at }, sig }`.

## Account management: `/me`

Authenticated with `Idz-Signature` (the phone) **or** `Authorization: Bearer <access_token>` issued to a client listed in the index's `DASHBOARD_CLIENT_IDS` (the dashboard PWA, a public PKCE client). Bearer sessions are checked for revocation on every call.

| Method | Path                       | Purpose                                                                                                                      |
| ------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/me`                      | `{ idz, handle, kind, via, device }`                                                                                         |
| `GET`  | `/me/devices`              | Devices with status, push platform, last seen, `current`                                                                     |
| `GET`  | `/me/pairings`             | Paired browsers with label (from the User-Agent), status, last used                                                          |
| `GET`  | `/me/sessions`             | Live OIDC sessions (`sid`, `client_id`, `device_id`, expiry)                                                                 |
| `GET`  | `/me/audit`                | Last 100 audit events                                                                                                        |
| `POST` | `/me/handle`               | `{ "handle": "george" \| null }`                                                                                             |
| `POST` | `/me/devices/:id/revoke`   | Revoke a device; pairings and sessions cascade; back-channel logout fires. A phone cannot revoke itself (`403 self_revoke`). |
| `POST` | `/me/pairings/:id/revoke`  | Remove a paired browser                                                                                                      |
| `POST` | `/me/sessions/:sid/revoke` | End a session; back-channel logout fires                                                                                     |

## Federation

`GET /.well-known/webfinger?resource=acct:<handle>@<index host>` resolves a handle to `{ subject, properties: { "https://identizen.com/ns/idz": … }, links: [{ rel: "https://identizen.com/ns/index", href }, { rel: "http://openid.net/specs/connect/1.0/issuer", href }] }`. `GET /.well-known/identizen` returns the index URL, the app URL, the pinned index public key, and the protocol version. `GET /health` reports database connectivity.
