# @identizen/sdk

Login with your phone. Standard OIDC on the outside.

```bash
npm install @identizen/sdk
```

## Browser

```ts
import { createIdentizen } from '@identizen/sdk';

const identizen = createIdentizen({
  indexUrl: 'https://index.identizen.com',
  clientId: 'idz_live_…',
});

const session = identizen.startLogin({
  redirectUri: 'https://app.example.com/api/auth/callback',
  state,
  nonce,
  codeChallenge,
});
session.subscribe((s) => {
  // s.status: starting | discovering | waiting | approved | denied | expired | error | cancelled
  // s.code (match code), s.qrSvg, s.deepLink, s.method (paired | bluetooth | qr | deeplink | push)
});
const final = await session.done;
if (final.status === 'approved' && final.redirect) location.assign(final.redirect);
```

Discovery order: paired browser (push straight to the phone) → Web Bluetooth (Chromium) → QR. On mobile the deep link opens the app. Pairing is on by default; pass `pairing: false` to opt out.

Path B: `identizen.enroll()` binds the phone to an existing account; `identizen.stepUp(sub, { reason })` pushes an approval to the bound phone.

## Server (Node, Bun, Workers)

```ts
import { createIdentizenServer } from '@identizen/sdk/server';

const idz = createIdentizenServer({ indexUrl, clientId, clientSecret });
const url = idz.authorizationUrl({ redirectUri, state, nonce, codeChallenge });
const { claims } = await idz.exchangeCode({ code, redirectUri, codeVerifier, nonce });
// claims.sub, claims.sid, claims.acr, claims.amr, claims.idz_device

const v = await idz.verify({ sub, reason: 'Approve wire of $12,000?' });
const done = await idz.waitForVerification(v.verification_id);
const event = await idz.verifyWebhook(await request.text());
const { sid } = await idz.verifyLogoutToken(logoutToken);
```

Every error is an `IdentizenError` with a `code`, a one-line `message`, and a `docsUrl`.
