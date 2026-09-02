---
title: Plain HTML
description: Use @identizen/sdk directly in the browser for a custom login UI, with a public (PKCE-only) client.
---

For a page without a framework, the browser SDK drives discovery (paired browser → Web Bluetooth → QR, deep link on mobile) and hands you the match code, the QR, and the final OIDC redirect.

Register the site as a public client so no secret is needed in the browser:

```bash
npx identizen register-site --name "Static site" --rp-id static.example.com \
  --redirect-uri https://static.example.com/callback.html --public --live
```

```html
<button id="login">Sign in with your phone</button>
<div id="panel" hidden>
  <p>Match code: <strong id="code"></strong></p>
  <div id="qr"></div>
  <p id="status" role="status" aria-live="polite"></p>
</div>
<script type="module" src="/login.js"></script>
```

```ts title="login.ts"
import { createIdentizen, pkceChallenge, randomString } from '@identizen/sdk';

const identizen = createIdentizen({
  indexUrl: 'https://index.identizen.com',
  clientId: 'idz_live_your_public_client',
});

const button = document.getElementById('login') as HTMLButtonElement;
const panel = document.getElementById('panel') as HTMLDivElement;
const codeEl = document.getElementById('code') as HTMLElement;
const qrEl = document.getElementById('qr') as HTMLDivElement;
const statusEl = document.getElementById('status') as HTMLElement;

button.addEventListener('click', async () => {
  const verifier = randomString(32);
  const state = randomString(16);
  sessionStorage.setItem('idz_tx', JSON.stringify({ verifier, state }));

  const session = identizen.startLogin({
    redirectUri: 'https://static.example.com/callback.html',
    state,
    nonce: randomString(16),
    codeChallenge: await pkceChallenge(verifier),
  });

  panel.hidden = false;
  session.subscribe((s) => {
    codeEl.textContent = s.code;
    if (s.method === 'qr') qrEl.innerHTML = s.qrSvg;
    if (s.method === 'deeplink') location.assign(s.deepLink);
    statusEl.textContent = s.status;
  });

  const final = await session.done;
  if (final.status === 'approved' && final.redirect) location.assign(final.redirect);
});
```

On `callback.html`, read `code` and `state` from the query string, check `state` against `sessionStorage`, and POST to the index token endpoint with `grant_type=authorization_code`, `code`, `redirect_uri`, `code_verifier`, and `client_id` (no secret for public clients). The response contains `id_token` and `access_token`; verify the id_token against `/.well-known/jwks.json` on whatever backend consumes it.

Pairing is on by default: the first approval pairs this browser (a non-extractable P-256 key in IndexedDB), and later logins push straight to the phone. Pass `pairing: false` to `createIdentizen` to opt out.
