---
title: Fleet API
description: Enrollments, managed devices, the approvals queue, MDM tokens and the managed app configuration on a tenant index, and the phone's /enroll/* routes — every route with its role, body and response.
---

The routes behind the portal's **Devices**, **Approvals** and **MDM** pages, the org app's self-service enrollment, an MDM's issue endpoint, and what the phone calls to claim an enrollment. Authentication and roles are on the [overview](/enterprise/api/); the guides are [Enrolling phones and the fleet](/enterprise/enrollment/) and [MDM integration](/enterprise/mdm/).

## Model

An **enrollment** is a one-time token, stored hashed, issued for a member. The phone that presents it becomes a **managed device** of the organisation (`org_id`, `managed: true`, an attestation status) and the enrollment links the member to the phone's identity, with the same effect as accepting an invitation plus device management. Approval is automatic (by policy, or for the MDM channel with `auto_approve_mdm`) or by an administrator from the approvals queue.

```ts
type EnrollmentStatus = 'pending' | 'claimed' | 'approved' | 'denied' | 'expired' | 'revoked';
type Channel = 'link' | 'qr' | 'mdm' | 'helpdesk';
type AttestationStatus = 'none' | 'unverified' | 'verified' | 'failed';

/** The enrollment half of the policy document, snapshotted when a token is issued. */
interface EnrollmentPolicy {
  require_attestation: boolean; // a claim without a verified attestation is refused
  auto_approve: boolean; // link, qr and helpdesk enrollments are approved at claim
  auto_approve_mdm: boolean; // mdm enrollments are approved at claim
  enrollment_ttl_hours: number; // 1–168, default 72
}

interface Enrollment {
  id: string; // e_…
  member_id: string;
  member_email: string;
  channel: Channel;
  status: EnrollmentStatus;
  device_id: string | null; // set at claim
  attestation_status: AttestationStatus;
  attestation_platform: 'ios' | 'android' | null;
  policy_snapshot: EnrollmentPolicy; // the policy that applied at issue time
  expires_at: string;
  claimed_at: string | null;
  decided_at: string | null;
  decided_by: string | null; // member id of the approver, or 'policy' / 'mdm'
  created_at: string;
}

interface ManagedDevice {
  id: string;
  member_id: string | null;
  member_email: string | null;
  idz: string;
  label: string | null;
  platform: 'apns' | 'fcm' | 'web' | null;
  status: 'active' | 'disabled' | 'revoked';
  managed: boolean;
  attestation_status: AttestationStatus;
  last_seen_at: string | null;
  enrolled_at: string | null; // enrollment approval time
  disabled_at: string | null;
  disabled_by: string | null;
  created_at: string;
}

interface MdmToken {
  id: string; // mdm_…
  name: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

/** POST /orgs/members/:id/enrollments, POST /orgs/me/enrollments, POST /enroll/mdm/issue */
interface IssuedEnrollment {
  enrollment: Enrollment;
  token: string; // shown once
  deep_link: string; // identizen://enroll?index=<issuer>&token=<token>
  qr_payload?: string; // the same string; absent on the MDM route
  delivery?: { email: 'sent' | 'failed' | 'not_configured' }; // link and helpdesk channels only
}
```

The whole policy document, including the login rules, is on the [Policy API](/enterprise/api/policy/) page; `policy_snapshot` holds only the four enrollment fields.

## Enrollments and approvals

