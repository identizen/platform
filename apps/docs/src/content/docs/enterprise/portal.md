---
title: Administering your organisation
description: The admin portal at {tenant}.portal.identizen.com — getting the first owner in, the roles and exactly what each may do, the org profile, verified domains, the user lifecycle, audit, and what the organisation never gets.
---

Every Identizen Cloud tenant has an admin portal at `https://{tenant}.portal.identizen.com`. It is a registered OIDC client on the tenant's own index, so you sign in to it the same way as to anything else built on Identizen: with the phone that holds your identity. Everything on this page is what the portal does today; the [overview](/enterprise/#on-the-roadmap) lists what is still to come.

The portal manages one organisation, the tenant itself. It has nine sections: **Overview** (counts of users, domains, managed devices and pending approvals, recent admin actions), **Organisation**, **Domains**, **Users**, **Devices**, **Approvals**, **Policy**, **MDM** and **Audit**. Devices, Approvals and Policy are described on [Enrolling phones and managing the fleet](/enterprise/enrollment/); MDM on [MDM integration](/enterprise/mdm/).

## Getting the first owner in

There is no sign-up. When Identizen provisions the tenant, we also create an invitation for the first owner, addressed to the admin contact you gave us, and hand you the link out of band (a password-manager share, never email in clear). The link is `https://{tenant}.portal.identizen.com/invite?token=…`; it is shown to us exactly once, works once, and expires after 7 days. If it expires, ask us and we issue a new one.

What the owner does:

1. Enrol a phone on the tenant index: install the Identizen app, open **Settings**, set the index to `https://{tenant}.index.identizen.com`, and enrol. An identity enrolled on the public index or on another tenant does not count; a tenant index knows only its own identities.
2. Open the invitation link. The page says "You are invited to administer _{org}_" and offers **Sign in to accept**.
3. Approve the sign-in on the phone. Back in the portal the invitation is accepted without another click, and the overview appears.

That person is now the organisation's `owner`, with `status: active` and the email the invitation was issued to. Nothing about the portal, the app or the org's clients needs configuring; the portal and org app were registered as OIDC clients on your index at provisioning.

If the org already has an owner, the same link page also accepts the invitations administrators create in **Users**.

## Roles

Every member has one role. What a role may do is decided by the index, not the portal; the portal only hides or disables what the index would refuse. This is the exact grant table from the index:

| Permission                                                               | `owner` | `admin` | `helpdesk` | `auditor` | `member` |
| ------------------------------------------------------------------------ | :-----: | :-----: | :--------: | :-------: | :------: |
| `org.read` — see the organisation profile                                |   yes   |   yes   |    yes     |    yes    |    no    |
| `org.write` — change display name and logo                               |   yes   |   yes   |     no     |    no     |    no    |
| `domains.read` — see domains and their instructions                      |   yes   |   yes   |    yes     |    yes    |    no    |
| `domains.write` — add, check and remove domains                          |   yes   |   yes   |     no     |    no     |    no    |
| `members.read` — list users and open a user's page (devices, sessions)   |   yes   |   yes   |    yes     |    yes    |    no    |
| `members.write` — invite, change role, deprovision                       |   yes   |   yes   |     no     |    no     |    no    |
| `members.support` — suspend, reinstate, reinvite                         |   yes   |   yes   |    yes     |    no     |    no    |
| `audit.read` — the organisation-wide event log and the admin-actions log |   yes   |   yes   |     no     |    yes    |    no    |
| `audit.read_member` — one member's events at a time                      |   yes   |   yes   |    yes     |    yes    |    no    |

The fleet, approvals, policy and MDM routes reuse these grants rather than adding new ones: listing devices and enrollments, issuing an enrollment, revoking a pending link, disabling and enabling a device are `members.support` (helpdesk and up); approving or denying an enrollment and revoking a device are `members.write` (owners and admins); reading the policy, the MDM tokens and the MDM profile is `org.read`; changing the policy and creating or revoking MDM tokens is `org.write`. The portal is narrower than the index in one place: it shows **Policy** and **MDM** to owners, admins and auditors only, although a helpdesk token can read both over the org API.

