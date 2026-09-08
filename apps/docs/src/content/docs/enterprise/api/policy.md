---
title: Policy API
description: The policy document (enrollment rules, login rules, retention keys), the managed-device preview, sites and workforce-only, and live member sessions on a tenant index — every route with its role, body and response.
---

The routes behind the portal's **Policy**, **Sites** and **Sessions** pages. Authentication and roles are on the [overview](/enterprise/api/); the guide is [Login policy](/enterprise/policy/).

## The policy document

```ts
interface Policy {
  // Enrollment (applied at claim, from the snapshot taken when the token was issued)
  require_attestation: boolean;
  auto_approve: boolean;
  auto_approve_mdm: boolean;
  enrollment_ttl_hours: number; // 1–168, default 72
  // Login (read live at each sign-in, members only)
  require_managed_device: boolean; // members may only sign in from a managed phone
  allowed_amr: string[]; // empty = any; else the phone's amr must include one of these
  session_max_age_hours: number; // 0 = index default (30 days); 1–720 otherwise
  login_windows: LoginWindow[] | null; // null = always; else logins only inside a window
  workforce_only_default: boolean; // stored; not yet applied to new sites
}

interface LoginWindow {
  timezone: string; // IANA, e.g. "Europe/Berlin"
  days: number[]; // 1 = Monday … 7 = Sunday
  start: string; // "HH:MM"
  end: string; // "HH:MM"; may be before start to wrap midnight
}

/** Retention keys live next to the policy but have their own routes: GET and PUT /orgs/retention. */
interface Retention {
  audit_retention_days: number; // default 365, 30–3650
  admin_actions_retention_days: number; // default 730, 30–3650
  scim_log_retention_days: number; // default 90, 7–3650
  webhook_deliveries_retention_days: number; // default 30, 1–365
  exports_retention_days: 7; // fixed
}
```

`allowed_amr` takes the protocol's values: `face`, `fingerprint`, `iris`, `pin`, `user`, `swk`, `bt`. The retention keys are stored in the same table as the policy but are read and written through [`/orgs/retention`](/enterprise/api/operations/#retention); they are not part of the `Policy` document that `PUT /orgs/policy` validates.

