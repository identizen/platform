---
title: OpenAPI
description: The machine-readable OpenAPI 3.1 description of the index API — where to fetch it, how to generate a typed client, and which credential each endpoint needs.
---

The index API is described in OpenAPI 3.1. The document is written by hand from the index routes and checked by a test on every change, so it matches what the index actually serves.

| Where                                                                                              | What                                                               |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [`https://index.identizen.com/openapi.json`](https://index.identizen.com/openapi.json)             | Served live by the hosted index (every index serves its own copy). |
| [`spec/openapi.yaml`](https://github.com/identizen/platform/blob/main/spec/openapi.yaml) on GitHub | The source of truth, next to `PROTOCOL.md`.                        |

Every path, parameter, body, response, and error code in the document is taken from the route code, and `apps/index/test/openapi.test.ts` fails when a route is served but not described (or described but not served).

## Generate a client

Any OpenAPI 3.1 tool works. `openapi-typescript` is the least opinionated: it emits types only, and you keep your own `fetch`.

```bash
npx openapi-typescript https://index.identizen.com/openapi.json -o identizen.d.ts
```

```ts check="false"
import type { paths } from './identizen';

type VerifyResponse =
  paths['/v1/verify']['post']['responses']['201']['content']['application/json'];
```

You rarely need a generated client for a normal integration: [`@identizen/sdk`](/reference/sdk/) already covers the browser flow, the server-side code exchange, and the Verification API. The document is for other languages, API gateways, and assistants.

## Which endpoints need which credential

| Credential                                                                                            | Endpoints                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| None                                                                                                  | `GET /`, `/health`, `/openapi.json`, `/.well-known/*`, `GET /authorize`, `POST /devices`, `POST /challenge`, `GET /challenge/{id}`, `/challenge/{id}/state`, `/challenge/{id}/browser-key`, `/challenge/{id}/ws`, `POST /discover/*` |
| Client authentication per OIDC (`client_secret_basic`, `client_secret_post`, or `none`)               | `POST /token`                                                                                                                                                                                                                        |
| `Authorization: Bearer <access_token>` (from `/token`)                                                | `GET`/`POST /userinfo`; `/me/*` when the token was issued to a client in the index's `DASHBOARD_CLIENT_IDS`                                                                                                                          |
| `Idz-Signature` (the phone's signed request header, [Index API](/reference/index-api/))               | `/devices/{id}/*`, `POST /identities`, `POST /challenge/{id}/assert`, `POST /challenge/{id}/deny`, `/me/*`                                                                                                                           |
| Client secret: `Authorization: Bearer <client_secret>` or HTTP Basic `client_id:client_secret`        | `GET`/`PATCH /sites/{client_id}`, `POST /sites/{client_id}/webhook`, `POST /v1/verify` and `GET /v1/verify/{id}` (bearer form also needs `Idz-Client-Id`)                                                                            |
| `Authorization: Bearer <SITE_REGISTRATION_TOKEN>` unless the index runs `OPEN_SITE_REGISTRATION=true` | `POST /sites`                                                                                                                                                                                                                        |

The two outbound calls — [back-channel logout](/reference/oidc/#sessions-and-back-channel-logout) and the [verification webhook](/reference/verification-api/#webhook) — are documented as OpenAPI callbacks on `POST /sites`, `PATCH /sites/{client_id}`, and `POST /sites/{client_id}/webhook`.

## Self-hosted indexes

A self-hosted index serves the same document at its own `/openapi.json`; the `servers` list in the file names the hosted index and `http://localhost:8787` (`wrangler dev`), so point your generator at the index you use.
