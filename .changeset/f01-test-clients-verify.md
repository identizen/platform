---
'@identizen/index': patch
---

Domain verification is decided by the host alone. An `idz_test_` client for a real host must prove the domain like a live one, and test registrations that were auto-passed before now read as `pending` until they verify (F01, 2026-09-08 review).
