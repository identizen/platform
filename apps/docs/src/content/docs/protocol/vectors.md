---
title: Test vectors
description: The byte-exact interop contract in spec/vectors — what each file covers and how to reproduce it.
---

`spec/vectors/*.json` are generated from fixed inputs by `npm run vectors -w @identizen/protocol` and committed. `@identizen/protocol` reproduces them byte for byte in its test suite; the mobile app runs the same check on Hermes, and any third-party implementation must match them to interoperate.

Fixed inputs: seed `000102…1f` (32 bytes), device key `2021…3f`, index key `4041…5f`, BLE key `6061…7f`, `iat = 1756560000`, fixed challenge / device / pairing ULIDs, and a fixed 32-byte nonce.

| File                | Covers                                                                                                                                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `keys.json`         | The 24-word mnemonic for the seed, the master key and `idz`, per-site keys and `sub` for `app.example.com` and `login.example.org`, the device key, the index key, and the identity proof (`master_sig` over `{ device_pubkey }`). |
| `canonicalize.json` | JCS (RFC 8785) input/output pairs: key ordering, nesting, unicode and escapes, number formatting.                                                                                                                                  |
| `challenge.json`    | A signed `idz:login` challenge and a signed `idz:mfa` challenge with a `reason`, each with the exact signing input (`identizen/v1/challenge\n` + canonical JSON) and the index signature.                                          |
| `assertion.json`    | The double-signed assertions for both challenges, with `reason_hash` for the MFA case, the signing input, `site_sig`, and `device_sig`.                                                                                            |
| `pairing.json`      | A signed pairing record and the bytes a paired browser signs (`identizen/v1/paired\n<challenge id>`).                                                                                                                              |
| `request.json`      | An `Idz-Signature` header for `POST /identities` with its method, path, body, and timestamp.                                                                                                                                       |
| `ble.json`          | The rotating BLE identifier for the window containing `iat` and its two neighbours.                                                                                                                                                |

Verify a third-party implementation by loading each file and checking that your canonicalization, derivation, signing, and encoding produce the same strings. The protocol package's `src/vectors.test.ts` shows the expected assertions.
