---
title: React (any app)
description: Add "Continue with Identizen" to any React + TypeScript app. In-page login with @identizen/react and a public PKCE client, or the hosted login page with a backend. Runs in minutes with the fake phone.
---

This guide is framework-agnostic: Vite, Remix, Astro islands, or a React app with any backend. If you use Next.js app router or Express, `npx identizen init` scaffolds everything and the [Quickstart](/quickstart/) is faster.

Two ways to integrate. Both are standard OpenID Connect with PKCE; the index is the OpenID Provider.

|                                 | In-page login                                     | Hosted login                                   |
| ------------------------------- | ------------------------------------------------- | ---------------------------------------------- |
| Where the QR / match code shows | inside your React tree (`<IdentizenButton>`)      | on the index's hosted page at `/authorize`     |
| Client type                     | public (PKCE only, no secret)                     | confidential (secret on your server)           |
| Needs a backend                 | only to create your own session from the id_token | yes, for the redirect and code exchange        |
| Best for                        | SPAs, design control                              | server-rendered apps, existing OIDC middleware |

## 1. Register the site and get a client id

```bash
npm install @identizen/react @identizen/sdk
npx identizen register-site --name "My app" --rp-id localhost \
  --redirect-uri http://localhost:5173/callback --public
```

`register-site` prints `client_id` once (`idz_test_…` on localhost, `idz_live_…` with `--live`). `--rp-id` must be the host your users see in the address bar; the phone signs it into every approval, which is what makes phishing fail. `--public` means PKCE only, so nothing secret ships to the browser. Without `--index` the CLI targets `IDENTIZEN_INDEX_URL`, else `http://localhost:8787`; pass `--index https://index.identizen.com` to use the hosted index.

## 2. In-page login with `@identizen/react`

Create one module that owns the OIDC transaction. The PKCE verifier, `state`, and `nonce` are created in the browser and kept in `sessionStorage` until the index redirects back.

```ts title="src/lib/identizen.ts"
import { pkceChallenge, randomString } from '@identizen/sdk';
import type { StartLoginOptions } from '@identizen/sdk';

export const INDEX_URL = 'https://index.identizen.com';
export const CLIENT_ID = 'idz_test_your_public_client'; // printed by `identizen register-site`
export const REDIRECT_URI = `${location.origin}/callback`; // must be registered exactly

const TX_KEY = 'idz:tx';

interface Tx {
  state: string;
  nonce: string;
  verifier: string;
}

/** Claims the index puts in every id_token. There is never an email. */
export interface Claims {
  sub: string; // stable per-site user id
  sid: string; // Identizen session id (back-channel logout refers to it)
  acr: 'idz:login' | 'idz:mfa';
  amr: string[]; // e.g. ['face', 'hwk']
  idz_device: string;
  idz_handle?: string;
  nonce?: string;
}

/** Call before rendering the button. Returns the `login` options for <IdentizenButton>. */
export async function prepareLogin(): Promise<StartLoginOptions> {
  const tx: Tx = { state: randomString(16), nonce: randomString(16), verifier: randomString(32) };
  sessionStorage.setItem(TX_KEY, JSON.stringify(tx));
  return {
    redirectUri: REDIRECT_URI,
    state: tx.state,
    nonce: tx.nonce,
    codeChallenge: await pkceChallenge(tx.verifier),
    scope: 'openid',
  };
}

/**
 * Call on the /callback route. Exchanges the code at the index's token endpoint as a public
 * PKCE client and returns the id_token with its claims, or null when there is no code.
 */
export async function completeLogin(): Promise<{ idToken: string; claims: Claims } | null> {
  const url = new URL(location.href);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const raw = sessionStorage.getItem(TX_KEY);
  if (!code || !state || !raw) return null;
  const tx = JSON.parse(raw) as Tx;
  sessionStorage.removeItem(TX_KEY);
  if (tx.state !== state) throw new Error('state mismatch');

  const res = await fetch(`${INDEX_URL}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: tx.verifier,
      client_id: CLIENT_ID,
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed (${res.status})`);
  const { id_token } = (await res.json()) as { id_token: string };

  // The token came straight from the index over TLS, so decoding is enough for the UI.
  // Anything that grants access must verify the signature server-side (step 3).
  const [, payload = ''] = id_token.split('.');
  const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as Claims;
  if (claims.nonce !== tx.nonce) throw new Error('nonce mismatch');
  return { idToken: id_token, claims };
}
```

Wrap the app once and render the button. It shows the two-digit match code and the QR (or a deep link on mobile, or "waiting on your phone" for a paired browser), then follows the redirect on approval.

```tsx title="src/App.tsx"
import { useEffect, useState } from 'react';
import { IdentizenProvider, IdentizenButton, type StartLoginOptions } from '@identizen/react';
import { CLIENT_ID, INDEX_URL, prepareLogin } from './lib/identizen';

export function App() {
  const [login, setLogin] = useState<StartLoginOptions | null>(null);
  useEffect(() => {
    void prepareLogin().then(setLogin);
  }, []);

  return (
    <IdentizenProvider indexUrl={INDEX_URL} clientId={CLIENT_ID}>
      <h1>Welcome back</h1>
      {login ? (
        <IdentizenButton
          label="Continue with Identizen"
          login={login}
          onError={(s) => console.warn('login ended:', s.status, s.error?.message)}
        />
      ) : null}
    </IdentizenProvider>
  );
}
```