Two rules sit on top of the table:

- **Only an owner may grant or remove `owner`.** An admin can invite and assign `admin`, `helpdesk`, `auditor` and `member`, and cannot change an owner's role. The invite form and the role select offer each administrator only the roles they may assign.
- **`member` is not an administrator.** A member who signs in to the portal is told "You are not an administrator of _{org}_" and offered sign-out. Members use the [organisation app](/enterprise/org-app/).

Suspended and invited administrators are refused too: the portal requires an active membership with a non-member role, and says why ("Your invitation has not been accepted yet", "Your membership is suspended").

## Organisation

The **Organisation** page has the profile: a **display name** (shown wherever the org is named, including the org app's banner and the invitation pages) and a **logo URL** (an `https://` image, shown in the portal header and the org app; square images work best). Owners and admins can edit; helpdesk and auditors see it read-only.

Next to it is the org's identity, fixed by Identizen when the tenant was created: the **slug**, the **org id** (with a copy button; it appears in domain records) and the created and updated times. Deleting an organisation is not available from the portal; contact Identizen support to close a tenant.

## Domains

Claiming a domain proves that your organisation controls it. Today that proof is a fact on record: the domain list, its status and the audit trail. The **auto-join** flag on a domain ("let people with a verified email under this domain join on their own") is stored but not acted on yet; self-enrolment by email domain is on the [roadmap](/enterprise/#on-the-roadmap).

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

The value pairs the token with your org id (`org=<org id>`), so a record can never be reused to verify the domain for another organisation. Both the record and the file body are printed on the domain's page with copy buttons.

Then press **Check now**. The index checks DNS first, then the HTTPS file, and either marks the domain `verified` with the method that matched or answers "no record or file matched" and shows what was checked. Nothing about the check is automatic: it runs when an administrator presses the button.

A domain has one of three statuses:

| Status     | Meaning                                                                                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pending`  | Added, never verified.                                                                                                                                           |
| `verified` | A check matched within the last 30 days. The page shows the method (`dns` or `https`), when it was verified and when it was last checked.                        |
| `stale`    | The last successful check is more than 30 days old. Keep the record or file in place and press **Check now** again; the portal does not re-check on its own yet. |

Adding a domain that is already listed is refused (`domain_taken`). **Remove** deletes the domain and its token; the domain's audit events stay.

## Users

**Users** lists everyone in the organisation, with a search box (email or display name), and status and role filters that live in the URL so a filtered list can be shared. Each row opens the user's page: profile (email, name, status, role, source, linked identity, invited and accepted times), the role select, the actions below, the phones holding the identity (label, platform, status, last seen), the member's enrollments (channel, issued, claimed or expires, status, each linking to its page under **Approvals**), live sessions across sites (site, client id, started, expires) and the member's last 50 audit events.

### Enrolling a phone

**Enrol a phone** on a user's page (helpdesk and up; not for a deprovisioned member) issues a one-time enrollment and shows its QR code and `identizen://enroll?…` link once, with when it expires. The person opens it on their phone; the phone then either becomes a managed device at once or waits in **Approvals**, depending on the policy. The whole flow, the approvals queue, the **Devices** page and the **Policy** settings are on [Enrolling phones and managing the fleet](/enterprise/enrollment/). A member with source `mdm` was created by your MDM through the issue endpoint ([MDM integration](/enterprise/mdm/)).

### Inviting

**Invite user** (owners and admins) takes an email address, a role (default `member`) and an optional display name. The index answers with the member row and an **invitation link, shown once**: copy it and send it to the person yourself. Invitation email is not built yet; the portal says so on the card. The link works for 7 days. An invitation for an administrator role points at the portal, `https://{tenant}.portal.identizen.com/invite?token=…`; one for `member` points at the org app, `https://{tenant}.app.identizen.com/invite?token=…`. An email that already belongs to a member is refused (`email_taken`).

The invited person enrols a phone on the tenant index (if they have not already), opens the link, signs in with that phone and accepts. That links their identity to the member row. One identity can hold one membership: accepting with an identity that is already a member fails with `identity_already_member`.

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
- **Deprovision** (any state → `deprovisioned`, owners and admins, with a confirmation): revokes every device enrolled for the identity and every live session, sends back-channel logout to every site, and voids any open invitation. Logins are refused with `member_deprovisioned`. The portal reports how many devices and sessions were revoked. This cannot be undone: a deprovisioned row cannot be reinstated, reinvited or given a role, and the person would need to be invited afresh as a new member and enrol a phone again.

Two protections:

- **You cannot act on yourself.** Suspending or deprovisioning your own membership is refused (`self_suspend`, `self_deprovision`).
- **The last owner.** The organisation must keep at least one active `owner`. Demoting or deprovisioning the only active owner is refused with `last_owner`. Invite or promote another owner first.

A role change applies from the person's next request to the index. A deprovisioned member's role cannot be changed.

## Audit

The organisation has two logs, both cursor-paged (**Load more**), newest first.

**Events** (`audit.read`; helpdesk sees them one member at a time) are the index's own `audit_events` rows tagged with the org or belonging to one of its identities: `login.success`, `login.denied`, `session.created`, `session.revoked`, and the org kinds `admin.bootstrapped`, `org.updated`, `domain.added`, `domain.verified`, `domain.removed`, `member.invited`, `member.accepted`, `member.role_changed`, `member.suspended`, `member.reinstated` and `member.deprovisioned`, plus the fleet kinds `enrollment.issued`, `enrollment.claimed`, `enrollment.approved`, `enrollment.denied`, `enrollment.revoked`, `device.disabled_by_org`, `device.enabled_by_org`, `device.revoked_by_org`, `policy.updated`, `mdm.token_created`, `mdm.token_revoked` and `mdm.enrollment_issued`. Filter by kind, by member and by date range. Each event carries the identity (`idz`), the device and client it concerns where there is one, and a `detail` object (for a suspension, the number of sessions revoked; for a domain, the method that matched).

**Admin actions** (owners, admins and auditors) is the record of what administrators changed through the portal: who (`actor_email`), what (`org.update`, `domain.add`, `domain.verify`, `domain.remove`, `member.invite`, `member.update`, `member.suspend`, `member.reinstate`, `member.reinvite`, `member.deprovision`, `enrollment.issue`, `enrollment.approve`, `enrollment.deny`, `enrollment.revoke`, `device.disable`, `device.enable`, `device.revoke`, `policy.update`, `mdm.token_create`, `mdm.token_revoke`), the target, and the object **before and after** the change. Every mutation in the portal writes one of these; the overview shows the most recent ten.

There is no export and no SIEM webhook yet; both are on the [roadmap](/enterprise/#on-the-roadmap). Everything in both logs is also reachable over the org API on your index, with the same bearer token the portal uses.

## What the organisation never gets

The portal gives an organisation power over access, not over identity:

- **No private keys.** The index stores public keys, push tokens, revocation state and audit events. A member's signing key exists only on their phone, and no route in the portal or the org API returns anything that could sign an assertion.
- **No impersonation.** An administrator cannot log in as a user, mint a token for them, or approve a login on their behalf. Suspension and deprovisioning are the org's powers; approval stays with the phone.
- **Hooks refuse, never approve.** The membership policy runs as index hooks at the phone-approval step and at code exchange. A hook can turn a login into a `403`; it cannot turn a missing approval into a success.

The same holds on a self-hosted index and for every roadmap item. If you find a way for the portal to do otherwise, that is a bug: [tell us](https://identizen.com/contact).
