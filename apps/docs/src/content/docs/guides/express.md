---
title: Express
description: Mount the Identizen router that `identizen init` scaffolds for Express.
---

Run `npx identizen init` in a project that depends on `express`. It writes `.env` and `identizen.ts` (or `identizen.js` when the project is not TypeScript) exporting an `identizenRouter()` and an `identizenSession()` middleware.

The router expects a session middleware that provides `req.session` (for example `express-session`) and `express.urlencoded()` for the back-channel logout form post.

```ts title="server.ts"
import express from 'express';
import { createIdentizenServer, pkceChallenge, randomString } from '@identizen/sdk/server';

const identizen = createIdentizenServer({
  indexUrl: process.env.IDENTIZEN_INDEX_URL ?? 'http://localhost:8787',
  clientId: process.env.IDENTIZEN_CLIENT_ID ?? '',
  clientSecret: process.env.IDENTIZEN_CLIENT_SECRET,
});
const SITE_URL = process.env.IDENTIZEN_SITE_URL ?? 'http://localhost:3000';
const REDIRECT_URI = `${SITE_URL}/api/auth/callback`;

interface Tx {
  state: string;
  nonce: string;
  verifier: string;
}
const transactions = new Map<string, Tx>();
const revokedSids = new Set<string>();

const app = express();
app.use(express.urlencoded({ extended: false }));

app.get('/api/auth/login', async (_req, res) => {
  const tx: Tx = { state: randomString(16), nonce: randomString(16), verifier: randomString(32) };
  transactions.set(tx.state, tx);
  res.redirect(
    identizen.authorizationUrl({
      redirectUri: REDIRECT_URI,
      state: tx.state,
      nonce: tx.nonce,
      codeChallenge: await pkceChallenge(tx.verifier),
      scope: 'openid handle',
    }),
  );
});

app.get('/api/auth/callback', async (req, res) => {
  const state = String(req.query.state ?? '');
  const tx = transactions.get(state);
  transactions.delete(state);
  const code = typeof req.query.code === 'string' ? req.query.code : null;
  if (!tx || !code) {
    res.redirect('/?error=state_mismatch');
    return;
  }
  const { claims } = await identizen.exchangeCode({
    code,
    redirectUri: REDIRECT_URI,
    codeVerifier: tx.verifier,
    nonce: tx.nonce,
  });
  // Put { sub: claims.sub, sid: claims.sid, acr: claims.acr } in your session store here.
  res.redirect(`/?sub=${encodeURIComponent(claims.sub)}`);
});

app.post('/api/auth/backchannel-logout', async (req, res) => {
  try {
    const body = req.body as { logout_token?: string };
    const { sid } = await identizen.verifyLogoutToken(String(body.logout_token ?? ''));
    revokedSids.add(sid);
    res.status(200).end();
  } catch (err) {
    res.status(400).json({ error: 'invalid_request', detail: String(err) });
  }
});

app.listen(3000);
```

The scaffolded `identizen.ts` is the same flow packaged as a `Router`, keyed on `req.session`. Mount it with `app.use(identizenRouter())` and read `req.identizen` after `app.use(identizenSession())`.

Step-up and enrollment work the same way as in the [Next.js guide](/guides/nextjs/): add `acr: 'idz:mfa', loginHint: sub` or `prompt: 'enroll'` to `authorizationUrl`. Server-to-server approvals use the [Verification API](/reference/verification-api/).
