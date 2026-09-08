---
title: SCIM API
description: SCIM tokens, the SCIM log, and the SCIM 2.0 server at /scim/v2 on a tenant index (Users only) — every route with its auth, body and response.
---

The tenant index is a SCIM 2.0 server (RFC 7643 and 7644 subset: **Users only**) at `https://{tenant}.index.identizen.com/scim/v2`, so an HR system or IdP can provision members. Tokens and the log are managed under `/orgs/scim/*` with a portal session bearer; `/scim/v2/*` takes a SCIM token. The guide, with Okta and Entra walkthroughs, is [SCIM provisioning](/enterprise/scim/).

## Objects

```ts
interface ScimToken {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

/** GET /orgs/scim/log entry: one row per call, including calls refused for a bad token. */
interface ScimLogEntry {
  id: number;
  at: string;
  method: string;
  path: string;
  status: number;
  token_id: string | null;
  detail: Record<string, unknown> | null;
}

/** The SCIM User resource, mapped onto a member. */
interface ScimUser {
  schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'];
  id: string; // the member id
  userName: string; // the member's email
  externalId?: string;
  name?: { givenName?: string; familyName?: string; formatted?: string };
  displayName?: string;
  emails: { value: string; primary: true; type: 'work' }[];
  active: boolean; // invited/active → true; suspended/deprovisioned → false
  meta: { resourceType: 'User'; created: string; lastModified: string; location: string };
}

interface ScimListResponse {
  schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: ScimUser[];
}

interface ScimError {
  schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'];
  status: string; // "409"
  detail: string;
  scimType?: string; // "uniqueness", "invalidValue", "quota_exceeded", …
}
```

## Tokens and log (portal bearer)

| Method   | Path                    | Role                    | Body → Response                                                                                   |
| -------- | ----------------------- | ----------------------- | ------------------------------------------------------------------------------------------------- |
| `GET`    | `/orgs/scim/tokens`     | admin+ (`org.write`)    | `{ tokens: ScimToken[], endpoint }`; `endpoint` is the base URL to paste into the IdP             |
| `POST`   | `/orgs/scim/tokens`     | admin+ (`org.write`)    | `{ name }` → `{ token: ScimToken, secret }` (`201`). `secret` is shown once. `409 quota_exceeded` |
| `DELETE` | `/orgs/scim/tokens/:id` | admin+ (`org.write`)    | → `204`; the token is revoked and every later call with it is `401`                               |
| `GET`    | `/orgs/scim/log`        | auditor+ (`audit.read`) | query `limit`, `cursor` → `{ entries: ScimLogEntry[], next_cursor }`                              |

Listing tokens is `org.write` rather than `org.read`: helpdesk and auditors cannot see the token names.

## `/scim/v2/*` (SCIM bearer)

Responses carry `content-type: application/scim+json`. Every call, including one refused for a bad token, is written to the SCIM log.

