---
title: Enterprise API reference
description: The organisation API on a tenant index — how to authenticate (portal session bearer, SCIM and MDM tokens, device signatures), the roles and grants, the error shape and codes, pagination, and how every change is audited.
---

Every Identizen Cloud tenant, and every on-prem install, runs one tenant index at `https://{tenant}.index.identizen.com`. It serves everything the open index serves ([Index API](/reference/index-api/), [OIDC](/reference/oidc/), [Verification API](/reference/verification-api/)) plus the organisation surface on these pages. The portal, the org app, an MDM, an IdP's SCIM client, a SAML service provider and the phone all talk to it over these routes; the guides under Enterprise describe the same features from the administrator's side.

| Page                                      | Surface                                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| [Organisation](/enterprise/api/orgs/)     | Profile, domains, members and invitations, the audit log and the admin-actions log       |
| [Fleet](/enterprise/api/fleet/)           | Enrollments, managed devices, approvals, MDM tokens and profile, the phone's `/enroll/*` |
| [Policy](/enterprise/api/policy/)         | The policy document, sites and workforce-only, live sessions                             |
| [SSO](/enterprise/api/sso/)               | OIDC apps, SAML apps and the SAML identity-provider endpoints                            |
| [SCIM](/enterprise/api/scim/)             | SCIM tokens, the SCIM log, `/scim/v2/*`                                                  |
| [Operations](/enterprise/api/operations/) | Exports, webhooks and signature verification, retention, status, quotas, licence         |

## Conventions

One tenant hosts one organisation, whose id equals the tenant id. Request and response bodies are JSON (`content-type: application/json`), timestamps are ISO 8601 strings in UTC, and ids are ULIDs with a type prefix (`m_` member, `d_` domain, `e_` enrollment, `mdm_` MDM token, `app_` SSO app, `exp_` export, `wh_` webhook, `dl_` delivery); audit events and admin actions have integer ids. Every page shows each resource as a TypeScript shape and each route as `Body → Response`; a status other than `200` is given in brackets.

## Authentication

Which credential a route takes depends on the surface:

| Surface                                                               | Credential                               | Header                                 |
| --------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------- |
| `/orgs/*`                                                             | Portal session bearer                    | `Authorization: Bearer <access_token>` |
| `/scim/v2/*`                                                          | SCIM token from `POST /orgs/scim/tokens` | `Authorization: Bearer <secret>`       |
| `POST /enroll/mdm/issue`                                              | MDM token from `POST /orgs/mdm/tokens`   | `Authorization: Bearer <secret>`       |
| `POST /enroll/:token/claim`, `GET /enroll/:token/status`              | The phone's device signature             | `Idz-Signature`                        |
| `GET /orgs/public`, `POST /enroll/:token/begin`, `/saml/*`, `/status` | None; rate limited per source IP         |                                        |

### Portal session bearer

