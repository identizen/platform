# identizen

## 0.3.0

### Minor Changes

- `register-site` and `init` print the DNS TXT record (or well-known file) a live site must publish to prove its domain, and the new `verify-site --client-id <idz_…>` asks the index to check it. Registration on the hosted index is open again; `--token` is only for indexes that keep it closed.

## 0.2.0

### Minor Changes

- Scaffolds record back-channel revocations through a two-call `revocations` store (memory by default, ready for your database or cache), the Next template signs its session cookie with a generated `IDENTIZEN_SESSION_SECRET` (never the client secret), uses a `Secure` transaction cookie and day-long sessions (`IDENTIZEN_SESSION_TTL`), and the Express template regenerates the session after login. `init` writes `IDENTIZEN_SESSION_SECRET`. `--token` passes a registration token for indexes with closed registration.

### Patch Changes

- @identizen/fake-phone@0.2.0
