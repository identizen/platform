---
title: Enterprise
description: Org identities, fleet console, instant revocation, SSO bridging, SCIM, audit. What exists today and what is on the roadmap.
---

:::note[Roadmap]
The enterprise tier is PRD Phase 3. This page separates what the open-source index does today from what is planned, so nobody builds on a feature that is not there yet.
:::

## Available today

- **Two identity kinds.** Identities carry `kind: 'personal' | 'org'` and an optional `org_id`; the `orgs` table exists so org features land without a schema break.
- **`idz_org` claim.** Org identities surface their organisation id in the `id_token` and `/userinfo`.
- **Instant revocation with back-channel logout.** Revoking a device (`POST /me/devices/:id/revoke`) or a session ends every live OIDC session for it and POSTs a logout token to each site's `backchannel_logout_uri` within a second. This is the mechanism the fleet console will drive.
- **Audit events.** Every login, denial, enrollment, pairing, session, verification, and revocation writes an `audit_events` row (`GET /me/audit` for the user's own view).
- **Self-hosting.** A regulated org can run the entire index inside its own boundary with no Identizen-operated service in the path ([self-hosting](/self-hosting/)).
- **Closed registration.** `SITE_REGISTRATION_TOKEN` gates which sites may register with an index.

## Planned (Phase 3)

| Capability           | Notes                                                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Org enrollment       | Admin-issued enrollment links (email, MDM, help-desk QR); device attests; admin approves or auto-approves by policy. No user-held recovery — the admin re-enrolls. |
| Fleet console        | Enroll, disable, re-enroll, last-seen, attestation status. Built on the same React app as the dashboard (`console.identizen.com`).                                 |
| Policy               | Require attestation, biometric class, geo/time rules.                                                                                                              |
| SSO bridging         | Identizen as an OIDC/SAML IdP into Okta, Entra ID, Google Workspace, or directly into SaaS apps.                                                                   |
| SCIM                 | User lifecycle from the HR system.                                                                                                                                 |
| Workforce-only login | A per-site flag requiring an org identity.                                                                                                                         |
| Compliance packaging | SOC 2 report, DPA, pen-test summary, EU/US data residency.                                                                                                         |

## What the org never gets

The org never holds a private key and cannot log in as a user. Revocation is the org's power; impersonation is not. The index stores public keys, push tokens, revocation state, and audit events, and nothing that could be used to sign an assertion.

Interested in a design partnership? [Contact us](https://identizen.com/contact).