An OIDC access token from this tenant's issuer, issued to one of the tenant's dashboard clients: the portal or the org app, whose client ids `GET /orgs/public` returns as `portal_client_id` and `app_client_id`. It is validated exactly as the open index validates `/me/*` (see [Identity management](/reference/index-api/#identity-management-me)): the token must come from this issuer and this client, and the session is checked for revocation on every call. To call the API from a script, run the authorization-code flow with PKCE against the tenant issuer using `portal_client_id` (a public client), approve on the phone that holds an administrator's identity, and use the access token. A missing or invalid token is `401 unauthorized`.

Routes marked **bearer** need only a valid token; any identity enrolled on the tenant may call them. Admin routes then require an active membership linked to the signed-in identity with a role that grants the action:

| Refusal                 | When                                                                           |
| ----------------------- | ------------------------------------------------------------------------------ |
| `403 not_a_member`      | No member row is linked to the identity                                        |
| `403 member_inactive`   | The membership is `invited`, `suspended` or `deprovisioned`                    |
| `403 not_admin`         | The role is `member`; every admin route refuses it                             |
| `403 insufficient_role` | The role exists but lacks the grant the route needs (named in the description) |

### SCIM and MDM tokens

Both are 32-byte secrets shown once at creation and stored hashed. A SCIM token authenticates `/scim/v2/*` only, an MDM token `POST /enroll/mdm/issue` only; neither can call `/orgs/*`. A revoked token is refused at once. SCIM refusals use the SCIM error envelope with status `401`; the MDM route answers `401 unauthorized`.

### Device signature

The phone routes under `/enroll/:token/*` authenticate with the open index's [`Idz-Signature` header](/reference/index-api/#idz-signature-request-authentication), signed by the device key the phone registered with `POST /devices`. `claim` requires an active device; `status` also accepts a disabled or revoked one, because a denied phone is revoked and must still be able to read its verdict. A request without the header is `401 missing_signature`.

## Roles and grants

Every member has one role. Routes are gated by grants, and the grant table is the index's, not the portal's; the portal only hides what the index would refuse.

| Grant                           | What it allows                                                                                                          | `owner` | `admin` | `helpdesk` | `auditor` |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | :-----: | :-----: | :--------: | :-------: |
| `org.read`                      | Read the profile, the policy, MDM tokens and profile, SSO apps, retention                                               |   yes   |   yes   |    yes     |    yes    |
| `org.write`                     | Change the profile, policy, retention, sites, SSO apps, SCIM and MDM tokens; sign everyone out                          |   yes   |   yes   |     no     |    no     |
| `domains.read`                  | List domains and their instructions                                                                                     |   yes   |   yes   |    yes     |    yes    |
| `domains.write`                 | Add, verify and remove domains                                                                                          |   yes   |   yes   |     no     |    no     |
| `members.read`                  | List members and open a member's page                                                                                   |   yes   |   yes   |    yes     |    yes    |
| `members.write`                 | Invite, change role, deprovision; approve or deny an enrollment; revoke a device                                        |   yes   |   yes   |     no     |    no     |
| `members.support`               | Suspend, reinstate, reinvite; issue enrollments; list and disable devices; list sites and sessions; sign one member out |   yes   |   yes   |    yes     |    no     |
| `audit.read`                    | The organisation-wide event log, the admin-actions log, the SCIM log                                                    |   yes   |   yes   |     no     |    yes    |
| `audit.read_member`             | One member's events at a time                                                                                           |   yes   |   yes   |    yes     |    yes    |
| `exports.read`, `exports.write` | List, create and download exports                                                                                       |   yes   |   yes   |     no     |    yes    |
| `webhooks.manage`               | Everything under `/orgs/webhooks`                                                                                       |   yes   |   yes   |     no     |    no     |
| `status.read`                   | `GET /orgs/status`                                                                                                      |   yes   |   yes   |     no     |    yes    |

`member` has no grant and is refused on every admin route with `not_admin`. The route tables use this shorthand:

| Shorthand        | Roles                                               |
| ---------------- | --------------------------------------------------- |
| `admin+`         | `owner`, `admin`                                    |
| `helpdesk+`      | `owner`, `admin`, `helpdesk`                        |
| `auditor+`       | `owner`, `admin`, `auditor`                         |
| `any admin role` | `owner`, `admin`, `helpdesk`, `auditor`             |
| `bearer`         | Any signed-in identity on the tenant, member or not |

Two rules sit on top of the table: only an `owner` may grant or remove `owner` (an admin can assign every other role), and the organisation must keep at least one active owner (`409 last_owner`).

## Errors

Every error is JSON with the status in the tables:

```json
{ "error": "domain_taken", "error_description": "example.com is already claimed" }
```

Some errors add a `detail` object (`verification_failed` carries `{ checked: [...] }`, `quota_exceeded` carries `{ quota, used, limit }`). Validation failures are `400`. A route that names a resource answers `404 <resource>_not_found` (`member_not_found`, `domain_not_found`, `enrollment_not_found`, `device_not_found`, `site_not_found`, `webhook_not_found`, `export_not_found`, `app_not_found`) when the id is not in this organisation. `/scim/v2/*` uses the SCIM error envelope instead ([SCIM](/enterprise/api/scim/#errors)). The codes each surface can return are listed on its page; the ones common to several are:

| Status | Code                                                                | Meaning                                                                                                                                       |
| ------ | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `401`  | `unauthorized`                                                      | No, expired or foreign bearer                                                                                                                 |
| `403`  | `not_a_member`, `member_inactive`, `not_admin`, `insufficient_role` | See [authentication](#portal-session-bearer)                                                                                                  |
| `409`  | `quota_exceeded`                                                    | The plan's quota for members, devices, SSO apps, SCIM tokens or webhooks is used up ([quotas](/enterprise/api/operations/#status-and-quotas)) |
| `409`  | `seats_exceeded`                                                    | On-prem: the licence's seats are used up                                                                                                      |
| `503`  | `licence_expired`                                                   | On-prem: the licence is past its grace period; logins are refused, admin routes keep working                                                  |

The login policy refuses sign-ins with `403` at phone approval or code exchange, audited as `login.denied`: `member_suspended`, `member_deprovisioned`, `workforce_only`, `managed_device_required`, `amr_not_allowed`, `outside_login_window`, `app_disabled`. These reach the person signing in and the audit log, not the administrator's API call ([where each rule runs](/enterprise/api/policy/#how-the-policy-acts-on-the-login-path)).

## Pagination

List routes that page take `limit` (each route's maximum is given with it) and `cursor`, and answer `{ ..., next_cursor }`. Cursors are opaque strings: pass `next_cursor` back as `cursor`; a missing `next_cursor` means the end. Lists without a cursor (`/orgs/domains`, `/orgs/sites`, `/orgs/sso/apps`, `/orgs/mdm/tokens`, `/orgs/scim/tokens`, `/orgs/exports`, `/orgs/webhooks`, `/orgs/webhooks/:id/deliveries`) return the whole set or a fixed newest-first window noted on the route.

## Audit events and admin actions

Every mutation under `/orgs/*` writes two rows in the same request: an **admin action** (`actor_member_id`, `actor_email`, `action`, `target`, and the object `before` and `after`) and an **audit event** with `org_id` set and a `kind`. Read them with [`GET /orgs/admin-actions` and `GET /orgs/audit`](/enterprise/api/orgs/#audit), stream them to a SIEM with [webhooks](/enterprise/api/operations/#siem-webhooks), or [export](/enterprise/api/operations/#audit-export) them. Each page lists the kinds and action names its routes write.

The open index's own events (`login.*`, `session.*`, `device.*`) are written to the same tenant table without `org_id`; they appear in a member's page, in exports and in webhook deliveries, and `login.denied` carries the policy reason. SCIM, SAML logins and the phone's enrollment claim are audited too, although no administrator made the call. Rows are kept for the periods set through [retention](/enterprise/api/operations/#retention).

## Rate limits, quotas and mail

Unauthenticated routes are rate limited per source IP; `POST /enroll/mdm/issue` is rate limited per token. Creates that count against a plan quota (member invite, SCIM user create, enrollment claim of a phone not yet managed, SSO app, SCIM token, webhook) answer `409 quota_exceeded` when the quota is used up; `GET /orgs/status` shows usage and limits.

When the index has mail configured, `POST /orgs/members`, `POST /orgs/members/:id/reinvite` and `POST /orgs/members/:id/enrollments` (channels `link` and `helpdesk`) email the link and add `delivery: { email: 'sent' | 'failed' | 'not_configured' }` to the response; the link is always returned as well. MDM and self-service enrollments are never emailed.
