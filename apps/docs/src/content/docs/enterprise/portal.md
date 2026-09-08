---
title: Administering your organization
description: The admin portal at {tenant}.portal.identizen.com — getting the first owner in, the roles and exactly what each may do, the org profile, verified domains, the user lifecycle, audit, and what the organization never gets.
---

Every Identizen Cloud tenant has an admin portal at `https://{tenant}.portal.identizen.com`. It is a registered OIDC client on the tenant's own index, so you sign in to it the same way as to anything else built on Identizen: with the phone that holds your identity. Everything on this page is what the portal does today; the [overview](/enterprise/#on-the-roadmap) lists what is still to come.

The portal manages one organization, the tenant itself. Its sections are **Overview** (counts of users, domains, managed devices, pending approvals, SSO apps and members provisioned by SCIM, recent admin actions), **Organization**, **Domains**, **Users**, **Devices**, **Approvals**, **Policy**, **Sites**, **Sessions**, **MDM**, **SSO**, **SCIM**, **Compliance**, **Billing** and **Audit**. Devices and Approvals are described on [Enrolling phones and managing the fleet](/enterprise/enrollment/), the login rules on [Login policy](/enterprise/policy/), MDM on [MDM integration](/enterprise/mdm/), the organization's applications on [SSO into your apps](/enterprise/sso/), provisioning on [SCIM provisioning](/enterprise/scim/), exports, webhooks, retention and status on [Compliance and operations](/enterprise/compliance/), and the plan and invoices on [Billing](/enterprise/billing/).

## Getting the first owner in

There is no sign-up. When Identizen provisions the tenant, we also create an invitation for the first owner, addressed to the admin contact you gave us, and hand you the link out of band (a password-manager share, never email in clear). The link is `https://{tenant}.portal.identizen.com/invite?token=…`; it is shown to us exactly once, works once, and expires after 7 days. If it expires, ask us and we issue a new one.

What the owner does:

1. Enroll a phone on the tenant index: install the Identizen app, create or restore an identity, then add the tenant index. The phone holds one identity on several indexes at once: **Settings → Indexes → Add index** with `https://{tenant}.index.identizen.com` registers the same identity there, next to the public one, and an enrollment link does the same on its own; nothing on the public index changes. A tenant index still knows only its own registrations: an identity that exists only on the public index or on another tenant is not one of its own until the phone registers there. (Several indexes on one phone ships with the next app build; the build in the stores today registers with one index at a time, set in **Settings** before registering.)
2. Open the invitation link. The page says "You are invited to administer _{org}_" and offers **Sign in to accept**.
3. Approve the sign-in on the phone. Back in the portal the invitation is accepted without another click, and the overview appears.

That person is now the organization's `owner`, with `status: active` and the email the invitation was issued to. Nothing about the portal, the app or the org's clients needs configuring; the portal and org app were registered as OIDC clients on your index at provisioning.

If the org already has an owner, the same link page also accepts the invitations administrators create in **Users**.

## Roles

Every member has one role. What a role may do is decided by the index, not the portal; the portal only hides or disables what the index would refuse. This is the exact grant table from the index:

| Permission                                                               | `owner` | `admin` | `helpdesk` | `auditor` | `member` |
| ------------------------------------------------------------------------ | :-----: | :-----: | :--------: | :-------: | :------: |
| `org.read` — see the organization profile                                |   yes   |   yes   |    yes     |    yes    |    no    |
| `org.write` — change display name and logo                               |   yes   |   yes   |     no     |    no     |    no    |
| `domains.read` — see domains and their instructions                      |   yes   |   yes   |    yes     |    yes    |    no    |
| `domains.write` — add, check and remove domains                          |   yes   |   yes   |     no     |    no     |    no    |
| `members.read` — list users and open a user's page (devices, sessions)   |   yes   |   yes   |    yes     |    yes    |    no    |
| `members.write` — invite, change role, deprovision                       |   yes   |   yes   |     no     |    no     |    no    |
| `members.support` — suspend, reinstate, reinvite                         |   yes   |   yes   |    yes     |    no     |    no    |
| `audit.read` — the organization-wide event log and the admin-actions log |   yes   |   yes   |     no     |    yes    |    no    |
| `audit.read_member` — one member's events at a time                      |   yes   |   yes   |    yes     |    yes    |    no    |

The fleet, approvals, policy, sites, sessions and MDM routes reuse these grants rather than adding new ones: listing devices, enrollments, sites and live sessions, issuing an enrollment, revoking a pending link, disabling and enabling a device and signing one member out are `members.support` (helpdesk and up); approving or denying an enrollment and revoking a device are `members.write` (owners and admins); reading the policy, the MDM tokens and the MDM profile is `org.read`; changing the policy, previewing the managed-device rule, changing a site and signing everyone out are `org.write` (owners and admins). Auditors therefore read the policy but not the site list or live sessions. The portal is narrower than the index in one place: it shows **Policy** and **MDM** to owners, admins and auditors only, although a helpdesk token can read both over the org API.

