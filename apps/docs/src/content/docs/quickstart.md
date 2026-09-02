---
title: Quickstart
description: A working "Continue with Identizen" login on a fresh Next.js app in under five minutes, with a fake phone so you can develop without a device.
---

You need Node 22+ and an index to talk to. For local development run the index from the monorepo (`npm run dev -w @identizen/index`, listens on `http://localhost:8787`) or point at a hosted index with `--index`.

## 1. Create the app and register it

```bash
npx create-next-app@latest my-app --ts --app --use-npm
cd my-app
npx identizen init --index http://localhost:8787
npm install
```

`identizen init` registers your site with the index, writes `IDENTIZEN_*` variables to `.env.local`, and scaffolds four route handlers under `app/api/auth/` (login, callback, logout, back-channel logout) plus `lib/identizen.ts`. It never overwrites files you already have.

## 2. Add the button

```tsx title="app/page.tsx"
export default function Home() {
  return (
    <main>
      <a href="/api/auth/login">Continue with Identizen</a>
    </main>
  );
}
```

That link is the whole integration. `/api/auth/login` redirects to the index's `/authorize` with PKCE; the callback exchanges the code and sets a signed session cookie.

## 3. Run a phone

```bash
npx identizen dev --index http://localhost:8787
```

This starts a fake phone at `http://localhost:4400`, registered with the same index, that approves sign-ins automatically. Open it in a browser to approve or deny by hand (`--policy manual`).

## 4. Log in

```bash
npm run dev
```

Open `http://localhost:3000`, click **Continue with Identizen**, and paste the "Open in Identizen" link from the hosted login page into the fake phone (or scan the QR with the real app). The page shows a two-digit match code; the phone shows the same one. Approve, and you land back on your site signed in.

## 5. Read the session

```ts title="app/dashboard/page.tsx" fragment="true"
import { getIdentizenSession } from '@/lib/identizen';

const session = await getIdentizenSession();
// session.sub  — stable per-site identifier
// session.sid  — Identizen session id (used for back-channel logout)
// session.acr  — 'idz:login' (or 'idz:mfa' after a step-up)
// session.amr  — ['face', 'hwk'] or similar
```

That is the whole login. There is no email in the token; if your app needs one, ask the user after login like any app.

## What happened

- The site is a standard OIDC relying party with PKCE. The index is the OpenID provider.
- The phone signed a challenge that contains your site's origin, so a phished login elsewhere cannot be replayed against you.
- On the first login the browser was **paired**: repeat logins push straight to the phone with no QR.

Next: [Add MFA to an existing login](/add-mfa/) or the [Next.js guide](/guides/nextjs/) for the generated files in detail.
