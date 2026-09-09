---
'@identizen/index': minor
---

Durable delivery. A Verification API result or a back-channel logout is written to the `deliveries` outbox before the first attempt, tried once in the request, and retried by the new `scheduled` export (cron `*/5 * * * *` in wrangler.jsonc; the container fires it every `SCHEDULED_INTERVAL` seconds) with backoff over about two days, each attempt with a freshly minted token. A refusal or an exhausted schedule records `delivery.failed`. Hosts with their own scheduler call `sweepDeliveries(deliveryContext(env), db)`; `deliverWebhook` and `sendLogoutTokens` keep their signatures.
