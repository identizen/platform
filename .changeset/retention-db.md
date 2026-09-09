---
'@identizen/db': minor
---

Retention and deletion: `purgeSessions`, `purgeVerifications`, `purgeAuditEvents`, `purgeStalePendingSites`; `deleteIdentityData` (everything about an identity in one transaction, returning its live sessions) and `identity_tombstones` (migration 0006) with `getTombstone`.
