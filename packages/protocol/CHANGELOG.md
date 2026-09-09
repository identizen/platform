# @identizen/protocol

## 0.5.0

### Minor Changes

- 33ee52c: Index key rotation by cross-certification (PROTOCOL.md §3.1): `Rotation` and `SignedRotation` schemas, `signRotation`, `verifyRotation`, and `resolveIndexKey`, which walks a published chain of statements from a pinned key to the current one. New test vector `rotation.json`.

## 0.2.0

### Minor Changes

- `amr` gains `iris` and the exported `USER_VERIFYING_AMR` list; the vocabulary now means what verified the person (`face`, `fingerprint`, `iris`, `pin`, `user`, `swk`), with `hwk` reserved for hardware-isolated keys. `signIdentityProof` / `verifyIdentityProof` take an optional binding `{ index, nonce }` (PROTOCOL.md §8.1) and `DeviceRegistrationSchema` accepts `nonce`; the unbound proof remains valid. Vectors gain `identity_proof_bound`.
