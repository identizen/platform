---
title: Enrolling phones and managing the fleet
description: How an organization enrolls a member's phone as a managed device — the three ways to issue an enrollment, the link and QR code, what the person sees on the phone, approval versus auto-approve, the fleet page and what each action does, re-enrollment, and the policy reference.
---

An **enrollment** turns a member's phone into a **managed device** of the organization: the phone carries the org's id, the organization can disable or revoke it from the [portal](/enterprise/portal/), and the member's row is linked to the phone's identity. Everything on this page is what the tenant index, the portal, the org app and the phone app do today. The organization still never holds a key: enrolling a phone changes who can switch it off, not who can sign with it.

## Three ways to issue an enrollment

Every enrollment starts as a one-time token, issued for one member, valid for `enrollment_ttl_hours` (default 72 hours, see the [policy reference](#policy-reference)). The index stores only a hash of the token.

| Who issues it                  | Where                                                                                                                                                                                                                                                                                                                           | Channel recorded |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| An administrator, for a member | The portal, on the user's page: **Enroll a phone** (helpdesk and up; not for a deprovisioned member). The card shows a QR code and the link once, with when it expires; after **I have shared it** the token is gone.                                                                                                           | `Helpdesk`       |
| A member, for their own phone  | The [org app](/enterprise/org-app/#enrolling-your-phone) at `https://{tenant}.app.identizen.com/enroll`: **Enroll this phone**. Open to a member whose status is `invited` or `active`; a suspended member is told enrollment is not available, and a signed-in identity that is not a member is told to ask for an invitation. | `Link`           |
| An MDM, for a user             | `POST /enroll/mdm/issue` on the tenant index with an MDM token; creates the member when the email is unknown ([MDM integration](/enterprise/mdm/)).                                                                                                                                                                             | `MDM`            |

Over the org API an administrator can also pass `channel: 'link'`, `'qr'` or `'helpdesk'` to `POST /orgs/members/:id/enrollments`; the portal always sends `helpdesk`. The channel is a label for the audit trail and the approvals queue; the only behavioral difference is that `mdm` enrollments follow `auto_approve_mdm` and every other channel follows `auto_approve`.

Every issue writes an `enrollment.issued` audit event (member, channel, who issued it); an administrator's issue also lands in the admin-actions log as `enrollment.issue`.

## The link and the QR code

The token travels as a deep link, and the QR code encodes exactly the same string:

```txt
identizen://enroll?index=https%3A%2F%2Facme.index.identizen.com&token=<token>
```

`index` is the tenant issuer, so the phone knows which index to talk to before anything else happens. The link is shown once, works for one phone, and stops working when it expires or when a helpdesk user or administrator revokes it from **Approvals** (status filter `pending`, then **Revoke**, which audits `enrollment.revoked`).

**Email.** When an administrator issues an enrollment from a user's page (any channel over `POST /orgs/members/:id/enrollments`), the tenant index also emails the link to the member's address, _Enroll your phone with {org}_, with an **Enroll this phone** button that opens the same `identizen://enroll?…` link, the address of the org app for people who do not have the Identizen app yet, and the expiry date. Mail goes through Resend and is configured on the tenant index by Identizen, not per organization; the response reports what happened as `delivery.email`: `sent`, `failed` (Resend refused or did not answer within 8 seconds) or `not_configured` (no mail on this index). Whatever the outcome, the link and QR code are still shown to the administrator, so the enrollment can always be passed on by hand, and the outcome is recorded with the `enrollment.issue` admin action. Self-service enrollments from the org app and MDM enrollments are not emailed: the member is looking at the QR code already, and the MDM delivers its own `deep_link`.

## What the person sees on the phone

The phone app opens the link (or the QR code, from its scan screen) on a **Join an organization** sheet, after asking the index what the link is for (`POST /enroll/:token/begin`, unsigned). A link that is not an Identizen enrollment link, that was never issued, that expired, or that another phone already used says so on the sheet.

The sheet shows the organization's name and logo, **Enrolling as** with the member's email masked (`ge****@example.com`), the sentence _This phone will be managed by {org}: they can disable or remove it and see your sign-in activity; they never get your keys_, and, when the policy requires attestation, _{org} requires a verified device_. Two buttons: **Enroll** and **Not now**.

On **Enroll**, in order:

1. The phone needs an identity. Without one it says _Create or restore an identity before enrolling_.
2. The phone must be registered on the organization's index. The phone holds one identity on several indexes at once, so this step adds the organization's index next to whatever the phone already has (the public index, another organization): a phone not yet registered there registers there with the same recovery phrase and a fresh device key, and a phone already registered there just switches to it. Either way the organization's index becomes the phone's _active_ index (Home and the Devices, Browsers and Sessions tabs show it; a chip on Home switches back, and **Settings → Indexes** lists them all). Nothing is forgotten, and the personal identity on the public index keeps working. The sheet says so before the tap: _Your identity is registered on {index host}, next to the indexes already on this phone; nothing there changes._
3. The phone claims the enrollment with its device signature (`POST /enroll/:token/claim`). Today no phone build attaches an attestation (see [attestation](/enterprise/mdm/#attestation)), so an organization with `require_attestation` on refuses at this step with _This organization only enrolls verified devices. This build of Identizen cannot prove the phone is genuine yet, so it cannot enroll here._
4. The index checks that the phone belongs to this member and to nobody else: a phone whose identity is already another member's, or that is managed for another member, is refused (_This phone is already enrolled with someone else in this organization_); a member who already has an identity can only add phones holding that same identity.

Then either **You are enrolled** (_This phone is now managed by {org}_), when the policy approves automatically, or **Waiting for approval**: _An administrator at {org} needs to approve this phone. You can wait here or check back later._ The phone polls `GET /enroll/:token/status` every 5 seconds for up to 10 minutes; **Check later** goes home, where a card shows the pending enrollment and checks again on the next visit. The end states are **You are enrolled**, **Enrollment declined** (_{org} declined this phone_) or **Enrollment expired** (_{org} did not decide in time. Ask your administrator for a new link_).

Once enrolled, the phone's home screen says **Managed by {org}**.

The phone app's enrollment flow, and holding several indexes on one phone, are written and tested, but they are not in the app build that is in the stores today; they ship with the next build.

## Approval or auto-approve

A claim leaves the enrollment `claimed` and attaches the phone to it, with the attestation status the claim produced: `none` when the phone sent no attestation (every claim today), `verified` or `unverified` when it did, and `failed` never persists because a failed attestation refuses the claim.

What happens next is decided by the **policy as it was when the token was issued** (the enrollment carries a `policy_snapshot`; changing the policy later does not change enrollments already out):

- **Auto-approve** (`auto_approve` for link, QR and helpdesk enrollments; `auto_approve_mdm` for MDM ones): the enrollment is approved in the same request, with `decided_by` `policy` or `mdm`, and the phone hears **You are enrolled** at once.
- **Otherwise** the enrollment waits in the portal's **Approvals** page, which opens on everything `claimed`, with a count next to **Approvals** in the navigation and a **Pending approvals** tile on the overview. Each row shows the member, channel, status, attestation, when it was claimed and the policy that applied; the row's page adds the phone that opened the link (label, status, attestation, platform, identity, last seen).

An owner or admin decides:

- **Approve** links the member to the phone's identity (the member becomes `active`, `accepted_at` is set, any open invitation token is voided), marks the device **managed** with an `enrolled_at` time, and audits `enrollment.approved`. The toast says which phone is now a managed device of whom.
- **Deny**, with an optional reason (up to 200 characters in the portal), is final for that phone: the enrollment becomes `denied`, the phone's device key is **revoked** on the index (it was never trusted), the device loses the organization, and the member is unchanged. Audited as `enrollment.denied` with the reason. The phone reads its verdict on its next check and shows **Enrollment declined**.

A `claimed` enrollment that nobody decides stays `claimed` (the expiry applies to unclaimed tokens); the phone stops polling after 10 minutes and checks again from its home screen. Helpdesk can see the queue and revoke pending links but cannot approve or deny.

Accepting an [invitation](/enterprise/portal/#inviting) still works as before and links the identity without a managed device; the org app then offers **Enroll this phone** so the same phone can become managed.

## The fleet page

**Devices** in the portal (helpdesk and up) lists every phone and browser key whose identity belongs to a member of the organization, managed or not, newest first, with a search box (member email or device label) and filters for status (`active`, `disabled`, `revoked`) and attestation (`none`, `unverified`, `verified`, `failed`) that live in the URL. Each row opens the device's page: member (linked to the user's page), status, **Managed** or not, attestation, platform, identity, id, last seen, enrolled, registered and, when it applies, when it was disabled; the device's own live sessions; and its recent audit events. The overview shows a **Managed devices** tile (with how many are disabled).

Three actions, each confirmed in place:

| Action      | Who               | What it does                                                                                                                                                                                                                                                                                                                  |
| ----------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Disable** | helpdesk and up   | Sets the device to `disabled`: the phone can no longer approve sign-ins on this index, every live session it holds is revoked and each site is told over back-channel logout. The portal reports how many sessions ended. Records who disabled it and when. Audited as `device.disabled_by_org`. Reversible.                  |
| **Enable**  | helpdesk and up   | Sets a disabled device back to `active`; the phone can approve sign-ins again. Nothing is restored; the person signs in again. Audited as `device.enabled_by_org`.                                                                                                                                                            |
| **Revoke**  | owners and admins | Final. The device key is revoked on the index (the same revocation a member can do from their own dashboard), its sessions end with back-channel logout, and the device is no longer managed. The page then says _This device has been revoked. The member enrolls again to use a phone._ Audited as `device.revoked_by_org`. |

A disabled or revoked device does not change the member's status: suspension and deprovisioning stay the member-level powers described on the [portal page](/enterprise/portal/#lifecycle). Deprovisioning a member revokes every device of their identity, managed or not.

The organization's activity log gains the fleet kinds: `enrollment.issued`, `enrollment.claimed`, `enrollment.approved`, `enrollment.denied`, `enrollment.revoked`, `device.disabled_by_org`, `device.enabled_by_org`, `device.revoked_by_org`, `policy.updated`, `mdm.token_created`, `mdm.token_revoked` and `mdm.enrollment_issued`. The admin-actions log records `enrollment.issue`, `enrollment.approve`, `enrollment.deny`, `enrollment.revoke`, `device.disable`, `device.enable`, `device.revoke`, `policy.update`, `mdm.token_create` and `mdm.token_revoke` with before and after.

## Re-enrollment

- **Another phone for the same person.** A member who already has an identity can enroll a further phone only if it holds that same identity (restored from the 24 words). Issue a new enrollment; the claim is accepted and the new phone gets its own managed record. A phone holding a different identity is refused (`identity_mismatch`), because one identity holds one membership.
- **The same phone again.** A phone whose identity is already this member's can claim a new enrollment; approval updates its managed record (attestation status, enrolled time) in place.
- **After a revoke or a deny.** The device key is gone for good on this index. The member needs a new enrollment, and the phone needs a device the index accepts again. The phone app has no step that re-registers a revoked device: the person forgets that index in the app's **Settings → Indexes** (**Forget this index**, which drops only the organization's registration; the personal identity on the public index stays), then opens the new link, which registers a fresh device on the organization's index.
- **A new phone, restored from the 24 words.** Restoring brings back the personal identity on the public index (or the index chosen under **Advanced: index URL** on the restore screen), not the organization's registration: the member opens a new enrollment link, which adds the organization's index again with the same identity, so the claim is accepted as in the first case above.
- **After disable.** Nothing to re-enroll: **Enable** brings the same device back.

## Policy reference

**Policy** in the portal (owners and admins edit; auditors read; the index also lets helpdesk read it over the API) holds the organization's whole policy. The four settings below are the enrollment half: each is applied when a phone claims, using the snapshot taken when the token was issued. The login half (`require_managed_device`, `allowed_amr`, `session_max_age_hours`, `login_windows`, `workforce_only_default`) runs at sign-in and is on [Login policy](/enterprise/policy/). Saving any of it audits `policy.updated` and an admin action `policy.update` with the old and new values.

| Setting                | Default | At claim time                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------- | :-----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `require_attestation`  |   off   | The claim must carry an attestation that the index verified (`verified`). A claim without one is refused with `attestation_required`; one the index cannot verify because it lacks credentials for that platform is refused too (`unverified` is not enough); a failed one is refused with `attestation_failed`. **Today no phone build sends an attestation, so switching this on refuses every enrollment** until the next app build ships one. |
| `auto_approve`         |   off   | Link, QR and helpdesk enrollments are approved in the claim request (`decided_by: policy`); off means they wait in **Approvals**.                                                                                                                                                                                                                                                                                                                 |
| `auto_approve_mdm`     |   on    | MDM enrollments are approved in the claim request (`decided_by: mdm`); off means they wait in **Approvals** like the others.                                                                                                                                                                                                                                                                                                                      |
| `enrollment_ttl_hours` |   72    | How long a token issued from now stays claimable, 1 to 168 hours (7 days). An unclaimed token past this is `expired`.                                                                                                                                                                                                                                                                                                                             |

The `policy_snapshot` an enrollment carries holds only these four fields; the login rules are read live at each sign-in and are never snapshotted. Scheduled re-checks of enrolled devices stay on the [roadmap](/enterprise/#on-the-roadmap).
