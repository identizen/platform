# @identizen/fake-phone

## 0.3.0

### Minor Changes

- 33ee52c: Re-pins the index key along the published rotation chain (PROTOCOL.md §3.1) when a challenge fails with `bad_index_signature`; a chain that does not verify, or names another index, leaves the pin alone.

### Patch Changes

- Updated dependencies [33ee52c]
  - @identizen/protocol@0.5.0

## 0.2.0

### Minor Changes

- Registration fetches a nonce from `POST /devices/nonce` and signs the bound identity proof; `--issuer` names the index as it appears in challenges when it differs from `--index`; `--host` binds the HTTP server; `--amr` (or `FAKE_PHONE_AMR`) sets what a simulated approval claims verified the person, default `face`, never `hwk`; `GET /l/:id` follows a deep link to the site's redirect so a headless browser can complete a login.
