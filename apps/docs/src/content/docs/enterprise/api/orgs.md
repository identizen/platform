---
title: Organization API
description: The organization profile, verified domains, members and invitations, the audit log and the admin-actions log on a tenant index — every route with its role, body and response.
---

The routes the portal's **Organization**, **Domains**, **Users** and **Audit** pages use, plus the public and session routes a UI needs before and after sign-in. Authentication, roles and the error shape are on the [overview](/enterprise/api/); the administrator's view is [Administering your organization](/enterprise/portal/).

## Objects

```ts
interface Org {
  id: string; // the tenant id
  slug: string;
  display_name: string;
  branding: { logo_url: string | null };
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface Member {
  id: string; // m_…
  email: string;
  display_name: string | null;
  role: 'owner' | 'admin' | 'helpdesk' | 'auditor' | 'member';
  status: 'invited' | 'active' | 'suspended' | 'deprovisioned';
  idz: string | null; // the linked identity; null until the invitation is accepted
  source: 'manual' | 'scim' | 'domain' | 'mdm';
  invited_at: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface OrgDomain {
  id: string; // d_…
  domain: string; // lower-case, no trailing dot
  status: 'pending' | 'verified' | 'stale'; // older name; `pending` = `state: 'unverified'`
  state: 'unverified' | 'verified' | 'stale'; // stale = verified, but the last scheduled re-check found no proof
  method: 'dns' | 'https' | null;
  verified_at: string | null;
  checked_at: string | null; // last check, on demand or scheduled, whatever the outcome
  stale_at: string | null; // when a re-check first failed; null while healthy
  auto_join: boolean; // stored; self-enrollment by domain is not built yet
  created_at: string;
}

interface DomainInstructions {
  dns: { name: string; type: 'TXT'; value: string }; // _identizen.<domain>  idz-org-verification=<token> org=<org id>
  https: { url: string; body: string }; // https://<domain>/.well-known/identizen-org, same value
}

interface AuditEvent {
  id: number;
  at: string;
  kind: string;
  idz: string | null;
  device_id: string | null;
  client_id: string | null;
  detail: Record<string, unknown> | null;
}

interface AdminAction {
  id: number;
  at: string;
  actor_member_id: string;
  actor_email: string;
  action: string;
  target: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

/** GET /orgs/members/:id */
interface MemberDetail {
  member: Member;
  devices: {
    id: string;
    label: string | null;
    platform: 'apns' | 'fcm' | 'web' | null;
    status: 'active' | 'disabled' | 'revoked';
    last_seen_at: string | null;
    created_at: string;
  }[];
  sessions: {
    sid: string;
    client_id: string;
    site_name: string | null;
    created_at: string;
    expires_at: string;
  }[];
  audit: AuditEvent[]; // the last 50
}
```

`source` is `manual` for members invited from the portal, `scim` for members created through `/scim/v2/Users`, `mdm` for members created by `POST /enroll/mdm/issue`, and `domain` is reserved for self-enrollment by verified domain, which is not built.

## Public and session routes

| Method | Path                   | Auth   | Body → Response                                                                                                                                                                                                                     |
| ------ | ---------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/orgs/public`         | none   | `{ org: { id, slug, display_name, branding }, portal_client_id, app_client_id, license }`: what a UI needs before sign-in. `license` is `null` on Identizen Cloud; on-prem it carries `{ status: 'ok' \| 'grace' \| 'expired', … }` |
| `GET`  | `/orgs/me`             | bearer | `{ org, member: Member \| null, managed_devices: number }`: the caller's own membership and how many active or disabled managed devices its identity has in this organization                                                       |
| `POST` | `/orgs/bootstrap`      | bearer | `{ invite_token }` → `{ member }` (`201`). Verifies the owner invitation with the control plane and creates the first `owner` linked to the caller. `409 already_bootstrapped` if an owner exists, `400 invalid_invite`             |
| `POST` | `/orgs/invites/accept` | bearer | `{ invite_token }` → `{ member }`. Links the caller's identity to the invited member, status → `active`. `400 invalid_invite`, `410 invite_expired`, `409 identity_already_member`                                                  |

## Organization

| Method  | Path    | Role                        | Body → Response                                                      |
| ------- | ------- | --------------------------- | -------------------------------------------------------------------- |
| `GET`   | `/orgs` | any admin role (`org.read`) | `{ org }`                                                            |
| `PATCH` | `/orgs` | admin+ (`org.write`)        | `{ display_name?, branding?: { logo_url? }, settings? }` → `{ org }` |

## Domains

| Method   | Path                       | Role                            | Body → Response                                                                                                                                                                                   |
| -------- | -------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/orgs/domains`            | any admin role (`domains.read`) | `{ domains: OrgDomain[] }`                                                                                                                                                                        |
| `POST`   | `/orgs/domains`            | admin+ (`domains.write`)        | `{ domain, auto_join? }` → `{ domain: OrgDomain, instructions: DomainInstructions }` (`201`). `409 domain_taken`                                                                                  |
| `GET`    | `/orgs/domains/:id`        | any admin role (`domains.read`) | `{ domain, instructions }`                                                                                                                                                                        |
| `POST`   | `/orgs/domains/:id/verify` | admin+ (`domains.write`)        | → `{ domain }`. Checks the DNS record, then the well-known file; sets `verified_at` and clears `stale_at`. `409 verification_failed` with `detail: { checked: [...] }` (`checked_at` still moves) |
| `DELETE` | `/orgs/domains/:id`        | admin+ (`domains.write`)        | → `204`                                                                                                                                                                                           |

### Domain re-checks

