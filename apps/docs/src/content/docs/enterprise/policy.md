---
title: Login policy
description: The organization-wide rules a tenant index applies when a member signs in — managed phones only, allowed approval methods, session maximum age, login windows and workforce-only sites — with the defaults, where each check runs, the refusal codes, and worked examples.
---

An organization on Identizen Cloud can decide when a member may sign in, from which phone, with which approval method, and for how long a session lasts. The rules live in **Policy** in the [portal](/enterprise/portal/#policy) and on `GET`/`PUT /orgs/policy` on the tenant index, and the index applies them as hooks on the open login path. Everything on this page is what the tenant index does today. As everywhere on Identizen, a rule can refuse a login; it can never approve one, and nothing here gives the organization a key.

The enrollment half of the same policy object (`require_attestation`, `auto_approve`, `auto_approve_mdm`, `enrollment_ttl_hours`) is on [Enrolling phones](/enterprise/enrollment/#policy-reference); this page is the login half.

## Who the rules apply to

The tenant index tells two kinds of identity apart:

- **Members**: identities linked to a row in **Users** (by accepting an invitation or by an approved enrollment). The membership checks and the three member rules below apply to them on every site of the tenant.
- **Everyone else**: identities on the tenant index that no member row points to, for instance contractors or customers who enrolled a phone against the tenant issuer and sign in to a site that is not workforce-only. The member rules leave them alone. The one rule that reaches them is **workforce-only**, which is set per site and refuses anyone who is not an active member.

## Reference

| Setting                  |     Default     | Values                                                                                                                                                                          | What it does                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------ | :-------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `require_managed_device` |       off       | boolean                                                                                                                                                                         | A member may only approve a login from a phone that is a **managed device** of this organization (enrolled and approved, see [Enrolling phones](/enterprise/enrollment/)). A phone that holds the member's identity but was never enrolled, or whose enrollment was revoked, is refused.                                                                            |
| `allowed_amr`            |   `[]` (any)    | Any subset of `face`, `fingerprint`, `iris`, `pin`, `user`, `swk`, `bt`                                                                                                         | The phone's approval must have used at least one of the listed methods: the assertion's `amr` must share a value with the list. Empty means any method. Duplicates are dropped on save.                                                                                                                                                                             |
| `session_max_age_hours`  |  `0` (30 days)  | `0`, or `1`–`720`                                                                                                                                                               | The longest a member's session on any site may live. `0` keeps the index default of 30 days. The value only ever **shortens** a session: 720 hours is the index default, so nothing can lengthen it.                                                                                                                                                                |
| `login_windows`          | `null` (always) | `null`, or up to 20 windows `{ timezone, days, start, end }`: an IANA timezone (`Europe/Berlin`), days `1` (Monday) to `7` (Sunday), and `HH:MM` start and end in that timezone | Members may only sign in while the current time falls inside at least one window. A window covers `start` up to but not including `end` on each listed day; an `end` earlier than `start` wraps past midnight, so the late part belongs to the listed day and the early part to the following morning. `null` means no restriction; an empty list would mean never. |
| `workforce_only_default` |       off       | boolean                                                                                                                                                                         | Stored and returned with the policy, but **nothing reads it yet**: a site registered today starts with `workforce_only: false` whatever this says, and an administrator switches it on per site in **Sites**. It is there so the portal can offer it as the default for new sites later.                                                                            |

Saving the policy validates every field and answers `400 invalid_policy` with an `error_description` naming the problem (`login_windows: unknown timezone Mars/Olympus`, `login_windows: a window cannot be empty` for `start === end`, `login_windows: days are 1 (Monday) to 7 (Sunday)`). A save audits `policy.updated` (with the list of fields that changed) and an admin action `policy.update` with the whole policy before and after.

## Where each rule runs

The open index gives a host two moments to refuse a login: when the phone's signed assertion arrives (**assertion time**, the moment the person approves on the phone) and when the site exchanges the code for tokens (**code exchange**). The tenant index uses both:

| Check                                                                       | When                                       | Applies to            | Refusal code                          |
| --------------------------------------------------------------------------- | ------------------------------------------ | --------------------- | ------------------------------------- |
| Membership is `suspended`                                                   | assertion time, and again at code exchange | members               | `member_suspended`                    |
| Membership is `deprovisioned`                                               | assertion time, and again at code exchange | members               | `member_deprovisioned`                |
| The site is workforce-only and the identity is not an active member         | assertion time                             | everyone on that site | `workforce_only`                      |
| `require_managed_device` and the approving phone is not managed by this org | assertion time                             | members               | `managed_device_required`             |
| `allowed_amr` is set and the assertion's `amr` shares no value with it      | assertion time                             | members               | `amr_not_allowed`                     |
| `login_windows` is set and now is outside every window                      | assertion time                             | members               | `outside_login_window`                |
| `session_max_age_hours` is set                                              | code exchange                              | members               | none: the session is created, shorter |

The order at assertion time is the order of the table: membership status first, then workforce-only, then the three member rules. An identity that is not a member stops after the workforce-only check.

A refusal at assertion time is a `403` to the phone with the code above, and the index writes a `login.denied` audit event with that code, the identity, the device and the site, so it appears in the organization's **Audit** events, on the user's page, on the device's page and in the member's own activity in the [org app](/enterprise/org-app/). The person sees the refusal on the phone, with the reason in plain words.

`session_max_age_hours` never refuses anything. At code exchange the index creates the session with `min(index default, max(60 seconds, hours × 3600))`, so a member session on a tenant with `session_max_age_hours: 8` expires eight hours after the exchange whatever the site asked for. Sessions that already exist keep their original expiry; to apply a new limit at once, use **Sessions** to sign everyone out ([below](/enterprise/portal/#sessions)).

Nothing ends a live session when a window closes, when a phone stops being managed, or when `allowed_amr` changes: the rules run at login, and a session lasts until it expires, the member ends it, or an administrator revokes it. Suspending or deprovisioning a member, disabling or revoking a device and the two **Sessions** actions do revoke sessions, with back-channel logout to each site.

## The `idz_role` claim

Every id_token minted for an **active member** carries `idz_role` with the member's role (`owner`, `admin`, `helpdesk`, `auditor` or `member`), and `/userinfo` returns it too. Identities that are not members, and members whose status is not `active`, get no `idz_role`. It is added by the tenant index next to the standard claims; the [SDK's](/reference/sdk/) id_token type does not know it, so read it as an extra claim (`claims.idz_role as string | undefined`) and treat it as absent for anyone who is not a member of the organization whose issuer signed the token. `idz_org` is still not set: membership does not assign the identity an `org_id` ([overview](/enterprise/#available-today)).

## Sites and workforce-only

**Sites** in the portal lists every site registered on the tenant index, whether or not an administrator has touched it, with its `client_id`, `rp_id`, redirect URIs, whether it is public (no client secret), its [domain verification](/enterprise/cloud-setup/#verify-the-domain) status (`verified`, `pending`, `stale` or `not_required`) and when it was verified, its back-channel logout URI, and the **workforce-only** switch. Owners and admins can rename a site and flip the switch; there is no secret rotation, redirect editing or site deletion here (the [CLI](/reference/sdk/#identizen-cli) and the registration token cover those). Changing a site audits `site.updated_by_org` and an admin action `site.update` with the site before and after.

With `workforce_only` on, every login to that site must come from an identity that is an active member: anyone else, including a suspended member, is refused at assertion time with `workforce_only`. The public sites of a tenant (a customer-facing app that happens to run on the organization's index) leave it off and stay open to any identity enrolled on the tenant index.

## Worked examples

Each example is a `PUT /orgs/policy` body; the portal's **Policy** page sets the same fields. A `PUT` is a patch: fields you leave out keep their value.

### Office hours in Berlin

Members may sign in Monday to Friday between 07:00 and 20:00 Berlin time, and no session outlives the working day:

```json
{
  "login_windows": [
    { "timezone": "Europe/Berlin", "days": [1, 2, 3, 4, 5], "start": "07:00", "end": "20:00" }
  ],
  "session_max_age_hours": 12
}
```

An approval at 19:59 Berlin time on a Wednesday is inside the window; one at 20:00 is refused with `outside_login_window` (`end` is exclusive), and so is any approval on Saturday. Daylight-saving changes are the timezone's business: the index evaluates the wall-clock time in `Europe/Berlin` at the moment the phone approves, so the window means the same local hours all year. A member who was signed in at 19:00 keeps that session past 20:00; with `session_max_age_hours: 12` it ends by 07:00 the next morning at the latest.

A night shift is a window that wraps midnight. Friday 22:00 to Saturday 06:00 is one window on day 5:

```json
{
  "login_windows": [{ "timezone": "Europe/Berlin", "days": [5], "start": "22:00", "end": "06:00" }]
}
```

Friday from 22:00 onward matches because Friday is listed; Saturday before 06:00 matches because the day before it, Friday, is listed. Several windows are combined with _or_, so a list of a day window and a night window covers both. Contractors on a non-workforce site are not affected by any of this: windows apply to members only.

### Biometrics only

Every member approval must have verified the person with a biometric:

```json
{ "allowed_amr": ["face", "fingerprint", "iris"] }
```

A phone that approved with the device passcode (`amr: ["pin"]`), or a development phone that skipped the prompt (`["swk"]`), is refused with `amr_not_allowed`, and the phone's message says which methods the organization accepts. This is an organization-wide floor for members; it does not replace `acr_values=idz:mfa` on a site, which is per request and also demands a user-verifying method ([MFA and step-up](/enterprise/mfa-and-step-up/)). The `amr` the index checks is the one the phone signed into the assertion, the same value the site later sees in the id_token.

### Managed phones only

Members may only sign in from a phone the organization has enrolled:

```json
{ "require_managed_device": true }
```

Before switching it on, ask the index who would be locked out:

```bash
curl -sS "https://acme.index.identizen.com/orgs/policy/preview?require_managed_device=true" \
  -H "Authorization: Bearer $PORTAL_TOKEN"
```

```json
{ "members_active": 42, "members_without_managed_device": 3 }
```

The portal shows the same preview on the **Policy** page when the rule is about to be turned on. `members_without_managed_device` counts active members none of whose phones is a managed device of the organization; from the moment the policy is saved, each of them is refused with `managed_device_required` until they enroll a phone (an administrator issues an enrollment from the user's page, or the member enrolls from the org app, see [Enrolling phones](/enterprise/enrollment/)). A member whose managed phone was **revoked** in **Devices** is in the same position; a **disabled** phone cannot approve anything at all, managed or not. Without `require_managed_device=true` in the query the preview answers `members_without_managed_device: 0` and only fills in `members_active`.

## Over the API

The policy, preview, site and session routes, with roles, bodies and a worked example, are on the [Policy API](/enterprise/api/policy/) reference. The bearer is the token the portal itself uses on your index. Reading the policy over the API is open to helpdesk, although the portal shows **Policy** to owners, admins and auditors only; listing sites is open to helpdesk and not to auditors, because it sits with the support grants. Sessions have their own routes, described on the [portal page](/enterprise/portal/#sessions).
