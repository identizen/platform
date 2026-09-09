---
'@identizen/db': minor
---

`deliveries` table (migration 0005) and queries: the outbox for webhooks and back-channel logout tokens, with `claimDueDeliveries` (leased, `FOR UPDATE SKIP LOCKED`), `recordDeliveryAttempt`, `listDeliveriesForSite` and `purgeDeliveries`; audit kind `delivery.failed`.
