# @identizen/dashboard

The features behind app.identizen.com as TypeScript source: sign-in (OIDC with PKCE against an
index), devices, paired browsers, sessions, activity, handle settings and the deep-link approval
route. Compose them in your own React 19 app with TanStack Router and Query, with
`@identizen/ui` for the tokens and primitives.

```ts
import { DevicesRoute, SessionsRoute, useSession } from '@identizen/dashboard';
import '@identizen/dashboard/styles.css';
```

The index URL resolves at runtime: `window.__IDZ_CONFIG__.indexUrl`, then
`VITE_IDENTIZEN_INDEX_URL`, then `<tenant>.app.<domain>` to `<tenant>.index.<domain>`, then
`http://localhost:8787`. One build serves every host.
