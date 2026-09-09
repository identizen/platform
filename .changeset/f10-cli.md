---
'identizen': minor
---

The scaffolded Express and Next.js integrations refuse to run with `NODE_ENV=production` on their process-local revocation store until it is replaced by a shared one; `IDENTIZEN_ALLOW_MEMORY_REVOCATIONS=true` is the explicit opt-out for a single instance (F10, 2026-09-08 review).
