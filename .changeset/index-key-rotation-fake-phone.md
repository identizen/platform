---
'@identizen/fake-phone': minor
---

Re-pins the index key along the published rotation chain (PROTOCOL.md §3.1) when a challenge fails with `bad_index_signature`; a chain that does not verify, or names another index, leaves the pin alone.
