---
title: Errors
description: Every error code the SDK and the index can return, with the cause and the fix. IdentizenError.docsUrl links here.
tableOfContents:
  maxHeadingLevel: 3
---

Every `IdentizenError` carries a `code`, a one-line `message`, an HTTP `status` when one applies, and `docsUrl = https://docs.identizen.com/errors#<code>`. Index responses use the same codes in `{ "error": "<code>", "error_description": "…" }`.

## SDK configuration

### config_index_url

`indexUrl` was empty. Pass the index issuer URL (for example `https://index.identizen.com`) to `createIdentizen` or `createIdentizenServer`.

### config_client_id

`clientId` was empty. Use the `client_id` printed by `identizen init` / `register-site` (`idz_live_…` or `idz_test_…`).

### config_client_secret

A server call that needs the client secret (Verification API) was made without one. Confidential clients get a secret at registration; public clients cannot use the Verification API.

### challenge_failed

The index rejected `POST /challenge` and returned no OIDC error code. Check `status` and the index logs; usually the site or the index URL is wrong.

### token_failed

`POST /token` failed without an OIDC error code. Check network reachability of the index.

### userinfo_failed

`GET /userinfo` failed. Usually `invalid_token` after session revocation.

### verify_failed

`POST /v1/verify` failed without a specific code. Check credentials (`Idz-Client-Id` + bearer secret).

### verification_not_found

`GET /v1/verify/:id` returned 404: the id is unknown or belongs to another site.

### nonce_mismatch

The id_token `nonce` differs from the one you sent. Keep the nonce with the transaction cookie and pass it to `exchangeCode`.

### invalid_id_token

The id_token is missing `sub` or `sid`. The token was not issued by an Identizen index.

### invalid_webhook

The JWT was valid but is not a `verification.resolved` event. Only Identizen webhooks should hit that endpoint.

### invalid_logout_token

The back-channel logout token lacked the logout event, had a `nonce`, or lacked `sid`.

### unexpected

Anything else the browser client caught; `cause` holds the original error.

## OIDC and site errors

### invalid_client

The client secret is missing, wrong, or malformed HTTP Basic, or, on `/token` and `/authorize`, the `client_id` is unknown. On `/token` this is a `401`; when the client used HTTP Basic the response carries `WWW-Authenticate: Basic`. On `/sites/:client_id` and `/v1/verify` an unknown `client_id` is `404 unknown_client` instead. For the Verification API send `Idz-Client-Id` plus `Authorization: Bearer <client_secret>` (or HTTP Basic).

### invalid_request

A required parameter is missing or malformed: on `/authorize` a missing `response_type`, PKCE with S256 (`code_challenge` of 43–128 unreserved characters), `acr_values=idz:mfa` without `login_hint`, or `prompt=none` combined with another prompt value; on `/token` a missing `grant_type`, `code`, or `code_verifier`; JSON bodies must match the schema — `issues` lists the fields.

### unsupported_response_type

Only `response_type=code` is supported (a missing `response_type` is `invalid_request`).

### request_not_supported / request_uri_not_supported

The `request` or `request_uri` parameter was sent on `/authorize`. Request objects are not supported (`request_parameter_supported: false` in discovery); pass the parameters in the query or form body.

### invalid_scope

`scope` must include `openid`.

### invalid_grant

The code is unknown, expired, already used (a reused code also revokes the session the first exchange created), issued to another client, the `redirect_uri` differs, PKCE verification failed, or the device is no longer active. Start the login again.

### unsupported_grant_type

Only `authorization_code` is supported; there are no refresh tokens.

### login_required

Step-up (`acr_values=idz:mfa`) targeted a `sub` that is not bound to an active device for this site. Run enrollment (`prompt=enroll`) first. The Verification API reports this as `unknown_sub`.

### login_hint_required

`acr=idz:mfa` was requested on `POST /challenge` without `login_hint`.

### interaction_required

`prompt=none` was sent. Identizen always needs the user to approve on the phone.

### invalid_token

