---
title: OIDC conformance
description: Which sections of OpenID Connect Core, Discovery, Back-Channel Logout, RFC 6749, RFC 6750, RFC 7517 and RFC 7636 the index is tested against, the deliberate deviations, and how to run the OpenID Foundation conformance suite locally.
tableOfContents:
  maxHeadingLevel: 3
---

The index ships a specification-derived conformance suite in `apps/index/test/oidc-conformance-*.test.ts`. Every test is named after the section of the specification it checks and runs a real authorization code flow against the Worker (the phone side is driven in-process by the test helpers, so no browser or app is involved). It runs as part of `npm run test:unit -w @identizen/index` and therefore of `npm run gate`, as its own vitest invocation after the rest of the index suite: the Workers test pool reloads the worker per test file, and a single run that lasts longer than the five-minute challenge-session retention trips its Durable Object wrapper when the wipe alarms fire, so the two halves each stay well under that.

This page is **not** an OpenID Certification. It documents what the automated suite checks, how the OpenID Foundation's own suite is run against the index unattended, and what that run reports; see [Running the OpenID Foundation conformance suite](#running-the-openid-foundation-conformance-suite) and the [results](#results).

Specifications referenced:

- **Core** — [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)
- **Discovery** — [OpenID Connect Discovery 1.0](https://openid.net/specs/openid-connect-discovery-1_0.html)
- **Back-Channel** — [OpenID Connect Back-Channel Logout 1.0](https://openid.net/specs/openid-connect-backchannel-1_0.html)
- **RFC 6749** — [The OAuth 2.0 Authorization Framework](https://www.rfc-editor.org/rfc/rfc6749)
- **RFC 6750** — [Bearer Token Usage](https://www.rfc-editor.org/rfc/rfc6750)
- **RFC 7517** — [JSON Web Key (JWK)](https://www.rfc-editor.org/rfc/rfc7517)
- **RFC 7636** — [PKCE](https://www.rfc-editor.org/rfc/rfc7636)
- **RFC 8414** — [OAuth 2.0 Authorization Server Metadata](https://www.rfc-editor.org/rfc/rfc8414)
- **RFC 9068** — [JWT Profile for OAuth 2.0 Access Tokens](https://www.rfc-editor.org/rfc/rfc9068)

## Coverage

One row per test; the first column is the section the test is named after, the second is the rest of the test name. The table is derived from the `it(...)` names in the three files, so a test rename should be mirrored here.

### `oidc-conformance-discovery.test.ts`

| Section                      | Check                                                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Discovery §3 / RFC 8414 §2   | issuer equals INDEX_URL with no trailing slash and every REQUIRED field is present with a valid value      |
| Discovery §4.2               | the document is served as application/json with status 200                                                 |
| Discovery §3                 | the advertised endpoints are the ones that answer                                                          |
| Discovery §3                 | response_types_supported is honored and unadvertised response types are rejected                           |
| Discovery §3                 | grant_types_supported is honored and unadvertised grants are rejected with unsupported_grant_type          |
| Discovery §3                 | code_challenge_methods_supported is honored (S256) and plain or missing methods are rejected               |
| Discovery §3                 | token_endpoint_auth_methods_supported — basic, post and none each work; an unadvertised method is rejected |
| Discovery §3                 | id_token_signing_alg_values_supported matches the id_token header                                          |
| Discovery §3                 | subject_types_supported is pairwise — sub differs between two sites                                        |
| Discovery §3 / RFC 6749 §3.3 | every advertised scope is honored; unadvertised scopes are ignored and absent from the granted scope       |
| Discovery §3                 | claims_supported covers every claim the id_token and userinfo carry                                        |
| Discovery §3                 | jwks_uri serves the key that signed the id_token                                                           |
| RFC 7517 §4                  | every key has kty, kid, alg and use=sig, no private members, and kids are unique                           |
| RFC 7517 §4.5                | the id_token header kid is present in the set                                                              |
| RFC 6749 §5.2                | every error body is JSON with string error and error_description at the documented status                  |
| Core §3.1.2.6                | authorization error redirects carry error, error_description and state                                     |
| Threat model                 | the login page is served no-store with X-Frame-Options DENY                                                |
| CORS                         | /token and /userinfo reflect the request Origin (index behavior, not a spec requirement)                   |
| RFC 9068 §2                  | the access token is a JWT with typ at+jwt, distinct from the id_token, carrying sid and client_id          |

### `oidc-conformance-authorize.test.ts`

| Section                       | Check                                                                                                                                                           |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core §3.1.2.1                 | GET and POST (form body) are both accepted and complete the code flow                                                                                           |
| Core §3.1.2.4                 | a missing or unknown client_id yields an error response without redirecting                                                                                     |
| Core §3.1.2.1 / §3.1.2.4      | an unregistered, mismatched or missing redirect_uri yields an error response without redirecting                                                                |
| Core §3.1.2.6                 | with a valid redirect_uri every other error redirects with error, error_description and the original state                                                      |
| Core §3.1.2.2                 | response_type other than code is unsupported_response_type; a missing response_type is invalid_request                                                          |
| Core §3.1.2.2                 | scope without openid is rejected with invalid_scope (the spec allows invalid_scope or invalid_request)                                                          |
| Core §3.1.2.2                 | a missing or empty scope is rejected with invalid_scope                                                                                                         |
| Core §3.1.2.1 / §3.1.3.3      | nonce is carried into the id_token unchanged and omitted when not sent                                                                                          |
| RFC 6749 §4.1.2               | state is echoed exactly on success and error redirects, including URL-unsafe characters                                                                         |
| Core §3.1.2.6                 | prompt=none yields interaction_required with state (a phone approval is always required)                                                                        |
| Core §3.1.2.1                 | prompt=none combined with another value is invalid_request                                                                                                      |
| Core §3.1.2.1                 | prompt=login, consent and select_account (alone or combined) do not error                                                                                       |
| Core §3.1.2.1                 | an unknown prompt value is carried through without error (index behavior; the spec defines no error for it)                                                     |
| Core §6.1 / §3.1.2.6          | request yields request_not_supported and request_uri yields request_uri_not_supported, matching discovery                                                       |
| Core §7.2.1                   | the registration parameter is ignored — it is defined only for Self-Issued OPs, so registration_not_supported does not apply                                    |
| Core §3.1.2.1                 | display, ui_locales, claims_locales, max_age, id_token_hint and acr_values do not break a valid request                                                         |
| Core §3.1.2.1                 | login_hint with a bound sub is honored; an unbound sub yields login_required (Identizen reads login_hint as the per-site sub)                                   |
| Core §2 / §3.1.2.1            | auth_time is present in the id_token when max_age was requested, and is the time of the phone approval                                                          |
| RFC 7636 §4.3                 | code_challenge is required and code_challenge_method must be S256 (plain and missing are rejected; discovery agrees)                                            |
| RFC 7636 §4.2                 | a code_challenge outside 43–128 unreserved characters is rejected                                                                                               |
| Core §3.1.2.1                 | acr_values=idz:mfa without login_hint is invalid_request (Identizen step-up needs the bound sub)                                                                |
| RFC 7636 §4.3 (policy switch) | PKCE is required for every client unless `OIDC_PKCE_OPTIONAL=true`, which relaxes it for confidential clients only; the test environment runs with it mandatory |
| Core §5.5.1.1                 | acr_values listing idz:login and idz:mfa without login_hint proceeds as a login and the id_token says acr=idz:login                                             |

### `oidc-conformance-token.test.ts`

| Section                                       | Check                                                                                                                             |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| RFC 6749 §4.1.3 / §5.2                        | grant_type must be authorization_code — other values are unsupported_grant_type and a missing one is invalid_request              |
| RFC 6749 §4.1.2 / §10.5                       | the code is single use; the second exchange fails with invalid_grant                                                              |
| RFC 6749 §4.1.3                               | redirect_uri must match the authorization request exactly                                                                         |
| RFC 7636 §4.6                                 | a wrong code_verifier is invalid_grant, a missing one is invalid_request, and only the S256 pre-image is accepted                 |
| RFC 6749 §4.1.3 / §10.5                       | a code issued to client A cannot be redeemed by client B                                                                          |
| RFC 6749 §2.3.1                               | client_secret_basic (form-urlencoded credentials) and client_secret_post are both accepted                                        |
| RFC 6749 §5.2                                 | a wrong secret is 401 invalid_client, with WWW-Authenticate when the client used the Authorization header                         |
| RFC 6749 §2.3.1                               | malformed Basic credentials are 401 invalid_client, not a server error                                                            |
| RFC 6749 §2.1 / §4.1.3                        | a public client exchanges with PKCE only and a confidential client cannot omit its secret                                         |
| RFC 6749 §5.1 / Core §3.1.3.3                 | the success response has token_type Bearer, access_token, id_token, expires_in, Cache-Control no-store and Pragma no-cache        |
| RFC 6749 §6 / Discovery grant_types_supported | no refresh_token is issued and the refresh_token grant is unsupported                                                             |
| RFC 6749 §4.1.2                               | a code older than the five-minute redemption window is invalid_grant                                                              |
| Core §3.1.3.7 / §2                            | header alg is ES256 with a kid from the JWKS and the signature verifies against jwks_uri                                          |
| Core §2                                       | iss, aud, exp, iat and nonce are exact; exp - iat is the documented lifetime and iat is now                                       |
| Core §3.3.2.11 / §3.1.3.6                     | at_hash is base64url of the left-most 128 bits of SHA-256(access_token)                                                           |
| Core §2 / §8                                  | sub is at most 255 ASCII characters, stable per site and pairwise across sites                                                    |
| Core §2                                       | sid, acr idz:login and a non-empty amr are present; no profile claims, no azp, nothing outside the documented list                |
| Core §5.4                                     | idz_handle is released only with the handle scope and only when the user set one                                                  |
| Core §5.3.1                                   | GET and POST with Authorization: Bearer both return application/json                                                              |
| Core §5.3.2                                   | sub equals the id_token sub and no claims beyond the documented set are returned                                                  |
| RFC 6750 §3 / §3.1                            | a missing token is 401 with a WWW-Authenticate: Bearer challenge carrying no error code                                           |
| RFC 6750 §3.1                                 | a malformed, revoked, foreign or id_token bearer is 401 with error="invalid_token"                                                |
| Core §5.3.2 / §5.4                            | scope-based claim release at userinfo mirrors the id_token                                                                        |
| Back-Channel §2.4                             | the logout token has typ logout+jwt, iss, aud, iat, exp, a unique jti, sid, the logout event and no nonce, signed with a JWKS key |
| Back-Channel §2.6                             | the token is POSTed as application/x-www-form-urlencoded with logout_token                                                        |
| Back-Channel §2 / Discovery                   | backchannel_logout_supported and backchannel_logout_session_supported are advertised and honored                                  |
| RFC 6750 §2.2                                 | `POST /userinfo` accepts `access_token` in an `application/x-www-form-urlencoded` body                                            |
| RFC 6750 §2.3                                 | a token in the query string is ignored and the request is 401                                                                     |
| RFC 6749 §4.1.2                               | presenting a code a second time revokes the session the first exchange created                                                    |

## Deliberate deviations

Where the index departs from what a generic OpenID Provider would do, it does so on purpose. Each item says what the specification allows or expects, what the index does, and why.

| Behavior                                                                                                                                                                      | Reason                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PKCE (`code_challenge_method=S256`) is required on every authorization request (RFC 7636 makes it optional; Core has none).                                                   | The code travels through a redirect and a hosted page; binding it to the client's verifier is what stops interception, and public clients have no other proof of possession. A self-hosted index can set `OIDC_PKCE_OPTIONAL=true` to let confidential clients omit it, which the OIDF Basic plan needs — see [below](#running-the-openid-foundation-conformance-suite).            |
| A request within `max_age` still re-authenticates: the second id_token has a newer `auth_time` (Core §3.1.2.1 lets the OP re-authenticate; the OIDF suite expects it not to). | Same reason: no session at the index, so there is nothing to reuse. `auth_time` is always the time of the phone approval, which is what a `max_age` check needs.                                                                                                                                                                                                                    |
| `prompt=none` is always `interaction_required` (Core §3.1.2.6).                                                                                                               | There is no browser session at the index: every login is an approval on the phone. A silent re-authentication cannot succeed.                                                                                                                                                                                                                                                       |
| No refresh tokens; `grant_types_supported` is `["authorization_code"]` only (RFC 6749 §6).                                                                                    | The site's session is the Identizen session (`sid`, 30 days); liveness is `GET /userinfo`, and revocation arrives by back-channel logout. Adding refresh tokens is a design change and is not planned for v1.                                                                                                                                                                       |
| No request objects: `request` → `request_not_supported`, `request_uri` → `request_uri_not_supported` (Core §6).                                                               | Discovery says `request_parameter_supported: false`; a request object could carry parameters that differ from the query, so it is rejected rather than ignored.                                                                                                                                                                                                                     |
| No `claims` parameter (`claims_parameter_supported: false`, Core §5.5).                                                                                                       | The claim set is fixed and documented; there is no per-request negotiation.                                                                                                                                                                                                                                                                                                         |
| `login_hint` is the per-site `sub`; any other value gives `login_required` (Core §3.1.2.1 leaves the format open).                                                            | The index has no e-mail or username to match a hint against. A bound `sub` routes the push to the right phone; anything else cannot.                                                                                                                                                                                                                                                |
| `acr_values` is voluntary: unknown values are ignored and the id_token carries the `acr` achieved (Core §5.5.1.1). `idz:mfa` alone without `login_hint` is `invalid_request`. | `idz:mfa` is honored when `login_hint` names the bound `sub` (the index needs it to know which phone to push to). A request listing both `idz:login` and `idz:mfa` without a hint proceeds as a login at `idz:login`; a request for `idz:mfa` alone without a hint is a site bug and is refused rather than silently downgraded. Sites must check `acr` in the id_token either way. |
| Unknown scopes are ignored, not rejected (RFC 6749 §3.3 allows either); the token response `scope` is the grant.                                                              | Libraries routinely ask for `profile email`; failing those requests would break integrations for no gain. The response never claims a scope it did not grant.                                                                                                                                                                                                                       |
| `registration` (Core §7.2.1) and unknown `prompt` values are ignored.                                                                                                         | `registration` exists only for Self-Issued OPs. The spec defines no error for unknown `prompt` values; `prompt=enroll` is an Identizen extension.                                                                                                                                                                                                                                   |
| The bearer token is accepted in the `Authorization` header (RFC 6750 §2.1) or, on POST, in the form body (§2.2); never in the query string (§2.3).                            | A token in a URL ends up in logs and referrers; the RFC discourages it and the index does not serve it.                                                                                                                                                                                                                                                                             |
| `claims_supported` does not list `at_hash`.                                                                                                                                   | Discovery §3 says the list need not be exhaustive; `at_hash` is an id_token integrity claim, not an end-user claim.                                                                                                                                                                                                                                                                 |
| CORS reflects any `Origin` on every route, including `/token` and `/userinfo`.                                                                                                | Public (PKCE-only) clients in the browser call `/token` directly. This is index behavior, not a specification requirement; the suite documents it rather than requiring it.                                                                                                                                                                                                         |

## Running the OpenID Foundation conformance suite

The automated suite above checks the normative text it was written from. The OpenID Foundation's [conformance suite](https://gitlab.com/openid/conformance-suite) is the reference implementation of the certification tests and runs locally in Docker against a local index. The plan to use is **`oidcc-basic-certification-test-plan`** (Basic OP profile: `response_type=code`). The procedure below is what produced the [results](#results) at the end of this page; it runs unattended.

**How the phone approval is automated.** Every Identizen login needs a phone approval, and the suite drives a headless browser (HtmlUnit) that cannot run the hosted login page's JavaScript. So the index is started with `APP_URL` pointing at the [fake phone](/testing/), which makes the "Open in Identizen" link on the login page open the phone's `GET /l/:id` route. That route does what a tap on a real phone does: it fetches and verifies the challenge, approves it (policy `approve`), waits for the index to resolve the login, and redirects the browser to the site's callback. The suite's `browser` configuration clicks that link.

**PKCE.** The Basic plan is written against OpenID Connect Core, which predates PKCE: of its 35 modules only `oidcc-ensure-request-with-valid-pkce-succeeds` sends `code_challenge`. The index requires S256 for every client, so the plan is run with `OIDC_PKCE_OPTIONAL=true`, which lets a confidential client omit PKCE. That switch exists for this purpose; the hosted index does not set it and the [production checklist](/self-hosting-production/) says to leave it unset. Public clients need PKCE regardless of the switch.

### 1. Start a local index and the fake phone

The index must be reachable from the suite's containers, and the `issuer` in discovery must equal the URL the suite fetches, so the Worker runs with `host.docker.internal` as its `INDEX_URL`. Give it a database of its own: a vitest run against the same Postgres truncates the default one.

```bash
docker compose up -d postgres
docker exec identizen-postgres-1 psql -U identizen -d identizen -c 'create database identizen_conf'
cd apps/index
DATABASE_URL=postgres://identizen:identizen@localhost:5433/identizen_conf node --import tsx test/reset-db.ts
WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgres://identizen:identizen@localhost:5433/identizen_conf \
  npx wrangler dev --env e2e --port 8787 \
  --var INDEX_URL:http://host.docker.internal:8787 \
  --var APP_URL:http://host.docker.internal:4400 \
  --var OIDC_PKCE_OPTIONAL:true
```

In a second terminal, a fake phone that the suite's browser can reach. `--host 0.0.0.0` binds it for the container; `--issuer` tells it the name the index uses for itself in its challenges, because `host.docker.internal` does not resolve on the host and the phone reaches the index at `localhost`.

```bash
npx identizen-fake-phone --index http://localhost:8787 --issuer http://host.docker.internal:8787 \
  --port 4400 --host 0.0.0.0 --url http://localhost:4400 --policy approve
```

Wait for `registered device …` in its output before starting the plan.

### 2. Register two clients for the suite

```bash
for n in client1 client2; do
  curl -s http://localhost:8787/sites -H 'content-type: application/json' -d "{
    \"name\": \"$n\",
    \"rp_id\": \"$n.localhost.emobix.co.uk\",
    \"redirect_uris\": [
      \"https://localhost.emobix.co.uk:8443/test/a/identizen/callback\",
      \"https://localhost.emobix.co.uk:8443/test/a/identizen/callback?dummy1=lorem&dummy2=ipsum\"
    ]
  }"; echo
done
```

Keep both `client_id`/`client_secret` pairs. The suite runs on `https://localhost.emobix.co.uk:8443`; `/test/a/<alias>/callback` is its redirect URI for the alias you choose, and the second URI with `dummy1`/`dummy2` is what its "redirect URI with query" module uses.

### 3. Run the plan

```bash
git -c core.longpaths=true clone https://gitlab.com/openid/conformance-suite.git
cd conformance-suite
docker compose -f docker-compose-prebuilt.yml up -d
python -m venv .venv && .venv/bin/pip install -r scripts/requirements.txt
```

Write `identizen-config.json` with the two clients and the browser automation:

```json
{
  "alias": "identizen",
  "server": {
    "discoveryUrl": "http://host.docker.internal:8787/.well-known/openid-configuration"
  },
  "client": { "client_id": "…", "client_secret": "…", "scope": "openid" },
  "client_secret_post": { "client_id": "…", "client_secret": "…", "scope": "openid" },
  "client2": { "client_id": "…", "client_secret": "…", "scope": "openid" },
  "browser": [
    {
      "match": "http://host.docker.internal:8787/authorize*",
      "tasks": [
        {
          "task": "Open the deep link on the fake phone",
          "optional": true,
          "match": "http://host.docker.internal:8787/authorize*",
          "commands": [
            ["click", "xpath", "//a[contains(@href,'/l/')]"],
            ["wait", "contains", "callback", 60]
          ]
        },
        {
          "task": "Verify Complete",
          "match": "*/test/*/callback*",
          "commands": [["wait", "id", "submission_complete", 10]]
        }
      ]
    }
  ]
}
```

The first task is `optional` because the modules that expect the index to refuse (a missing `response_type`, `prompt=none`) are answered with an error redirect before any page renders. Then:

```bash
CONFORMANCE_SERVER=https://localhost.emobix.co.uk:8443/ CONFORMANCE_DEV_MODE=1 \
  .venv/bin/python scripts/run-test-plan.py --no-parallel --export-dir ./results \
  'oidcc-basic-certification-test-plan[server_metadata=discovery][client_registration=static_client]' \
  identizen-config.json
```

`CONFORMANCE_DEV_MODE=1` is what the local server accepts instead of an API token. `--rerun <plan>:<n>` reruns one module. Four modules stop in `WAITING` for a screenshot to be uploaded for human review: `oidcc-prompt-login` and `oidcc-max-age-1` want the second login page, `oidcc-ensure-registered-redirect-uri` and `oidcc-ensure-request-object-with-redirect-uri` want the error the index shows for an unregistered `redirect_uri`. Upload one from the suite's UI (or `POST /api/log/<id>/images` with a `data:image/png;base64,…` body); the module then finishes as `REVIEW`, which is the best result those modules can give. With or without an upload the runner gives up on the module after a few minutes and continues. Do not upload to a module that is merely waiting for the browser (`oidcc-codereuse-30seconds` waits 30 s by design): an image marks any module for review.

### What to expect

The [results](#results) below came from this procedure. Reading them:

- **Passed** — every module that exercises the code flow end to end: discovery and JWKS, the happy path with `client_secret_basic` and `client_secret_post`, `POST` to `/authorize`, userinfo by header and by form body, a request without `nonce`, `display`, `ui_locales`, `claims_locales`, unknown parameters, `acr_values`, a missing `response_type`, `prompt=none` when nobody is logged in, code reuse immediately and after 30 s (the second exchange fails and the first session is revoked), and PKCE.
- **Warning** — `oidcc-server` flags `idz_device` as an id_token claim the client did not request; it is documented in the [claims table](/reference/oidc/#id_token-claims) and deliberate. `oidcc-claims-essential` asks for `name` as an essential claim and warns that userinfo has none; the index holds no profile claims.
- **Review** — `oidcc-prompt-login` and `oidcc-max-age-1` (a person confirms the second login page was shown; `max-age-1` also checks that `auth_time` moved forward, which it does), `oidcc-ensure-registered-redirect-uri` and `oidcc-ensure-request-object-with-redirect-uri` (a person confirms the index showed an error instead of redirecting to the unregistered URI, which it does: a JSON `400 invalid_request`). Review is the highest result those modules give.
- **Skipped by the suite** — `oidcc-scope-profile`, `-email`, `-address`, `-phone`, `-all`, `oidcc-alternate-happy-flow` because `scopes_supported` lists none of those scopes; `oidcc-unsigned-request-object-supported-correctly-or-rejected-as-unsupported` because `request_not_supported` is a permitted answer; `oidcc-refresh-token` because no refresh token is issued.
- **Failed, by design** — `oidcc-prompt-none-logged-in` and `oidcc-id-token-hint` expect a silent login for a person the index already knows; every Identizen login is a phone approval, so `prompt=none` is always `interaction_required` ([deviations](#deliberate-deviations)). `oidcc-max-age-10000` expects a second login within `max_age` to reuse the first authentication and carry the same `auth_time`; the index re-authenticates and `auth_time` moves forward. `oidcc-login-hint` sends an arbitrary hint; the index accepts only a bound `sub` and answers `login_required`.

### Results

Run on 2026-09-06 against the index at the commit that added this page, with the procedure above (`OIDC_PKCE_OPTIONAL=true`, confidential client, `client_secret_basic`). Suite plan `Y95zKwO5Rxdam`; `oidcc-userinfo-get` and `oidcc-codereuse-30seconds` were rerun alone (plans `EjTp9DVWlksW1`, `U9b1hGNyTzkX8`) after a stray screenshot upload had marked them for review, and `oidcc-prompt-login`, `oidcc-max-age-1` and `oidcc-max-age-10000` were rerun (plans `bDspUsaFnv13q`, `XGY00TrxhUQVT`, `3p8MwCSlTVHt8`) after `auth_time` was added to the id_token.

| Result  | Count | Modules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------- | ----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Passed  |    17 | `oidcc-response-type-missing`, `oidcc-userinfo-get`, `oidcc-userinfo-post-header`, `oidcc-userinfo-post-body`, `oidcc-ensure-request-without-nonce-succeeds-for-code-flow`, `oidcc-display-page`, `oidcc-display-popup`, `oidcc-prompt-none-not-logged-in`, `oidcc-ensure-request-with-unknown-parameter-succeeds`, `oidcc-ui-locales`, `oidcc-claims-locales`, `oidcc-ensure-request-with-acr-values-succeeds`, `oidcc-codereuse`, `oidcc-codereuse-30seconds`, `oidcc-ensure-post-request-succeeds`, `oidcc-server-client-secret-post`, `oidcc-ensure-request-with-valid-pkce-succeeds` |
| Warning |     2 | `oidcc-server` (non-requested claim `idz_device`), `oidcc-claims-essential` (no `name` claim)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Review  |     4 | `oidcc-prompt-login`, `oidcc-max-age-1`, `oidcc-ensure-registered-redirect-uri`, `oidcc-ensure-request-object-with-redirect-uri`                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Skipped |     8 | `oidcc-scope-profile`, `oidcc-scope-email`, `oidcc-scope-address`, `oidcc-scope-phone`, `oidcc-scope-all`, `oidcc-alternate-happy-flow`, `oidcc-unsigned-request-object-supported-correctly-or-rejected-as-unsupported`, `oidcc-refresh-token`                                                                                                                                                                                                                                                                                                                                            |
| Failed  |     4 | `oidcc-prompt-none-logged-in`, `oidcc-id-token-hint`, `oidcc-max-age-10000`, `oidcc-login-hint` (all by design: no session at the index)                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

With PKCE mandatory (the hosted configuration) the same procedure runs one module, `oidcc-ensure-request-with-valid-pkce-succeeds`, and it passes; every other module is answered `invalid_request` at `/authorize`.

Update this table when you rerun the plan, and keep the failed rows honest: a certification would need the no-session deviations (silent re-login with `prompt=none`, `id_token_hint`, or within `max_age`, and free-form `login_hint`) resolved or accepted.
