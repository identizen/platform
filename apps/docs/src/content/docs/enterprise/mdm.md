---
title: MDM integration
description: Letting Intune, Jamf or another MDM enroll phones on a tenant index — MDM tokens, the issue endpoint with a curl example, the managed app configuration keys and plist, the Intune and Jamf recipe, and what device attestation verifies today.
---

An MDM can issue enrollments on your organization's behalf: it presents an **MDM token** to the tenant index, gets a one-time enrollment for a user, and the phone that opens it becomes a managed device, approved automatically by default. This page is everything the index, the portal and the phone app do for that today; read [Enrolling phones](/enterprise/enrollment/) first for what an enrollment is.

## MDM tokens

**MDM** in the portal (owners and admins manage; auditors read; the index also lets helpdesk read the list over the API) holds the organization's MDM tokens. **Create token** asks for a name (up to 80 characters, `Intune production` say) and answers with the secret, `mdm_…`, **shown once**: paste it into your MDM, then press **I have copied it**. The index keeps only a hash. If the secret is lost, revoke the token and create another.

The list shows each token's name, when it was created, when it was last used (touched on every successful issue) and, once revoked, when. **Revoke** (owners and admins; `DELETE /orgs/mdm/tokens/:id`, 204) stops that MDM issuing new enrollments immediately; phones it already enrolled are unaffected. Creating and revoking are audited (`mdm.token_created`, `mdm.token_revoked`) and land in the admin-actions log (`mdm.token_create`, `mdm.token_revoke`).

## The issue endpoint

Your MDM asks for one enrollment per user:

```bash
curl -sS -X POST https://acme.index.identizen.com/enroll/mdm/issue \
  -H "Authorization: Bearer $IDENTIZEN_MDM_SECRET" \
  -H "Content-Type: application/json" \
  -d '{ "email": "grace@example.com" }'
```

The body is `{ "email": string, "display_name"?: string }`; the email is trimmed and lower-cased. The response is `201`:

```json
{
  "enrollment": {
    "id": "e_…",
    "member_id": "m_…",
    "member_email": "grace@example.com",
    "channel": "mdm",
    "status": "pending",
    "device_id": null,
    "attestation_status": "none",
    "attestation_platform": null,
    "policy_snapshot": {
      "require_attestation": false,
      "auto_approve": false,
      "auto_approve_mdm": true,
      "enrollment_ttl_hours": 72
    },
    "expires_at": "2026-09-10T09:00:00.000Z",
    "claimed_at": null,
    "decided_at": null,
    "decided_by": null,
    "created_at": "2026-09-07T09:00:00.000Z"
  },
  "token": "<one-time token>",
  "deep_link": "identizen://enroll?index=https%3A%2F%2Facme.index.identizen.com&token=<one-time token>"
}
```

What the call does:

- An email the organization does not know becomes a new member with the role `member`, status `invited` and `source: 'mdm'`; a known email reuses the member. A deprovisioned member is refused (`400 member_deprovisioned`).
- The enrollment is issued on channel `mdm` with the organization's current [policy](/enterprise/enrollment/#policy-reference) as its snapshot, so it expires after `enrollment_ttl_hours` and is approved at claim when `auto_approve_mdm` is on (the default). With `auto_approve_mdm` off it waits in **Approvals** like any other.
- `token` and `deep_link` are returned once and never again; `deep_link` is the same `identizen://enroll?index=…&token=…` link the portal shows, and the token can be turned into a QR code by the MDM if it prefers.
- The token's `last_used_at` is updated and `mdm.enrollment_issued` is audited with the token id, member id and enrollment id.

Errors: `401 missing_token` without a bearer, `401 invalid_token` for an unknown or revoked secret, and the usual `400` for a malformed body. The route is rate-limited per source address.

## Managed app configuration

