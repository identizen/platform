---
title: SSO API
description: OIDC apps, SAML apps and the SAML identity-provider endpoints on a tenant index — every route with its role, body and response.
---

The routes behind the portal's **SSO** page and the SAML endpoints a service provider talks to. The tenant index is already an OpenID Connect provider; these routes let an administrator register the organization's own applications on it and let SAML-only applications sign in through the same phone approval. Authentication and roles are on the [overview](/enterprise/api/); the guide is [SSO into your apps](/enterprise/sso/).

## OIDC apps

An OIDC app is a site on the tenant index created by an administrator. The open index's registration logic is reused (the index registers the site with the tenant's registration token) and the app is then tracked in the organization's SSO list.

```ts
interface OidcApp {
  id: string; // app_…
  kind: 'oidc';
  name: string;
  status: 'active' | 'disabled';
  client_id: string;
  public: boolean; // true = no client secret, PKCE only
  rp_id: string;
  redirect_uris: string[];
  backchannel_logout_uri: string | null;
  release_profile: boolean; // members' email and name are added to id_token and userinfo
  workforce_only: boolean;
  verification: 'verified' | 'pending' | 'stale' | 'not_required';
  created_at: string;
}
```

| Method   | Path                 | Role                        | Body → Response                                                                                                                                                                                                                                                                                                                                                                                  |
| -------- | -------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET`    | `/orgs/sso/apps`     | any admin role (`org.read`) | `{ apps: (OidcApp \| SamlApp)[] }`                                                                                                                                                                                                                                                                                                                                                               |
| `POST`   | `/orgs/sso/oidc`     | admin+ (`org.write`)        | `{ name, rp_id, redirect_uris: string[], public?: boolean (default false), backchannel_logout_uri?, release_profile?: boolean (default true), workforce_only?: boolean (default policy.workforce_only_default) }` → `{ app: OidcApp, client_secret: string \| null }` (`201`). The secret is shown once. `409 quota_exceeded`                                                                    |
| `GET`    | `/orgs/sso/apps/:id` | any admin role (`org.read`) | `{ app }`, plus `{ idp: IdpFacts }` for a SAML app                                                                                                                                                                                                                                                                                                                                               |
| `PATCH`  | `/orgs/sso/apps/:id` | admin+ (`org.write`)        | OIDC: `{ name?, status?: 'active' \| 'disabled', release_profile?, workforce_only? }`; SAML: `{ name?, status?, acs_url?, entity_id?, name_id_format?, attributes?, sign_assertion?, slo_url?: string \| null, sp_certificate_pem?: string \| null, allow_unsigned_logout?: boolean }` (`null` clears `slo_url` / `sp_certificate_pem`; the certificate must parse, `400` otherwise) → `{ app }` |
| `DELETE` | `/orgs/sso/apps/:id` | admin+ (`org.write`)        | → `204`. OIDC: the site stays registered but disabled, logins refused with `app_disabled`; SAML: the app is removed                                                                                                                                                                                                                                                                              |

A disabled OIDC app refuses logins at challenge start with `403 app_disabled`. **Profile release**: when `release_profile` is true and the signed-in identity is an active member, the id_token and `/userinfo` carry `email` (the member's email as recorded by the organization), `name` (the display name when set) and `idz_role`. Nothing is released for non-members; the open index's claims never include an email otherwise.

## SAML identity provider

```ts
interface SamlApp {
  id: string; // app_…
  kind: 'saml';
  name: string;
  status: 'active' | 'disabled';
  entity_id: string; // the SP's entity id (Issuer in AuthnRequests)
  acs_url: string; // HTTPS AssertionConsumerService URL (HTTP-POST binding)
  name_id_format: 'emailAddress' | 'persistent'; // persistent = the member's stable id
  attributes: Record<string, 'email' | 'name' | 'role' | 'idz' | 'member_id'>; // SAML attribute name → source
  sign_assertion: boolean; // default true; the Response is always signed
  slo_url: string | null; // HTTPS SingleLogoutService of the SP (Redirect or POST binding); null = no single logout
  sp_certificate_pem: string | null; // the SP's X.509 signing certificate (PEM); signed requests are verified with it
  allow_unsigned_logout: boolean; // default false: opt-in to LogoutRequests without a verifiable signature
  created_at: string;
}

