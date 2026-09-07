# @identizen/index

The Identizen index: challenge relay, device registry and OIDC provider, for Cloudflare Workers.
Deploy it as is (`wrangler deploy` in this directory, see the self-hosting guide) or embed it:

```ts
import { createApp, ChallengeSession, RequestGuard, type Env } from '@identizen/index';

export { ChallengeSession, RequestGuard };
const app = createApp({
  resolveEnv: (request, env) => env, // per-request bindings (multi-tenant hosts)
  hooks: { onChallengeStart() {} }, // policy hooks
  extend: (app) => app.get('/orgs/ping', (c) => c.text('ok')),
});
export default { fetch: (req: Request, env: Env, ctx: ExecutionContext) => app.fetch(req, env, ctx) };
```

The package ships compiled ESM for bundlers (wrangler, Vite); it is not a Node server. Docs:
https://docs.identizen.com/embedding/
