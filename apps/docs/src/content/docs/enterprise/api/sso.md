---
title: SSO API
description: OIDC apps, SAML apps and the SAML identity-provider endpoints on a tenant index — every route with its role, body and response.
---

The routes behind the portal's **SSO** page and the SAML endpoints a service provider talks to. The tenant index is already an OpenID Connect provider; these routes let an administrator register the organisation's own applications on it and let SAML-only applications sign in through the same phone approval. Authentication and roles are on the [overview](/enterprise/api/); the guide is [SSO into your apps](/enterprise/sso/).

## OIDC apps

An OIDC app is a site on the tenant index created by an administrator. The open index's registration logic is reused (the index registers the site with the tenant's registration token) and the app is then tracked in the organisation's SSO list.

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

| Method   | Path                 | Role                        | Body → Response                                                                                                                                                                                                                                                                                                               |
| -------- | -------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/orgs/sso/apps`     | any admin role (`org.read`) | `{ apps: (OidcApp \| SamlApp)[] }`                                                                                                                                                                                                                                                                                            |
| `POST`   | `/orgs/sso/oidc`     | admin+ (`org.write`)        | `{ name, rp_id, redirect_uris: string[], public?: boolean (default false), backchannel_logout_uri?, release_profile?: boolean (default true), workforce_only?: boolean (default policy.workforce_only_default) }` → `{ app: OidcApp, client_secret: string \| null }` (`201`). The secret is shown once. `409 quota_exceeded` |
| `GET`    | `/orgs/sso/apps/:id` | any admin role (`org.read`) | `{ app }`, plus `{ idp: IdpFacts }` for a SAML app                                                                                                                                                                                                                                                                            |
| `PATCH`  | `/orgs/sso/apps/:id` | admin+ (`org.write`)        | OIDC: `{ name?, status?: 'active' \| 'disabled', release_profile?, workforce_only? }`; SAML: `{ name?, status?, acs_url?, entity_id?, name_id_format?, attributes?, sign_assertion? }` → `{ app }`                                                                                                                            |
| `DELETE` | `/orgs/sso/apps/:id` | admin+ (`org.write`)        | → `204`. OIDC: the site stays registered but disabled, logins refused with `app_disabled`; SAML: the app is removed                                                                                                                                                                                                           |

A disabled OIDC app refuses logins at challenge start with `403 app_disabled`. **Profile release**: when `release_profile` is true and the signed-in identity is an active member, the id_token and `/userinfo` carry `email` (the member's email as recorded by the organisation), `name` (the display name when set) and `idz_role`. Nothing is released for non-members; the open index's claims never include an email otherwise.

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
  created_at: string;
}

interface IdpFacts {
  entity_id: string; // https://{tenant}.index.identizen.com/saml/metadata
  sso_url: string; // https://{tenant}.index.identizen.com/saml/sso
  metadata_url: string;
  certificate_pem: string; // the tenant's SAML signing certificate
  test_login_url: string; // IdP-initiated: /saml/sso?app=<id>
}
```

| Method        | Path             | Role / auth          | Body → Response                                                                                                                                                                                                                                                                                                               |
| ------------- | ---------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST`        | `/orgs/sso/saml` | admin+ (`org.write`) | `{ name, entity_id, acs_url, name_id_format?, attributes?, sign_assertion? }` → `{ app: SamlApp, idp: IdpFacts }` (`201`). Default attributes `{ email: 'email', name: 'name', role: 'role' }`. `409 quota_exceeded`                                                                                                          |
| `GET`         | `/saml/metadata` | none                 | The tenant IdP's SAML metadata (XML), with the signing certificate                                                                                                                                                                                                                                                            |
| `GET`, `POST` | `/saml/sso`      | none                 | SP-initiated: `SAMLRequest` (HTTP-Redirect, deflated) or POST binding, optional `RelayState`. IdP-initiated: `?app=<id>`. Starts an Identizen login and, after approval, posts a signed SAML Response to the app's ACS URL through an auto-submitting HTML form. Unknown app `404 app_not_found`, disabled `403 app_disabled` |
| `GET`         | `/saml/callback` | none                 | Internal: where the Identizen login returns before the Response is posted                                                                                                                                                                                                                                                     |

Who may use SAML SSO: **active members only**, since a SAML app is a workforce app by definition; anyone else is refused with `workforce_only`. The login itself is the tenant's normal phone approval and every [policy rule](/enterprise/api/policy/#how-the-policy-acts-on-the-login-path) applies. The assertion is valid for 5 minutes and is bound to the request id when there is one. **Single logout is not implemented**: there is no `/saml/slo` endpoint and no LogoutRequest is sent when a session ends; revoking a session ends the Identizen session and back-channel logout reaches OIDC apps only.

Signing: each tenant has a SAML signing key and a self-signed certificate created by Identizen at provisioning (`GET /orgs/status` reports `index.saml: 'provisioned' | 'missing'`). The certificate is what the SP must trust; it is in `IdpFacts.certificate_pem` and inside the metadata.

## Audit and admin actions

Audit kinds: `sso.app_created`, `sso.app_updated`, `sso.app_removed`, and `sso.saml_login` for every SAML login. Admin actions: `sso.app_create`, `sso.app_update`, `sso.app_remove`.

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