The scheduled `domains` job ([scheduled jobs](/enterprise/api/operations/#scheduled-jobs)) re-checks every verified domain 30 days after its last check with the same DNS-then-HTTPS lookup as `verify`. Success moves `checked_at`; a failure stamps `stale_at` (`state: 'stale'`) and writes `domain.stale` with `{ domain_id, domain, method, reason }`, delivered to webhooks like every audit event. A stale domain is re-checked on every daily run: success clears `stale_at` and writes `domain.reverified`; a failure more than 30 days after `stale_at` clears `verified_at` (`state: 'unverified'`), keeps `stale_at` and writes `domain.unverified`. Unverifying changes nothing else today: `auto_join` is stored, not acted on, so no membership is created or removed by a domain lapsing. An administrator can re-verify at any time with `POST /orgs/domains/:id/verify`.

## Members

| Method  | Path                            | Role                            | Body → Response                                                                                                                                                                                        |
| ------- | ------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET`   | `/orgs/members`                 | any admin role (`members.read`) | query `q` (email or display-name substring), `status`, `role`, `limit` (≤ 100), `cursor` → `{ members: Member[], next_cursor }`                                                                        |
| `POST`  | `/orgs/members`                 | admin+ (`members.write`)        | `{ email, role?, display_name? }` → `{ member, invite_url, delivery? }` (`201`). `invite_url` is shown once. `409 email_taken`, `409 quota_exceeded`; only an owner may set `role: 'owner'`            |
| `GET`   | `/orgs/members/:id`             | any admin role (`members.read`) | `MemberDetail`                                                                                                                                                                                         |
| `PATCH` | `/orgs/members/:id`             | admin+ (`members.write`)        | `{ role?, display_name? }` → `{ member }`. Only an owner may grant or remove `owner`; the last owner cannot be demoted (`409 last_owner`)                                                              |
| `POST`  | `/orgs/members/:id/suspend`     | helpdesk+ (`members.support`)   | → `{ member, sessions_revoked }`. Revokes every live session with back-channel logout; logins are refused while suspended. `403 self_suspend`                                                          |
| `POST`  | `/orgs/members/:id/reinstate`   | helpdesk+ (`members.support`)   | → `{ member }`. A suspended row that never linked an identity goes back to `invited`                                                                                                                   |
| `POST`  | `/orgs/members/:id/reinvite`    | helpdesk+ (`members.support`)   | → `{ member, invite_url, delivery? }`. New token; the old one is void                                                                                                                                  |
| `POST`  | `/orgs/members/:id/deprovision` | admin+ (`members.write`)        | → `{ member, devices_revoked, sessions_revoked }`. Revokes every device and session, back-channel logout to every site, status `deprovisioned`; irreversible. `403 self_deprovision`, `409 last_owner` |

`delivery` is `{ email: 'sent' | 'failed' | 'not_configured' }` and says whether the same link was emailed ([mail](/enterprise/api/#rate-limits-quotas-and-mail)).

### Invitations

`POST /orgs/members` and `reinvite` return `invite_url`: `https://{tenant}.app.identizen.com/invite?token=<token>` for `member`, `https://{tenant}.portal.identizen.com/invite?token=<token>` for an administrator role. Tokens are 32 random bytes (base64url), stored hashed, valid 7 days. The invited person enrolls a phone on the tenant index, opens the link, signs in and the page posts the token to `POST /orgs/invites/accept`. The first owner's invitation is created by Identizen at provisioning and lands on the portal's `/invite` page, which posts to `POST /orgs/bootstrap` instead.

## Audit

| Method | Path                  | Role                                                                              | Body → Response                                                                                                     |
| ------ | --------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/orgs/audit`         | auditor+ (`audit.read`); helpdesk with `member_id` or `idz` (`audit.read_member`) | query `kind`, `member_id`, `idz`, `from`, `to`, `limit` (≤ 200), `cursor` → `{ events: AuditEvent[], next_cursor }` |
| `GET`  | `/orgs/admin-actions` | auditor+ (`audit.read`)                                                           | query `limit`, `cursor` → `{ actions: AdminAction[], next_cursor }`                                                 |

Audit kinds these routes write: `admin.bootstrapped`, `org.updated`, `domain.added`, `domain.verified`, `domain.removed`, `member.invited`, `member.accepted`, `member.role_changed`, `member.suspended`, `member.reinstated`, `member.deprovisioned`; the scheduled re-check writes `domain.stale`, `domain.reverified` and `domain.unverified` with no actor. Admin actions: `org.update`, `domain.add`, `domain.verify`, `domain.remove`, `member.invite`, `member.update`, `member.suspend`, `member.reinstate`, `member.reinvite`, `member.deprovision`. An identity linked to a suspended or deprovisioned member is refused at phone approval and at code exchange with `member_suspended` or `member_deprovisioned`, audited as `login.denied`.

## Example: invite a member

```bash
curl -sS -X POST https://acme.index.identizen.com/orgs/members \
  -H "Authorization: Bearer $IDZ_PORTAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "email": "grace@example.com", "role": "helpdesk", "display_name": "Grace Hopper" }'
```

```json
{
  "member": {
    "id": "m_01K4A7…",
    "email": "grace@example.com",
    "display_name": "Grace Hopper",
    "role": "helpdesk",
    "status": "invited",
    "idz": null,
    "source": "manual",
    "invited_at": "2026-09-07T09:12:44.120Z",
    "accepted_at": null,
    "created_at": "2026-09-07T09:12:44.120Z",
    "updated_at": "2026-09-07T09:12:44.120Z"
  },
  "invite_url": "https://acme.portal.identizen.com/invite?token=…",
  "delivery": { "email": "sent" }
}
```