| Method   | Path                             | Body → Response                                                                                                                                                                                                                                                                                  |
| -------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET`    | `/scim/v2/ServiceProviderConfig` | Static document: no bulk, no filter beyond the two below, bearer auth                                                                                                                                                                                                                            |
| `GET`    | `/scim/v2/ResourceTypes`         | Static document: `User` only                                                                                                                                                                                                                                                                     |
| `GET`    | `/scim/v2/Schemas`               | Static document: the core User schema                                                                                                                                                                                                                                                            |
| `GET`    | `/scim/v2/Users`                 | query `filter` (`userName eq "…"` or `externalId eq "…"`), `startIndex` (1-based), `count` → `ScimListResponse`                                                                                                                                                                                  |
| `POST`   | `/scim/v2/Users`                 | `ScimUser` (without `id`, `meta`) → `201 ScimUser`. Creates a member with `source: 'scim'`, role `member`, status `invited`, and emails the invitation when mail is configured. `409 uniqueness` when the email exists; `409 quota_exceeded` / `seats_exceeded` in `scimType`                    |
| `GET`    | `/scim/v2/Users/:id`             | → `ScimUser`. `404` when the id is not a member of this organization                                                                                                                                                                                                                             |
| `PUT`    | `/scim/v2/Users/:id`             | Replace: `active`, `name`, `emails`, `externalId`, `displayName` → `ScimUser`                                                                                                                                                                                                                    |
| `PATCH`  | `/scim/v2/Users/:id`             | `{ Operations: [{ op: 'replace' \| 'add' \| 'remove', path?, value }] }` → `ScimUser`. Paths: `active`, `name.givenName`, `name.familyName`, `displayName`, `emails[type eq "work"].value`, `externalId`; both the Okta shape (a `value` object without `path`) and the Entra shape are accepted |
| `DELETE` | `/scim/v2/Users/:id`             | Deprovisions the member: devices and sessions revoked, back-channel logout → `204`                                                                                                                                                                                                               |

What `active` does: `active: false` suspends the member (every live session revoked, logins refused with `member_suspended`); `active: true` reinstates. `DELETE` is the same deprovisioning an administrator performs and is irreversible. Owners and admins cannot be suspended or deprovisioned through SCIM (`403 scim_protected_role`); every provisioned member has the `member` role, and roles are changed in the portal or with `PATCH /orgs/members/:id`. Groups are not implemented.

## Errors

`/scim/v2/*` answers with the SCIM error envelope, never the `{ error }` shape used elsewhere:

```json
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:Error"],
  "status": "409",
  "scimType": "uniqueness",
  "detail": "a member with this email already exists"
}
```

| Status | `scimType`                         | When                                                                |
| ------ | ---------------------------------- | ------------------------------------------------------------------- |
| `400`  | `invalidValue`                     | The body or an `Operations` entry failed validation                 |
| `401`  |                                    | Missing, unknown or revoked token                                   |
| `403`  | `scim_protected_role`              | `active: false` or `DELETE` on an owner or admin                    |
| `404`  |                                    | No member with this id in the organization                          |
| `409`  | `uniqueness`                       | `POST` with an email that already belongs to a member               |
| `409`  | `quota_exceeded`, `seats_exceeded` | The plan's member quota, or the on-prem license's seats, is used up |

## Audit

Audit kinds: `scim.token_created`, `scim.token_revoked` (also recorded as the admin actions `scim.token_create`, `scim.token_revoke`), `scim.user_created`, `scim.user_updated`, `scim.user_deactivated`, `scim.user_reactivated`, `scim.user_deleted`. SCIM calls carry no administrator, so the user events have no admin action; the SCIM log is the per-call record.

## Example: create a user

```bash
curl -sS -X POST https://acme.index.identizen.com/scim/v2/Users \
  -H "Authorization: Bearer $IDZ_SCIM_SECRET" \
  -H "Content-Type: application/scim+json" \
  -d '{
    "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
    "userName": "grace@example.com",
    "externalId": "00u1abc2def",
    "name": { "givenName": "Grace", "familyName": "Hopper" },
    "emails": [{ "value": "grace@example.com", "primary": true, "type": "work" }],
    "active": true
  }'
```

```json
{
  "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
  "id": "m_01K4A7…",
  "userName": "grace@example.com",
  "externalId": "00u1abc2def",
  "name": { "givenName": "Grace", "familyName": "Hopper", "formatted": "Grace Hopper" },
  "displayName": "Grace Hopper",
  "emails": [{ "value": "grace@example.com", "primary": true, "type": "work" }],
  "active": true,
  "meta": {
    "resourceType": "User",
    "created": "2026-09-07T09:40:02.310Z",
    "lastModified": "2026-09-07T09:40:02.310Z",
    "location": "https://acme.index.identizen.com/scim/v2/Users/m_01K4A7…"
  }
}
```

The member is `invited` until the person enrolls a phone and accepts the emailed invitation; `active` is `true` throughout because SCIM's `active` tracks suspension, not acceptance.
