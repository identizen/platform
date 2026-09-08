---
title: The organisation app for members
description: What a member sees at {tenant}.app.identizen.com, how to accept an invitation (including installing the app and pointing it at the organisation's index), and what happens when an administrator suspends or deprovisions you.
---

Every Identizen Cloud tenant has an app for its people at `https://{tenant}.app.identizen.com`. It is the same personal dashboard that runs at `app.identizen.com`, deployed for your organisation and pointed at its index, and it is a registered OIDC client on that index. You sign in to it with the phone you enrolled on the organisation's index; nothing else is needed.

This page is for members. Administrators have their own [portal](/enterprise/portal/).

## What you see

Above the dashboard sits a strip with the organisation's name and logo and the word **Members**, and the home page begins with **Managed by _{org}_** (or **This phone is managed by _{org}_** once the organisation manages one of your phones), so you always know whose index you are on. If your identity has a handle it appears in the header as `@handle`.

The navigation is the dashboard's:

| Page         | What it holds                                                                                                                             |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Devices**  | The phones that hold your identity on this index. Revoking a device ends all of its sessions and paired browsers.                         |
| **Browsers** | Browsers that push sign-ins straight to your phone. Unpairing brings back the QR code there.                                              |
| **Sessions** | Where you are signed in right now, per site. Ending a session logs that site out within seconds.                                          |
| **Activity** | Everything that happened to your identity, newest first: logins, denials, enrollments, pairings, sessions, verifications and revocations. |
| **Settings** | Your handle, your identity id and the details of the current session, the theme, and sign-out.                                            |

Everything here is yours to act on. Revoking a device or ending a session from this app has the same effect as when an administrator does it: the session ends and the site is told over back-channel logout.

If an administrator has suspended your membership, every page shows a notice: **Your access is suspended; contact your administrator.** See [below](#when-an-administrator-suspends-you) for what that means.

## Accepting an invitation

An administrator invites you with a link of the form `https://{tenant}.app.identizen.com/invite?token=…`. It reaches you as an email from the organisation's index (_You're invited to join {org}_, with an **Accept invitation** button) when the index has mail set up, and otherwise from the administrator directly; either way it works once and expires 7 days after it was created.

1. **Install the Identizen app** on your phone from [identizen.com/download](https://identizen.com/download/), if you do not have it.
2. **Add your organisation's index.** In the app open **Settings → Indexes → Add index** and enter `https://{tenant}.index.identizen.com` (the invitation page shows the exact address). The phone registers the same identity there, next to the public index, and makes it the active one; nothing on the public index changes. An identity that exists only on the public index is unknown to your organisation's index until the phone registers there. (Several indexes on one phone ships with the next app build; in the build in the stores today the index is set in **Settings** before registering and a phone is registered with one index at a time.)
3. **Enrol** the phone there. That creates your identity on the organisation's index; the organisation does not see the private key, which never leaves the phone.
4. **Open the invitation link.** The page says **Join _{org}_** and, since you are not signed in yet, offers **Sign in to accept**.
5. **Sign in with the phone.** A QR code or a push arrives on the phone; approve it. You come back to the app, where the invitation is accepted for you without another click.
6. You see **You're a member of _{org}_**, an **Enrol this phone** button (below) and a **Go to your dashboard** button.

If you open the link while already signed in to the app, the page asks first (**Accept invitation**) because accepting links the identity you are signed in with to the membership, permanently. One identity can hold one membership.

What can go wrong, in the words the page uses:

| Message                                      | Cause                                                                                                |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| This invite link is incomplete               | The `token` is missing from the address; open the link exactly as it was sent, or ask for a new one. |
| This invite link is not valid                | The token was never issued, was already used, or a newer invitation replaced it.                     |
| This invite has expired                      | More than 7 days passed. Ask your administrator to reinvite you; the new link replaces the old.      |
| Your identity is already a member of _{org}_ | The phone you signed in with is already linked to a membership. There is nothing to accept.          |

## Enrolling your phone

Being a member and having a **managed phone** are two different things. Accepting an invitation links your identity to the membership; enrolling makes a phone that holds that identity a managed device of the organisation, which can then disable or revoke it from the portal and see its sign-in activity. The organisation still never gets your keys.

The page is `https://{tenant}.app.identizen.com/enroll`, **Enrol this phone**; the invitation page offers it as soon as you have accepted, and the home page shows a **Finish joining _{org}_** card while your membership is still waiting for a phone. It is open while your membership is `invited` or `active`; while suspended it says _Enrolment is not available while your access is suspended_, and a signed-in identity that is not a member sees **Not a member yet**.

1. Press **Enrol this phone**. The app asks the index for a one-time code (`POST /orgs/me/enrollments`) and shows a QR code, an **Open in the Identizen app on this phone** link for when you are reading the page on the phone itself, and when the code expires (the organisation's policy sets this; 72 hours by default). The code works once.
2. Scan the code with the Identizen app (or tap the link). The phone shows **Join an organisation** with the organisation's name and your masked email; press **Enrol**. The phone has to hold the identity you are signed in with: the one you enrolled on the organisation's index for the invitation, or a second phone restored from the same 24 words.
3. Either the phone is a managed device at once, or, when the organisation reviews enrolments, the page says _Waiting for approval. After you approve on your phone, an administrator has to approve the enrolment_, and the phone waits too.
4. The page polls your membership every 3 seconds and switches to **You're enrolled** (_Your phone is now managed by {org}_) once the organisation counts one more managed phone for you, with a **Go to your dashboard** button. If the code's time runs out first the page says so and offers **Start again**.

Exactly what the phone shows, and what the organisation can do with a managed phone, is on [Enrolling phones and managing the fleet](/enterprise/enrollment/). A managed phone that an administrator **disables** cannot approve sign-ins and loses its sessions until it is enabled again; one that is **revoked** is gone for good, exactly as if you had revoked it yourself from **Devices**.

## When an administrator suspends you

Suspension is a lock, not a removal.

- Every live session you have on sites registered with the organisation's index ends at once, and each of those sites receives a back-channel logout, so you are signed out everywhere.
- Until you are reinstated, every login attempt on this index is refused: the phone's approval is rejected with `member_suspended`, and the refusal is recorded in your activity as a denied login.
- Your phone stays enrolled and your paired browsers stay paired; nothing on the device changes.
- If the app is still open in a browser, it shows the suspended notice on every page.

When an administrator reinstates you, nothing needs re-enrolling: sign in again and everything is as it was.

## When an administrator deprovisions you

Deprovisioning is final.

- Every phone enrolled for your identity on the organisation's index is revoked. Your phone can no longer approve anything for this index; the app on the phone will need to enrol again if you are ever invited back, as a new member.
- Every live session ends and every site is told over back-channel logout, exactly as for suspension.
- Logins are refused with `member_deprovisioned`.

Deprovisioning touches only the organisation's index. An identity you hold on the public index, or on any other tenant, is a different identity with different keys and is not affected.

## What the organisation can and cannot see

Administrators with the right role can see your email and display name, your role and status, the phones holding your identity (label, platform, status, last seen), your live sessions (which site, when they started and expire) and your activity on this index. They cannot see your private key, because the index never has it; they cannot sign in as you, because only the phone can approve a login; and they cannot read anything about you on any other index.
