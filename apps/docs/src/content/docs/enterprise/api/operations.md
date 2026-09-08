---
title: Operations API
description: Audit and data exports, SIEM webhooks and how to verify their signatures, retention, the status and quota report, the public status route, and the on-prem licence on a tenant index — every route with its role, body and response.
---

The routes behind the portal's **Compliance** and **Status** pages. Nothing here stores a secret in the tenant database: webhook deliveries are signed with the tenant's Ed25519 index key, exports live in object storage under a random key, and licences are verified with a public key. Authentication and roles are on the [overview](/enterprise/api/); the guide is [Compliance and operations](/enterprise/compliance/).

## Audit export

Exports are asynchronous jobs written to the tenant's object store and downloaded through the index. A job covers the audit log (`kind: 'audit'`, CSV or JSON, optional date range) or the organisation's data (`kind: 'data'`, JSON only: members, domains, policies, SSO apps, SCIM tokens as ids and names only, devices with fleet fields, sessions, admin actions).

```ts
interface ExportJob {
  id: string; // exp_…
  kind: 'audit' | 'data';
  format: 'csv' | 'json';
  from: string | null; // audit only, ISO
  to: string | null;
  status: 'pending' | 'running' | 'done' | 'failed';
  rows: number | null;
  bytes: number | null;
  error: string | null;
  requested_by: string | null; // member id
  created_at: string;
  completed_at: string | null;
  expires_at: string; // the object is deleted 7 days after completion
}
```

| Method   | Path                         | Role                       | Body → Response                                                                                                                                                                                                      |
| -------- | ---------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/orgs/exports`              | auditor+ (`exports.read`)  | `{ exports: ExportJob[] }`, newest first, 50                                                                                                                                                                         |
| `POST`   | `/orgs/exports`              | auditor+ (`exports.write`) | `{ kind: 'audit', format: 'csv' \| 'json', from?, to? }` or `{ kind: 'data' }` → `{ export: ExportJob }` (`202`). The job runs after the response; at most 3 pending or running per organisation (`429 export_busy`) |
| `GET`    | `/orgs/exports/:id`          | auditor+ (`exports.read`)  | `{ export }`: poll `status`                                                                                                                                                                                          |
| `GET`    | `/orgs/exports/:id/download` | auditor+ (`exports.read`)  | The file (`content-disposition: attachment`). `404 export_not_ready` until `done`, `410 export_expired` after `expires_at`                                                                                           |
| `DELETE` | `/orgs/exports/:id`          | admin+ (`org.write`)       | → `204`, deletes the object                                                                                                                                                                                          |

CSV columns for an audit export: `id, at, kind, idz, device_id, client_id, session_id, detail` (`detail` JSON-encoded). JSON is an array of the same objects `GET /orgs/audit` returns, plus `session_id`, which is `detail.sid` or `detail.session_id` when the event carries one, else `null`. An audit export covers every row in the tenant database: the organisation's own events and the open index's login, session and device events, which carry no `org_id`. The file is assembled in memory in pages of 500 rows and stored with one write, so an export is bounded by Worker memory, not streamed; streaming for very large logs is on the [roadmap](/enterprise/#on-the-roadmap).

## SIEM webhooks

```ts
interface Webhook {
  id: string; // wh_…
  url: string; // https only; private, loopback and link-local addresses refused
  kinds: string[]; // audit kinds, or prefixes with a trailing '*' (e.g. 'login.*'); [] = everything
  status: 'active' | 'paused' | 'failing'; // failing = 20 consecutive failures; deliveries continue
  description: string | null;
  created_at: string;
  last_delivery_at: string | null;
  last_status: number | null;
  consecutive_failures: number;
}

interface Delivery {
  id: string; // dl_…
  webhook_id: string;
  event_id: number; // the audit event's id
  kind: string;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  next_attempt_at: string | null;
  last_status: number | null;
  last_error: string | null;
  created_at: string;
  delivered_at: string | null;
}

/** The body of every delivery: the audit event as GET /orgs/audit returns it, plus org_id and session_id. */
interface WebhookEvent {
  id: number;
  at: string;
  org_id: string;
  kind: string;
  idz: string | null;
  device_id: string | null;
  client_id: string | null;
  session_id: string | null;
  detail: Record<string, unknown> | null;
}
```

| Method   | Path                                       | Role                       | Body → Response                                                                                                                                        |
| -------- | ------------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET`    | `/orgs/webhooks`                           | admin+ (`webhooks.manage`) | `{ webhooks: Webhook[], signing_key: { kid: 'index', alg: 'EdDSA', public_key: string } }`; `public_key` is the raw Ed25519 key, base64url             |
| `POST`   | `/orgs/webhooks`                           | admin+ (`webhooks.manage`) | `{ url, kinds?, description? }` → `{ webhook }` (`201`). `400 destination_blocked` for a private, loopback or link-local address; `409 quota_exceeded` |
| `PATCH`  | `/orgs/webhooks/:id`                       | admin+ (`webhooks.manage`) | `{ url?, kinds?, description?, status?: 'active' \| 'paused' }` → `{ webhook }`. Setting `active` resets `consecutive_failures`                        |
| `DELETE` | `/orgs/webhooks/:id`                       | admin+ (`webhooks.manage`) | → `204`; pending deliveries are dropped                                                                                                                |
| `POST`   | `/orgs/webhooks/:id/test`                  | admin+ (`webhooks.manage`) | Sends a `webhook.test` event now → `{ delivery }` with the result                                                                                      |
| `GET`    | `/orgs/webhooks/:id/deliveries`            | admin+ (`webhooks.manage`) | query `status` → `{ deliveries: Delivery[] }`, newest 100                                                                                              |
| `POST`   | `/orgs/webhooks/:id/deliveries/:did/retry` | admin+ (`webhooks.manage`) | Re-queues a failed delivery, resets its attempts and posts at once → `{ delivery }`. `400 already_delivered`                                           |