`GET /orgs/mdm/profile` (shown on the portal's MDM page as **Enrollment profile**, with copy buttons) is what an MDM would push to the Identizen app as managed app configuration:

| Key                   | Value                                                                     |
| --------------------- | ------------------------------------------------------------------------- |
| `index_url`           | The tenant issuer, `https://acme.index.identizen.com`                     |
| `enrollment_endpoint` | `https://acme.index.identizen.com/enroll/mdm/issue`, for your own scripts |
| `enrollment_token`    | Per user: the `token` your MDM obtained from the issue endpoint           |

and the same three keys as a property list, with `PayloadType` `com.apple.ManagedClient.appconfig`, `PayloadDisplayName` `Identizen ({org})` and `$USER_ENROLLMENT_TOKEN` as the placeholder for the per-user token:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadDisplayName</key><string>Identizen (Acme Corp)</string>
  <key>PayloadType</key><string>com.apple.ManagedClient.appconfig</string>
  <key>index_url</key><string>https://acme.index.identizen.com</string>
  <key>enrollment_endpoint</key><string>https://acme.index.identizen.com/enroll/mdm/issue</string>
  <key>enrollment_token</key><string>$USER_ENROLLMENT_TOKEN</string>
</dict>
</plist>
```

**The phone app does not read managed app configuration yet.** The app build that includes enrollment opens the `identizen://enroll?index=…&token=…` link, scans it as a QR code, or accepts it as an `https://…/enroll?…` link on its associated domain; nothing in it reads `index_url` or `enrollment_token` from an MDM profile. So today a pushed profile is inert on the phone, and what makes an MDM enrollment happen is getting the `deep_link` from the issue response to the person's phone: through your MDM's messaging or portal, as a QR code, or by an administrator. The profile keys are published now so the recipe below does not change when the app starts reading them.

## Intune and Jamf

Both recipes push the fixed `index_url` and a per-user `enrollment_token` obtained from the issue endpoint with an MDM token from the portal, and both apply once the app reads managed app configuration (see above); until then use the same tokens and deliver the `deep_link`.

**1. Get a token per user.** For each user your MDM should enroll, call the issue endpoint as shown above. Unknown emails become members with the role `member`. Each token works once and for the lifetime set in **Policy**.

**2a. Microsoft Intune.**

1. Apps › App configuration policies › Add › Managed apps, and target the Identizen app.
2. Under General configuration add `index_url` = `https://acme.index.identizen.com` and `enrollment_token` = the user's token (a script or the Graph API sets it per user).
3. Assign the policy to the group that should enroll.

**2b. Jamf Pro.**

1. Devices › Mobile Device Apps › Identizen › App Configuration.
2. Paste the plist from the enrollment profile and replace `$USER_ENROLLMENT_TOKEN` with the user's token; Jamf variables such as `$EMAIL` help when you script the issue call.
3. Scope the app to the devices that should enroll.

With **Approve MDM enrollments automatically** on in **Policy** (the default), the phone becomes a managed device as soon as it claims; otherwise it waits in **Approvals**.

## Attestation

The tenant index can verify that the phone claiming an enrollment is a genuine device running the genuine Identizen app, and records the answer on the enrollment and the device as `attestation_status`: `none` (the claim carried no attestation), `unverified` (it did, but the index has no credentials for that platform), `verified`, or `failed` (which refuses the claim with `403 attestation_failed` and stores nothing).

**What the server verifies.** A claim may carry `attestation: { platform: 'ios' | 'android', key_id?, payload }`. The nonce that `POST /enroll/:token/begin` returned is the challenge.

- **iOS, App Attest.** The payload is the App Attest attestation object. Verified offline against the embedded Apple App Attestation root: the certificate chain, the nonce bound into the leaf certificate, the key id against the credential certificate's public key, the `rpIdHash` against `APP_ATTEST_APP_ID`, a counter of zero, and the `appattest` production environment (Xcode builds are accepted only when `APP_ATTEST_ALLOW_DEVELOPMENT` is `true`). Only the enrollment-time attestation is checked; per-request assertions and Apple's receipt endpoint are not used.
- **Android, Play Integrity.** The payload is the Play Integrity token. The index authenticates to Google with a service account and asks Google to decode it, then checks the package name, the nonce, a timestamp within 10 minutes, `PLAY_RECOGNIZED` for the app, the signing certificate digest when `PLAY_INTEGRITY_CERT_DIGESTS` is set, and `MEETS_DEVICE_INTEGRITY` for the device. A device that only meets basic integrity fails, and the verdicts are kept on the record so an administrator can see why.

**Operator settings.** These are set by Identizen on the tenant index Worker, per deployment, not per tenant yet: `APP_ATTEST_APP_ID` (`<team id>.<bundle id>`; set for Identizen Cloud), `APP_ATTEST_ALLOW_DEVELOPMENT`, `PLAY_INTEGRITY_PACKAGE`, `PLAY_INTEGRITY_SERVICE_ACCOUNT` (the service-account JSON, with the Play Integrity API enabled and linked to the app in Play Console) and `PLAY_INTEGRITY_CERT_DIGESTS`. A platform whose settings are absent is reported `unverified`. Whether `unverified` is acceptable is the organization's `require_attestation` policy, which only accepts `verified`.

**No phone build sends an attestation yet.** Producing one needs a native module (App Attest on iOS, Play Integrity on Android) that the Identizen app does not ship; the enrollment flow in the app sends the claim without an attestation and, when the organization requires one, refuses before claiming with _This organization only enrolls verified devices. This build of Identizen cannot prove the phone is genuine yet._ So today every claim arrives with `attestation_status: none`, the **Attestation** column in **Approvals** and **Devices** reads `none` for every phone, and `require_attestation` refuses every enrollment. Leave it off until an app build with attestation ships; the server side is ready for it.

## What is not built

No scheduled re-check of enrolled devices, no email for MDM-issued enrollments (the MDM delivers the `deep_link`; only enrollments an administrator issues from the portal are emailed), no reading of managed app configuration on the phone, no SCIM and no SSO bridging. The [overview](/enterprise/#on-the-roadmap) keeps the roadmap.
