---
title: SCIM provisioning
description: User lifecycle from your IdP or HR system over SCIM 2.0 — the endpoint, tokens, what each SCIM operation does to a member, the Okta and Entra recipes, and the log.
---

Every Identizen Cloud tenant index serves a SCIM 2.0 server at `https://{tenant}.index.identizen.com/scim/v2`, so the system that already knows who works for you (Okta, Microsoft Entra, or an HR platform with a SCIM connector) can create members, keep their names current, suspend them and deprovision them, without anyone opening the portal. Users only; groups are [on the roadmap](/enterprise/#on-the-roadmap).

## Tokens

An owner or admin creates a SCIM token in **SCIM**, with a name for the system that will hold it. The secret is shown once; it is a bearer token the provisioning system sends on every call. Tokens never expire; revoke one from the same page and every call with it is refused from then on. Each token shows when it was last used.

## What each operation does

A SCIM `User` is a member of the organisation. `id` is the member id, `userName` is the email, and:

| SCIM attribute                 | Member                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| `userName`, `emails[primary]`  | email (unique in the organisation; 409 `uniqueness` on a clash)                        |
| `name.givenName`, `familyName` | kept as the member's profile; `displayName` or `name.formatted` sets the display name  |
| `externalId`                   | your system's id for the person, searchable with `filter=externalId eq "…"`            |
| `active`                       | `true` for `invited` and `active` members; `false` for `suspended` and `deprovisioned` |

- **Create** (`POST /Users`) creates a member with the role `member`, `source: scim` and status `invited`, and emails the invitation to the address (the link is valid 7 days, as for a portal invitation). The person enrols a phone on the tenant index and accepts, as described in [Administering your organisation](/enterprise/portal/#inviting). Creating with `active: false` makes the member `suspended` straight away.
- **Update** (`PUT`, or `PATCH` with `replace`/`add`/`remove` operations) changes the email, names and `externalId`. `active: false` suspends the member: every session is revoked, back-channel logout goes to every site, and the phone is refused at its next login with `member_suspended`. `active: true` reinstates them (`active` if they have a phone, `invited` if they never enrolled).
- **Delete** (`DELETE /Users/:id`) deprovisions the member: every device and session is revoked, and the member disappears from SCIM listings while staying in the portal as `deprovisioned` for the audit trail.
- **Owners and admins are never touched by SCIM.** Deactivating or deleting one answers 403 `scim_protected_role`; demote them in the portal first.

Listing supports `startIndex` and `count`, and the filters `userName eq "…"`, `emails.value eq "…"` and `externalId eq "…"`. `ServiceProviderConfig`, `ResourceTypes` and `Schemas` are served for connectors that read them; bulk, sorting and ETags are not supported and say so.

## Okta

In the Okta app integration (Provisioning → Integration): SCIM connector base URL `https://{tenant}.index.identizen.com/scim/v2`, unique identifier field `userName`, supported actions **Push New Users**, **Push Profile Updates** and **Push User Deactivation**, authentication mode **HTTP Header** with the SCIM token as the bearer. Import is not supported (there are no groups to import). Under **To App**, enable create, update and deactivate; Okta's default attribute mappings (userName, givenName, familyName, email, displayName) match the table above.

## Microsoft Entra

In the enterprise application (Provisioning → Automatic): tenant URL `https://{tenant}.index.identizen.com/scim/v2`, secret token the SCIM token; **Test Connection** calls `/Users?filter=userName eq "…"` and succeeds. Keep the default user mappings; Entra's `PATCH` shape (`op: "Replace"`, `path: "active"`, `value: "False"`) is understood. Assign the users or groups whose members should exist in Identizen; Entra creates each one at the next cycle and deactivates them when they leave the assignment.

## The log and audit

**SCIM** in the portal shows every call: time, method, path, response status and which token made it (a call with a bad token is logged without one), so a mis-mapped attribute or a revoked token is visible at once. Each change is also an audit event: `scim.user_created`, `scim.user_updated`, `scim.user_deactivated`, `scim.user_reactivated`, `scim.user_deleted`, and `scim.token_created` and `scim.token_revoked` for the tokens; the token actions are recorded as admin actions too.

## Over the API

| Method | Path                    | Role     | Notes                                           |
| ------ | ----------------------- | -------- | ----------------------------------------------- |
| GET    | `/orgs/scim/tokens`     | admin+   | `{ tokens, endpoint }`                          |
| POST   | `/orgs/scim/tokens`     | admin+   | `{ name }` → `{ token, secret }` (once)         |
| DELETE | `/orgs/scim/tokens/:id` | admin+   | 204                                             |
| GET    | `/orgs/scim/log`        | auditor+ | `limit`, `cursor` → `{ entries, next_cursor? }` |

Errors from `/scim/v2/*` use the SCIM error schema (`urn:ietf:params:scim:api:messages:2.0:Error`) with `status`, `detail` and, where the RFC defines one, `scimType`.