| Method | Path                   | Role                        | Body → Response                                                                                                                              |
| ------ | ---------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/orgs/policy`         | any admin role (`org.read`) | `{ policy: Policy }`, the whole document including the enrollment fields                                                                     |
| `PUT`  | `/orgs/policy`         | admin+ (`org.write`)        | `Partial<Policy>` → `{ policy }`. `400 invalid_policy` with `error_description` naming the field; audited `policy.updated`                   |
| `GET`  | `/orgs/policy/preview` | admin+ (`org.write`)        | query `require_managed_device=true` → `{ members_without_managed_device: number, members_active: number }`; without it, the first count is 0 |

Reading the policy is gated on `org.read`, so helpdesk can read it over the API although the portal shows **Policy** to owners, admins and auditors only.

## How the policy acts on the login path

| Check                                                                                       | Where                    | Refusal (`403`, audited `login.denied`)                                      |
| ------------------------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------- |
| Member suspended or deprovisioned                                                           | assertion, code exchange | `member_suspended`, `member_deprovisioned`                                   |
| `workforce_only` site: the identity must be an active member                                | assertion                | `workforce_only`                                                             |
| `require_managed_device`: the approving phone must be a managed device of this organisation | assertion (members only) | `managed_device_required`                                                    |
| `allowed_amr`: the assertion's `amr` must share a value with the list                       | assertion (members only) | `amr_not_allowed`                                                            |
| `login_windows`: now must fall inside a window                                              | assertion (members only) | `outside_login_window`                                                       |
| `session_max_age_hours`                                                                     | code exchange            | The session's `expires_at` is shortened; never longer than the index default |

Checks marked "members only" apply to identities linked to a member; other identities on the tenant (contractors on non-workforce sites) are untouched. `workforce_only` applies to everyone on that site. Members get `idz_role` (their role) in the id_token and `/userinfo`. Ending live sessions when a login window closes is not built; `POST /orgs/sessions/revoke-all` is the manual equivalent.

## Sites

Every site registered on the tenant appears here, not only the ones an administrator has touched. Registering a site, changing its redirect URIs or logout URI, rotating its secret and verifying its domain are done with the [CLI and the registration token](/enterprise/cloud-setup/#register-a-site), not here.

```ts
interface OrgSite {
  client_id: string;
  name: string;
  rp_id: string;
  redirect_uris: string[];
  public: boolean; // no client secret
  workforce_only: boolean;
  verification: 'verified' | 'pending' | 'stale' | 'not_required';
  verified_at: string | null;
  backchannel_logout_uri: string | null;
  created_at: string;
}
```

| Method  | Path                     | Role                          | Body → Response                                    |
| ------- | ------------------------ | ----------------------------- | -------------------------------------------------- |
| `GET`   | `/orgs/sites`            | helpdesk+ (`members.support`) | `{ sites: OrgSite[] }`                             |
| `GET`   | `/orgs/sites/:client_id` | helpdesk+ (`members.support`) | `{ site: OrgSite }`. `404 site_not_found`          |
| `PATCH` | `/orgs/sites/:client_id` | admin+ (`org.write`)          | `{ workforce_only?: boolean, name? }` → `{ site }` |

Listing sites sits with the support grants, so helpdesk can and auditors cannot. `workforce_only_default` in the policy is stored but not yet applied when a site registers; set `workforce_only` per site.

## Sessions

```ts
interface OrgSession {
  sid: string;
  member_id: string;
  member_email: string;
  device_id: string;
  client_id: string;
  site_name: string | null;
  created_at: string;
  expires_at: string;
}
```

| Method | Path                                | Role                          | Body → Response                                                                                                                       |
| ------ | ----------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/orgs/sessions`                    | helpdesk+ (`members.support`) | query `member_id`, `limit`, `cursor` → `{ sessions: OrgSession[], next_cursor }`: live sessions of members                            |
| `POST` | `/orgs/members/:id/sessions/revoke` | helpdesk+ (`members.support`) | → `{ sessions_revoked }`, with back-channel logout to every site that registered one                                                  |
| `POST` | `/orgs/sessions/revoke-all`         | admin+ (`org.write`)          | `{ confirm: "<org slug>" }` → `{ sessions_revoked, members: number }`: every member session, logout delivered. `400 confirm_mismatch` |

Sessions of identities that are not members do not appear; they belong to the person, who manages them from their own dashboard.

## Audit and admin actions

Audit kinds: `policy.updated` (with `detail.fields`), `site.updated_by_org`, `session.revoked_by_org`, `org.sessions_revoked`, and `login.denied` with the reasons above. Admin actions: `policy.update`, `site.update`, `member.sessions_revoke`, `org.sessions_revoke_all`.

## Example: biometrics only, office hours in Berlin

```bash
curl -sS -X PUT https://acme.index.identizen.com/orgs/policy \
  -H "Authorization: Bearer $IDZ_PORTAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "allowed_amr": ["face", "fingerprint", "iris"],
    "login_windows": [
      { "timezone": "Europe/Berlin", "days": [1, 2, 3, 4, 5], "start": "07:00", "end": "20:00" }
    ],
    "session_max_age_hours": 12
  }'
```

```json
{
  "policy": {
    "require_attestation": false,
    "auto_approve": false,
    "auto_approve_mdm": true,
    "enrollment_ttl_hours": 72,
    "require_managed_device": false,
    "allowed_amr": ["face", "fingerprint", "iris"],
    "session_max_age_hours": 12,
    "login_windows": [
      { "timezone": "Europe/Berlin", "days": [1, 2, 3, 4, 5], "start": "07:00", "end": "20:00" }
    ],
    "workforce_only_default": false
  }
}
```

A member who approves with a PIN, or at 21:00 Berlin time, is refused with `amr_not_allowed` or `outside_login_window`; sessions created from now on expire after 12 hours.
