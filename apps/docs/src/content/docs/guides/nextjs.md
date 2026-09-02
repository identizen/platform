---
title: Next.js
description: What `identizen init` scaffolds in a Next.js app router project, and how to customise it.
---

Run `npx identizen init` in a Next.js (app router) project. It detects `next` in `package.json`, registers the site, writes `.env.local`, adds `@identizen/sdk`, `@identizen/react`, and `jose` to your dependencies, and writes these files (existing files are kept unless you pass `--force`):

| File                                       | Purpose                                                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `lib/identizen.ts` (or `src/lib/…`)        | Server client from `@identizen/sdk/server`, `REDIRECT_URI`, a signed-cookie session helper, and the set of revoked session ids |
| `app/api/auth/login/route.ts`              | Builds the PKCE authorization URL and redirects; `?mode=stepup&sub=…` for step-up, `?mode=enroll` for enrollment               |
| `app/api/auth/callback/route.ts`           | Validates `state`, exchanges the code, verifies the `id_token`, sets the session cookie                                        |
| `app/api/auth/logout/route.ts`             | Clears the cookie                                                                                                              |
| `app/api/auth/backchannel-logout/route.ts` | Receives OIDC back-channel logout tokens when the user revokes a device or session                                             |

## Environment

```bash title=".env.local"
IDENTIZEN_INDEX_URL=https://index.identizen.com
IDENTIZEN_CLIENT_ID=idz_live_…
IDENTIZEN_CLIENT_SECRET=…
IDENTIZEN_SITE_URL=https://app.example.com
```

`IDENTIZEN_SITE_URL` must match the origin you registered; the callback is `${IDENTIZEN_SITE_URL}/api/auth/callback`.

## The server client

```ts title="lib/identizen.ts (excerpt)"
import { createIdentizenServer } from '@identizen/sdk/server';

export const identizen = createIdentizenServer({
  indexUrl: process.env.IDENTIZEN_INDEX_URL ?? 'http://localhost:8787',
  clientId: process.env.IDENTIZEN_CLIENT_ID ?? '',
  clientSecret: process.env.IDENTIZEN_CLIENT_SECRET,
});
```

## Login route

```ts title="app/api/auth/login/route.ts"
import { cookies } from 'next/headers';
import { pkceChallenge, randomString } from '@identizen/sdk/server';
import { identizen, REDIRECT_URI } from '@/lib/identizen';

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const state = randomString(16);
  const nonce = randomString(16);
  const verifier = randomString(32);
  const jar = await cookies();
  jar.set('identizen_tx', JSON.stringify({ state, nonce, verifier }), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  const stepUpSub = url.searchParams.get('mode') === 'stepup' ? url.searchParams.get('sub') : null;
  return Response.redirect(
    identizen.authorizationUrl({
      redirectUri: REDIRECT_URI,
      state,
      nonce,
      codeChallenge: await pkceChallenge(verifier),
      scope: 'openid handle',
      ...(stepUpSub ? { acr: 'idz:mfa', loginHint: stepUpSub } : {}),
      ...(url.searchParams.get('mode') === 'enroll' ? { prompt: 'enroll' } : {}),
    }),
    302,
  );
}
```

## Callback route

```ts title="app/api/auth/callback/route.ts"
import { cookies } from 'next/headers';
import { identizen, REDIRECT_URI, SITE_URL, setIdentizenSession } from '@/lib/identizen';

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const jar = await cookies();
  const raw = jar.get('identizen_tx')?.value;
  jar.delete('identizen_tx');
  const tx = raw ? (JSON.parse(raw) as { state: string; nonce: string; verifier: string }) : null;
  const error = url.searchParams.get('error');
  if (error) return Response.redirect(`${SITE_URL}/?error=${encodeURIComponent(error)}`, 302);
  const code = url.searchParams.get('code');
  if (!tx || !code || url.searchParams.get('state') !== tx.state) {
    return Response.redirect(`${SITE_URL}/?error=state_mismatch`, 302);
  }
  const { claims } = await identizen.exchangeCode({
    code,
    redirectUri: REDIRECT_URI,
    codeVerifier: tx.verifier,
    nonce: tx.nonce,
  });
  await setIdentizenSession({
    sub: claims.sub,
    sid: claims.sid,
    acr: claims.acr,
    amr: claims.amr,
    ...(claims.idz_handle ? { handle: claims.idz_handle } : {}),
  });
  return Response.redirect(`${SITE_URL}/`, 302);
}
```

## Back-channel logout

When the user revokes a device or a session in the Identizen app, the index POSTs a logout token to `/api/auth/backchannel-logout`. The scaffold records the `sid` in an in-memory set that the session helper checks. Replace that set with your session store in production.

```ts title="app/api/auth/backchannel-logout/route.ts"
import { identizen, revokedSids } from '@/lib/identizen';

export async function POST(req: Request): Promise<Response> {
  const form = await req.formData();
  const token = form.get('logout_token');
  if (typeof token !== 'string')
    return Response.json({ error: 'invalid_request' }, { status: 400 });
  try {
    const { sid } = await identizen.verifyLogoutToken(token);
    revokedSids.add(sid);
    return new Response(null, { status: 200, headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    return Response.json({ error: 'invalid_request', detail: String(err) }, { status: 400 });
  }
}
```

## Using NextAuth / Auth.js instead

Identizen is a standard OIDC provider, so a generic OIDC provider config works: issuer `IDENTIZEN_INDEX_URL`, client id and secret, `authorization: { params: { scope: 'openid handle', code_challenge_method: 'S256' } }`, `checks: ['pkce', 'state', 'nonce']`, and `profile: (p) => ({ id: p.sub })`. Map `acr`, `amr`, `idz_device`, and `idz_handle` from the id_token in your callbacks if you need them. See the [OIDC reference](/reference/oidc/) for the exact claims.
