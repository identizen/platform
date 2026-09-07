# identizen

## 0.2.0

### Minor Changes

- Scaffolds record back-channel revocations through a two-call `revocations` store (memory by default, ready for your database or cache), the Next template signs its session cookie with a generated `IDENTIZEN_SESSION_SECRET` (never the client secret), uses a `Secure` transaction cookie and day-long sessions (`IDENTIZEN_SESSION_TTL`), and the Express template regenerates the session after login. `init` writes `IDENTIZEN_SESSION_SECRET`. `--token` passes a registration token for indexes with closed registration.

### Patch Changes

- @identizen/fake-phone@0.2.0
