---
'@identizen/index': patch
---

A spent authorization code is bound to its client and redirect before any reuse signal, so another client presenting it neither learns of nor revokes the session it produced (F05). The egress policy canonicalizes hostnames (`localhost.` no longer passes), and `fetchOutbound` reads the response body under the same deadline as the headers, capped at 64 KiB (`OUTBOUND_MAX_BODY_BYTES`, `readBounded`), so a trickling server cannot hold a webhook, logout or push attempt open (F06).
