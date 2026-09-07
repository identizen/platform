# @identizen/fake-phone

## 0.2.0

### Minor Changes

- Registration fetches a nonce from `POST /devices/nonce` and signs the bound identity proof; `--issuer` names the index as it appears in challenges when it differs from `--index`; `--host` binds the HTTP server; `--amr` (or `FAKE_PHONE_AMR`) sets what a simulated approval claims verified the person, default `face`, never `hwk`; `GET /l/:id` follows a deep link to the site's redirect so a headless browser can complete a login.
