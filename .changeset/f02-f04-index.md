---
'@identizen/index': minor
---

Approval side effects can no longer outrun a denial, a revocation cannot race session issuance, and a device key is enrolled once even under concurrent registration (F02–F04, 2026-09-08 review).

- `ChallengeStore` gains `reserve()` and `release()`: the assertion route claims the session before writing the binding, pairing and success audit, `deny()` throws `ReservedError` (`isReservedError`) while the claim is held and the route answers `409 approval_in_progress`, expiry waits `RESERVE_GRACE_MS`, and a failed write releases the claim and revokes a pairing already written. A host that supplies its own stores must implement both methods.
- `/token` inserts the session with `createSessionForActiveDevice`; `/userinfo` and `/me/*` refuse a bearer whose device is no longer active.
- `POST /devices` uses `enrollDevice`, so the second of two racing registrations gets the first one's row (`200`) instead of a duplicate; migration 0003 in `@identizen/db` must be applied.
