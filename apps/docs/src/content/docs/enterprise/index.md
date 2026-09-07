---
title: Enterprise
description: Open core, the two editions (Identizen Cloud today, on-prem on the roadmap), what an organisation gets, what it never gets, and an honest today-versus-roadmap table.
---

Identizen is open core. The protocol, the index (`@identizen/index`, every route it serves today), the database schema and migrations, the SDKs, the CLI and fake phone, the design system, the personal dashboard features and the mobile app are open under Apache-2.0 and stay that way. What is proprietary is the layer that runs the open index _for an organisation_: the multi-tenant control plane that provisions tenants, holds their sealed secrets and resolves hostnames, and the management surfaces built on top of it. Nothing proprietary changes what the open index promises, and nothing in it ever holds a private key.

## Two editions

| Edition             | What it is                                                                                                                                                                                                               | Status                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| **Identizen Cloud** | A dedicated index per organisation at `https://{tenant}.index.identizen.com`: its own issuer, its own signing keys, its own Postgres in a US or EU region, operated by Identizen. [Set it up](/enterprise/cloud-setup/). | Available today; provisioned by Identizen on request |
| **On-prem**         | The same code packaged as containers (compose bundle and Helm chart) with a signed licence, installed inside your own boundary.                                                                                          | Roadmap                                              |

If you need the index inside your boundary now, [self-hosting](/self-hosting/) the open index is supported today and needs no licence.

## Available today

- **A tenant index.** Every organisation on Identizen Cloud gets its own issuer, JWKS, challenge-signing key and database. A request for one tenant can never read another's: separate databases, host-pinned issuer, per-tenant Durable Object and cache namespaces, and a token minted by one tenant's issuer is rejected by every other. The tenant Worker's test suite includes isolation tests for exactly this.
- **Data residency.** Each tenant's Postgres lives in the US or the EU, chosen at provisioning and never moved ([details](/enterprise/cloud-setup/#data-residency)).
- **Closed registration.** Only holders of the tenant's registration token can register sites on its index.
- **The index as a library.** `@identizen/index` exposes `createApp(options)` with per-request bindings, policy hooks and extra routes, which is how the tenant Worker is built ([embedding](/embedding/)).
- **MFA and step-up.** `acr_values=idz:mfa` with `login_hint=<sub>`, the Verification API, and an honest `amr` that refuses to call an unverified approval a second factor ([recipe](/enterprise/mfa-and-step-up/)).
- **Instant revocation with back-channel logout.** Revoking a device (`POST /me/devices/:id/revoke`) or a session ends every live OIDC session for it and POSTs a logout token to each site's `backchannel_logout_uri` immediately, retried for a few seconds on failure.
- **Audit events.** Every login, denial, enrollment, pairing, session, verification and revocation writes an `audit_events` row (`GET /me/audit` for the user's own view).
- **Domain verification.** A live site must prove its `rp_id` by DNS TXT or the well-known file before it can start logins, on a tenant index exactly as on the public one.
- **Dashboard as a package.** `@identizen/dashboard` (sign-in, devices, paired browsers, sessions, activity) is published so an organisation can compose it into its own app pointed at its tenant issuer. Identizen does not yet deploy it per tenant.
- **Two identity kinds and `idz_org`.** Identities carry `kind: 'personal' | 'org'` and an optional `org_id`; the id_token and `/userinfo` carry `idz_org` for identities that have one. Nothing assigns an `org_id` yet.

## On the roadmap

No dates. Nothing below is built; treat all of it as absent when you integrate.

| Capability                       | Notes                                                                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Admin portal (`{tenant}.portal`) | Org profile, domains, users, device fleet, policy, sites, SSO, SCIM, audit search and export.                                                                      |
| Org app (`{tenant}.app`)         | The dashboard package deployed per tenant, with enrollment and org-specific messages.                                                                              |
| Org enrollment                   | Admin-issued enrollment links (email, MDM, help-desk QR); device attests; admin approves or auto-approves by policy. No user-held recovery — the admin re-enrolls. |
| Fleet console                    | Enroll, disable, re-enroll, last-seen, attestation status.                                                                                                         |
| Policy                           | Require attestation, biometric class, geo/time rules, session max age.                                                                                             |
| Workforce-only login             | A per-site flag requiring an org identity.                                                                                                                         |
| SSO bridging                     | Identizen as an OIDC/SAML identity provider into your existing IdP, or directly into SaaS apps.                                                                    |
| SCIM                             | User lifecycle from the HR system.                                                                                                                                 |
| Operations                       | Audit export and SIEM webhook, retention, key-rotation jobs, a per-tenant status endpoint, custom domains (`login.example.com`).                                   |
| On-prem packaging                | Containers, compose bundle, Helm chart, signed licence.                                                                                                            |
| Compliance packaging             | SOC 2 report, DPA, pen-test summary.                                                                                                                               |
| Self-serve sign-up and billing   | Today provisioning is done by Identizen; there is no sign-up form.                                                                                                 |

## What the org never gets

The org never holds a private key and cannot log in as a user. Revocation is the org's power; impersonation is not. The index stores public keys, push tokens, revocation state, and audit events, and nothing that could be used to sign an assertion. That holds for a tenant index, for a self-hosted one, and for every roadmap item above: hooks and policies can refuse a login; they cannot approve one.

Want a tenant index, or a design partnership on the roadmap items? [Contact us](https://identizen.com/contact).