### Delivery and signature

Each delivery is `POST {url}` with `content-type: application/json`, a `WebhookEvent` body, and the headers:

```http
Idz-Event-Id: 48213
Idz-Delivery-Id: dl_01K4D0…
Idz-Timestamp: 1789117200
Idz-Signature: v1=<base64url Ed25519 signature over "<timestamp>.<body>">
```

The signature is made with the tenant's index key; the public key is `signing_key.public_key` in `GET /orgs/webhooks` and `index_pubkey` in `GET /.well-known/identizen`. A `2xx` within 5 seconds counts as delivered; anything else, or a timeout, is a failed attempt. Retries run at 1, 5 and 30 minutes and 2, 6 and 24 hours after the first attempt (7 attempts in all), then the delivery is `failed`. A delivery that succeeds on a `failing` webhook sets it back to `active`. Verify the signature over the raw body before parsing it:

```ts title="verify-webhook.ts"
import { ed25519Verify, fromBase64Url, utf8Encode } from '@identizen/protocol';

/** From GET /orgs/webhooks (signing_key.public_key) or GET /.well-known/identizen (index_pubkey). */
const INDEX_PUBKEY = fromBase64Url(process.env.IDZ_INDEX_PUBKEY ?? '');

export async function handleWebhook(request: Request): Promise<Response> {
  const body = await request.text();
  const timestamp = request.headers.get('idz-timestamp') ?? '';
  const header = request.headers.get('idz-signature') ?? '';
  const signature = header.startsWith('v1=') ? fromBase64Url(header.slice(3)) : null;
  const fresh = Math.abs(Date.now() / 1000 - Number(timestamp)) < 5 * 60;
  const valid =
    signature !== null &&
    fresh &&
    ed25519Verify(signature, utf8Encode(`${timestamp}.${body}`), INDEX_PUBKEY);
  if (!valid) return new Response('bad signature', { status: 401 });

  const event = JSON.parse(body) as { id: number; kind: string; at: string };
  // Retries re-send the same event with a new Idz-Delivery-Id: deduplicate on event.id.
  console.log(event.kind, event.id, event.at);
  return new Response(null, { status: 204 });
}
```

How events reach the queue: every audit write in the organisation routes, SCIM, SAML and enrollment records the event and delivers in the request's background. The open index writes `login.*`, `session.*` and `device.*` events itself, so each webhook also keeps a cursor into the audit table and the scheduled job sweeps everything settled past it (at least 5 seconds old) into the queue. A new webhook's cursor starts at the current last event, so history is never replayed; a `(webhook, event)` pair is queued at most once. The destination is checked at registration against the egress policy whatever the index's own setting, since an administrator-supplied URL is the SSRF vector.

## Retention

