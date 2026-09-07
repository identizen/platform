---
'@identizen/index': minor
---

`hooks.onSessionCreate` may return `{ ttlSeconds }` to shorten a session (never beyond the index default), so an embedder can enforce an organisation's session maximum age.