Render this at the `/callback` route you registered. It finishes the exchange and hands the id_token to your API.

```tsx title="src/Callback.tsx"
import { useEffect, useState } from 'react';
import { completeLogin, type Claims } from './lib/identizen';

export function Callback() {
  const [claims, setClaims] = useState<Claims | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    completeLogin().then(
      async (result) => {
        if (!result) return;
        // Create your own session: your API verifies the token (step 3) and sets a cookie.
        await fetch('/api/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ idToken: result.idToken }),
        });
        setClaims(result.claims);
      },
      (err: unknown) => setError(err instanceof Error ? err.message : String(err)),
    );
  }, []);

  if (error) return <p role="alert">Login failed: {error}</p>;
  if (!claims) return <p>Signing you in…</p>;
  return (
    <p>
      Signed in as <code>{claims.sub}</code> with {claims.amr.join(' + ')}.
    </p>
  );
}
```

Style the button with `className` and `panelClassName`, or target the `data-idz` attributes (`button`, `panel`, `status`, `code`, `qr`, `deeplink`, `bluetooth`, `cancel`, `retry`). For a fully custom UI use `useIdentizen()` and read `state.code`, `state.qrSvg`, `state.method`, and `state.status` yourself.

## 3. Turn the id_token into your session

Never trust a decoded token for authorization. Your API verifies it against the index's JWKS with `@identizen/sdk/server`, then issues whatever session your app already uses.

```ts title="server.ts"
import express from 'express';
import { createIdentizenServer } from '@identizen/sdk/server';

const identizen = createIdentizenServer({
  indexUrl: 'https://index.identizen.com',
  clientId: 'idz_test_your_public_client', // no clientSecret for a public client
});

const app = express();
app.use(express.json());

app.post('/api/session', async (req, res) => {
  try {
    const { idToken } = req.body as { idToken?: string };
    const claims = await identizen.verifyIdToken(String(idToken ?? ''));
    // claims.sub is the stable per-site user id; claims.sid identifies the Identizen session.
    // Look up or create the user by claims.sub and set your session cookie here.
    res.json({ sub: claims.sub, acr: claims.acr });
  } catch (err) {
    res.status(401).json({ error: 'invalid_token', detail: String(err) });
  }
});

app.listen(3000);
```

`verifyIdToken` checks issuer, audience, signature (ES256, two published keys), and expiry. Pass the `nonce` you sent when you can. Every failure throws an `IdentizenError` with `code`, `message`, and `docsUrl`.

## 4. Run it with a fake phone

```bash
npx identizen dev --index https://index.identizen.com
npm run dev
```

`identizen dev` starts a fake phone at `http://localhost:4400` registered with the same index. Click **Continue with Identizen**, paste the deep link (or scan the QR with the real app); the fake phone approves automatically (`--policy manual` to approve by hand). You land on `/callback` signed in. On the second login the browser is paired and the approval pushes straight to the phone with no QR.

The iOS app is currently an internal build and is not yet on the App Store; use the fake phone from `identizen dev`, or the playground at https://identizen.com/playground. See [examples](/examples/) for complete sample apps.

## Hosted login instead

If you would rather not render the login in-page, your backend redirects to the index's `/authorize` and the user sees the hosted page (match code, QR, "check your phone"). The React side is then a plain link:

```tsx title="src/Login.tsx"
export function Login() {
  return <a href="/api/auth/login">Continue with Identizen</a>;
}
```

The backend is the same in every framework: build the authorization URL with PKCE, exchange the code in the callback, set a session. The [Express guide](/guides/express/) has the complete server; the [Next.js guide](/guides/nextjs/) covers what `identizen init` generates. Register the site as a confidential client (drop `--public`) and keep the secret on the server.

## Step-up and MFA

Once a user has logged in you hold their `sub`. Push an approval to their phone for a sensitive action with `<IdentizenStepUp sub={sub} reason="Approve wire of $12,000?" />` (the reason is shown on the phone and signed into the assertion), or from the server with the [Verification API](/reference/verification-api/). To add Identizen as a second factor to an existing password or SSO login, follow [Add MFA](/add-mfa/).

## Errors you may hit

| Symptom                                     | Cause                                                                       | Fix                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `400` page at `/authorize`                  | `redirect_uri` not registered exactly                                       | Register the same scheme, host, port, and path with `register-site`    |
| `invalid_grant` from `/token`               | code reused, PKCE verifier mismatch, or wrong `redirect_uri`                | Use the verifier stored with the same `state`; exchange each code once |
| `state mismatch` in `completeLogin`         | the callback opened in a different tab or after a reload                    | Start the login again; `sessionStorage` is per tab                     |
| Button never leaves "Contacting Identizen…" | wrong `indexUrl` or `clientId`, or the origin is not the registered `rp_id` | Check the values printed by `register-site`                            |

The full list is on the [errors page](/errors/).
