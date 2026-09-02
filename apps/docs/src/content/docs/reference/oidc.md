---
title: OIDC
description: The index as an OpenID Provider — discovery, endpoints, PKCE, id_token claims, step-up, enrollment, and back-channel logout.
---

The index is a standard OpenID Provider implementing the Authorization Code flow with PKCE (S256, required for every client). Any OIDC library works; the specifics below are what makes Identizen different from a password IdP.

## Discovery

`GET /.well-known/openid-configuration` returns, among the standard fields:

| Field                                                                       | Value                                                                |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `issuer`                                                                    | the index URL                                                        |
| `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, `jwks_uri` | `/authorize`, `/token`, `/userinfo`, `/.well-known/jwks.json`        |
| `response_types_supported`                                                  | `["code"]`                                                           |
| `grant_types_supported`                                                     | `["authorization_code"]` (no refresh tokens in v1)                   |
| `subject_types_supported`                                                   | `["pairwise"]` — `sub` is per site                                   |
| `id_token_signing_alg_values_supported`                                     | `["ES256"]`                                                          |
| `scopes_supported`                                                          | `["openid", "handle"]`                                               |
| `token_endpoint_auth_methods_supported`                                     | `client_secret_basic`, `client_secret_post`, `none` (public clients) |
| `code_challenge_methods_supported`                                          | `["S256"]`                                                           |
| `acr_values_supported`                                                      | `["idz:login", "idz:mfa"]`                                           |
| `backchannel_logout_supported` / `backchannel_logout_session_supported`     | `true`                                                               |

`request`, `request_uri`, and the `claims` parameter are not supported.

## `GET /authorize`

Required: `response_type=code`, `client_id`, a registered `redirect_uri` (exact match), `scope` containing `openid`, `code_challenge` + `code_challenge_method=S256`. Recommended: `state`, `nonce`.

Optional Identizen parameters:

| Parameter                                 | Effect                                                                                                         |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `acr_values=idz:mfa` + `login_hint=<sub>` | Step-up: push straight to the device bound to `sub`. Without a binding the response is `error=login_required`. |
| `login_hint=<sub>` alone                  | Repeat login pushed to the bound device (still `acr: idz:login`).                                              |
| `prompt=enroll`                           | Enrollment: normal discovery; the resulting `sub` is the binding the site should store.                        |
| `prompt=none`                             | Always `error=interaction_required` — approval on the phone is mandatory.                                      |
| `scope=openid handle`                     | Releases `idz_handle` when the user has set one.                                                               |

Validation errors with a valid `redirect_uri` are returned as OIDC error redirects (`invalid_request`, `unsupported_response_type`, `invalid_scope`, `login_required`, `interaction_required`); an unknown client or unregistered `redirect_uri` is a `400` page. On success the index renders the hosted login page (match code, QR or "check your phone", WebSocket to the session) and, after approval, redirects to `redirect_uri?code=…&state=…`. The code is single-use, bound to the client, and lives as long as the challenge session.

## `POST /token`

`application/x-www-form-urlencoded` with `grant_type=authorization_code`, `code`, `redirect_uri`, `code_verifier`, and client authentication: `client_id` + `client_secret` in the body, HTTP Basic, or `client_id` alone for public clients. Errors follow RFC 6749 (`invalid_client` 401, `invalid_grant` 400 for a used/unknown code, redirect mismatch, or failed PKCE, `unsupported_grant_type`).

```json
{
  "access_token": "<JWT, typ at+jwt, 1 hour>",
  "token_type": "Bearer",
  "expires_in": 3600,
  "id_token": "<JWT, ES256, 1 hour>",
  "scope": "openid handle"
}
```

## id_token claims

Exactly these claims are issued; there is never an `email`.

| Claim        | Value                                                                                 |
| ------------ | ------------------------------------------------------------------------------------- |
| `iss`        | index URL                                                                             |
| `sub`        | per-site identifier: `base64url(SHA-256(per-site public key))[0:32]`                  |
| `aud`        | your `client_id`                                                                      |
| `iat`, `exp` | issued-at and expiry (60 minutes)                                                     |
| `nonce`      | echoed when sent                                                                      |
| `sid`        | Identizen session id; back-channel logout refers to it                                |
| `amr`        | authentication methods from the phone, e.g. `["face","hwk"]`, `["fingerprint","hwk"]` |
| `acr`        | `idz:login` or `idz:mfa`                                                              |
| `at_hash`    | left-most 128 bits of SHA-256 of the access token, base64url                          |
| `idz_device` | opaque device id (`dev_…`) for your own session/device UI                             |
| `idz_handle` | the user's handle — only with the `handle` scope and only if the user set one         |
| `idz_org`    | organisation id for org identities (absent for personal)                              |

Verify with the JWKS at `/.well-known/jwks.json`; two ES256 keys are published so rotation never breaks verification.

## `GET /userinfo`

`Authorization: Bearer <access_token>`. Returns `sub`, `idz_device`, `idz_handle` (with the `handle` scope), `idz_org`. Returns `401 invalid_token` once the session has been revoked, so it doubles as a liveness check.

## Sessions and back-channel logout

Every code exchange creates an Identizen session (`sid`, 30 days). The user can end it from the app or the dashboard; revoking a device ends all of its sessions. In both cases the index POSTs a logout token to the site's registered `backchannel_logout_uri`:

```http
POST /your/backchannel-logout
Content-Type: application/x-www-form-urlencoded

logout_token=<JWT>
```

The token is signed with the index keys, `typ: logout+jwt`, `iss` = index URL, `aud` = `client_id`, `sub` = the user's per-site `sub`, `sid` = the session to end, `jti` unique, `events` = `{"http://schemas.openid.net/event/backchannel-logout": {}}`, no `nonce`, 2-minute expiry. Respond `200` quickly; delivery retries three times on failures. `@identizen/sdk/server` verifies it with `verifyLogoutToken(token)`.

## Site registration

Sites are registered with `POST /sites` (the CLI does this):

```json
{
  "name": "Acme",
  "rp_id": "app.example.com",
  "redirect_uris": ["https://app.example.com/api/auth/callback"],
  "backchannel_logout_uri": "https://app.example.com/api/auth/backchannel-logout",
  "webhook_url": null,
  "public": false,
  "environment": "live"
}
```

The response includes `client_id` (`idz_live_…` or `idz_test_…`), `client_secret` (once; `null` for public clients), and `webhook_secret` when a webhook URL was given. `rp_id` is the host inside every challenge the phone signs; it must be the origin your users see. Hosted indexes may require `Authorization: Bearer <registration token>`; self-hosted indexes open registration with `OPEN_SITE_REGISTRATION=true`. `GET`/`PATCH /sites/:client_id` (bearer = client secret) read and update the site, including secret rotation.