Two rules sit on top of the table:

- **Only an owner may grant or remove `owner`.** An admin can invite and assign `admin`, `helpdesk`, `auditor` and `member`, and cannot change an owner's role. The invite form and the role select offer each administrator only the roles they may assign.
- **`member` is not an administrator.** A member who signs in to the portal is told "You are not an administrator of _{org}_" and offered sign-out. Members use the [organization app](/enterprise/org-app/).

Suspended and invited administrators are refused too: the portal requires an active membership with a non-member role, and says why ("Your invitation has not been accepted yet", "Your membership is suspended").

## Organization

The **Organization** page has the profile: a **display name** (shown wherever the org is named, including the org app's banner and the invitation pages) and a **logo URL** (an `https://` image, shown in the portal header and the org app; square images work best). Owners and admins can edit; helpdesk and auditors see it read-only.

Next to it is the org's identity, fixed by Identizen when the tenant was created: the **slug**, the **org id** (with a copy button; it appears in domain records) and the created and updated times. Deleting an organization is not available from the portal; contact Identizen support to close a tenant.

## Domains

Claiming a domain proves that your organization controls it. Today that proof is a fact on record: the domain list, its status and the audit trail. The **auto-join** flag on a domain ("let people with a verified email under this domain join on their own") is stored but not acted on yet; self-enrollment by email domain is on the [roadmap](/enterprise/#on-the-roadmap).

**Add a domain** (owners and admins) takes a hostname such as `example.com` and opens the domain's page with two ways to prove control. Either one is enough.

**Option 1: DNS.** Publish a TXT record at `_identizen.<domain>`:

```txt
_identizen.example.com.  TXT  "idz-org-verification=<token> org=<org id>"
```

The index looks for the record at `_identizen.<domain>` and at the same name on each parent zone, so one record on `_identizen.example.com` also covers `intranet.example.com` if you claim that separately. DNS changes can take up to an hour to be visible.

**Option 2: HTTPS.** Serve the same value as plain text at

```txt
https://example.com/.well-known/identizen-org
```

The value pairs the token with your org id (`org=<org id>`), so a record can never be reused to verify the domain for another organization. Both the record and the file body are printed on the domain's page with copy buttons.

Then press **Check now**. The index checks DNS first, then the HTTPS file, and either marks the domain `verified` with the method that matched or answers "no record or file matched" and shows what was checked. The first verification is always an administrator pressing the button; after that the index re-checks on its own.

**Re-checks.** Once a day, the index re-checks every verified domain whose last check is 30 days old, with the same DNS-then-HTTPS lookup. While the record or file stays in place nothing changes except the "last checked" time. If the proof is gone, the domain becomes **stale**: the list shows a warning pill, the domain's page says when the re-check first failed, and `domain.stale` is written to the audit log (and delivered to webhooks). A stale domain is re-checked every day; put the record or file back, or press **Check now**, and it returns to verified (`domain.reverified`). If it stays stale for 30 more days it becomes **unverified** (`domain.unverified`) and needs a fresh **Check now**. Nothing else changes when a domain lapses: the auto-join flag is not acted on, so no membership is created or removed by it.

A domain has one of three states:

| State        | Meaning                                                                                                                                                        |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unverified` | Added and never verified, or verified once and stale for more than 30 days. Press **Check now** with the record or file in place.                              |
| `verified`   | The last check found the proof. The page shows the method (`dns` or `https`), when it was verified and when it was last checked.                               |
| `stale`      | Verified, but the last daily re-check found no proof. Keep or restore the record or file and press **Check now**, or wait for the next daily re-check to pass. |

Adding a domain that is already listed is refused (`domain_taken`). **Remove** deletes the domain and its token; the domain's audit events stay.

## Users

**Users** lists everyone in the organization, with a search box (email or display name), and status and role filters that live in the URL so a filtered list can be shared. Each row opens the user's page: profile (email, name, status, role, source, linked identity, invited and accepted times), the role select, the actions below, the phones holding the identity (label, platform, status, last seen), the member's enrollments (channel, issued, claimed or expires, status, each linking to its page under **Approvals**), live sessions across sites (site, client id, started, expires) and the member's last 50 audit events.

### Enrolling a phone

**Enroll a phone** on a user's page (helpdesk and up; not for a deprovisioned member) issues a one-time enrollment and shows its QR code and `identizen://enroll?…` link once, with when it expires. The person opens it on their phone; the phone then either becomes a managed device at once or waits in **Approvals**, depending on the policy. The whole flow, the approvals queue, the **Devices** page and the **Policy** settings are on [Enrolling phones and managing the fleet](/enterprise/enrollment/). A member with source `mdm` was created by your MDM through the issue endpoint ([MDM integration](/enterprise/mdm/)).

### Inviting

**Invite user** (owners and admins) takes an email address, a role (default `member`) and an optional display name. The index answers with the member row, an **invitation link, shown once**, and `delivery.email`, which says whether the same link was emailed to the address: `sent`, `failed` (the mail provider refused or did not answer in time) or `not_configured` (the index has no mail set up, which the portal reports as "Email not configured"). The link is always shown so you can pass it on yourself, and the outcome is recorded with the `member.invite` admin action; **Reinvite** sends again in the same way. The email comes from the tenant index through Resend, configured by Identizen per index rather than per organization, with the subject _You're invited to administer {org}_ for an administrator role or _You're invited to join {org}_ for `member`, the role, an **Accept invitation** button, a line telling the person to get the Identizen app and point it at the organization's index first, and the expiry date. The link works for 7 days. An invitation for an administrator role points at the portal, `https://{tenant}.portal.identizen.com/invite?token=…`; one for `member` points at the org app, `https://{tenant}.app.identizen.com/invite?token=…`. An email that already belongs to a member is refused (`email_taken`).

The invited person enrolls a phone on the tenant index (if they have not already), opens the link, signs in with that phone and accepts. That links their identity to the member row. One identity can hold one membership: accepting with an identity that is already a member fails with `identity_already_member`.

### Lifecycle

A member is always in exactly one of four states.

| State           | Meaning                                                 | Can sign in to sites on this index |
| --------------- | ------------------------------------------------------- | :--------------------------------: |
| `invited`       | A row with an email and a role; no identity linked yet. |         n/a (no identity)          |
| `active`        | An identity is linked. This is the normal state.        |                yes                 |
| `suspended`     | Temporarily locked out.                                 |                 no                 |
| `deprovisioned` | Removed. Final.                                         |                 no                 |

What each transition does:

- **Accept** (`invited` → `active`): links the signing-in identity to the row, records `accepted_at`, voids the invitation token.
- **Reinvite** (`invited`, helpdesk and up): issues a new link, shown once; the old link stops working immediately. The person's state stays `invited`.
- **Suspend** (`active` → `suspended`, helpdesk and up): revokes every live session the identity has on this index and sends a back-channel logout to each site that registered one, so the person is signed out everywhere at once. From then on every login attempt is refused at the phone-approval step and at code exchange with `member_suspended`, and each refusal is audited as `login.denied`. The phone stays enrolled; nothing on the device changes. The portal reports how many sessions were ended.
- **Reinstate** (`suspended` → `active`, helpdesk and up): lifts the lock. Nothing is restored; the person signs in again. (A suspended row that never had an identity linked goes back to `invited`.)
- **Deprovision** (any state → `deprovisioned`, owners and admins, with a confirmation): revokes every device enrolled for the identity and every live session, sends back-channel logout to every site, and voids any open invitation. Logins are refused with `member_deprovisioned`. The portal reports how many devices and sessions were revoked. This cannot be undone: a deprovisioned row cannot be reinstated, reinvited or given a role, and the person would need to be invited afresh as a new member and enroll a phone again.

Two protections:

- **You cannot act on yourself.** Suspending or deprovisioning your own membership is refused (`self_suspend`, `self_deprovision`).
- **The last owner.** The organization must keep at least one active `owner`. Demoting or deprovisioning the only active owner is refused with `last_owner`. Invite or promote another owner first.

A role change applies from the person's next request to the index. A deprovisioned member's role cannot be changed.

## Policy

**Policy** (owners and admins edit; auditors read) holds every organization-wide rule in one place: the enrollment settings described on [Enrolling phones](/enterprise/enrollment/#policy-reference) and the login rules described on [Login policy](/enterprise/policy/): members only from managed phones (with a preview of how many active members have no managed phone before you switch it on), the approval methods allowed (`allowed_amr`), the session maximum age, login windows by weekday and local time in a named timezone, and the stored-but-not-yet-applied default for new sites being workforce-only. Every save audits `policy.updated` and the admin action `policy.update` with the policy before and after. Rules refuse logins at the phone-approval step with the codes on the policy page; none of them can approve one.

## Sites

**Sites** (helpdesk and up read; owners and admins change) lists every site registered on your index, not only the ones an administrator has touched: name, `client_id`, `rp_id`, redirect URIs, whether the site is public (registered without a client secret), its domain verification status (`verified`, `pending`, `stale`, `not_required`) and when it was verified, its back-channel logout URI and when it was registered. Two things can be changed here: the site's **name**, and **workforce-only**, which makes the site refuse every login that does not come from an active member of the organization (refusal code `workforce_only`, at the phone-approval step, applied to everyone who tries that site). Both audit `site.updated_by_org` and the admin action `site.update` with the site before and after.

Nothing else about a site is edited from the portal. Registering a site, changing its redirect URIs or logout URI, rotating its client secret and verifying its domain are done with the [CLI and the registration token](/enterprise/cloud-setup/#register-a-site); the portal shows the verification state so an administrator can see which sites still cannot start logins.

## Sessions

**Sessions** (helpdesk and up) lists the organization's live member sessions across every site, newest first and cursor-paged: member (email), site, device, when the session started and when it expires; the same list is available per member from the user's page. The overview counts them. Sessions of identities that are not members do not appear here; they belong to the person, who manages them from their own dashboard.

Two actions:

- **Sign out a member** (helpdesk and up, `POST /orgs/members/:id/sessions/revoke`): revokes every live session of that member's identity on this index and sends a back-channel logout to each site that registered one. The portal reports how many sessions ended. Audited as `session.revoked_by_org` and the admin action `member.sessions_revoke`. The member's phone and membership are untouched; they can sign in again at once. This is the lighter tool next to **Suspend**, which also locks the member out.
- **Sign everyone out** (owners and admins, `POST /orgs/sessions/revoke-all`): revokes every live member session on the index at once, with back-channel logout to every site, after you type the organization's **slug** to confirm (`confirm_mismatch` otherwise). The portal reports how many sessions ended and how many members were affected. Audited as `org.sessions_revoked` and the admin action `org.sessions_revoke_all`. Use it after changing `session_max_age_hours` to apply the new limit immediately, or when you need every member to sign in afresh.

Neither action changes a membership, a device or a policy; both are the same revocation a member can perform on their own sessions, applied by the organization.

## Audit

The organization has two logs, both cursor-paged (**Load more**), newest first.

**Events** (`audit.read`; helpdesk sees them one member at a time) are the index's own `audit_events` rows tagged with the org or belonging to one of its identities: `login.success`, `login.denied`, `session.created`, `session.revoked`, and the org kinds `admin.bootstrapped`, `org.updated`, `domain.added`, `domain.verified`, `domain.removed`, `member.invited`, `member.accepted`, `member.role_changed`, `member.suspended`, `member.reinstated` and `member.deprovisioned`, plus the fleet kinds `enrollment.issued`, `enrollment.claimed`, `enrollment.approved`, `enrollment.denied`, `enrollment.revoked`, `device.disabled_by_org`, `device.enabled_by_org`, `device.revoked_by_org`, `policy.updated`, `mdm.token_created`, `mdm.token_revoked` and `mdm.enrollment_issued`, and the site and session kinds `site.updated_by_org`, `session.revoked_by_org` and `org.sessions_revoked`. A `login.denied` event carries the reason the [login policy](/enterprise/policy/#where-each-rule-runs) refused (`member_suspended`, `member_deprovisioned`, `workforce_only`, `managed_device_required`, `amr_not_allowed`, `outside_login_window`) alongside the open index's own reasons. Filter by kind, by member and by date range. Each event carries the identity (`idz`), the device and client it concerns where there is one, and a `detail` object (for a suspension, the number of sessions revoked; for a domain, the method that matched).

**Admin actions** (owners, admins and auditors) is the record of what administrators changed through the portal: who (`actor_email`), what (`org.update`, `domain.add`, `domain.verify`, `domain.remove`, `member.invite`, `member.update`, `member.suspend`, `member.reinstate`, `member.reinvite`, `member.deprovision`, `enrollment.issue`, `enrollment.approve`, `enrollment.deny`, `enrollment.revoke`, `device.disable`, `device.enable`, `device.revoke`, `policy.update`, `site.update`, `member.sessions_revoke`, `org.sessions_revoke_all`, `mdm.token_create`, `mdm.token_revoke`), the target, and the object **before and after** the change. Every mutation in the portal writes one of these; the overview shows the most recent ten.

Both logs can be exported and streamed to a SIEM from [Compliance](/enterprise/compliance/). Everything in both logs is also reachable over the org API on your index, with the same bearer token the portal uses.

## What the organization never gets

The portal gives an organization power over access, not over identity:

- **No private keys.** The index stores public keys, push tokens, revocation state and audit events. A member's signing key exists only on their phone, and no route in the portal or the org API returns anything that could sign an assertion.
- **No impersonation.** An administrator cannot log in as a user, mint a token for them, or approve a login on their behalf. Suspension and deprovisioning are the org's powers; approval stays with the phone.
- **Hooks refuse, never approve.** The membership and [login policy](/enterprise/policy/) run as index hooks at the phone-approval step and at code exchange. A hook can turn a login into a `403` or shorten a session; it cannot turn a missing approval into a success.

The same holds on a self-hosted index and for every roadmap item. If you find a way for the portal to do otherwise, that is a bug: [tell us](https://identizen.com/contact).
