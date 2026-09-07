# @identizen/protocol

## 0.2.0

### Minor Changes

- `amr` gains `iris` and the exported `USER_VERIFYING_AMR` list; the vocabulary now means what verified the person (`face`, `fingerprint`, `iris`, `pin`, `user`, `swk`), with `hwk` reserved for hardware-isolated keys. `signIdentityProof` / `verifyIdentityProof` take an optional binding `{ index, nonce }` (PROTOCOL.md §8.1) and `DeviceRegistrationSchema` accepts `nonce`; the unbound proof remains valid. Vectors gain `identity_proof_bound`.