The retention keys sit in the same table as the [policy document](/enterprise/api/policy/#the-policy-document) but have their own routes:

| Key                                 | Default | Range   |
| ----------------------------------- | :-----: | ------- |
| `audit_retention_days`              |   365   | 30–3650 |
| `admin_actions_retention_days`      |   730   | 30–3650 |
| `scim_log_retention_days`           |   90    | 7–3650  |
| `webhook_deliveries_retention_days` |   30    | 1–365   |
| `exports_retention_days`            |    7    | fixed   |

| Method | Path              | Role                        | Body → Response                                                                                                             |
| ------ | ----------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/orgs/retention` | any admin role (`org.read`) | `{ retention }`                                                                                                             |
| `PUT`  | `/orgs/retention` | admin+ (`org.write`)        | Any subset of the keys → `{ retention }`. `400` outside the limits; admin action `retention.update`, audit `policy.updated` |

Once a day the scheduled job deletes rows past retention (the tenant's whole audit table, which holds one organisation; admin actions; the SCIM log; delivered and failed webhook deliveries; job runs older than 30 days) and writes `retention.run` to the audit log with the counts and the policy applied.

## Scheduled jobs

The index runs a job set every five minutes for every active tenant, in this order: `retention` (once a day), `exports` (deletes objects past `expires_at`; the row stays so the download answers `410`), `purge` (expired SAML flows; pending enrollments past `expires_at` become `expired`), `webhooks` (the cursor sweep, then up to 100 due deliveries). Each job writes a run record with `status: 'running' | 'ok' | 'error'`; a job that throws is recorded and the next job still runs; a tenant whose database is unreachable is skipped and never blocks another. The latest run of each job is in `GET /orgs/status`.

## Status and quotas

```ts
interface OrgStatus {
  tenant: { slug: string; plan: 'standard' | 'dedicated'; residency: 'us' | 'eu'; version: number };
  index: {
    url: string;
    issuer: string;
    database: 'ok' | 'error';
    mail: 'configured' | 'not_configured';
    saml: 'provisioned' | 'missing';
  };
  quotas: Record<
    'members' | 'devices' | 'sso_apps' | 'scim_tokens' | 'webhooks',
    { used: number; limit: number }
  >;
  jobs: { job: string; last_run_at: string | null; status: string | null }[];
  webhooks: { active: number; failing: number; pending_deliveries: number };
}

/** GET /status */
interface PublicStatus {
  ok: boolean;
  service: string;
  issuer: string;
  database: 'ok' | 'error';
  version: number; // the tenant record's version
}
```

| Method | Path           | Role                     | Response                                                                                                          |
| ------ | -------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/orgs/status` | auditor+ (`status.read`) | `OrgStatus`                                                                                                       |
| `GET`  | `/status`      | none                     | `PublicStatus`: the tenant's public liveness, no counts. `503` with `ok: false` when the database does not answer |

Quotas come from the plan and can be raised or lowered per tenant by Identizen:

| Quota         | `standard` | `dedicated` | Counts                                          | Checked at                                             |
| ------------- | :--------: | :---------: | ----------------------------------------------- | ------------------------------------------------------ |
| `members`     |    500     |    5000     | `invited` + `active` members                    | `POST /orgs/members`, `POST /scim/v2/Users`            |
| `devices`     |    2000    |    20000    | managed devices that are `active` or `disabled` | `POST /enroll/:token/claim` of a phone not yet managed |
| `sso_apps`    |     20     |     100     | `active` apps                                   | `POST /orgs/sso/oidc`, `POST /orgs/sso/saml`           |
| `scim_tokens` |     5      |     20      | unrevoked tokens                                | `POST /orgs/scim/tokens`                               |
| `webhooks`    |     5      |     20      | all webhooks                                    | `POST /orgs/webhooks`                                  |

Exceeding one refuses the create with `409 quota_exceeded` and `{ quota, used, limit }`; SCIM answers with its own envelope and `scimType: quota_exceeded`.

## Licence (on-prem)

An on-prem install runs in single-tenant mode: the tenant record and secrets come from environment variables, and `LICENSE` is an Ed25519-signed JSON document issued by Identizen, verified at boot against Identizen's public key baked into the image.

```ts
interface Licence {
  v: 1;
  id: string;
  subject: string;
  seats: number; // active members
  features: string[];
  issued_at: string;
  expires_at: string;
}
```

An expired licence enters a 14-day grace period, reported as `licence.status: 'grace'` in `GET /orgs/public` and `GET /status` and shown as a banner in the portal and org app; after grace, logins are refused with `503 licence_expired` while the admin routes keep working. Seats are active members: exceeding them refuses invitations and SCIM creates with `409 seats_exceeded`. Identizen Cloud tenants report `licence: null`. Installation is on [On-prem installation](/enterprise/on-prem/).

## Audit and admin actions

Audit kinds: `export.created`, `export.completed`, `export.failed`, `webhook.created`, `webhook.updated`, `webhook.removed`, `webhook.test`, `webhook.failing`, `retention.run`, `licence.grace`, `licence.expired`; a retention change is `policy.updated`. Admin actions: `export.create`, `export.remove`, `webhook.create`, `webhook.update`, `webhook.remove`, `webhook.test`, `webhook.retry`, `retention.update`.

## Example: stream every login and membership event to a SIEM

```bash
curl -sS -X POST https://acme.index.identizen.com/orgs/webhooks \
  -H "Authorization: Bearer $IDZ_PORTAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://siem.example.com/hooks/identizen",
    "kinds": ["login.*", "member.*", "session.*"],
    "description": "Splunk HEC relay"
  }'
```

```json
{
  "webhook": {
    "id": "wh_01K4D0…",
    "url": "https://siem.example.com/hooks/identizen",
    "kinds": ["login.*", "member.*", "session.*"],
    "status": "active",
    "description": "Splunk HEC relay",
    "created_at": "2026-09-07T09:52:40.006Z",
    "last_delivery_at": null,
    "last_status": null,
    "consecutive_failures": 0
  }
}
```

Follow with `POST /orgs/webhooks/wh_01K4D0…/test` to receive a `webhook.test` event and check the signature with the sample above.
