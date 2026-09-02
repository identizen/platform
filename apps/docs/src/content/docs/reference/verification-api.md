---
title: Verification API
description: Server-to-server phone approval (Path B) — POST /v1/verify, polling, and the signed webhook.
---

The Verification API pushes an approval to the phone bound to a per-site `sub` and returns the result with the signed assertion. It needs no browser and works from any backend: a job, a CLI, an SSH login, a payment step.

## Authentication

Every call identifies the site and proves the client secret. Two equivalent forms:

```http
Authorization: Bearer <client_secret>
Idz-Client-Id: <client_id>
```

```http
Authorization: Basic base64(<client_id>:<client_secret>)
```

Public (PKCE-only) clients have no secret and cannot use this API.

## `POST /v1/verify`

```http
POST /v1/verify
Content-Type: application/json

{ "sub": "<per-site sub>", "reason": "Approve wire transfer of $12,000 to Acme?" }
```

| Field    | Rule                                                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `sub`    | Required. The per-site identifier bound at enrollment or first login (32 base64url chars).                                   |
| `reason` | Optional, 1–140 characters. Displayed verbatim on the phone; its SHA-256 is echoed in the signed assertion as `reason_hash`. |
| `ttl`    | Accepted for forward compatibility; challenges live 60 seconds in v1.                                                        |

Response `201`:

```json
{
  "verification_id": "vf_01K3ZB2N9G0000000000000004",
  "status": "pending",
  "sub": "…",
  "reason": "Approve wire transfer of $12,000 to Acme?",
  "created_at": "2026-09-02T14:07:07.998Z",
  "resolved_at": null,
  "assertion": null,
  "challenge_id": "ch_01K3ZB2N9G0000000000000000",
  "code": "47",
  "expires_at": 1756560060
}
```

`code` is the two-digit match code shown on the phone; show it to the user if your flow has a screen.

Errors: `401 invalid_client` (bad or missing credentials), `404 unknown_sub` (no active device is bound to that `sub` for your site), `400 invalid_request` (validation).

## `GET /v1/verify/:id`

Poll with the same credentials. `status` is one of `pending`, `approved`, `denied`, `timeout`. When approved, `assertion` holds the phone's double-signed assertion:

```json
{
  "payload": {
    "type": "assertion",
    "challenge_id": "ch_…",
    "nonce": "…",
    "rp_id": "app.example.com",
    "sub": "…",
    "site_pubkey": "…",
    "device_id": "dev_…",
    "iat": 1756560012,
    "amr": ["face", "hwk"],
    "acr": "idz:mfa",
    "reason_hash": "…"
  },
  "site_sig": "…",
  "device_sig": "…"
}
```

`reason_hash` is `base64url(SHA-256(UTF8(reason)))`, or `null` when no reason was sent. The index already verified both signatures and the binding before marking the verification approved; you may re-verify with `@identizen/protocol` if you want independent evidence.

Only the site that created a verification can read it; other clients get `404`.

## Timeouts

A verification stays `pending` for the life of its challenge (60 seconds). When the challenge expires unresolved, the index marks it `timeout` and delivers the webhook.

## Webhook

Register a webhook URL at site registration (`webhook_url`) or later:

```http
POST /sites/:client_id/webhook
Authorization: Bearer <client_secret>
Content-Type: application/json

{ "webhook_url": "https://app.example.com/idz/webhook" }
```

The response includes a fresh `webhook_secret` (shown once). When a verification resolves, the index POSTs a signed JWT:

```http
POST https://app.example.com/idz/webhook
Content-Type: application/jwt
Idz-Event: verification.resolved
Idz-Webhook-Signature: sha256=<hex>

<jwt>
```

The JWT is signed with the index's OIDC keys (`typ: idz-webhook+jwt`, `iss` = index URL, `aud` = your `client_id`, 10-minute expiry) and carries:

```json
{
  "event": "verification.resolved",
  "verification_id": "vf_…",
  "status": "approved",
  "sub": "…",
  "reason": "…",
  "assertion": { "payload": {}, "site_sig": "…", "device_sig": "…" },
  "resolved_at": 1756560020
}
```

Verify it against `/.well-known/jwks.json`; `@identizen/sdk/server` does this with `verifyWebhook(body)`. Delivery is retried up to three times (immediately, after 0.5 s, after 2 s) on network errors, `429`, and `5xx`; a `2xx` stops retries, other `4xx` responses are not retried.

## SDK equivalents

```ts
import { createIdentizenServer } from '@identizen/sdk/server';

const identizen = createIdentizenServer({
  indexUrl: 'https://index.identizen.com',
  clientId: 'idz_live_…',
  clientSecret: process.env.IDENTIZEN_CLIENT_SECRET,
});

const started = await identizen.verify({ sub: 'S'.repeat(32), reason: 'Approve?' });
const polled = await identizen.getVerification(started.verification_id);
const final = await identizen.waitForVerification(started.verification_id, { timeoutMs: 65_000 });
console.info(polled.status, final.status);
```