| Method | Path                            | Role                          | Body → Response                                                                                                                                                                                          |
| ------ | ------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/orgs/members/:id/enrollments` | helpdesk+ (`members.support`) | `{ channel?: 'link' \| 'qr' \| 'helpdesk' }` → `IssuedEnrollment` (`201`). The member must not be `deprovisioned`                                                                                        |
| `GET`  | `/orgs/enrollments`             | helpdesk+ (`members.support`) | query `status`, `member_id`, `limit`, `cursor` → `{ enrollments: Enrollment[], next_cursor }`                                                                                                            |
| `GET`  | `/orgs/enrollments/:id`         | helpdesk+ (`members.support`) | `{ enrollment, device: ManagedDevice \| null }`                                                                                                                                                          |
| `POST` | `/orgs/enrollments/:id/approve` | admin+ (`members.write`)      | → `{ enrollment, device, member }`. Only from `claimed` (`409 not_claimed`). Links the member (`idz`, status `active`) and marks the device managed                                                      |
| `POST` | `/orgs/enrollments/:id/deny`    | admin+ (`members.write`)      | `{ reason? }` → `{ enrollment }`. Only from `claimed`: the device loses the organisation (`org_id` null, `managed` false) and is **revoked**, since the phone was never trusted; the member is unchanged |
| `POST` | `/orgs/enrollments/:id/revoke`  | helpdesk+ (`members.support`) | → `{ enrollment }`. Only from `pending` (`409 not_pending`): the token stops working                                                                                                                     |
| `GET`  | `/orgs/fleet/summary`           | helpdesk+ (`members.support`) | `{ managed_devices, pending_approvals }`                                                                                                                                                                 |

## Devices

`/orgs/devices` lists every device whose identity belongs to a member, managed or not, so an administrator sees the phones a member enrolled before the organisation existed as well.

| Method | Path                        | Role                          | Body → Response                                                                                                                             |
| ------ | --------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/orgs/devices`             | helpdesk+ (`members.support`) | query `q` (email or label), `status`, `attestation`, `limit`, `cursor` → `{ devices: ManagedDevice[], next_cursor }`                        |
| `GET`  | `/orgs/devices/:id`         | helpdesk+ (`members.support`) | `{ device, member, sessions, audit }`                                                                                                       |
| `POST` | `/orgs/devices/:id/disable` | helpdesk+ (`members.support`) | → `{ device, sessions_revoked }`. The open index's `disabled` status: the phone cannot approve logins, its sessions are revoked; reversible |
| `POST` | `/orgs/devices/:id/enable`  | helpdesk+ (`members.support`) | → `{ device }`. `409 not_disabled` unless the device is disabled                                                                            |
| `POST` | `/orgs/devices/:id/revoke`  | admin+ (`members.write`)      | → `{ device, sessions_revoked }`. Irreversible; the member enrols again                                                                     |

## MDM tokens and profile

| Method   | Path                   | Role                        | Body → Response                                                                                                                                |
| -------- | ---------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/orgs/mdm/tokens`     | any admin role (`org.read`) | `{ tokens: MdmToken[] }`                                                                                                                       |
| `POST`   | `/orgs/mdm/tokens`     | admin+ (`org.write`)        | `{ name }` → `{ token: MdmToken, secret }` (`201`). `secret` is shown once                                                                     |
| `DELETE` | `/orgs/mdm/tokens/:id` | admin+ (`org.write`)        | → `204`, the token is revoked; phones it already enrolled are unaffected                                                                       |
| `GET`    | `/orgs/mdm/profile`    | any admin role (`org.read`) | `{ managed_app_config: { index_url, enrollment_endpoint, enrollment_token }, plist: string }`: what an MDM pushes as managed app configuration |

Reading the token list and the profile is gated on `org.read`, so every admin role can read them, although the portal shows **MDM** to owners, admins and auditors only; creating and revoking are owners and admins.

## Self-service (org app)

| Method | Path                   | Role                                 | Body → Response                                                                                                                                                               |
| ------ | ---------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/orgs/me/enrollments` | bearer; member `invited` or `active` | → `IssuedEnrollment` (`201`). A member enrols another phone of their own, or their first right after accepting an invitation; channel `link`; approval follows `auto_approve` |

## MDM issue

