---
'@identizen/index': minor
'@identizen/db': minor
---

Header and request-cost hardening from the 2026-09-08 review (F08, F09, F11).

- Every response carries `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` and, over https, HSTS; the hosted login page gets a per-response nonce CSP and the root page a static one.
- CORS is per route: the login, discovery and token endpoints still answer any origin, while `/me/*` answers only `APP_URL`'s origin and the new `CORS_ALLOWED_ORIGINS` list. A host whose dashboard lives on another origin must list it.
- Signed request bodies are capped at 64 KiB (`readBodyCapped`, `413 payload_too_large`) and any declared body over 1 MiB is refused before a route runs.
- `X-Forwarded-For` is believed only with `TRUST_PROXY_HEADERS=true` (`clientIp`); `/discover/ble` scans at most `BLE_LOOKUP_LIMIT` recently seen advertisers, served by the partial index in `@identizen/db` migration 0004.
- The Worker compatibility date moves to 2026-09-01.
