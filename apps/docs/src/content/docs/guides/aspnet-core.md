---
title: ASP.NET Core
description: Configure Identizen as a standard OpenID Connect provider with Microsoft.AspNetCore.Authentication.OpenIdConnect.
---

Identizen is a standard OpenID Connect provider (Authorization Code + PKCE), so the built-in `OpenIdConnect` handler works without an Identizen-specific package.

:::caution[Unverified sample]
This page is a standard-OIDC configuration written from the provider's behaviour. It has not yet been run against ASP.NET Core in CI. If something differs, please open an issue.
:::

## Register the site

```bash
npx identizen register-site --name "Acme" --rp-id app.example.com \
  --redirect-uri https://app.example.com/signin-identizen \
  --backchannel-logout-uri https://app.example.com/identizen/logout --live
```

Keep the printed `client_id` and `client_secret`.

## Configure the handler

```csharp
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;

builder.Services
    .AddAuthentication(options =>
    {
        options.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = OpenIdConnectDefaults.AuthenticationScheme;
    })
    .AddCookie()
    .AddOpenIdConnect(options =>
    {
        options.Authority = "https://index.identizen.com";       // discovery at /.well-known/openid-configuration
        options.ClientId = builder.Configuration["Identizen:ClientId"];
        options.ClientSecret = builder.Configuration["Identizen:ClientSecret"];
        options.ResponseType = "code";
        options.UsePkce = true;                                   // required by Identizen
        options.CallbackPath = "/signin-identizen";
        options.Scope.Clear();
        options.Scope.Add("openid");
        options.Scope.Add("handle");                              // optional: releases idz_handle
        options.GetClaimsFromUserInfoEndpoint = false;            // everything you need is in the id_token
        options.TokenValidationParameters.NameClaimType = "sub";
        options.ClaimActions.MapUniqueJsonKey("acr", "acr");
        options.ClaimActions.MapUniqueJsonKey("idz_device", "idz_device");
        options.ClaimActions.MapUniqueJsonKey("idz_handle", "idz_handle");
    });
```

`amr` is an array claim; map it with `options.ClaimActions.MapJsonKey("amr", "amr")` if you need it.

## Step-up (Path B)

Trigger a challenge with the extra parameters on the authentication properties:

```csharp
var props = new AuthenticationProperties { RedirectUri = "/transfer/confirm" };
props.Parameters["acr_values"] = "idz:mfa";
props.Parameters["login_hint"] = boundSub;   // the sub you stored at enrollment
return Challenge(props, OpenIdConnectDefaults.AuthenticationScheme);
```

Then check `User.FindFirst("acr")?.Value == "idz:mfa"` before completing the sensitive action. Enrollment is the same call with `props.Parameters["prompt"] = "enroll"`.

## Back-channel logout

The index POSTs `logout_token=<jwt>` (form-encoded) to the URI you registered. Validate it with the same authority and audience, check `events` contains `http://schemas.openid.net/event/backchannel-logout` and that `nonce` is absent, then end the session identified by `sid` (store `sid` from the id_token in your cookie session at sign-in). See the [OIDC reference](/reference/oidc/#sessions-and-back-channel-logout).

## Server-to-server approvals

Transaction approval with a displayed `reason` does not need the OIDC handler at all: call the [Verification API](/reference/verification-api/) with `HttpClient` using `Authorization: Bearer <client_secret>` and `Idz-Client-Id: <client_id>`.
