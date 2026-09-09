---
'@identizen/index': minor
---

Index key rotation without stranding phones. `INDEX_KEY_ROTATIONS` (a JSON array of signed rotation statements, oldest first) is published as `rotations` at `GET /.well-known/identizen`, now cached for five minutes; `npm run keys:index -- rotate` generates the new key and the statement the retiring key signs. The rotation runbook is in the production self-hosting guide.
