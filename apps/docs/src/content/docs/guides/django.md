---
title: Django
description: Configure Identizen as a standard OpenID Connect provider with mozilla-django-oidc.
---

Identizen is a standard OpenID Connect provider (Authorization Code + PKCE). Any Django OIDC client works; this page uses `mozilla-django-oidc`.

:::caution[Unverified sample]
Written from the provider's behaviour and the library's documented settings; not yet run against Django in CI. Please report differences.
:::

## Register the site

```bash
npx identizen register-site --name "Acme" --rp-id app.example.com \
  --redirect-uri https://app.example.com/oidc/callback/ \
  --backchannel-logout-uri https://app.example.com/identizen/logout/ --live
```

## Settings

```python
INSTALLED_APPS += ["mozilla_django_oidc"]
AUTHENTICATION_BACKENDS = ["mozilla_django_oidc.auth.OIDCAuthenticationBackend"]

OIDC_RP_CLIENT_ID = env("IDENTIZEN_CLIENT_ID")
OIDC_RP_CLIENT_SECRET = env("IDENTIZEN_CLIENT_SECRET")
OIDC_OP_AUTHORIZATION_ENDPOINT = "https://index.identizen.com/authorize"
OIDC_OP_TOKEN_ENDPOINT = "https://index.identizen.com/token"
OIDC_OP_USER_ENDPOINT = "https://index.identizen.com/userinfo"
OIDC_OP_JWKS_ENDPOINT = "https://index.identizen.com/.well-known/jwks.json"
OIDC_RP_SIGN_ALGO = "ES256"
OIDC_RP_SCOPES = "openid handle"
OIDC_USE_PKCE = True          # Identizen requires PKCE (S256)
OIDC_USE_NONCE = True
```

The id_token has no `email`. Override the backend so users are created from `sub`:

```python
from mozilla_django_oidc.auth import OIDCAuthenticationBackend

class IdentizenBackend(OIDCAuthenticationBackend):
    def get_username(self, claims):
        return claims["sub"]

    def filter_users_by_claims(self, claims):
        return self.UserModel.objects.filter(username=claims["sub"])

    def create_user(self, claims):
        return self.UserModel.objects.create_user(username=claims["sub"])

    def verify_claims(self, claims):
        return "sub" in claims
```

`acr` (`idz:login` or `idz:mfa`), `amr`, `sid`, `idz_device`, and `idz_handle` (with the `handle` scope) are available in the claims; keep `sid` on the session so you can honour back-channel logout.

## Step-up

Send the user to the authorization endpoint with `acr_values=idz:mfa&login_hint=<sub>` (`OIDC_AUTH_REQUEST_EXTRA_PARAMS` in `mozilla-django-oidc`, or build the URL yourself), then require `acr == "idz:mfa"` before the sensitive action. Enrollment adds `prompt=enroll`.

## Back-channel logout

Add a view for the URI you registered. It receives `logout_token` as form data: validate the JWT against the JWKS, require the `http://schemas.openid.net/event/backchannel-logout` event, reject tokens with a `nonce`, then delete sessions whose stored `sid` matches. Details in the [OIDC reference](/reference/oidc/#sessions-and-back-channel-logout).

## Verification API

For transaction approval with a displayed `reason`, call the [Verification API](/reference/verification-api/) with `requests`:

```python
import requests

r = requests.post(
    "https://index.identizen.com/v1/verify",
    headers={"Authorization": f"Bearer {CLIENT_SECRET}", "Idz-Client-Id": CLIENT_ID},
    json={"sub": user.identizen_sub, "reason": "Approve wire transfer of $12,000 to Acme?"},
)
verification_id = r.json()["verification_id"]
```
