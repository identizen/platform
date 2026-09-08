---
title: SSO into your apps
description: The tenant index as the identity provider for your SaaS and internal apps — OIDC apps registered from the portal with profile claims released to them, and a SAML 2.0 identity provider for apps that only speak SAML.
---

Every Identizen Cloud tenant index is already an OpenID Connect provider. **SSO** in the portal is where an administrator registers the organization's applications on it, and where the index doubles as a SAML 2.0 identity provider for the SaaS apps that only speak SAML. Either way the login is the tenant's normal phone approval, every [login policy](/enterprise/policy/) applies, and the app never sees a password because there is none.

This page is what ships today. SCIM groups and IdP-initiated SAML logout are [on the roadmap](/enterprise/#on-the-roadmap).

## OIDC apps

An OIDC app is a site on the tenant index, exactly like one registered with the registration token, except that an administrator creates it from the portal and the organization can release profile claims to it.

**Creating one** (owner or admin): **SSO → New OIDC app**, with a name, the `rp_id` (the app's public hostname), one or more `https://` redirect URIs, whether the client is **public** (PKCE only, no secret; single-page and native apps) or **confidential** (a client secret, shown once, for server-side apps), an optional back-channel logout URI, and two switches:

- **Release profile** (default on): active members signing in to this app get `email` (the address the organization holds for them), `name` (their display name, when set) and `idz_role` in the id_token and `/userinfo`. The open index never releases an email or a name; the organization's own record is the only source, and nothing is released for identities that are not active members.
- **Workforce only** (default from the policy's `workforce_only_default`): refuses anyone who is not an active member, with `workforce_only`.

The app then appears under **SSO** and under **Sites**, with the same [domain verification](/enterprise/policy/#sites-and-workforce-only) rules as any site: the `rp_id` must be proven by DNS TXT or the well-known file before logins start. The discovery document is `https://{tenant}.index.identizen.com/.well-known/openid-configuration`; point any OIDC library at it with the client id.

**Disabling** an app refuses every login at phone approval with `app_disabled` (audited as `login.denied`); enabling it again restores logins. **Removing** an OIDC app disables it and keeps the site registered, so the `client_id` can never be re-issued to someone else. A SAML app is deleted outright.

## The SAML identity provider

For an app that only accepts SAML, the tenant index is the identity provider. The facts an app needs are on **SSO → New SAML app** and on every SAML app's page:

| Fact           | Value                                                             |
| -------------- | ----------------------------------------------------------------- |
| Entity id      | `https://{tenant}.index.identizen.com/saml/metadata`              |
| SSO URL        | `https://{tenant}.index.identizen.com/saml/sso`                   |
| SLO URL        | `https://{tenant}.index.identizen.com/saml/slo`                   |
| Metadata URL   | the entity id; serves the IdP metadata XML                        |
| Certificate    | the tenant's SAML signing certificate (PEM), also in the metadata |
| Test login URL | `…/saml/sso?app=<id>`: an IdP-initiated login into that app       |

**Creating a SAML app** takes the app's **entity id** (the `Issuer` it puts in its AuthnRequests), its **ACS URL** (`https://`, HTTP-POST binding), the **NameID format** (`emailAddress`, the member's email, or `persistent`, the member's stable id) and the **attribute map**: SAML attribute name → one of `email`, `name`, `role`, `idz`, `member_id`. The default map is `email`, `name` and `role`. `sign_assertion` (default on) signs the assertion; the Response is signed either way. Three optional settings concern single logout and request signing: the app's **SLO URL** (its `SingleLogoutService`, `https://`, Redirect or POST binding; leave it empty and the app has no single logout), the app's **signing certificate** (`sp_certificate_pem`, the X.509 certificate the app signs its requests with; it must parse, and `null` clears it), and **allow unsigned logout** (off by default; see below before turning it on).

**How a login runs.** The app sends an AuthnRequest to the SSO URL, by HTTP-Redirect (deflated) or HTTP-POST binding, with an optional `RelayState`. The index checks the `Issuer` against the registered apps and the request's ACS URL against the registered one, then starts an ordinary Identizen login on the tenant. After the phone approves, the index verifies the id_token it just issued, looks up the member, builds a SAML Response and returns an auto-submitting form that posts it to the ACS URL with the `RelayState`. IdP-initiated logins (`?app=<id>`) work the same way without a request.

What the Response carries: a signed assertion valid for 5 minutes, `InResponseTo` bound to the request id when there was one (absent for IdP-initiated logins), the NameID in the chosen format, an `AuthnStatement` with `urn:oasis:names:tc:SAML:2.0:ac:classes:MobileTwoFactorContract` (every Identizen login is possession plus the phone's biometric), and the mapped attributes.

**Who may sign in.** Active members only; a SAML app is a workforce app by definition. Anyone else, and members who are suspended or deprovisioned, are refused (`workforce_only`, `member_suspended`, `member_deprovisioned`). Login policy (managed device, `allowed_amr`, login windows) applies exactly as for any site.

**Signing key.** Each tenant has an RSA-2048 SAML signing key and a self-signed certificate, created by Identizen at provisioning and sealed like every other tenant secret; the private key exists only inside a request on the tenant Worker. When we rotate it, every SAML app must be given the new certificate; there is no overlap window today, so rotation is scheduled with you.

**Single logout.** SP-initiated only. When an app has an SLO URL, the metadata advertises `SingleLogoutService` for the Redirect and POST bindings at the SLO URL above. When the app sends a `LogoutRequest` there, the index reads the member from its `NameID` the way the app's NameID format defines it (`emailAddress` → the member's email, `persistent` → the member id), revokes every session of that member's identity, sends back-channel logout to the OIDC apps that registered one, and returns a signed `LogoutResponse` (`InResponseTo` the request, Status Success) to the app's SLO URL by the binding the request used. It is audited as `sso.saml_logout`. A `NameID` that matches no active member still gets a Success response, because the SAML profile forbids revealing whether a principal exists; that case is audited as `sso.saml_logout_unknown`. The response is always signed with the tenant's SAML key; configure the app to verify it with the certificate from the metadata.

**Signed logout is the default.** A `LogoutRequest` must carry a signature that verifies with the app's signing certificate: `SigAlg` and `Signature` on the Redirect binding, an enveloped XML signature on the POST binding. Without a signature the request is refused with `signature_required`; with one that does not verify, `bad_signature`; both are audited as `sso.saml_logout_rejected` with the reason. An app can only use single logout without a certificate when it was created or patched with **allow unsigned logout** on. That is an explicit opt-in and it means exactly this: anyone who knows a member's email (or member id, for `persistent`) and the app's entity id can end that member's sessions. With the opt-in and a certificate, a signature that is present is still verified. AuthnRequests stay accepted unsigned; when a certificate is configured, a signed one is verified and refused with `bad_signature` if it does not verify (most apps sign only when configured to, so a missing signature is not an error).

**XML handling.** Every SAML message is checked before any XML parser sees it. A request body, query string or `SAMLRequest` over 64 KiB, or a deflated message that would inflate past 256 KiB, is refused with `saml_request_too_large`. Any markup declaration (`<!DOCTYPE`, `<!ENTITY`, `<!ELEMENT` and the rest, so XXE and entity-expansion payloads never reach a parser), entity references other than the five predefined ones and character references, parameter entities, malformed XML including a duplicated `ID`, more than one `Issuer` or `NameID`, a nested `AuthnRequest` or `LogoutRequest`, and an `Issuer` or `NameID` with child elements are refused with `saml_xml_rejected`. A request without an `ID` or `NameID` is `invalid_saml_request`. `Issuer`, `ID`, the ACS URL and `NameID` are read with a namespace-aware DOM parser, so comment tricks such as `<Issuer>https://good<!--x-->.example</Issuer>` resolve to the literal text. Both SAML endpoints are rate limited per IP.

**Not implemented.** IdP-initiated logout (the index does not send `LogoutRequest`s to apps when a member is suspended, deprovisioned or signs out elsewhere; apps learn of that through their own session lifetime, or through OIDC back-channel logout where they are OIDC apps), encrypted assertions, and SP metadata import.

### Configuring the app

In the app's SAML settings, paste the entity id as the IdP issuer, the SSO URL as the sign-in URL (POST or Redirect binding, whichever the app offers), and the certificate. Set the NameID or "user identifier" to email unless the app wants a stable opaque id, in which case create the app with the `persistent` format. Map the app's required attributes from the attribute map you configured (most apps want `email`; some want a display name or a role for authorization). For single logout, paste the SLO URL as the app's sign-out or logout URL, turn on request signing in the app and put the app's signing certificate into the SAML app's settings on the portal. Then use the test login URL: it runs a full IdP-initiated login and lands you in the app.

## Over the API

Everything the portal does is `https://{tenant}.index.identizen.com` with a portal session bearer; the roles are the [portal roles](/enterprise/portal/#roles). The app routes and the SAML endpoints, with bodies, resource shapes and a worked example, are on the [SSO API](/enterprise/api/sso/) reference.

Admin actions are recorded as `sso.app_create`, `sso.app_update` and `sso.app_remove`; audit events as `sso.app_created`, `sso.app_updated`, `sso.app_removed`, `sso.saml_login` for every SAML login, and `sso.saml_logout`, `sso.saml_logout_unknown` and `sso.saml_logout_rejected` for single logout.
