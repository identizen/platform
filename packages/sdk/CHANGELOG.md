# @identizen/sdk

## 0.3.1

### Patch Changes

- f065934: US English everywhere: error descriptions, OpenAPI descriptions, user-facing copy, README and doc comments now use US spellings (enroll, organization, license, canceled, behavior). Error codes, JSON fields and the SDK's `'cancelled'` session status are unchanged.

## 0.2.0

### Minor Changes

- `verifyIdToken` accepts only an Identizen id_token: `alg` must be ES256, `typ` must be `JWT`, every documented claim (`sub`, `sid`, `acr`, `amr`, `auth_time`, `idz_device`, `iat`, `exp`) must be present with its type, and a token carrying an `events` claim is refused (RFC 8725 §3.12). `verifyWebhook` and `verifyLogoutToken` pin ES256. `IdentizenIdToken` gains `auth_time`. The QR is shown immediately and Web Bluetooth runs only when `session.useBluetooth()` is called.

### Patch Changes

- Updated dependencies
  - @identizen/protocol@0.2.0
