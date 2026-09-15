---
'@identizen/dashboard': minor
---

The `/l/<id>` deep-link page honors `?index=<issuer>`: a challenge from another (self-hosted) index is read from that index, and the "Open in the Identizen app" link carries the issuer along, the way the phone expects it. `api()` takes an `indexUrl` option for the same purpose.