interface IdpFacts {
  entity_id: string; // https://{tenant}.index.identizen.com/saml/metadata
  sso_url: string; // https://{tenant}.index.identizen.com/saml/sso
  slo_url: string; // https://{tenant}.index.identizen.com/saml/slo
  metadata_url: string;
  certificate_pem: string; // the tenant's SAML signing certificate
  test_login_url: string; // IdP-initiated: /saml/sso?app=<id>
}
```

| Method        | Path             | Role / auth          | Body → Response                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------- | ---------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST`        | `/orgs/sso/saml` | admin+ (`org.write`) | `{ name, entity_id, acs_url, name_id_format?, attributes?, sign_assertion?, slo_url?, sp_certificate_pem?, allow_unsigned_logout? (default false) }` → `{ app: SamlApp, idp: IdpFacts }` (`201`). Default attributes `{ email: 'email', name: 'name', role: 'role' }`. `slo_url` must be HTTPS; `sp_certificate_pem` must parse as an X.509 certificate (`400` otherwise); both accept `null` for "unset". `409 quota_exceeded`                                                                                                                                                                                                                                                                                                                                                                                          |
| `GET`         | `/saml/metadata` | none                 | The tenant IdP's SAML metadata (XML), with the signing certificate; advertises `SingleLogoutService` (Redirect and POST) at `/saml/slo` when an app has an `slo_url`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `GET`, `POST` | `/saml/sso`      | none                 | SP-initiated: `SAMLRequest` (HTTP-Redirect, deflated) or POST binding, optional `RelayState`. IdP-initiated: `?app=<id>`. Starts an Identizen login and, after approval, posts a signed SAML Response to the app's ACS URL through an auto-submitting HTML form. Unknown app `404 app_not_found`, disabled `403 app_disabled`; an `AssertionConsumerServiceURL` that differs from the registered `acs_url` `400 acs_mismatch`; a signed request whose signature does not verify with `sp_certificate_pem` `400 bad_signature` (unsigned requests are accepted)                                                                                                                                                                                                                                                           |
| `GET`         | `/saml/callback` | none                 | Internal: where the Identizen login returns before the Response is posted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `GET`, `POST` | `/saml/slo`      | none                 | SP-initiated single logout: a `LogoutRequest` by HTTP-Redirect (deflated `SAMLRequest`, optional `RelayState`) or HTTP-POST (form). Revokes every session of the named member and answers with a signed `LogoutResponse` (`InResponseTo` = the request ID, Status Success) delivered to the app's `slo_url` by the binding the request used: Redirect → `302` with deflated `SAMLResponse`, `RelayState`, `SigAlg` and `Signature` (RSA-SHA256 over `SAMLResponse[&RelayState]&SigAlg`); POST → auto-submitting form. Unknown issuer `404 app_not_found`; app without `slo_url` `404 slo_not_configured`; disabled app `403 app_disabled`; no `ID` or `NameID` `400 invalid_saml_request`; unsigned request without `allow_unsigned_logout` `400 signature_required`; signature that does not verify `400 bad_signature` |

Who may use SAML SSO: **active members only**, since a SAML app is a workforce app by definition; anyone else is refused with `workforce_only`. The login itself is the tenant's normal phone approval and every [policy rule](/enterprise/api/policy/#how-the-policy-acts-on-the-login-path) applies. The assertion is valid for 5 minutes and is bound to the request id when there is one. Both SAML endpoints are rate limited per IP.

Signing: each tenant has a SAML signing key and a self-signed certificate created by Identizen at provisioning (`GET /orgs/status` reports `index.saml: 'provisioned' | 'missing'`). The certificate is what the SP must trust; it is in `IdpFacts.certificate_pem` and inside the metadata.

### Single logout

SP-initiated only. When an app has an `slo_url`, the metadata advertises `SingleLogoutService` for the HTTP-Redirect and HTTP-POST bindings at `/saml/slo`. A `LogoutRequest` names the member by `NameID`, read the way the app's `name_id_format` defines it (`emailAddress` → the member's email, `persistent` → the member id). Every session of that member's identity is revoked, OIDC apps with a `backchannel_logout_uri` receive their back-channel logout, and the event is audited as `sso.saml_logout` (`app_id`, `member_id`, `request_id`, `sessions_revoked`). A `NameID` that matches no active member still receives a Success `LogoutResponse` (the profile forbids revealing whether a principal exists) and is audited as `sso.saml_logout_unknown` (`app_id`, `request_id`, `name_id`, `name_id_format`). The `LogoutResponse` is always signed with the tenant's SAML key; the app should verify it with the certificate in the metadata.

