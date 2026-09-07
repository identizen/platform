---
title: Setting up Identizen Cloud
description: What a tenant is, the hostnames, data residency, what Identizen needs from you, what you receive, and how to register and verify your first site on your own index.
---

Identizen Cloud gives your organisation its own index: a dedicated OpenID Provider with its own issuer, signing keys and database, run by Identizen on the same code as the public index. Everything on this page is what exists today. There is no self-serve sign-up: you [contact us](https://identizen.com/contact), we provision the tenant, and you receive the credentials out of band.

## What a tenant is

A tenant is one organisation's index. It has:

- a **slug** (`acme`) that becomes the first label of every hostname;
- its own **issuer**, `https://acme.index.identizen.com`, with its own OIDC signing keys, JWKS and challenge-signing key, generated at provisioning and sealed in the control plane, never shared with another tenant;
- a **dedicated Postgres** (a Neon project of its own) in the region the tenant's residency selects;
- its own **Durable Object and cache namespaces**, so two tenants on the same Worker never share an in-flight login, a request guard or a rate-limit bucket;
- a **status**: `provisioning` (503 `tenant_provisioning`), `active`, `suspended` (403 `tenant_suspended`). An unknown slug is a 404 `tenant_not_found` before any database is touched.

Sites, identities, devices, sessions and audit events registered on a tenant index exist only there. A `sub` issued by `acme.index.identizen.com` is not the same person's `sub` on the public index, and an id_token from one issuer is rejected by every other.

## Hostnames

| Hostname                        | Serves                                                                                                                            | Status |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `{tenant}.index.identizen.com`  | The index: OIDC, challenges, discovery, `/me`, the Verification API, the org API                                                  | Today  |
| `{tenant}.portal.identizen.com` | [Admin portal](/enterprise/portal/): organisation profile, domains, users and roles, devices, policy, sites, sessions, MDM, audit | Today  |
| `{tenant}.app.identizen.com`    | [Organisation app](/enterprise/org-app/): members' devices, paired browsers, sessions, activity, invitations                      | Today  |

The portal and the app are registered as OIDC clients on the tenant's index when the tenant is provisioned; you do not register them. Exactly one label precedes the surface: `a.b.index.identizen.com` is not a tenant host.

## Data residency

Each tenant's Postgres is created in one of two regions:

| Residency | Region         | Chosen when                                                                                                              |
| --------- | -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `eu`      | `eu-central-1` | You ask for EU, or the provisioning request originates from an EU or EEA member state, Switzerland or the United Kingdom |
| `us`      | `us-east-1`    | You ask for US, or the request originates anywhere else                                                                  |

Residency is fixed at provisioning and never moved. If you need a region other than where your request comes from, say so when you contact us. There is no migration tool between regions or from the public index.

## What we need from you

| Item                        | Rules                                                                                                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tenant slug                 | 3–32 characters, lower-case letters, digits and single hyphens, no leading or trailing hyphen, no `--`. Reserved names (`www`, `app`, `index`, `portal`, `api`, `admin`, `docs`, …) are refused. |
| Display name                | Up to 120 characters; shown wherever the tenant is named.                                                                                                                                        |
| Admin contact               | A person and an email address. We hand the credentials to them, notify them about the tenant, and issue the first owner invitation to that address.                                              |
| Residency                   | `us` or `eu`, or leave it to us and we use where your request comes from.                                                                                                                        |
| Sites                       | For each site you will register: its `rp_id` (the host users see, `app.example.com`), redirect URIs, and whether it needs a back-channel logout URI or a verification webhook.                   |
| Dashboard client (optional) | If you compose [`@identizen/dashboard`](/enterprise/#available-today) into your own app, its client id, so we can allow it to call `/me` with a bearer token on your index.                      |

## What you receive

| Item               | Value                                                                                                                                                                                                                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Issuer             | `https://{tenant}.index.identizen.com`                                                                                                                                                                                                                                                                                                 |
| Discovery          | `https://{tenant}.index.identizen.com/.well-known/openid-configuration`                                                                                                                                                                                                                                                                |
| JWKS               | `https://{tenant}.index.identizen.com/.well-known/jwks.json`                                                                                                                                                                                                                                                                           |
| Registration token | Handed over out of band. It is the tenant's `SITE_REGISTRATION_TOKEN`: the bearer that `POST /sites` requires on your index. Keep it where you keep deployment secrets; it is not needed at runtime by any site, only when registering one. Ask us to rotate it.                                                                       |
| Owner invitation   | A link, `https://{tenant}.portal.identizen.com/invite?token=…`, issued to your admin contact and handed over out of band. It works once and expires after 7 days; ask us for a new one if it lapses. The owner enrols a phone on your index, opens the link and accepts ([the steps](/enterprise/portal/#getting-the-first-owner-in)). |
| Portal and app     | `https://{tenant}.portal.identizen.com` and `https://{tenant}.app.identizen.com`, already registered as OIDC clients on your index. Nothing to configure.                                                                                                                                                                              |

The registration token and the owner invitation are the only credentials Identizen hands you. Everything else (client ids, client secrets for your own sites) is created by you when you register sites, printed once, and never stored by the index in a recoverable form.

## Register a site

The CLI takes the index URL and the registration token:

```bash
npx identizen register-site --index https://acme.index.identizen.com --token "$IDENTIZEN_REGISTRATION_TOKEN" \
  --name "Acme App" --rp-id app.example.com \
  --redirect-uri https://app.example.com/api/auth/callback \
  --backchannel-logout-uri https://app.example.com/api/auth/backchannel-logout --live
```

It prints the credentials once as JSON and the DNS TXT record (or well-known file) to publish. Or scaffold a Next.js or Express app in one step with `npx identizen init --index https://acme.index.identizen.com --token "$IDENTIZEN_REGISTRATION_TOKEN"`, which registers the site and writes `IDENTIZEN_INDEX_URL`, `IDENTIZEN_CLIENT_ID` and `IDENTIZEN_CLIENT_SECRET` for you.

The same call over HTTP:

```bash
curl -sS https://acme.index.identizen.com/sites \
  -H "Authorization: Bearer $IDENTIZEN_REGISTRATION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme App",
    "rp_id": "app.example.com",
    "redirect_uris": ["https://app.example.com/api/auth/callback"],
    "backchannel_logout_uri": "https://app.example.com/api/auth/backchannel-logout",
    "environment": "live"
  }'
```

Without a valid token the index answers 403 `registration_closed`. The request and response shapes are in the [OpenAPI reference](/reference/openapi/).

## Verify the domain

A live site cannot start logins until it proves it owns its `rp_id`, on a tenant index exactly as on the public one: publish the `_identizen.<rp_id>` DNS TXT record or the `/.well-known/identizen-site` file that `register-site` printed, then run

```bash
npx identizen verify-site --index https://acme.index.identizen.com --client-id idz_live_…
```

Until then logins fail with [`site_unverified`](/errors/#site_unverified). The index re-checks periodically; see the [CLI reference](/reference/sdk/#identizen-cli).

## Point everything at your issuer

Every SDK, guide and framework recipe in these docs works unchanged with `indexUrl` set to your issuer. `createIdentizenServer({ indexUrl: 'https://acme.index.identizen.com', … })` fetches your discovery document and JWKS, and `verifyIdToken` pins `iss` to it. Phones register with one index at a time: in the Identizen app, set the index URL in Settings to your issuer before enrolling; for development, `npx identizen dev --index https://acme.index.identizen.com` runs the fake phone against it.

## What is different from the public index

| Public index (`index.identizen.com`)       | Tenant index (`{tenant}.index.identizen.com`)                                                            |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Site registration is open                  | Closed: `POST /sites` needs the tenant's registration token                                              |
| One issuer and JWKS shared by every site   | Your own issuer, JWKS and challenge-signing key                                                          |
| One shared database (US)                   | Your own Postgres in the US or the EU                                                                    |
| Dashboard at `app.identizen.com`           | Your own at `{tenant}.app.identizen.com`, plus the admin portal at `{tenant}.portal.identizen.com`       |
| No organisation; every identity is its own | An organisation with owners, admins, helpdesk, auditors and members, invited and managed from the portal |
| Provisioned by nobody; anyone can register | Provisioned by Identizen after you contact us                                                            |

Everything else is identical: the same routes, the same claims, the same SDKs and CLI, the same domain verification, the same revocation and back-channel logout, the same audit events, and the same rule that the index holds nothing that can sign for a person. The tenant Worker is `@identizen/index` with per-request bindings resolved from the hostname; the protocol behaviour is the open code's.
