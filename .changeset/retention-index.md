---
'@identizen/index': minor
---

Retention and deletion. The scheduled sweep now also purges ended sessions, resolved verifications and settled deliveries after thirty days, unverified registrations after two, and audit events after `AUDIT_RETENTION_DAYS` (365 by default, `0` keeps them). `DELETE /me` (phone-signed or dashboard bearer) removes the identity and everything about it, sends a back-channel logout to every live session's site first, records an anonymized `identity.deleted`, and leaves a tombstone; `reason: "compromised"` refuses any later enrollment of the same master key (`403 identity_revoked`). Hosts clear their own rows in the new `onDeleteIdentity` hook.