| Method | Path                | Auth                                 | Body → Response                                                                                                                                                                                               |
| ------ | ------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/enroll/mdm/issue` | `Authorization: Bearer <MDM secret>` | `{ email, display_name? }` → `{ enrollment, token, deep_link }` (`201`). Creates the member (`source: 'mdm'`, role `member`) when the email is unknown and issues an `mdm` enrollment. Rate limited per token |

## Phone routes

The phone registers on the tenant index first (`POST /devices/nonce`, `POST /devices`, unchanged from the [open index](/reference/index-api/#device-and-identity)) and claims **after** registration, with the registered device's signature.

| Method | Path                    | Auth                       | Body → Response                                                                                                                                                                                                                                                                                                                                                                    |
| ------ | ----------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/enroll/:token/begin`  | none (IP rate limit)       | → `{ org: { display_name, logo_url }, member_email_masked, index, policy: { require_attestation }, expires_at, nonce }`. `nonce` is the attestation challenge. `404 invalid_enrollment`, `410 enrollment_expired`, `409 enrollment_used`                                                                                                                                           |
| `POST` | `/enroll/:token/claim`  | device (`Idz-Signature`)   | `{ attestation?: { platform: 'ios' \| 'android', key_id?: string, payload: string } }` → `{ enrollment, approval_required: boolean }`. Verifies the attestation when present; with `require_attestation`, a missing or failed one is `403 attestation_required` / `403 attestation_failed`. When approval is automatic, `enrollment.status` is `approved` and the member is linked |
| `GET`  | `/enroll/:token/status` | device (inactive accepted) | → `{ status, approval_required }` for the claiming device to poll                                                                                                                                                                                                                                                                                                                  |

A device already linked to another member of this organisation is refused with `409 device_already_enrolled`. A device whose identity is already a member (re-enrolment) is allowed and replaces that member's previous managed device. Claiming with a phone that is not yet managed counts against the `devices` quota (`409 quota_exceeded`).

### Attestation

For `platform: 'ios'`, `payload` is the base64 App Attest attestation object for `key_id`, produced with the enrollment `nonce` as the client data hash. For `'android'`, `payload` is the Play Integrity token requested with the nonce. When the tenant index has no credentials for a platform the result is `unverified`, which is accepted only while `require_attestation` is false. No phone build sends an attestation yet, so today every claim records `none` and `require_attestation` refuses every enrollment ([status](/enterprise/mdm/#attestation)).

## Audit and admin actions

Audit kinds: `enrollment.issued`, `enrollment.claimed`, `enrollment.approved`, `enrollment.denied`, `enrollment.revoked`, `device.enrolled` (the open index's kind, reused with `org_id`), `device.disabled_by_org`, `device.enabled_by_org`, `device.revoked_by_org`, `mdm.token_created`, `mdm.token_revoked`, `mdm.enrollment_issued`. Admin actions: `enrollment.issue`, `enrollment.approve`, `enrollment.deny`, `enrollment.revoke`, `device.disable`, `device.enable`, `device.revoke`, `mdm.token_create`, `mdm.token_revoke`.

## Example: issue an enrollment for a member

```bash
curl -sS -X POST https://acme.index.identizen.com/orgs/members/m_01K4A7.../enrollments \
  -H "Authorization: Bearer $IDZ_PORTAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "channel": "link" }'
```

```json
{
  "enrollment": {
    "id": "e_01K4B2…",
    "member_id": "m_01K4A7…",
    "member_email": "grace@example.com",
    "channel": "link",
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
    "expires_at": "2026-09-10T09:20:01.004Z",
    "claimed_at": null,
    "decided_at": null,
    "decided_by": null,
    "created_at": "2026-09-07T09:20:01.004Z"
  },
  "token": "…",
  "deep_link": "identizen://enroll?index=https%3A%2F%2Facme.index.identizen.com&token=…",
  "qr_payload": "identizen://enroll?index=https%3A%2F%2Facme.index.identizen.com&token=…",
  "delivery": { "email": "sent" }
}
```