The bearer access token is missing, invalid, expired, not an access token (an id_token was sent), or its session was revoked. The `401` carries `WWW-Authenticate: Bearer …` per RFC 6750; with a token present the challenge includes `error="invalid_token"`.

### not_dashboard_client

The bearer token belongs to a client that is not listed in the index's `DASHBOARD_CLIENT_IDS`; only the dashboard may call `/me` with a token.

### registration_closed

`POST /sites` needs `Authorization: Bearer <SITE_REGISTRATION_TOKEN>` on this index. Self-hosters can set `OPEN_SITE_REGISTRATION=true`.

### unknown_client

No site with that `client_id`.

### unknown_sub

Verification API: no active device is bound to that `sub` for your site.

### unknown_verification

No verification with that id for your site.

### conflict

A unique constraint failed (for example the `rp_id` is already registered).

### invalid_transition

HTTP 409. The object cannot move to the requested state (for example revoking a device that is already revoked). Read its current state and retry only if it makes sense.

### rate_limited

HTTP 429. Too many challenge, discovery, or `/authorize` requests from one IP address in a minute (`RATE_LIMIT_REQUESTS_PER_IP`, default 60). Try again in a minute.

### client_rate_limited

HTTP 429. The site started too many logins in a minute (`RATE_LIMIT_CHALLENGES_PER_CLIENT`, default 300). Slow down, or raise the limit on a self-hosted index.

### unknown_handle

HTTP 404. WebFinger: no identity with that handle on this index.

### wrong_index

HTTP 404. WebFinger: the host in `acct:<handle>@<host>` is not this index. Query the index that serves that host.

## Device and challenge errors

### missing_signature

The `Idz-Signature` header is absent or malformed.

### missing_credentials

`/me` was called with neither `Idz-Signature` nor a bearer token.

### unknown_device

The `device_id` in the signature or assertion is not registered.

### bad_signature

The request signature (or a browser pairing signature) did not verify: wrong key, tampered body, or a stale timestamp (±60 s).

### replayed_request

The same `(device_id, timestamp, signature)` was seen before. Sign every request freshly.

### device_inactive

The device is disabled or revoked. Re-enroll from the app.

### wrong_device

The signing device differs from the device named in the assertion, or the challenge was pushed to another device.

### self_revoke

A phone tried to revoke itself through `/me`; use another device or [the dashboard](https://app.identizen.com).

### not_your_device / not_your_session / not_your_pairing

The object belongs to another identity.

### unknown_session / unknown_pairing

HTTP 404. `/me/sessions/:sid/revoke` or `/me/pairings/:id/revoke` named a session or pairing that does not exist.

### bad_identity_proof

`master_sig` on `POST /devices` does not verify over `{ device_pubkey }` with `master_pubkey`.

### handle_taken

Another identity already uses that handle.

### unknown_challenge

No challenge with that id, or it is no longer pending for discovery.

### challenge_approved / challenge_denied / challenge_expired

The challenge already reached that terminal state (HTTP 410). Start a new login.

### malformed_assertion, challenge_mismatch, nonce_mismatch, rp_id_mismatch, acr_mismatch, reason_mismatch, expired, iat_too_early, iat_too_late, bad_device_signature, bad_site_pubkey, sub_mismatch, bad_site_signature

Assertion verification failures, in the order the index checks them (PROTOCOL.md §4.1). `rp_id_mismatch` is the anti-phishing check; `reason_mismatch` means the phone signed a different reason than the one on the challenge.

### binding_conflict

The `sub` is already bound to a different site key or identity for this site (trust-on-first-use).

### no_device

`POST /discover/ble`: no active device advertises that rotating id in the current window ±1.

### pairing_inactive

`POST /discover/paired`: the pairing is unknown or revoked; the SDK forgets it and falls back to Bluetooth or QR.

### push_rate_limited

Too many pushes to one device in a minute (push-bombing guard). Try again shortly.

### not_found

No such route or object.

### server_error

Unhandled error on the index; check its logs.
