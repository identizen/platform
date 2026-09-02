# OIDC conformance (M4.7, `[cc+human]`)

Goal: pass the OpenID Foundation conformance suite, **Basic OP** profile, against a local index.

## 1. Run the index locally

```bash
docker compose up -d postgres
npm run migrate -w @identizen/db
cp apps/index/.dev.vars.example apps/index/.dev.vars
npm run keys -w @identizen/index          # paste the JSON into OIDC_SIGNING_KEYS in .dev.vars
npm run dev -w @identizen/index           # http://localhost:8787
```

The suite must reach the index over a hostname it can resolve from Docker; set `INDEX_URL` in `apps/index/wrangler.jsonc` vars (or `.dev.vars`) to `http://host.docker.internal:8787` for the run.

## 2. Register a test client

```bash
curl -s http://localhost:8787/sites -H 'content-type: application/json' -d '{
  "name": "Conformance", "rp_id": "localhost",
  "redirect_uris": ["https://localhost.emobix.co.uk:8443/test/a/identizen/callback"]
}'
```

Keep `client_id` and `client_secret`.

## 3. Run the suite

```bash
git clone https://gitlab.com/openid/conformance-suite.git && cd conformance-suite
docker compose up
```

Open https://localhost.emobix.co.uk:8443, create a plan:

- Plan: `oidcc-basic-certification-test-plan`
- Server metadata: discovery, `https://host.docker.internal:8787` (or your `INDEX_URL`)
- Client: the `client_id` / `client_secret` above, `client_secret_basic`
- Response type `code`, `client_registration: static_client`

The user-interaction tests open `/authorize`; approve them with the fake phone (`npm run dev -w @identizen/fake-phone --  --auto-approve`, M5) or a real device.

## 4. Record the result

Paste the plan URL and the pass/fail table below, then check **M4.7** in `TASKS.md`.

| Date | Plan | Result | Notes |
| ---- | ---- | ------ | ----- |
|      |      |        |       |

Known deviations to expect: `prompt=none` always returns `interaction_required` (Identizen requires a phone approval); no `id_token` response types; `request`/`request_uri` unsupported (declared in discovery).