**Signed logout is the default.** A `LogoutRequest` must carry a signature that verifies with the app's `sp_certificate_pem` (HTTP-Redirect: `SigAlg` + `Signature` over `SAMLRequest[&RelayState]&SigAlg`; HTTP-POST: an enveloped XML signature). Without a signature the request is refused with `400 signature_required`; with one that does not verify, `400 bad_signature`; both are audited as `sso.saml_logout_rejected` (`app_id`, `request_id`, `reason`). An app can only use single logout without a certificate when it was created or patched with `allow_unsigned_logout: true`. That is an explicit opt-in and it means exactly this: anyone who knows a member's email (or member id, for `persistent`) and the app's entity id can end that member's sessions. With the opt-in and a certificate, a present signature is still verified. `AuthnRequest`s stay accepted unsigned; when a certificate is configured a signed one is verified and refused with `bad_signature` if it does not verify (most SPs sign only when configured to, so a missing signature is not an error).

Not in scope: IdP-initiated logout. The index does not send `LogoutRequest`s to SPs when a member is suspended, deprovisioned, or signs out elsewhere; SPs learn of that through their own session lifetime, or through OIDC back-channel logout where they are OIDC apps.

### XML handling

Every SAML message is checked before any XML parser sees it. The endpoints answer `413 saml_request_too_large` for a request body, query string or `SAMLRequest` parameter over 64 KiB and for a deflated (Redirect binding) message that would inflate past 256 KiB. They answer `400 saml_xml_rejected` for any markup declaration (`<!DOCTYPE`, `<!ENTITY`, `<!ELEMENT`, and so on, so XXE and entity-expansion payloads never reach a parser), for entity references other than the five predefined ones and character references, for parameter entities, for malformed XML (including a duplicated `ID` attribute), for more than one `Issuer` or `NameID` element, for a nested `AuthnRequest`/`LogoutRequest`, and for an `Issuer`/`NameID` that contains child elements. `Issuer`, `ID`, `AssertionConsumerServiceURL` and `NameID` are read from the document element with a namespace-aware DOM parser, so comment tricks such as `<Issuer>https://good<!--x-->.example</Issuer>` resolve to the literal text.

## Audit and admin actions

Audit kinds: `sso.app_created`, `sso.app_updated`, `sso.app_removed`, `sso.saml_login` for every SAML login, and `sso.saml_logout`, `sso.saml_logout_unknown`, `sso.saml_logout_rejected` for single logout. Admin actions: `sso.app_create`, `sso.app_update`, `sso.app_remove`.

## Example: register a confidential OIDC app

```bash
curl -sS -X POST https://acme.index.identizen.com/orgs/sso/oidc \
  -H "Authorization: Bearer $IDZ_PORTAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Wiki",
    "rp_id": "wiki.example.com",
    "redirect_uris": ["https://wiki.example.com/auth/callback"],
    "backchannel_logout_uri": "https://wiki.example.com/auth/backchannel-logout",
    "workforce_only": true
  }'
```

```json
{
  "app": {
    "id": "app_01K4C9…",
    "kind": "oidc",
    "name": "Wiki",
    "status": "active",
    "client_id": "idz_live_…",
    "public": false,
    "rp_id": "wiki.example.com",
    "redirect_uris": ["https://wiki.example.com/auth/callback"],
    "backchannel_logout_uri": "https://wiki.example.com/auth/backchannel-logout",
    "release_profile": true,
    "workforce_only": true,
    "verification": "pending",
    "created_at": "2026-09-07T09:31:18.771Z"
  },
  "client_secret": "…"
}
```

The app is a normal relying party from here: point it at the tenant issuer with this `client_id` and secret ([Point everything at your issuer](/enterprise/cloud-setup/#point-everything-at-your-issuer)) and verify `wiki.example.com` before the first login.
