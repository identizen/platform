# identizen (CLI)

```bash
npx identizen init        # register your site, write .env.local, scaffold /api/auth/* routes
npx identizen dev         # run a fake phone that approves sign-ins (no device needed)
npx identizen register-site --name "My App" --rp-id app.example.com --redirect-uri https://app.example.com/api/auth/callback
```

`init` detects Next.js (app router) or Express, registers the site with the index (`--index`, default `IDENTIZEN_INDEX_URL` or `http://localhost:8787`), writes `IDENTIZEN_*` variables, and scaffolds login, callback, logout, and back-channel logout routes on top of `@identizen/sdk/server`. Existing files are never overwritten unless `--force`.

`dev` starts a fake phone at http://localhost:4400 registered with the same index. It auto-approves by default; open it in a browser to approve or deny by hand (`--policy manual`). Against a hosted index it polls its inbox, so no inbound connectivity is required.
