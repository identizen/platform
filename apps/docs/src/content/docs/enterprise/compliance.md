---
title: Compliance and operations
description: Audit export, SIEM webhooks signed with the tenant's key, retention, the organisation status page with plan quotas, and how the tenant index's scheduled jobs run.
---

**Compliance** in the portal is where an organisation gets its data out and keeps it under control: exports of the audit log and of the organisation itself, webhooks that stream every audit event to a SIEM, retention periods, and a status page with the tenant's quotas and jobs. Everything on this page runs on the tenant index; nothing leaves the tenant's database except what an administrator exports or points a webhook at.

## Exports

An export is a job that writes a file to the tenant's object store and lets an administrator download it for 7 days.

- **Audit log**, as CSV or JSON, optionally limited to a date range. The columns are `id, at, kind, idz, device_id, client_id, session_id, detail` (`detail` is the event's JSON). JSON exports are the same objects the portal's audit page shows.
- **Organisation data**, JSON only: members, domains, policies, SSO apps, SCIM tokens (ids and names, never secrets), devices with their fleet fields, sessions and admin actions.

Owners, admins and auditors can start and download exports; owners and admins can delete one early. At most three jobs run at once per organisation. Each export is an admin action and an audit event (`export.created`, `export.completed`, `export.failed`), and the file disappears when it expires.

## SIEM webhooks

A webhook receives every audit event (or only the kinds you list, with `login.*`-style prefixes) as a JSON POST to an `https://` URL you control. Private, loopback and link-local addresses are refused, and delivery goes through the index's outbound policy.

Every delivery is **signed with the tenant's Ed25519 index key**, the same key the phones trust, so there is no shared secret to store on either side. Headers:

| Header            | Value                                                        |
| ----------------- | ------------------------------------------------------------ |
| `Idz-Event-Id`    | the audit event id                                           |
| `Idz-Delivery-Id` | unique per attempt series                                    |
| `Idz-Timestamp`   | Unix seconds when the request was signed                     |
| `Idz-Signature`   | `v1=<base64url Ed25519 signature over "<timestamp>.<body>">` |

Verify with the public key from `GET /.well-known/identizen` (`index_pubkey`), which the portal also shows next to the webhook list, and reject timestamps older than a few minutes. A 2xx acknowledges the event; anything else, or no answer within 5 seconds, is a failed attempt. Failed deliveries are retried after 1, 5 and 30 minutes, then 2, 6 and 24 hours, and marked failed after that. Twenty consecutive failures mark the webhook `failing` (deliveries continue; the portal shows it). The portal lists every delivery with its status and lets an administrator retry a failed one or send a `webhook.test` event.

## Retention

Four policy keys, editable under **Compliance → Retention**, through `PUT /orgs/policy` alongside the login policy, or through `GET`/`PUT /orgs/retention` on their own:

| Key                                 | Default | Range      |
| ----------------------------------- | ------- | ---------- |
| `audit_retention_days`              | 365     | 30 to 3650 |
| `admin_actions_retention_days`      | 730     | 30 to 3650 |
| `scim_log_retention_days`           | 90      | 7 to 3650  |
| `webhook_deliveries_retention_days` | 30      | 1 to 365   |

Export files are kept for 7 days. A scheduled job deletes rows past retention once a day and records what it removed as a `retention.run` audit event.

## Status and quotas

**Compliance → Status** (and `GET /orgs/status` for owners, admins and auditors) shows the tenant's plan and region, whether the database, mail and SAML signing are healthy, every scheduled job with its last run, the webhook summary, the verified domains split into healthy and stale (`domains: { verified, stale }`), and the quotas of the plan with how much of each is used:

| Quota       | Standard | Dedicated |
| ----------- | -------- | --------- |
| Members     | 500      | 5000      |
| Devices     | 2000     | 20000     |
| SSO apps    | 20       | 100       |
| SCIM tokens | 5        | 20        |
| Webhooks    | 5        | 20        |

Identizen can raise any of them for a tenant. Creating past a quota answers 409 `quota_exceeded` with the quota, the count and the limit. `GET /status` on the tenant index is the public health view (issuer, database, version) with no counts.

## Scheduled jobs

The tenant index runs a job set every five minutes for every active tenant: `retention` (once a day), `exports` (expired export files), `purge` (expired SAML flows and enrollments), `domains` (once a day: the [domain re-checks](/enterprise/portal/#domains); recorded only when at least one domain was due), `usage` (once a day: the active-device count for [billing](/enterprise/billing/)) and `webhooks` (deliveries that are due). Each run is recorded and shown under **Status**, and a tenant whose database is unreachable is skipped without affecting the others.

## Over the API

Every route on this page, with roles, bodies, the webhook signature and a verification sample, is on the [Operations API](/enterprise/api/operations/) reference.
