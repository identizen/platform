// Generated from spec/openapi.yaml by scripts/gen-openapi.ts. Do not edit; run `npm run openapi`.
export const OPENAPI_DOCUMENT: Record<string, unknown> = {
  "openapi": "3.1.0",
  "info": {
    "title": "Identizen index API",
    "version": "0.1.0",
    "summary": "The Identizen index — device registry, login relay, and OpenID Provider.",
    "description": "Machine-readable description of the HTTP API served by an Identizen index\n(`apps/index`). It is written by hand from the Hono routes in\n`apps/index/src/routes/*.ts`, the Zod schemas in `packages/protocol/src/schemas.ts`,\nand the error helpers in `apps/index/src/lib/errors.ts`, and it is validated by\n`apps/index/test/openapi.test.ts`: every route registered on the app must appear here and\nevery path here must be served by the app. The index also serves this document as JSON at\n`GET /openapi.json`.\n\nThree kinds of caller use this API:\n\n- **Phones** (the Identizen app): register with `POST /devices`, then sign every request\n  with the `Idz-Signature` header (PROTOCOL.md §8).\n- **Browsers / the SDK**: start logins (`POST /challenge`), run discovery\n  (`/discover/*`), and wait on the challenge (`/challenge/{id}/state` or the WebSocket).\n- **Sites** (relying parties): standard OIDC (`/authorize`, `/token`, `/userinfo`), site\n  management (`/sites`), and the server-to-server Verification API (`/v1/verify`).\n\nErrors are JSON `{ \"error\": \"<code>\", \"error_description\": \"…\" }`; the codes are listed\nper operation and documented at https://docs.identizen.com/errors/. Unknown routes answer\n`404 not_found`, unhandled failures `500 server_error`. Every response carries permissive\nCORS headers (`Access-Control-Allow-Origin` echoes the request origin; allowed request\nheaders are `Content-Type`, `Authorization`, and `Idz-Signature`).\n",
    "license": {
      "name": "Apache-2.0",
      "identifier": "Apache-2.0"
    },
    "contact": {
      "name": "Identizen",
      "url": "https://docs.identizen.com"
    }
  },
  "externalDocs": {
    "description": "Identizen documentation",
    "url": "https://docs.identizen.com"
  },
  "servers": [
    {
      "url": "https://index.identizen.com",
      "description": "Hosted index"
    },
    {
      "url": "http://localhost:8787",
      "description": "Local `wrangler dev`"
    }
  ],
  "tags": [
    {
      "name": "Service",
      "description": "Landing page, health, and this document."
    },
    {
      "name": "Well-known",
      "description": "Discovery documents for OIDC, the pinned index key, and WebFinger."
    },
    {
      "name": "OIDC",
      "description": "OpenID Connect Authorization Code flow with PKCE (S256 required)."
    },
    {
      "name": "Devices",
      "description": "Phone registration and device-authenticated device operations."
    },
    {
      "name": "Identities",
      "description": "Handle management from the phone."
    },
    {
      "name": "Challenges",
      "description": "One in-flight login. Challenges live 60 seconds."
    },
    {
      "name": "Discovery",
      "description": "Deliver a pending challenge to a phone found over BLE or via a browser pairing."
    },
    {
      "name": "Account",
      "description": "`/me` account management for the caller's identity (phone or dashboard)."
    },
    {
      "name": "Sites",
      "description": "Relying-party registration and management."
    },
    {
      "name": "Verification",
      "description": "Server-to-server phone approval (Verification API, Path B)."
    }
  ],
  "paths": {
    "/": {
      "get": {
        "tags": [
          "Service"
        ],
        "operationId": "getRoot",
        "summary": "Landing page or JSON service descriptor",
        "description": "Content negotiation on the `Accept` header: when it contains `text/html` the response\nis an HTML landing page for humans; otherwise a JSON descriptor. Cached for 300 s.\n",
        "responses": {
          "200": {
            "description": "Service descriptor (JSON) or landing page (HTML).",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string",
                  "const": "public, max-age=300"
                }
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ServiceDescriptor"
                }
              },
              "text/html": {
                "schema": {
                  "type": "string"
                }
              }
            }
          }
        }
      }
    },
    "/health": {
      "get": {
        "tags": [
          "Service"
        ],
        "operationId": "getHealth",
        "summary": "Service and database status",
        "responses": {
          "200": {
            "description": "The database answered `select 1`.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Health"
                }
              }
            }
          },
          "503": {
            "description": "The database did not answer; `ok` is `false` and `database` is `error`.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Health"
                }
              }
            }
          }
        }
      }
    },
    "/openapi.json": {
      "get": {
        "tags": [
          "Service"
        ],
        "operationId": "getOpenApi",
        "summary": "This document as JSON",
        "description": "The OpenAPI description of the index, generated from `spec/openapi.yaml`.",
        "responses": {
          "200": {
            "description": "OpenAPI 3.1 document.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string",
                  "const": "public, max-age=300"
                }
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "description": "An OpenAPI 3.1 document.",
                  "required": [
                    "openapi",
                    "info",
                    "paths"
                  ],
                  "properties": {
                    "openapi": {
                      "type": "string"
                    },
                    "info": {
                      "type": "object"
                    },
                    "paths": {
                      "type": "object"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/.well-known/identizen": {
      "get": {
        "tags": [
          "Well-known"
        ],
        "operationId": "getWellKnownIdentizen",
        "summary": "Pinned index key and app URL",
        "description": "Public index metadata. Phones pin `index_pubkey` at registration and only honour\nchallenges and pairings signed by it.\n",
        "responses": {
          "200": {
            "description": "Index metadata.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "required": [
                    "index",
                    "app",
                    "index_pubkey",
                    "protocol"
                  ],
                  "properties": {
                    "index": {
                      "type": "string",
                      "format": "uri",
                      "description": "Public issuer URL of this index."
                    },
                    "app": {
                      "type": "string",
                      "format": "uri",
                      "description": "Public URL of the web app (deep links)."
                    },
                    "index_pubkey": {
                      "$ref": "#/components/schemas/PublicKey"
                    },
                    "protocol": {
                      "type": "string",
                      "const": "identizen/v1"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/.well-known/webfinger": {
      "get": {
        "tags": [
          "Well-known"
        ],
        "operationId": "getWebfinger",
        "summary": "Resolve a handle to an identity (RFC 7033)",
        "description": "`resource=acct:<handle>@<host>`; handle and host are lower-cased. The host must be\nthis index's host, otherwise `404 wrong_index`.\n",
        "parameters": [
          {
            "name": "resource",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "pattern": "^acct:[^@]+@.+$"
            },
            "example": "acct:george@index.identizen.com"
          }
        ],
        "responses": {
          "200": {
            "description": "JSON Resource Descriptor for the handle.",
            "content": {
              "application/jrd+json": {
                "schema": {
                  "type": "object",
                  "required": [
                    "subject",
                    "properties",
                    "links"
                  ],
                  "properties": {
                    "subject": {
                      "type": "string",
                      "description": "`acct:<handle>@<index host>`, lower-cased."
                    },
                    "properties": {
                      "type": "object",
                      "required": [
                        "https://identizen.com/ns/idz"
                      ],
                      "properties": {
                        "https://identizen.com/ns/idz": {
                          "$ref": "#/components/schemas/Idz"
                        }
                      }
                    },
                    "links": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "required": [
                          "rel",
                          "href"
                        ],
                        "properties": {
                          "rel": {
                            "type": "string",
                            "enum": [
                              "https://identizen.com/ns/index",
                              "http://openid.net/specs/connect/1.0/issuer"
                            ]
                          },
                          "href": {
                            "type": "string",
                            "format": "uri"
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          "400": {
            "description": "`invalid_request` — `resource` missing or not `acct:handle@host`.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "404": {
            "description": "`wrong_index` — the host is not this index; `unknown_handle` — no identity with that handle.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          }
        }
      }
    },
    "/.well-known/openid-configuration": {
      "get": {
        "tags": [
          "Well-known",
          "OIDC"
        ],
        "operationId": "getOpenIdConfiguration",
        "summary": "OpenID Connect discovery document",
        "responses": {
          "200": {
            "description": "OpenID Provider metadata.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/OpenIdConfiguration"
                }
              }
            }
          }
        }
      }
    },
    "/.well-known/jwks.json": {
      "get": {
        "tags": [
          "Well-known",
          "OIDC"
        ],
        "operationId": "getJwks",
        "summary": "Public keys that sign id_tokens, access tokens, logout tokens, and webhooks",
        "description": "Every key in the OIDC keyring (two during rotation). Cached for 300 s.",
        "responses": {
          "200": {
            "description": "JSON Web Key Set (ES256, `use: sig`).",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string",
                  "const": "public, max-age=300"
                }
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "required": [
                    "keys"
                  ],
                  "properties": {
                    "keys": {
                      "type": "array",
                      "items": {
                        "$ref": "#/components/schemas/Jwk"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/authorize": {
      "get": {
        "tags": [
          "OIDC"
        ],
        "operationId": "authorize",
        "summary": "OIDC authorization endpoint (hosted login page)",
        "description": "Authorization Code flow with PKCE. Creates a challenge session and renders the hosted\nlogin page (match code, QR, WebSocket to the session). After the phone approves, the\npage redirects the browser to `redirect_uri?code=…&state=…`. The code is single-use and\nbound to the client.\n\nValidation order: unknown `client_id` or unregistered `redirect_uri` is a JSON `400`\n(nothing is redirected to an unverified URI). Every later failure is an OIDC error\nredirect (`302` to `redirect_uri` with `error`, `error_description`, and `state`):\n`invalid_request` (missing `response_type`, missing or malformed PKCE,\n`acr_values=idz:mfa` without `login_hint`, `prompt=none` combined with another value),\n`unsupported_response_type`, `request_not_supported`, `request_uri_not_supported`,\n`invalid_scope` (no `openid`), `interaction_required` (`prompt=none`), and\n`login_required` (no active device is bound to `login_hint`). Unknown scopes and\nunknown `acr_values` are ignored (RFC 6749 §3.3; `acr` is a voluntary claim).\n\n`acr_values=idz:mfa` with `login_hint=<sub>` is step-up: the challenge is pushed to the\ndevice bound to `sub`. `login_hint` alone pushes to the bound device at `idz:login`.\n`prompt=enroll` marks an enrollment (the resulting `sub` is what the site stores).\nRate limited per source IP (`429 rate_limited`) and per client (`429 client_rate_limited`).\nThe same request may be sent as `POST` with a form body (OpenID Connect Core §3.1.2.1).\n",
        "parameters": [
          {
            "name": "response_type",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "const": "code"
            }
          },
          {
            "name": "client_id",
            "in": "query",
            "required": true,
            "schema": {
              "$ref": "#/components/schemas/ClientId"
            }
          },
          {
            "name": "redirect_uri",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uri"
            },
            "description": "Must exactly match one of the site's registered `redirect_uris`."
          },
          {
            "name": "scope",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "Space-separated; must include `openid`. `handle` releases `idz_handle`.",
            "example": "openid handle"
          },
          {
            "name": "code_challenge",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "code_challenge_method",
            "in": "query",
            "required": true,
            "schema": {
              "type": "string",
              "const": "S256"
            }
          },
          {
            "name": "state",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Echoed on the success and error redirects."
          },
          {
            "name": "nonce",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Echoed in the id_token when sent."
          },
          {
            "name": "acr_values",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "Space-separated; each value must be `idz:login` or `idz:mfa`. `idz:mfa` requires `login_hint`."
          },
          {
            "name": "login_hint",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "The per-site `sub` whose bound device should receive the push."
          },
          {
            "name": "prompt",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            },
            "description": "`none` always fails with `interaction_required`; `enroll` marks an enrollment. Other values are carried through unchanged."
          }
        ],
        "responses": {
          "200": {
            "$ref": "#/components/responses/LoginPage"
          },
          "302": {
            "$ref": "#/components/responses/AuthorizeErrorRedirect"
          },
          "400": {
            "$ref": "#/components/responses/AuthorizeBadRequest"
          },
          "429": {
            "$ref": "#/components/responses/RateLimited"
          }
        }
      },
      "post": {
        "tags": [
          "OIDC"
        ],
        "operationId": "authorizePost",
        "summary": "OIDC authorization endpoint (POST form)",
        "description": "Identical to `GET /authorize` with the same parameters in an\n`application/x-www-form-urlencoded` body (OpenID Connect Core §3.1.2.1 requires both).\n",
        "requestBody": {
          "required": true,
          "content": {
            "application/x-www-form-urlencoded": {
              "schema": {
                "$ref": "#/components/schemas/AuthorizeRequest"
              }
            }
          }
        },
        "responses": {
          "200": {
            "$ref": "#/components/responses/LoginPage"
          },
          "302": {
            "$ref": "#/components/responses/AuthorizeErrorRedirect"
          },
          "400": {
            "$ref": "#/components/responses/AuthorizeBadRequest"
          },
          "429": {
            "$ref": "#/components/responses/RateLimited"
          }
        }
      }
    },
    "/token": {
      "post": {
        "tags": [
          "OIDC"
        ],
        "operationId": "token",
        "summary": "OIDC token endpoint",
        "description": "`grant_type=authorization_code` with PKCE. Client authentication is\n`client_secret_basic` (HTTP Basic), `client_secret_post` (`client_id` + `client_secret`\nin the body), or `none` (`client_id` alone) for public clients; a confidential client\nthat omits or mismatches its secret gets `401 invalid_client`. The code is redeemed once\nat the challenge session; `redirect_uri` must equal the one used on the authorization\nrequest; `code_verifier` must hash (S256) to the request's `code_challenge` (and must\nbe absent when the request had none, which only `OIDC_PKCE_OPTIONAL=true` allows); the\napproving device must still be active. Each successful exchange creates a 30-day\nIdentizen session (`sid`).\n",
        "security": [
          {},
          {
            "clientSecretBasic": []
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/x-www-form-urlencoded": {
              "schema": {
                "$ref": "#/components/schemas/TokenRequest"
              }
            },
            "multipart/form-data": {
              "schema": {
                "$ref": "#/components/schemas/TokenRequest"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Tokens. No refresh token is issued.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string",
                  "const": "no-store"
                }
              },
              "Pragma": {
                "schema": {
                  "type": "string",
                  "const": "no-cache"
                }
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/TokenResponse"
                }
              }
            }
          },
          "400": {
            "description": "`invalid_request` — `grant_type`, `code`, or `code_verifier` missing; `unsupported_grant_type` — any grant other than `authorization_code` (there are no refresh tokens); `invalid_grant` — malformed, unknown, expired, or used code, code issued to another client, `redirect_uri` mismatch, PKCE failure, or the device no longer exists / is not active.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string",
                  "const": "no-store"
                }
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "401": {
            "description": "`invalid_client` — `client_id` missing, unknown, malformed Basic credentials, or the client secret is wrong. When the client used HTTP Basic the response carries `WWW-Authenticate: Basic realm=\"identizen\"` (RFC 6749 §5.2).",
            "headers": {
              "WWW-Authenticate": {
                "schema": {
                  "type": "string"
                }
              },
              "Cache-Control": {
                "schema": {
                  "type": "string",
                  "const": "no-store"
                }
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          }
        }
      }
    },
    "/userinfo": {
      "get": {
        "tags": [
          "OIDC"
        ],
        "operationId": "getUserinfo",
        "summary": "OIDC userinfo endpoint",
        "description": "Requires the access token from `/token`. Fails with `401 invalid_token` once the\nsession has been revoked, so it doubles as a session liveness check.\n",
        "security": [
          {
            "accessToken": []
          }
        ],
        "responses": {
          "200": {
            "$ref": "#/components/responses/Userinfo"
          },
          "401": {
            "$ref": "#/components/responses/InvalidToken"
          }
        }
      },
      "post": {
        "tags": [
          "OIDC"
        ],
        "operationId": "postUserinfo",
        "summary": "OIDC userinfo endpoint (POST form)",
        "description": "Identical to `GET /userinfo`; the token travels in the `Authorization` header or, per RFC 6750 §2.2, as `access_token` in an `application/x-www-form-urlencoded` body.",
        "security": [
          {
            "accessToken": []
          }
        ],
        "responses": {
          "200": {
            "$ref": "#/components/responses/Userinfo"
          },
          "401": {
            "$ref": "#/components/responses/InvalidToken"
          }
        }
      }
    },
    "/devices": {
      "post": {
        "tags": [
          "Devices"
        ],
        "operationId": "registerDevice",
        "summary": "Register an install (and, on first sight of the master key, its identity)",
        "description": "The one unsigned phone request (PROTOCOL.md §8). `master_sig` must be an Ed25519\nsignature of type `identity` over `{ \"device_pubkey\": … }` by `master_pubkey`; the\nidentity id `idz` is derived from the master public key, so a restored phone re-registers\nagainst the same identity. `handle` and `kind` only apply when the identity is created.\n",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/DeviceRegistration"
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Device registered.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "required": [
                    "device_id",
                    "idz",
                    "handle",
                    "index",
                    "index_pubkey"
                  ],
                  "properties": {
                    "device_id": {
                      "$ref": "#/components/schemas/DeviceId"
                    },
                    "idz": {
                      "$ref": "#/components/schemas/Idz"
                    },
                    "handle": {
                      "oneOf": [
                        {
                          "$ref": "#/components/schemas/Handle"
                        },
                        {
                          "type": "null"
                        }
                      ]
                    },
                    "index": {
                      "type": "string",
                      "format": "uri"
                    },
                    "index_pubkey": {
                      "$ref": "#/components/schemas/PublicKey",
                      "description": "The index's Ed25519 public key. Pin it."
                    }
                  }
                }
              }
            }
          },
          "400": {
            "description": "`invalid_request` — body failed validation; `bad_identity_proof` — `master_sig` does not verify over `device_pubkey`.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "409": {
            "description": "`handle_taken` — another identity already uses the handle.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          }
        }
      }
    },
    "/devices/{id}/push-token": {
      "post": {
        "tags": [
          "Devices"
        ],
        "operationId": "updatePushToken",
        "summary": "Replace the calling device's push token",
        "description": "Both fields are required (send `null` to clear). The signing device must be `{id}` (`403 wrong_device`).",
        "security": [
          {
            "idzSignature": []
          }
        ],
        "parameters": [
          {
            "$ref": "#/components/parameters/DeviceIdPath"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "push_token",
                  "push_platform"
                ],
                "properties": {
                  "push_token": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "maxLength": 4096,
                    "description": "APNs / FCM token, an Expo push token (`ExponentPushToken[…]`), an HTTP(S) URL (platform `web`), or the literal `poll`."
                  },
                  "push_platform": {
                    "oneOf": [
                      {
                        "$ref": "#/components/schemas/PushPlatform"
                      },
                      {
                        "type": "null"
                      }
                    ]
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Updated.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "required": [
                    "device_id",
                    "push_platform"
                  ],
                  "properties": {
                    "device_id": {
                      "$ref": "#/components/schemas/DeviceId"
                    },
                    "push_platform": {
                      "oneOf": [
                        {
                          "$ref": "#/components/schemas/PushPlatform"
                        },
                        {
                          "type": "null"
                        }
                      ]
                    }
                  }
                }
              }
            }
          },
          "400": {
            "$ref": "#/components/responses/InvalidRequest"
          },
          "401": {
            "$ref": "#/components/responses/DeviceUnauthorized"
          },
          "403": {
            "description": "`device_inactive` — the signing device is disabled or revoked; `wrong_device` — the signature is for a different device than `{id}`.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          }
        }
      }
    },
    "/devices/{id}/inbox": {
      "get": {
        "tags": [
          "Devices"
        ],
        "operationId": "drainInbox",
        "summary": "Drain queued challenge ids",
        "description": "The delivery of record for pushes: every challenge targeted at a device is queued here\nbefore any push provider is called. Returns and clears the queue (at most 50 ids;\nentries expire with the challenge). The signing device must be `{id}`.\n",
        "security": [
          {
            "idzSignature": []
          }
        ],
        "parameters": [
          {
            "$ref": "#/components/parameters/DeviceIdPath"
          }
        ],
        "responses": {
          "200": {
            "description": "Queued challenge ids, oldest first.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string",
                  "const": "no-store"
                }
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "required": [
                    "challenge_ids"
                  ],
                  "properties": {
                    "challenge_ids": {
                      "type": "array",
                      "items": {
                        "$ref": "#/components/schemas/ChallengeId"
                      }
                    }
                  }
                }
              }
            }
          },
          "401": {
            "$ref": "#/components/responses/DeviceUnauthorized"
          },
          "403": {
            "description": "`device_inactive`; `wrong_device` — the signature is for a different device than `{id}`.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          }
        }
      }
    },
    "/devices/{id}/revoke": {
      "post": {
        "tags": [
          "Devices"
        ],
        "operationId": "revokeDevice",
        "summary": "Revoke a device of the same identity from another enrolled device",
        "description": "`{id}` must belong to the caller's identity. Active pairings of the device are revoked,\nits live sessions are revoked, and back-channel logout is dispatched for them. No body.\n",
        "security": [
          {
            "idzSignature": []
          }
        ],
        "parameters": [
          {
            "$ref": "#/components/parameters/DeviceIdPath"
          }
        ],
        "responses": {
          "200": {
            "$ref": "#/components/responses/DeviceRevoked"
          },
          "401": {
            "$ref": "#/components/responses/DeviceUnauthorized"
          },
          "403": {
            "description": "`device_inactive` — the caller is disabled or revoked; `not_your_device` — `{id}` is unknown or belongs to another identity.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "409": {
            "$ref": "#/components/responses/InvalidTransition"
          }
        }
      }
    },
    "/identities": {
      "post": {
        "tags": [
          "Identities"
        ],
        "operationId": "setHandle",
        "summary": "Set or clear the identity's handle",
        "description": "Identity creation happens inside `POST /devices`; this endpoint only manages the optional handle of the calling device's identity.",
        "security": [
          {
            "idzSignature": []
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/HandleUpdate"
              }
            }
          }
        },
        "responses": {
          "200": {
            "$ref": "#/components/responses/HandleUpdated"
          },
          "400": {
            "$ref": "#/components/responses/InvalidRequest"
          },
          "401": {
            "$ref": "#/components/responses/DeviceUnauthorized"
          },
          "403": {
            "$ref": "#/components/responses/DeviceInactive"
          },
          "409": {
            "$ref": "#/components/responses/HandleTaken"
          }
        }
      }
    },
    "/challenge": {
      "post": {
        "tags": [
          "Challenges"
        ],
        "operationId": "startChallenge",
        "summary": "Start a login (the JSON twin of `/authorize`)",
        "description": "What the SDK calls. Creates a signed challenge in a session and returns what the\nbrowser needs; the phone fetches the signed challenge itself (`GET /challenge/{id}`).\nWhen `redirect_uri` is present the session also carries the OIDC parameters so the\napproval yields an authorization code redeemable at `POST /token`. `acr: idz:mfa` or\n`login_hint` pushes the challenge to the device bound to `login_hint`\n(`400 login_hint_required` when `idz:mfa` has no hint, `400 login_required` when the\n`sub` has no active bound device). Rate limited per source IP and per client.\n",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/ChallengeStartRequest"
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Challenge created.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ChallengeStarted"
                }
              }
            }
          },
          "400": {
            "description": "`invalid_request` — body failed validation; `login_hint_required`; `login_required` — no active device is bound to `login_hint` for this site.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "404": {
            "description": "`unknown_client` — no site with that `client_id`.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "429": {
            "$ref": "#/components/responses/RateLimited"
          }
        }
      }
    },
    "/challenge/{id}": {
      "get": {
        "tags": [
          "Challenges"
        ],
        "operationId": "getChallenge",
        "summary": "The signed challenge (what the phone signs)",
        "description": "Public. The phone verifies `sig` against the pinned index key before showing anything.",
        "parameters": [
          {
            "$ref": "#/components/parameters/ChallengeIdPath"
          }
        ],
        "responses": {
          "200": {
            "description": "Signed challenge plus the session status.",
            "content": {
              "application/json": {
                "schema": {
                  "allOf": [
                    {
                      "$ref": "#/components/schemas/SignedChallenge"
                    },
                    {
                      "type": "object",
                      "required": [
                        "status"
                      ],
                      "properties": {
                        "status": {
                          "$ref": "#/components/schemas/ChallengeStatus"
                        }
                      }
                    }
                  ]
                }
              }
            }
          },
          "404": {
            "$ref": "#/components/responses/UnknownChallenge"
          }
        }
      }
    },
    "/challenge/{id}/state": {
      "get": {
        "tags": [
          "Challenges"
        ],
        "operationId": "getChallengeState",
        "summary": "Poll the session (fallback for environments without WebSocket)",
        "parameters": [
          {
            "$ref": "#/components/parameters/ChallengeIdPath"
          }
        ],
        "responses": {
          "200": {
            "description": "Current state. `redirect` is only set once approved.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "required": [
                    "challenge_id",
                    "status",
                    "pairing",
                    "redirect"
                  ],
                  "properties": {
                    "challenge_id": {
                      "$ref": "#/components/schemas/ChallengeId"
                    },
                    "status": {
                      "$ref": "#/components/schemas/ChallengeStatus"
                    },
                    "pairing": {
                      "oneOf": [
                        {
                          "$ref": "#/components/schemas/SignedPairing"
                        },
                        {
                          "type": "null"
                        }
                      ]
                    },
                    "redirect": {
                      "type": [
                        "string",
                        "null"
                      ],
                      "format": "uri",
                      "description": "`redirect_uri?code=…&state=…` when the session carried an OIDC request and was approved."
                    }
                  }
                }
              }
            }
          },
          "404": {
            "$ref": "#/components/responses/UnknownChallenge"
          }
        }
      }
    },
    "/challenge/{id}/browser-key": {
      "post": {
        "tags": [
          "Challenges"
        ],
        "operationId": "attachBrowserKey",
        "summary": "Attach the browser's P-256 public key so approval issues a pairing",
        "description": "Used by the hosted login page after render. Accepted only while the session is pending and has no key yet (`ok: false` otherwise).",
        "parameters": [
          {
            "$ref": "#/components/parameters/ChallengeIdPath"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "browser_pubkey"
                ],
                "properties": {
                  "browser_pubkey": {
                    "type": "string",
                    "pattern": "^[A-Za-z0-9_-]{80,100}$",
                    "description": "Raw uncompressed P-256 public key (65 bytes) as base64url."
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Whether the key was attached.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "required": [
                    "ok"
                  ],
                  "properties": {
                    "ok": {
                      "type": "boolean"
                    }
                  }
                }
              }
            }
          },
          "400": {
            "$ref": "#/components/responses/InvalidRequest"
          },
          "404": {
            "$ref": "#/components/responses/UnknownChallenge"
          }
        }
      }
    },
    "/challenge/{id}/ws": {
      "get": {
        "tags": [
          "Challenges"
        ],
        "operationId": "challengeWebSocket",
        "summary": "WebSocket for the waiting browser",
        "description": "Upgrade to a WebSocket bridged to the session. The server sends JSON text frames:\n`{ \"type\": \"pending\", \"challenge_id\", \"exp\" }` on connect while pending, then exactly one\nterminal event and a close (code 1000):\n`{ \"type\": \"approved\", \"challenge_id\", \"pairing\": SignedPairing | null, \"redirect\": string | null }`,\n`{ \"type\": \"denied\", \"challenge_id\" }`, or `{ \"type\": \"expired\", \"challenge_id\" }`.\nA late joiner receives the terminal event immediately. Sending the text `ping` returns\n`pong`. Without an `Upgrade: websocket` header the response is `426` (plain text).\n",
        "parameters": [
          {
            "$ref": "#/components/parameters/ChallengeIdPath"
          },
          {
            "name": "Upgrade",
            "in": "header",
            "required": true,
            "schema": {
              "type": "string",
              "const": "websocket"
            }
          }
        ],
        "responses": {
          "101": {
            "description": "Switching Protocols."
          },
          "404": {
            "description": "Unknown challenge (plain text `unknown challenge`).",
            "content": {
              "text/plain": {
                "schema": {
                  "type": "string"
                }
              }
            }
          },
          "426": {
            "description": "Not a WebSocket upgrade (plain text `expected websocket`).",
            "content": {
              "text/plain": {
                "schema": {
                  "type": "string"
                }
              }
            }
          }
        }
      }
    },
    "/challenge/{id}/assert": {
      "post": {
        "tags": [
          "Challenges"
        ],
        "operationId": "submitAssertion",
        "summary": "Submit the phone's double-signed assertion",
        "description": "Device-authenticated (`Idz-Signature`) and double-signed: `device_sig` by the device\nkey, `site_sig` by the per-site key. `payload.device_id` must be the signing device.\nVerification order (PROTOCOL.md §4.1): session pending → device active and, when the\nchallenge was pushed to a specific device, the same device → assertion schema, challenge\nid, nonce, `rp_id`, `acr`, `reason_hash`, expiry, `iat` window, `device_sig`,\n`site_pubkey`, `sub`, `site_sig` → trust-on-first-use binding of `(rp_id, sub)`.\nEvery failure writes a `login.denied` audit event. On success the session is approved,\nthe waiting browser is notified, a pairing is issued when the browser supplied a key,\nan OIDC code is minted when the session carried an authorization request, and a\nVerification API record is resolved when the session belongs to one.\n",
        "security": [
          {
            "idzSignature": []
          }
        ],
        "parameters": [
          {
            "$ref": "#/components/parameters/ChallengeIdPath"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/SignedAssertion"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Approved.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "required": [
                    "status",
                    "challenge_id",
                    "sub",
                    "acr",
                    "pairing",
                    "redirect"
                  ],
                  "properties": {
                    "status": {
                      "type": "string",
                      "const": "approved"
                    },
                    "challenge_id": {
                      "$ref": "#/components/schemas/ChallengeId"
                    },
                    "sub": {
                      "$ref": "#/components/schemas/Sub"
                    },
                    "acr": {
                      "$ref": "#/components/schemas/Acr"
                    },
                    "pairing": {
                      "oneOf": [
                        {
                          "$ref": "#/components/schemas/SignedPairing"
                        },
                        {
                          "type": "null"
                        }
                      ]
                    },
                    "redirect": {
                      "type": [
                        "string",
                        "null"
                      ],
                      "format": "uri"
                    }
                  }
                }
              }
            }
          },
          "400": {
            "description": "Assertion rejected: `malformed_assertion`, `challenge_mismatch`, `nonce_mismatch`, `rp_id_mismatch`, `acr_mismatch`, `reason_mismatch`, `iat_too_early`, `iat_too_late`, `sub_mismatch`.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "401": {
            "description": "Request signature: `missing_signature`, `unknown_device`, `bad_signature`, `replayed_request`. Assertion: `unknown_device` — `payload.device_id` is not registered; `bad_device_signature`, `bad_site_pubkey`, `bad_site_signature`.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "403": {
            "description": "`device_inactive`; `wrong_device` — `payload.device_id` differs from the signing device, or the challenge was pushed to another device.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "404": {
            "$ref": "#/components/responses/UnknownChallenge"
          },
          "409": {
            "description": "`binding_conflict` — `sub` is already bound to a different site key or identity for this `rp_id`.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "410": {
            "description": "`challenge_approved`, `challenge_denied`, `challenge_expired` — the session already reached that state; `expired` — the challenge `exp` has passed.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          }
        }
      }
    },
    "/challenge/{id}/deny": {
      "post": {
        "tags": [
          "Challenges"
        ],
        "operationId": "denyChallenge",
        "summary": "Decline a challenge from the phone",
        "description": "Marks a pending session denied and notifies the browser. When the session is no longer pending the current status is returned unchanged. No body.",
        "security": [
          {
            "idzSignature": []
          }
        ],
        "parameters": [
          {
            "$ref": "#/components/parameters/ChallengeIdPath"
          }
        ],
        "responses": {
          "200": {
            "description": "Session status after the call.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "required": [
                    "status",
                    "challenge_id"
                  ],
                  "properties": {
                    "status": {
                      "$ref": "#/components/schemas/ChallengeStatus"
                    },
                    "challenge_id": {
                      "$ref": "#/components/schemas/ChallengeId"
                    }
                  }
                }
              }
            }
          },
          "401": {
            "$ref": "#/components/responses/DeviceUnauthorized"
          },
          "403": {
            "$ref": "#/components/responses/DeviceInactive"
          },
          "404": {
            "$ref": "#/components/responses/UnknownChallenge"
          }
        }
      }
    },
    "/discover/ble": {
      "post": {
        "tags": [
          "Discovery"
        ],
        "operationId": "discoverBle",
        "summary": "Resolve a rotating BLE id and push the challenge to that phone",
        "description": "Resolves the rotating id against active devices with a BLE key (current window ±1) and pushes `{ challenge_id }` to the match. Rate limited per source IP.",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "challenge_id",
                  "rotating_id"
                ],
                "properties": {
                  "challenge_id": {
                    "type": "string",
                    "minLength": 1
                  },
                  "rotating_id": {
                    "type": "string",
                    "pattern": "^[A-Za-z0-9_-]{22}$",
                    "description": "The 16-byte rotating id read from the advertisement, base64url."
                  }
                }
              }
            }
          }
        },
        "responses": {
          "202": {
            "$ref": "#/components/responses/Pushed"
          },
          "400": {
            "$ref": "#/components/responses/InvalidRequest"
          },
          "404": {
            "description": "`unknown_challenge` — no pending challenge with that id; `no_device` — no active device advertises this id.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "429": {
            "description": "`rate_limited` — per-IP limit; `push_rate_limited` — too many pushes to that device in a minute.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          }
        }
      }
    },
    "/discover/paired": {
      "post": {
        "tags": [
          "Discovery"
        ],
        "operationId": "discoverPaired",
        "summary": "Push the challenge straight to a paired browser's phone",
        "description": "`sig` is an ECDSA P-256 / SHA-256 signature (raw `r||s`, base64url) by the pairing's\nbrowser key over `\"identizen/v1/paired\\n\" + challenge_id`. Rate limited per source IP.\n",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "challenge_id",
                  "pairing_id",
                  "sig"
                ],
                "properties": {
                  "challenge_id": {
                    "type": "string",
                    "minLength": 1
                  },
                  "pairing_id": {
                    "type": "string",
                    "minLength": 1
                  },
                  "sig": {
                    "$ref": "#/components/schemas/Base64Url"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "202": {
            "$ref": "#/components/responses/Pushed"
          },
          "400": {
            "$ref": "#/components/responses/InvalidRequest"
          },
          "401": {
            "description": "`pairing_inactive` — unknown or revoked pairing; `device_inactive` — the paired device is disabled or revoked; `bad_signature` — the browser signature does not verify.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "404": {
            "description": "`unknown_challenge` — no pending challenge with that id.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "429": {
            "description": "`rate_limited` — per-IP limit; `push_rate_limited` — too many pushes to that device in a minute.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          }
        }
      }
    },
    "/me": {
      "get": {
        "tags": [
          "Account"
        ],
        "operationId": "getMe",
        "summary": "Who am I",
        "description": "Unlike the other `/me` operations, a disabled or revoked phone is answered here so it can learn its own state.",
        "security": [
          {
            "idzSignature": []
          },
          {
            "accessToken": []
          }
        ],
        "responses": {
          "200": {
            "description": "The principal's identity.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "required": [
                    "idz",
                    "handle",
                    "kind",
                    "via",
                    "device"
                  ],
                  "properties": {
                    "idz": {
                      "$ref": "#/components/schemas/Idz"
                    },
                    "handle": {
                      "oneOf": [
                        {
                          "$ref": "#/components/schemas/Handle"
                        },
                        {
                          "type": "null"
                        }
                      ]
                    },
                    "kind": {
                      "$ref": "#/components/schemas/IdentityKind"
                    },
                    "via": {
                      "$ref": "#/components/schemas/Via"
                    },
                    "device": {
                      "description": "The calling device for phone requests; `null` for dashboard requests.",
                      "oneOf": [
                        {
                          "type": "object",
                          "required": [
                            "id",
                            "status"
                          ],
                          "properties": {
                            "id": {
                              "$ref": "#/components/schemas/DeviceId"
                            },
                            "status": {
                              "$ref": "#/components/schemas/DeviceStatus"
                            }
                          }
                        },
                        {
                          "type": "null"
                        }
                      ]
                    }
                  }
                }
              }
            }
          },
          "401": {
            "$ref": "#/components/responses/MeUnauthorized"
          },
          "403": {
            "description": "`not_dashboard_client` — the bearer token was issued to a client not listed in `DASHBOARD_CLIENT_IDS`.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          }
        }
      }
    },
    "/me/devices": {
      "get": {
        "tags": [
          "Account"
        ],
        "operationId": "listMyDevices",
        "summary": "The identity's devices",
        "security": [
          {
            "idzSignature": []
          },
          {
            "accessToken": []
          }
        ],
        "responses": {
          "200": {
            "description": "All devices of the identity, including disabled and revoked ones.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "required": [
                    "devices"
                  ],
                  "properties": {
                    "devices": {
                      "type": "array",
                      "items": {
                        "$ref": "#/components/schemas/Device"
                      }
                    }
                  }
                }
              }
            }
          },
          "401": {
            "$ref": "#/components/responses/MeUnauthorized"
          },
          "403": {
            "$ref": "#/components/responses/MeForbidden"
          }
        }
      }
    },
    "/me/sessions": {
      "get": {
        "tags": [
          "Account"
        ],
        "operationId": "listMySessions",
        "summary": "Live OIDC sessions",
        "security": [
          {
            "idzSignature": []
          },
          {
            "accessToken": []
          }
        ],
        "responses": {
          "200": {
            "description": "Sessions that are neither revoked nor expired.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "required": [
                    "sessions"
                  ],
                  "properties": {
                    "sessions": {
                      "type": "array",
                      "items": {
                        "$ref": "#/components/schemas/Session"
                      }
                    }
                  }
                }
              }
            }
          },
          "401": {
            "$ref": "#/components/responses/MeUnauthorized"
          },
          "403": {
            "$ref": "#/components/responses/MeForbidden"
          }
        }
      }
    },
    "/me/pairings": {
      "get": {
        "tags": [
          "Account"
        ],
        "operationId": "listMyPairings",
        "summary": "Paired browsers",
        "security": [
          {
            "idzSignature": []
          },
          {
            "accessToken": []
          }
        ],
        "responses": {
          "200": {
            "description": "Pairings across all of the identity's devices.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "required": [
                    "pairings"
                  ],
                  "properties": {
                    "pairings": {
                      "type": "array",
                      "items": {
                        "$ref": "#/components/schemas/PairingRecord"
                      }
                    }
                  }
                }
              }
            }
          },
          "401": {
            "$ref": "#/components/responses/MeUnauthorized"
          },
          "403": {
            "$ref": "#/components/responses/MeForbidden"
          }
        }
      }
    },
    "/me/audit": {
      "get": {
        "tags": [
          "Account"
        ],
        "operationId": "listMyAudit",
        "summary": "The last 100 audit events",
        "security": [
          {
            "idzSignature": []
          },
          {
            "accessToken": []
          }
        ],
        "responses": {
          "200": {
            "description": "Newest first.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "required": [
                    "events"
                  ],
                  "properties": {
                    "events": {
                      "type": "array",
                      "maxItems": 100,
                      "items": {
                        "$ref": "#/components/schemas/AuditEvent"
                      }
                    }
                  }
                }
              }
            }
          },
          "401": {
            "$ref": "#/components/responses/MeUnauthorized"
          },
          "403": {
            "$ref": "#/components/responses/MeForbidden"
          }
        }
      }
    },
    "/me/handle": {
      "post": {
        "tags": [
          "Account"
        ],
        "operationId": "setMyHandle",
        "summary": "Set or clear the handle",
        "security": [
          {
            "idzSignature": []
          },
          {
            "accessToken": []
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/HandleUpdate"
              }
            }
          }
        },
        "responses": {
          "200": {
            "$ref": "#/components/responses/HandleUpdated"
          },
          "400": {
            "$ref": "#/components/responses/InvalidRequest"
          },
          "401": {
            "$ref": "#/components/responses/MeUnauthorized"
          },
          "403": {
            "$ref": "#/components/responses/MeForbidden"
          },
          "409": {
            "$ref": "#/components/responses/HandleTaken"
          }
        }
      }
    },
    "/me/sessions/{sid}/revoke": {
      "post": {
        "tags": [
          "Account"
        ],
        "operationId": "revokeMySession",
        "summary": "End a session",
        "description": "Revokes the session and dispatches back-channel logout to the site. Revoking an already revoked session returns it unchanged. No body.",
        "security": [
          {
            "idzSignature": []
          },
          {
            "accessToken": []
          }
        ],
        "parameters": [
          {
            "name": "sid",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Revoked.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "required": [
                    "sid",
                    "revoked_at"
                  ],
                  "properties": {
                    "sid": {
                      "type": "string"
                    },
                    "revoked_at": {
                      "type": "string",
                      "format": "date-time"
                    }
                  }
                }
              }
            }
          },
          "401": {
            "$ref": "#/components/responses/MeUnauthorized"
          },
          "403": {
            "description": "`device_inactive`; `not_dashboard_client`; `not_your_session` — the session belongs to another identity.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "404": {
            "description": "`unknown_session`.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          }
        }
      }
    },
    "/me/pairings/{id}/revoke": {
      "post": {
        "tags": [
          "Account"
        ],
        "operationId": "revokeMyPairing",
        "summary": "Remove a paired browser",
        "description": "No body.",
        "security": [
          {
            "idzSignature": []
          },
          {
            "accessToken": []
          }
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "$ref": "#/components/schemas/PairingId"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Revoked.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "required": [
                    "id",
                    "status"
                  ],
                  "properties": {
                    "id": {
                      "$ref": "#/components/schemas/PairingId"
                    },
                    "status": {
                      "$ref": "#/components/schemas/PairingStatus"
                    }
                  }
                }
              }
            }
          },
          "401": {
            "$ref": "#/components/responses/MeUnauthorized"
          },
          "403": {
            "description": "`device_inactive`; `not_dashboard_client`; `not_your_pairing` — the pairing belongs to another identity.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "404": {
            "description": "`unknown_pairing`.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "409": {
            "$ref": "#/components/responses/InvalidTransition"
          }
        }
      }
    },
    "/me/devices/{id}/revoke": {
      "post": {
        "tags": [
          "Account"
        ],
        "operationId": "revokeMyDevice",
        "summary": "Revoke one of the identity's devices",
        "description": "From another device or from the dashboard; a phone cannot revoke itself here (`403 self_revoke`). Pairings and sessions of the device cascade and back-channel logout fires. No body.",
        "security": [
          {
            "idzSignature": []
          },
          {
            "accessToken": []
          }
        ],
        "parameters": [
          {
            "$ref": "#/components/parameters/DeviceIdPath"
          }
        ],
        "responses": {
          "200": {
            "$ref": "#/components/responses/DeviceRevoked"
          },
          "401": {
            "$ref": "#/components/responses/MeUnauthorized"
          },
          "403": {
            "description": "`device_inactive`; `not_dashboard_client`; `not_your_device` — `{id}` is unknown or belongs to another identity; `self_revoke` — a phone tried to revoke itself.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "409": {
            "$ref": "#/components/responses/InvalidTransition"
          }
        }
      }
    },
    "/sites": {
      "post": {
        "tags": [
          "Sites"
        ],
        "operationId": "registerSite",
        "summary": "Register a site (relying party)",
        "description": "Open when the index runs with `OPEN_SITE_REGISTRATION=true` (dev / self-host);\notherwise `Authorization: Bearer <SITE_REGISTRATION_TOKEN>` is required\n(`403 registration_closed`). The `client_id` is `idz_<environment>_<ULID>`.\nConfidential sites receive `client_secret` once; sites with a `webhook_url` receive\n`webhook_secret` once. `rp_id` is normalised and must be unique across the index.\n",
        "security": [
          {},
          {
            "siteRegistrationToken": []
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/SiteCreate"
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Site created. Secrets are shown once.",
            "content": {
              "application/json": {
                "schema": {
                  "allOf": [
                    {
                      "$ref": "#/components/schemas/Site"
                    },
                    {
                      "$ref": "#/components/schemas/SiteSecrets"
                    }
                  ]
                }
              }
            }
          },
          "400": {
            "$ref": "#/components/responses/InvalidRequest"
          },
          "403": {
            "description": "`registration_closed` — registration needs the site registration token on this index.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "409": {
            "description": "`conflict` — a site with this `rp_id` is already registered.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          }
        },
        "callbacks": {
          "backchannelLogout": {
            "$ref": "#/components/callbacks/BackchannelLogout"
          },
          "verificationWebhook": {
            "$ref": "#/components/callbacks/VerificationWebhook"
          }
        }
      }
    },
    "/sites/{client_id}": {
      "get": {
        "tags": [
          "Sites"
        ],
        "operationId": "getSite",
        "summary": "Read a site",
        "description": "Bearer token = the site's client secret (HTTP Basic with the secret as password is accepted too). Public clients have no secret and cannot authenticate here.",
        "security": [
          {
            "clientSecretBearer": []
          },
          {
            "clientSecretBasic": []
          }
        ],
        "parameters": [
          {
            "$ref": "#/components/parameters/ClientIdPath"
          }
        ],
        "responses": {
          "200": {
            "description": "The site.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Site"
                }
              }
            }
          },
          "401": {
            "$ref": "#/components/responses/InvalidClient"
          },
          "404": {
            "$ref": "#/components/responses/UnknownClient"
          }
        }
      },
      "patch": {
        "tags": [
          "Sites"
        ],
        "operationId": "updateSite",
        "summary": "Update a site, optionally rotating its secrets",
        "security": [
          {
            "clientSecretBearer": []
          },
          {
            "clientSecretBasic": []
          }
        ],
        "parameters": [
          {
            "$ref": "#/components/parameters/ClientIdPath"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/SitePatch"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "The updated site. `client_secret` / `webhook_secret` are the new values when rotated, otherwise `null`.",
            "content": {
              "application/json": {
                "schema": {
                  "allOf": [
                    {
                      "$ref": "#/components/schemas/Site"
                    },
                    {
                      "$ref": "#/components/schemas/SiteSecrets"
                    }
                  ]
                }
              }
            }
          },
          "400": {
            "$ref": "#/components/responses/InvalidRequest"
          },
          "401": {
            "$ref": "#/components/responses/InvalidClient"
          },
          "404": {
            "$ref": "#/components/responses/UnknownClient"
          }
        },
        "callbacks": {
          "backchannelLogout": {
            "$ref": "#/components/callbacks/BackchannelLogout"
          },
          "verificationWebhook": {
            "$ref": "#/components/callbacks/VerificationWebhook"
          }
        }
      }
    },
    "/sites/{client_id}/webhook": {
      "post": {
        "tags": [
          "Sites",
          "Verification"
        ],
        "operationId": "setSiteWebhook",
        "summary": "Register (or clear) the Verification API webhook",
        "description": "Setting a URL issues a fresh `webhook_secret` (shown once); `null` clears the webhook and its secret.",
        "security": [
          {
            "clientSecretBearer": []
          },
          {
            "clientSecretBasic": []
          }
        ],
        "parameters": [
          {
            "$ref": "#/components/parameters/ClientIdPath"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "webhook_url"
                ],
                "properties": {
                  "webhook_url": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "format": "uri"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Webhook updated.",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "required": [
                    "client_id",
                    "webhook_url",
                    "webhook_secret"
                  ],
                  "properties": {
                    "client_id": {
                      "$ref": "#/components/schemas/ClientId"
                    },
                    "webhook_url": {
                      "type": [
                        "string",
                        "null"
                      ],
                      "format": "uri"
                    },
                    "webhook_secret": {
                      "type": [
                        "string",
                        "null"
                      ],
                      "description": "New secret when a URL was set; `null` when cleared."
                    }
                  }
                }
              }
            }
          },
          "400": {
            "$ref": "#/components/responses/InvalidRequest"
          },
          "401": {
            "$ref": "#/components/responses/InvalidClient"
          },
          "404": {
            "$ref": "#/components/responses/UnknownClient"
          }
        },
        "callbacks": {
          "verificationWebhook": {
            "$ref": "#/components/callbacks/VerificationWebhook"
          }
        }
      }
    },
    "/v1/verify": {
      "post": {
        "tags": [
          "Verification"
        ],
        "operationId": "startVerification",
        "summary": "Push an approval to the phone bound to a per-site `sub`",
        "description": "Creates a verification record and an `idz:mfa` challenge pushed to the active device\nbound to `sub` for this site. Authenticate with `Idz-Client-Id` plus\n`Authorization: Bearer <client_secret>`, or HTTP Basic `client_id:client_secret`.\nPublic (PKCE-only) clients cannot use this API. The result arrives by polling\n`GET /v1/verify/{id}` or through the site's webhook.\n",
        "security": [
          {
            "clientSecretBearer": []
          },
          {
            "clientSecretBasic": []
          }
        ],
        "parameters": [
          {
            "$ref": "#/components/parameters/IdzClientIdHeader"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "sub"
                ],
                "properties": {
                  "sub": {
                    "$ref": "#/components/schemas/Sub"
                  },
                  "reason": {
                    "type": [
                      "string",
                      "null"
                    ],
                    "minLength": 1,
                    "maxLength": 140,
                    "description": "Shown verbatim on the phone; its SHA-256 is echoed as `reason_hash` in the assertion."
                  },
                  "ttl": {
                    "type": "integer",
                    "minimum": 10,
                    "maximum": 600,
                    "description": "Accepted for forward compatibility; challenges always live 60 s in v1."
                  }
                }
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Verification created and pushed.",
            "content": {
              "application/json": {
                "schema": {
                  "allOf": [
                    {
                      "$ref": "#/components/schemas/Verification"
                    },
                    {
                      "type": "object",
                      "required": [
                        "challenge_id",
                        "code",
                        "expires_at"
                      ],
                      "properties": {
                        "challenge_id": {
                          "$ref": "#/components/schemas/ChallengeId"
                        },
                        "code": {
                          "$ref": "#/components/schemas/MatchCode"
                        },
                        "expires_at": {
                          "type": "integer",
                          "description": "Challenge expiry, Unix seconds."
                        }
                      }
                    }
                  ]
                }
              }
            }
          },
          "400": {
            "$ref": "#/components/responses/InvalidRequest"
          },
          "401": {
            "description": "`invalid_client` — no `Idz-Client-Id` / Basic client id, or the client secret is missing or wrong.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "404": {
            "description": "`unknown_client` — no site with that client id; `unknown_sub` — no active device is bound to `sub` for this site.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "429": {
            "description": "`client_rate_limited` — the site started too many challenges in a minute.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          }
        }
      }
    },
    "/v1/verify/{id}": {
      "get": {
        "tags": [
          "Verification"
        ],
        "operationId": "getVerification",
        "summary": "Poll a verification",
        "description": "Same credentials as `POST /v1/verify`. Only the site that created the verification can read it.",
        "security": [
          {
            "clientSecretBearer": []
          },
          {
            "clientSecretBasic": []
          }
        ],
        "parameters": [
          {
            "$ref": "#/components/parameters/IdzClientIdHeader"
          },
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "$ref": "#/components/schemas/VerificationId"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "The verification. `assertion` is set once approved.",
            "headers": {
              "Cache-Control": {
                "schema": {
                  "type": "string",
                  "const": "no-store"
                }
              }
            },
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Verification"
                }
              }
            }
          },
          "401": {
            "description": "`invalid_client`.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          },
          "404": {
            "description": "`unknown_client`; `unknown_verification` — no verification with that id for this site.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          }
        }
      }
    }
  },
  "components": {
    "securitySchemes": {
      "accessToken": {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT",
        "description": "The OIDC access token from `POST /token` (`typ: at+jwt`, ES256, 1 hour, audience =\nthe index). `/userinfo` accepts any client's token. `/me/*` additionally requires the\ntoken to have been issued to a client listed in the index's `DASHBOARD_CLIENT_IDS`\n(`403 not_dashboard_client`) and checks the session for revocation on every call.\n"
      },
      "idzSignature": {
        "type": "apiKey",
        "in": "header",
        "name": "Idz-Signature",
        "description": "Device request authentication (PROTOCOL.md §8):\n\n    Idz-Signature: v1,d=<device_id>,t=<unix seconds>,s=<base64url sig>\n\nwhere `sig = Ed25519.sign(deviceKey, UTF8(\"identizen/v1/request\\n\" + METHOD + \"\\n\" +\nPATH + \"\\n\" + base64url(SHA-256(body)) + \"\\n\" + t))`. `METHOD` is upper-case, `PATH`\nis the request path including the query string, `body` is the raw request body (empty\nstring for none). The index rejects `t` outside ±60 s of its clock (`401 bad_signature`)\nand any `(device_id, t, sig)` seen before (`401 replayed_request`); a device may send at\nmost 120 signed requests per minute. `@identizen/protocol` exports `signRequest`.\n"
      },
      "clientSecretBearer": {
        "type": "http",
        "scheme": "bearer",
        "description": "`Authorization: Bearer <client_secret>`. On `/sites/{client_id}` the client id comes\nfrom the path; on `/v1/verify*` it must be sent in the `Idz-Client-Id` header.\n"
      },
      "clientSecretBasic": {
        "type": "http",
        "scheme": "basic",
        "description": "`Authorization: Basic base64(client_id:client_secret)`."
      },
      "siteRegistrationToken": {
        "type": "http",
        "scheme": "bearer",
        "description": "`Authorization: Bearer <SITE_REGISTRATION_TOKEN>`; required by `POST /sites` unless the index runs with `OPEN_SITE_REGISTRATION=true`."
      }
    },
    "parameters": {
      "DeviceIdPath": {
        "name": "id",
        "in": "path",
        "required": true,
        "schema": {
          "$ref": "#/components/schemas/DeviceId"
        }
      },
      "ChallengeIdPath": {
        "name": "id",
        "in": "path",
        "required": true,
        "schema": {
          "$ref": "#/components/schemas/ChallengeId"
        }
      },
      "ClientIdPath": {
        "name": "client_id",
        "in": "path",
        "required": true,
        "schema": {
          "$ref": "#/components/schemas/ClientId"
        }
      },
      "IdzClientIdHeader": {
        "name": "Idz-Client-Id",
        "in": "header",
        "required": false,
        "schema": {
          "$ref": "#/components/schemas/ClientId"
        },
        "description": "The site's `client_id`. Required with bearer authentication; redundant with HTTP Basic (the header wins when both are present)."
      }
    },
    "responses": {
      "InvalidRequest": {
        "description": "`invalid_request` — the body failed validation; `issues` lists the offending fields.",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      },
      "InvalidTransition": {
        "description": "`invalid_transition` — the object is already in the requested state (for example revoking a revoked device or pairing).",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      },
      "RateLimited": {
        "description": "`rate_limited` — too many requests from this IP address in a minute; `client_rate_limited` — the site started too many logins in a minute.",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      },
      "DeviceUnauthorized": {
        "description": "`missing_signature` — `Idz-Signature` absent or malformed; `unknown_device`; `bad_signature` — wrong key, tampered request, or stale timestamp; `replayed_request`.",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      },
      "DeviceInactive": {
        "description": "`device_inactive` — the signing device is disabled or revoked.",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      },
      "MeUnauthorized": {
        "description": "Phone: `missing_signature`, `unknown_device`, `bad_signature`, `replayed_request`. Dashboard: `missing_credentials` — neither header sent; `invalid_token` — access token invalid, expired, or its session revoked.",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      },
      "MeForbidden": {
        "description": "`device_inactive` — the signing phone is disabled or revoked; `not_dashboard_client` — the bearer token belongs to a client not listed in `DASHBOARD_CLIENT_IDS`.",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      },
      "InvalidClient": {
        "description": "`invalid_client` — the client secret is missing or wrong (or the site is a public client).",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      },
      "UnknownClient": {
        "description": "`unknown_client` — no site with that `client_id`.",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      },
      "UnknownChallenge": {
        "description": "`unknown_challenge` — no session with that id (sessions are wiped a few minutes after they resolve).",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      },
      "HandleTaken": {
        "description": "`handle_taken` — another identity already uses the handle.",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      },
      "InvalidToken": {
        "description": "`invalid_token` — bearer token missing, invalid, expired, or its session revoked. Carries `WWW-Authenticate: Bearer …` (RFC 6750 §3); with a token present the challenge includes `error=\"invalid_token\"`.",
        "headers": {
          "WWW-Authenticate": {
            "schema": {
              "type": "string"
            },
            "example": "Bearer realm=\"identizen\", error=\"invalid_token\", error_description=\"session has been revoked\""
          }
        },
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      },
      "LoginPage": {
        "description": "The hosted login page.",
        "headers": {
          "Cache-Control": {
            "schema": {
              "type": "string",
              "const": "no-store"
            }
          },
          "X-Frame-Options": {
            "schema": {
              "type": "string",
              "const": "DENY"
            }
          },
          "Referrer-Policy": {
            "schema": {
              "type": "string",
              "const": "no-referrer"
            }
          }
        },
        "content": {
          "text/html": {
            "schema": {
              "type": "string"
            }
          }
        }
      },
      "AuthorizeErrorRedirect": {
        "description": "OIDC error redirect to `redirect_uri` with `error`, `error_description`, and `state` query parameters.",
        "headers": {
          "Location": {
            "schema": {
              "type": "string",
              "format": "uri"
            }
          }
        }
      },
      "AuthorizeBadRequest": {
        "description": "`invalid_client` — unknown `client_id`; `invalid_request` — `redirect_uri` is not registered for this client.",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      },
      "Userinfo": {
        "description": "Claims for the token's session.",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "required": [
                "sub",
                "idz_device"
              ],
              "properties": {
                "sub": {
                  "$ref": "#/components/schemas/Sub"
                },
                "idz_device": {
                  "$ref": "#/components/schemas/DeviceId"
                },
                "idz_handle": {
                  "$ref": "#/components/schemas/Handle",
                  "description": "Only with the `handle` scope and only when the user has set one."
                },
                "idz_org": {
                  "type": "string",
                  "description": "Organisation id for org identities; absent for personal identities."
                }
              }
            }
          }
        }
      },
      "HandleUpdated": {
        "description": "The identity's current handle.",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "required": [
                "idz",
                "handle"
              ],
              "properties": {
                "idz": {
                  "$ref": "#/components/schemas/Idz"
                },
                "handle": {
                  "oneOf": [
                    {
                      "$ref": "#/components/schemas/Handle"
                    },
                    {
                      "type": "null"
                    }
                  ]
                }
              }
            }
          }
        }
      },
      "DeviceRevoked": {
        "description": "The device's new status and how many live sessions were ended.",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "required": [
                "device_id",
                "status",
                "sessions_revoked"
              ],
              "properties": {
                "device_id": {
                  "$ref": "#/components/schemas/DeviceId"
                },
                "status": {
                  "$ref": "#/components/schemas/DeviceStatus"
                },
                "sessions_revoked": {
                  "type": "integer",
                  "minimum": 0
                }
              }
            }
          }
        }
      },
      "Pushed": {
        "description": "The challenge was queued in the device's inbox and a push was attempted.",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "required": [
                "status",
                "challenge_id"
              ],
              "properties": {
                "status": {
                  "type": "string",
                  "const": "pushed"
                },
                "challenge_id": {
                  "type": "string"
                }
              }
            }
          }
        }
      }
    },
    "callbacks": {
      "BackchannelLogout": {
        "{$request.body#/backchannel_logout_uri}": {
          "post": {
            "summary": "OpenID Connect Back-Channel Logout 1.0",
            "description": "Sent once per revoked session (device revocation, session revocation from the\nphone or dashboard) to the site's registered `backchannel_logout_uri`.\n`logout_token` is a JWT signed with the index OIDC keys (`typ: logout+jwt`, ES256,\nverify against `/.well-known/jwks.json`) with claims `iss` (index URL), `aud`\n(`client_id`), `sub` (the per-site sub), `sid`, `jti`, `iat`, `exp` (2 minutes),\nand `events: { \"http://schemas.openid.net/event/backchannel-logout\": {} }`; there is\nno `nonce`. Delivery is retried up to three times (immediately, after 0.5 s, after\n2 s) on network errors, `429`, and `5xx`; other `4xx` stop retries.\n",
            "requestBody": {
              "required": true,
              "content": {
                "application/x-www-form-urlencoded": {
                  "schema": {
                    "type": "object",
                    "required": [
                      "logout_token"
                    ],
                    "properties": {
                      "logout_token": {
                        "type": "string",
                        "description": "Signed JWT (`typ: logout+jwt`)."
                      }
                    }
                  }
                }
              }
            },
            "responses": {
              "200": {
                "description": "Acknowledged. Any 2xx stops retries."
              }
            }
          }
        }
      },
      "VerificationWebhook": {
        "{$request.body#/webhook_url}": {
          "post": {
            "summary": "Verification API result",
            "description": "Sent to the site's `webhook_url` when a verification resolves (`approved`,\n`denied`, or `timeout`). The body is a JWT signed with the index OIDC keys\n(`typ: idz-webhook+jwt`, ES256, `iss` = index URL, `aud` = `client_id`, `jti`,\n`iat`, `exp` = 10 minutes) whose claims are `event: \"verification.resolved\"`,\n`verification_id`, `status`, `sub`, `reason`, `assertion` (the signed assertion\nwhen approved, else `null`), and `resolved_at` (Unix seconds or `null`). The\n`Idz-Webhook-Signature` header (`sha256=<hex>`) is informational; verify the JWT.\nDelivery is retried up to three times (immediately, after 0.5 s, after 2 s) on\nnetwork errors, `429`, and `5xx`; other `4xx` stop retries.\n",
            "parameters": [
              {
                "name": "Idz-Event",
                "in": "header",
                "required": true,
                "schema": {
                  "type": "string",
                  "const": "verification.resolved"
                }
              },
              {
                "name": "Idz-Webhook-Signature",
                "in": "header",
                "required": false,
                "schema": {
                  "type": "string",
                  "pattern": "^sha256=[0-9a-f]{64}$"
                }
              }
            ],
            "requestBody": {
              "required": true,
              "content": {
                "application/jwt": {
                  "schema": {
                    "type": "string",
                    "description": "Signed JWT (`typ: idz-webhook+jwt`)."
                  }
                }
              }
            },
            "responses": {
              "200": {
                "description": "Acknowledged. Any 2xx stops retries."
              }
            }
          }
        }
      }
    },
    "schemas": {
      "Error": {
        "type": "object",
        "description": "Every error body. `issues` is present only for `invalid_request` from body validation.",
        "required": [
          "error",
          "error_description"
        ],
        "properties": {
          "error": {
            "type": "string",
            "description": "Stable machine-readable code; see https://docs.identizen.com/errors/."
          },
          "error_description": {
            "type": "string"
          },
          "issues": {
            "type": "array",
            "items": {
              "type": "object",
              "required": [
                "path",
                "message"
              ],
              "properties": {
                "path": {
                  "type": "string",
                  "description": "Dotted path of the offending field."
                },
                "message": {
                  "type": "string"
                }
              }
            }
          }
        }
      },
      "Base64Url": {
        "type": "string",
        "pattern": "^[A-Za-z0-9_-]+$"
      },
      "PublicKey": {
        "type": "string",
        "description": "32-byte Ed25519 public key, base64url (43 chars).",
        "pattern": "^[A-Za-z0-9_-]{43}$"
      },
      "Signature": {
        "type": "string",
        "description": "64-byte Ed25519 signature, base64url (86 chars).",
        "pattern": "^[A-Za-z0-9_-]{86}$"
      },
      "Nonce32": {
        "type": "string",
        "description": "32 random bytes, base64url (43 chars).",
        "pattern": "^[A-Za-z0-9_-]{43}$"
      },
      "KeyId": {
        "type": "string",
        "description": "`base64url(SHA-256(x))[0:32]`.",
        "pattern": "^[A-Za-z0-9_-]{32}$"
      },
      "Idz": {
        "$ref": "#/components/schemas/KeyId",
        "description": "Identity id — the key id of the master public key."
      },
      "Sub": {
        "$ref": "#/components/schemas/KeyId",
        "description": "Per-site subject — the key id of the per-site public key. Stable per (identity, rp_id)."
      },
      "ChallengeId": {
        "type": "string",
        "pattern": "^ch_[0-9A-HJKMNP-TV-Z]{26}$"
      },
      "DeviceId": {
        "type": "string",
        "pattern": "^dev_[0-9A-HJKMNP-TV-Z]{26}$"
      },
      "PairingId": {
        "type": "string",
        "pattern": "^pr_[0-9A-HJKMNP-TV-Z]{26}$"
      },
      "VerificationId": {
        "type": "string",
        "pattern": "^vf_[0-9A-HJKMNP-TV-Z]{26}$"
      },
      "ClientId": {
        "type": "string",
        "description": "`idz_live_<ULID>` or `idz_test_<ULID>`.",
        "pattern": "^idz_(live|test)_[0-9A-HJKMNP-TV-Z]{26}$"
      },
      "RpId": {
        "type": "string",
        "description": "The site host as the user sees it (lower-case host name).",
        "minLength": 1,
        "maxLength": 253,
        "pattern": "^[a-z0-9.-]+$"
      },
      "Handle": {
        "type": "string",
        "minLength": 3,
        "maxLength": 32,
        "pattern": "^[a-z0-9][a-z0-9_.-]*[a-z0-9]$"
      },
      "MatchCode": {
        "type": "string",
        "description": "Two-digit match code shown to the user and on the phone.",
        "pattern": "^[0-9]{2}$"
      },
      "Acr": {
        "type": "string",
        "enum": [
          "idz:login",
          "idz:mfa"
        ]
      },
      "Amr": {
        "type": "string",
        "enum": [
          "face",
          "fingerprint",
          "pin",
          "hwk",
          "user",
          "swk"
        ]
      },
      "IdentityKind": {
        "type": "string",
        "enum": [
          "personal",
          "org"
        ]
      },
      "PushPlatform": {
        "type": "string",
        "enum": [
          "apns",
          "fcm",
          "web"
        ]
      },
      "DeviceStatus": {
        "type": "string",
        "enum": [
          "active",
          "disabled",
          "revoked"
        ]
      },
      "PairingStatus": {
        "type": "string",
        "enum": [
          "active",
          "revoked"
        ]
      },
      "VerificationStatus": {
        "type": "string",
        "enum": [
          "pending",
          "approved",
          "denied",
          "timeout"
        ]
      },
      "ChallengeStatus": {
        "type": "string",
        "description": "Session status of a challenge.",
        "enum": [
          "pending",
          "approved",
          "denied",
          "expired"
        ]
      },
      "Via": {
        "type": "string",
        "description": "How the `/me` caller authenticated.",
        "enum": [
          "device",
          "dashboard"
        ]
      },
      "Challenge": {
        "type": "object",
        "description": "The payload the index signs and the phone verifies (PROTOCOL.md §3). `exp - iat` is always 60.",
        "additionalProperties": false,
        "required": [
          "type",
          "id",
          "rp_id",
          "rp_name",
          "nonce",
          "code",
          "iat",
          "exp",
          "index",
          "acr",
          "reason"
        ],
        "properties": {
          "type": {
            "type": "string",
            "const": "challenge"
          },
          "id": {
            "$ref": "#/components/schemas/ChallengeId"
          },
          "rp_id": {
            "$ref": "#/components/schemas/RpId"
          },
          "rp_name": {
            "type": "string",
            "minLength": 1,
            "maxLength": 64
          },
          "nonce": {
            "$ref": "#/components/schemas/Nonce32"
          },
          "code": {
            "$ref": "#/components/schemas/MatchCode"
          },
          "iat": {
            "type": "integer",
            "minimum": 0,
            "description": "Unix seconds."
          },
          "exp": {
            "type": "integer",
            "minimum": 0,
            "description": "Unix seconds; `iat + 60`."
          },
          "index": {
            "type": "string",
            "format": "uri",
            "description": "Issuer URL of the index that signed the challenge."
          },
          "acr": {
            "$ref": "#/components/schemas/Acr"
          },
          "reason": {
            "type": [
              "string",
              "null"
            ],
            "minLength": 1,
            "maxLength": 140
          }
        }
      },
      "SignedChallenge": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "payload",
          "sig"
        ],
        "properties": {
          "payload": {
            "$ref": "#/components/schemas/Challenge"
          },
          "sig": {
            "$ref": "#/components/schemas/Signature",
            "description": "Index Ed25519 signature of type `challenge` over the canonical payload."
          }
        }
      },
      "Assertion": {
        "type": "object",
        "description": "The phone's answer to a challenge (PROTOCOL.md §4).",
        "additionalProperties": false,
        "required": [
          "type",
          "challenge_id",
          "nonce",
          "rp_id",
          "sub",
          "site_pubkey",
          "device_id",
          "iat",
          "amr",
          "acr",
          "reason_hash"
        ],
        "properties": {
          "type": {
            "type": "string",
            "const": "assertion"
          },
          "challenge_id": {
            "$ref": "#/components/schemas/ChallengeId"
          },
          "nonce": {
            "$ref": "#/components/schemas/Nonce32"
          },
          "rp_id": {
            "$ref": "#/components/schemas/RpId"
          },
          "sub": {
            "$ref": "#/components/schemas/Sub"
          },
          "site_pubkey": {
            "$ref": "#/components/schemas/PublicKey",
            "description": "The per-site Ed25519 public key; `sub` is its key id."
          },
          "device_id": {
            "$ref": "#/components/schemas/DeviceId"
          },
          "iat": {
            "type": "integer",
            "minimum": 0,
            "description": "Unix seconds."
          },
          "amr": {
            "type": "array",
            "minItems": 1,
            "items": {
              "$ref": "#/components/schemas/Amr"
            }
          },
          "acr": {
            "$ref": "#/components/schemas/Acr"
          },
          "reason_hash": {
            "type": [
              "string",
              "null"
            ],
            "pattern": "^[A-Za-z0-9_-]{43}$",
            "description": "`base64url(SHA-256(UTF8(reason)))`, or `null` when the challenge had no reason."
          }
        }
      },
      "SignedAssertion": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "payload",
          "site_sig",
          "device_sig"
        ],
        "properties": {
          "payload": {
            "$ref": "#/components/schemas/Assertion"
          },
          "site_sig": {
            "$ref": "#/components/schemas/Signature",
            "description": "Per-site key signature of type `assertion` over the canonical payload."
          },
          "device_sig": {
            "$ref": "#/components/schemas/Signature",
            "description": "Device key signature of type `assertion` over the canonical payload."
          }
        }
      },
      "Pairing": {
        "type": "object",
        "description": "A browser pairing issued on approval (PROTOCOL.md §6.4).",
        "additionalProperties": false,
        "required": [
          "type",
          "pairing_id",
          "device_id",
          "browser_pubkey",
          "issued_at"
        ],
        "properties": {
          "type": {
            "type": "string",
            "const": "pairing"
          },
          "pairing_id": {
            "$ref": "#/components/schemas/PairingId"
          },
          "device_id": {
            "$ref": "#/components/schemas/DeviceId"
          },
          "browser_pubkey": {
            "$ref": "#/components/schemas/Base64Url",
            "description": "Raw uncompressed P-256 public key (65 bytes) as base64url."
          },
          "issued_at": {
            "type": "integer",
            "minimum": 0,
            "description": "Unix seconds."
          }
        }
      },
      "SignedPairing": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "payload",
          "sig"
        ],
        "properties": {
          "payload": {
            "$ref": "#/components/schemas/Pairing"
          },
          "sig": {
            "$ref": "#/components/schemas/Signature",
            "description": "Index Ed25519 signature of type `pairing` over the canonical payload."
          }
        }
      },
      "DeviceRegistration": {
        "type": "object",
        "description": "Body of `POST /devices` (unsigned).",
        "additionalProperties": false,
        "required": [
          "device_pubkey",
          "master_pubkey",
          "master_sig"
        ],
        "properties": {
          "device_pubkey": {
            "$ref": "#/components/schemas/PublicKey"
          },
          "master_pubkey": {
            "$ref": "#/components/schemas/PublicKey"
          },
          "master_sig": {
            "$ref": "#/components/schemas/Signature",
            "description": "Ed25519 signature of type `identity` over `{ \"device_pubkey\": … }` by the master key."
          },
          "handle": {
            "$ref": "#/components/schemas/Handle"
          },
          "kind": {
            "$ref": "#/components/schemas/IdentityKind",
            "default": "personal"
          },
          "ble_key": {
            "$ref": "#/components/schemas/Base64Url",
            "description": "32-byte BLE HMAC key, base64url. Enables BLE discovery."
          },
          "push_token": {
            "type": "string",
            "maxLength": 4096
          },
          "push_platform": {
            "$ref": "#/components/schemas/PushPlatform"
          },
          "attestation": {
            "type": "object",
            "additionalProperties": true
          },
          "label": {
            "type": "string",
            "maxLength": 64,
            "description": "Recorded in the `device.enrolled` audit event only."
          }
        }
      },
      "HandleUpdate": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "handle"
        ],
        "properties": {
          "handle": {
            "oneOf": [
              {
                "$ref": "#/components/schemas/Handle"
              },
              {
                "type": "null"
              }
            ]
          }
        }
      },
      "ChallengeStartRequest": {
        "type": "object",
        "description": "Body of `POST /challenge`.",
        "additionalProperties": false,
        "required": [
          "client_id"
        ],
        "properties": {
          "client_id": {
            "type": "string",
            "minLength": 1
          },
          "acr": {
            "$ref": "#/components/schemas/Acr",
            "default": "idz:login"
          },
          "reason": {
            "type": [
              "string",
              "null"
            ],
            "minLength": 1,
            "maxLength": 140
          },
          "login_hint": {
            "type": "string",
            "minLength": 1,
            "description": "The per-site `sub` whose bound device receives the push."
          },
          "browser_pubkey": {
            "$ref": "#/components/schemas/Base64Url",
            "description": "Raw P-256 public key of the browser, so approval issues a pairing."
          },
          "redirect_uri": {
            "type": "string",
            "format": "uri",
            "description": "Presence turns the session into an OIDC authorization request whose approval yields a code for `POST /token`."
          },
          "state": {
            "type": "string",
            "maxLength": 512
          },
          "nonce": {
            "type": "string",
            "maxLength": 512
          },
          "code_challenge": {
            "type": "string",
            "minLength": 43,
            "maxLength": 128
          },
          "code_challenge_method": {
            "type": "string",
            "const": "S256"
          },
          "scope": {
            "type": "string",
            "maxLength": 256
          },
          "prompt": {
            "type": "string",
            "enum": [
              "enroll",
              "login",
              "none",
              "consent"
            ]
          }
        }
      },
      "ChallengeStarted": {
        "type": "object",
        "required": [
          "challenge_id",
          "code",
          "exp",
          "acr",
          "rp_name",
          "deep_link",
          "ws_url",
          "pushed"
        ],
        "properties": {
          "challenge_id": {
            "$ref": "#/components/schemas/ChallengeId"
          },
          "code": {
            "$ref": "#/components/schemas/MatchCode"
          },
          "exp": {
            "type": "integer",
            "description": "Unix seconds."
          },
          "acr": {
            "$ref": "#/components/schemas/Acr"
          },
          "rp_name": {
            "type": "string"
          },
          "deep_link": {
            "type": "string",
            "format": "uri",
            "description": "`<APP_URL>/l/<challenge_id>` — opens the phone app (also the QR content)."
          },
          "ws_url": {
            "type": "string",
            "format": "uri",
            "description": "`wss://…/challenge/<id>/ws`."
          },
          "pushed": {
            "type": "boolean",
            "description": "Whether the challenge was pushed to a bound device at creation."
          }
        }
      },
      "Device": {
        "type": "object",
        "description": "A device as listed by `GET /me/devices`.",
        "required": [
          "id",
          "status",
          "push_platform",
          "has_ble",
          "last_seen_at",
          "created_at",
          "current"
        ],
        "properties": {
          "id": {
            "$ref": "#/components/schemas/DeviceId"
          },
          "status": {
            "$ref": "#/components/schemas/DeviceStatus"
          },
          "push_platform": {
            "oneOf": [
              {
                "$ref": "#/components/schemas/PushPlatform"
              },
              {
                "type": "null"
              }
            ]
          },
          "has_ble": {
            "type": "boolean"
          },
          "last_seen_at": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          },
          "current": {
            "type": "boolean",
            "description": "`true` for the calling phone; always `false` for dashboard callers."
          }
        }
      },
      "Session": {
        "type": "object",
        "description": "A live OIDC session as listed by `GET /me/sessions`.",
        "required": [
          "sid",
          "client_id",
          "device_id",
          "created_at",
          "expires_at"
        ],
        "properties": {
          "sid": {
            "type": "string"
          },
          "client_id": {
            "$ref": "#/components/schemas/ClientId"
          },
          "device_id": {
            "$ref": "#/components/schemas/DeviceId"
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          },
          "expires_at": {
            "type": "string",
            "format": "date-time"
          }
        }
      },
      "PairingRecord": {
        "type": "object",
        "description": "A paired browser as listed by `GET /me/pairings`. Browser and OS fields are parsed from the pairing browser's User-Agent.",
        "required": [
          "id",
          "device_id",
          "label",
          "browser",
          "browser_version",
          "os",
          "os_version",
          "last_ip",
          "status",
          "last_used_at",
          "created_at"
        ],
        "properties": {
          "id": {
            "$ref": "#/components/schemas/PairingId"
          },
          "device_id": {
            "$ref": "#/components/schemas/DeviceId"
          },
          "label": {
            "type": [
              "string",
              "null"
            ],
            "description": "Human label such as `Chrome 128 on macOS`."
          },
          "browser": {
            "type": [
              "string",
              "null"
            ]
          },
          "browser_version": {
            "type": [
              "string",
              "null"
            ]
          },
          "os": {
            "type": [
              "string",
              "null"
            ]
          },
          "os_version": {
            "type": [
              "string",
              "null"
            ]
          },
          "last_ip": {
            "type": [
              "string",
              "null"
            ]
          },
          "status": {
            "$ref": "#/components/schemas/PairingStatus"
          },
          "last_used_at": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          }
        }
      },
      "AuditEvent": {
        "type": "object",
        "required": [
          "id",
          "at",
          "kind",
          "device_id",
          "client_id",
          "detail"
        ],
        "properties": {
          "id": {
            "type": "integer"
          },
          "at": {
            "type": "string",
            "format": "date-time"
          },
          "kind": {
            "type": "string",
            "description": "Dotted event kind, e.g. `login.success`, `device.revoked`, `pairing.created`."
          },
          "device_id": {
            "type": [
              "string",
              "null"
            ]
          },
          "client_id": {
            "type": [
              "string",
              "null"
            ]
          },
          "detail": {
            "type": [
              "object",
              "null"
            ],
            "additionalProperties": true
          }
        }
      },
      "SiteCreate": {
        "type": "object",
        "description": "Body of `POST /sites`.",
        "additionalProperties": false,
        "required": [
          "name",
          "rp_id",
          "redirect_uris"
        ],
        "properties": {
          "name": {
            "type": "string",
            "minLength": 1,
            "maxLength": 64,
            "description": "Shown on the phone as `rp_name`."
          },
          "rp_id": {
            "type": "string",
            "minLength": 1,
            "maxLength": 253,
            "description": "The site host; normalised before storage."
          },
          "redirect_uris": {
            "type": "array",
            "minItems": 1,
            "maxItems": 32,
            "items": {
              "type": "string",
              "format": "uri"
            }
          },
          "backchannel_logout_uri": {
            "type": [
              "string",
              "null"
            ],
            "format": "uri"
          },
          "webhook_url": {
            "type": [
              "string",
              "null"
            ],
            "format": "uri"
          },
          "public": {
            "type": "boolean",
            "default": false,
            "description": "Public (PKCE-only) clients get no client secret."
          },
          "environment": {
            "type": "string",
            "enum": [
              "live",
              "test"
            ],
            "default": "live",
            "description": "Prefix of the generated `client_id`."
          }
        }
      },
      "SitePatch": {
        "type": "object",
        "description": "Body of `PATCH /sites/{client_id}`. Every field is optional.",
        "additionalProperties": false,
        "properties": {
          "name": {
            "type": "string",
            "minLength": 1,
            "maxLength": 64
          },
          "redirect_uris": {
            "type": "array",
            "minItems": 1,
            "maxItems": 32,
            "items": {
              "type": "string",
              "format": "uri"
            }
          },
          "backchannel_logout_uri": {
            "type": [
              "string",
              "null"
            ],
            "format": "uri"
          },
          "webhook_url": {
            "type": [
              "string",
              "null"
            ],
            "format": "uri"
          },
          "rotate_webhook_secret": {
            "type": "boolean"
          },
          "rotate_client_secret": {
            "type": "boolean"
          }
        }
      },
      "Site": {
        "type": "object",
        "description": "The public view of a site.",
        "required": [
          "client_id",
          "rp_id",
          "name",
          "redirect_uris",
          "backchannel_logout_uri",
          "webhook_url",
          "public_client",
          "created_at"
        ],
        "properties": {
          "client_id": {
            "$ref": "#/components/schemas/ClientId"
          },
          "rp_id": {
            "$ref": "#/components/schemas/RpId"
          },
          "name": {
            "type": "string"
          },
          "redirect_uris": {
            "type": "array",
            "items": {
              "type": "string",
              "format": "uri"
            }
          },
          "backchannel_logout_uri": {
            "type": [
              "string",
              "null"
            ],
            "format": "uri"
          },
          "webhook_url": {
            "type": [
              "string",
              "null"
            ],
            "format": "uri"
          },
          "public_client": {
            "type": "boolean",
            "description": "`true` when the site has no client secret."
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          }
        }
      },
      "SiteSecrets": {
        "type": "object",
        "required": [
          "client_secret",
          "webhook_secret"
        ],
        "properties": {
          "client_secret": {
            "type": [
              "string",
              "null"
            ],
            "description": "Shown once — at creation for confidential clients, or when rotated. Otherwise `null`."
          },
          "webhook_secret": {
            "type": [
              "string",
              "null"
            ],
            "description": "Shown once — when a `webhook_url` was set at creation, or when rotated. Otherwise `null`."
          }
        }
      },
      "Verification": {
        "type": "object",
        "description": "A Verification API record.",
        "required": [
          "verification_id",
          "status",
          "sub",
          "reason",
          "created_at",
          "resolved_at",
          "assertion"
        ],
        "properties": {
          "verification_id": {
            "$ref": "#/components/schemas/VerificationId"
          },
          "status": {
            "$ref": "#/components/schemas/VerificationStatus"
          },
          "sub": {
            "$ref": "#/components/schemas/Sub"
          },
          "reason": {
            "type": [
              "string",
              "null"
            ]
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          },
          "resolved_at": {
            "type": [
              "string",
              "null"
            ],
            "format": "date-time"
          },
          "assertion": {
            "description": "The phone's double-signed assertion once approved; `null` otherwise.",
            "oneOf": [
              {
                "$ref": "#/components/schemas/SignedAssertion"
              },
              {
                "type": "null"
              }
            ]
          }
        }
      },
      "AuthorizeRequest": {
        "type": "object",
        "description": "The `GET /authorize` query parameters as a form body; see the GET operation for each field.",
        "required": [
          "response_type",
          "client_id",
          "redirect_uri",
          "scope",
          "code_challenge",
          "code_challenge_method"
        ],
        "properties": {
          "response_type": {
            "type": "string",
            "const": "code"
          },
          "client_id": {
            "$ref": "#/components/schemas/ClientId"
          },
          "redirect_uri": {
            "type": "string",
            "format": "uri"
          },
          "scope": {
            "type": "string",
            "example": "openid handle"
          },
          "code_challenge": {
            "type": "string"
          },
          "code_challenge_method": {
            "type": "string",
            "const": "S256"
          },
          "state": {
            "type": "string"
          },
          "nonce": {
            "type": "string"
          },
          "acr_values": {
            "type": "string"
          },
          "login_hint": {
            "type": "string"
          },
          "prompt": {
            "type": "string"
          }
        }
      },
      "TokenRequest": {
        "type": "object",
        "required": [
          "grant_type",
          "code"
        ],
        "properties": {
          "grant_type": {
            "type": "string",
            "const": "authorization_code"
          },
          "code": {
            "type": "string",
            "description": "`<challenge_id>.<secret>` from the authorization redirect."
          },
          "code_verifier": {
            "type": "string",
            "description": "Required whenever the authorization request carried a `code_challenge`, which is every request unless the index runs with `OIDC_PKCE_OPTIONAL=true` and the client is confidential."
          },
          "redirect_uri": {
            "type": "string",
            "format": "uri",
            "description": "Required whenever the authorization request carried one; must match exactly."
          },
          "client_id": {
            "$ref": "#/components/schemas/ClientId",
            "description": "Required unless sent via HTTP Basic."
          },
          "client_secret": {
            "type": "string",
            "description": "`client_secret_post`; omit for public clients or when using HTTP Basic."
          }
        }
      },
      "TokenResponse": {
        "type": "object",
        "required": [
          "access_token",
          "token_type",
          "expires_in",
          "id_token",
          "scope"
        ],
        "properties": {
          "access_token": {
            "type": "string",
            "description": "JWT (`typ: at+jwt`, ES256) for `/userinfo` and, for dashboard clients, `/me`."
          },
          "token_type": {
            "type": "string",
            "const": "Bearer"
          },
          "expires_in": {
            "type": "integer",
            "const": 3600
          },
          "id_token": {
            "type": "string",
            "description": "JWT (ES256, 1 hour) with claims `iss`, `sub`, `aud`, `iat`, `exp`, `sid`, `amr`, `acr`, `auth_time`, `at_hash`, `idz_device`, and optionally `nonce`, `idz_handle`, `idz_org`. Never an email."
          },
          "scope": {
            "type": "string"
          }
        }
      },
      "OpenIdConfiguration": {
        "type": "object",
        "required": [
          "issuer",
          "authorization_endpoint",
          "token_endpoint",
          "userinfo_endpoint",
          "jwks_uri",
          "response_types_supported",
          "response_modes_supported",
          "grant_types_supported",
          "subject_types_supported",
          "id_token_signing_alg_values_supported",
          "scopes_supported",
          "token_endpoint_auth_methods_supported",
          "claims_supported",
          "claims_parameter_supported",
          "code_challenge_methods_supported",
          "acr_values_supported",
          "backchannel_logout_supported",
          "backchannel_logout_session_supported",
          "request_parameter_supported",
          "request_uri_parameter_supported",
          "service_documentation"
        ],
        "properties": {
          "issuer": {
            "type": "string",
            "format": "uri"
          },
          "authorization_endpoint": {
            "type": "string",
            "format": "uri"
          },
          "token_endpoint": {
            "type": "string",
            "format": "uri"
          },
          "userinfo_endpoint": {
            "type": "string",
            "format": "uri"
          },
          "jwks_uri": {
            "type": "string",
            "format": "uri"
          },
          "response_types_supported": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "const": [
              "code"
            ]
          },
          "response_modes_supported": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "const": [
              "query"
            ]
          },
          "grant_types_supported": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "const": [
              "authorization_code"
            ]
          },
          "subject_types_supported": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "const": [
              "pairwise"
            ]
          },
          "id_token_signing_alg_values_supported": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "const": [
              "ES256"
            ]
          },
          "scopes_supported": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "const": [
              "openid",
              "handle"
            ]
          },
          "token_endpoint_auth_methods_supported": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "const": [
              "client_secret_basic",
              "client_secret_post",
              "none"
            ]
          },
          "claims_supported": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "const": [
              "iss",
              "sub",
              "aud",
              "exp",
              "iat",
              "nonce",
              "sid",
              "amr",
              "acr",
              "auth_time",
              "idz_device",
              "idz_handle",
              "idz_org"
            ]
          },
          "claims_parameter_supported": {
            "type": "boolean",
            "const": false
          },
          "code_challenge_methods_supported": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "const": [
              "S256"
            ]
          },
          "acr_values_supported": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "const": [
              "idz:login",
              "idz:mfa"
            ]
          },
          "backchannel_logout_supported": {
            "type": "boolean",
            "const": true
          },
          "backchannel_logout_session_supported": {
            "type": "boolean",
            "const": true
          },
          "request_parameter_supported": {
            "type": "boolean",
            "const": false
          },
          "request_uri_parameter_supported": {
            "type": "boolean",
            "const": false
          },
          "service_documentation": {
            "type": "string",
            "format": "uri",
            "const": "https://docs.identizen.com"
          }
        }
      },
      "Jwk": {
        "type": "object",
        "description": "Public ES256 JSON Web Key.",
        "required": [
          "kid",
          "kty",
          "crv",
          "x",
          "y",
          "alg",
          "use"
        ],
        "properties": {
          "kid": {
            "type": "string"
          },
          "kty": {
            "type": "string",
            "const": "EC"
          },
          "crv": {
            "type": "string",
            "const": "P-256"
          },
          "x": {
            "type": "string"
          },
          "y": {
            "type": "string"
          },
          "alg": {
            "type": "string",
            "const": "ES256"
          },
          "use": {
            "type": "string",
            "const": "sig"
          }
        }
      },
      "ServiceDescriptor": {
        "type": "object",
        "required": [
          "service",
          "issuer",
          "protocol",
          "app",
          "docs",
          "source",
          "endpoints"
        ],
        "properties": {
          "service": {
            "type": "string",
            "const": "identizen-index"
          },
          "issuer": {
            "type": "string",
            "format": "uri"
          },
          "protocol": {
            "type": "string",
            "const": "identizen/v1"
          },
          "app": {
            "type": "string",
            "format": "uri"
          },
          "docs": {
            "type": "string",
            "format": "uri",
            "const": "https://docs.identizen.com"
          },
          "source": {
            "type": "string",
            "format": "uri",
            "const": "https://github.com/identizen/platform"
          },
          "endpoints": {
            "type": "object",
            "description": "Discovery endpoint path → one-line description.",
            "additionalProperties": {
              "type": "string"
            }
          }
        }
      },
      "Health": {
        "type": "object",
        "required": [
          "ok",
          "service",
          "issuer",
          "database"
        ],
        "properties": {
          "ok": {
            "type": "boolean"
          },
          "service": {
            "type": "string",
            "const": "identizen-index"
          },
          "issuer": {
            "type": "string",
            "format": "uri"
          },
          "database": {
            "type": "string",
            "enum": [
              "ok",
              "error"
            ]
          }
        }
      }
    }
  }
};
