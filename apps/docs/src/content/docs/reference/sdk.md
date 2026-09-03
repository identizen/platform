---
title: SDK and CLI
description: '@identizen/sdk (browser and server), @identizen/react, and the identizen CLI.'
---

```bash
npm install @identizen/sdk @identizen/react
```

## `@identizen/sdk` — browser

```ts
import { createIdentizen } from '@identizen/sdk';

const identizen = createIdentizen({
  indexUrl: 'https://index.identizen.com',
  clientId: 'idz_live_…',
  pairing: true, // default; false disables browser pairing
});
```

### `startLogin(options?)`

Creates a challenge and runs discovery: **paired browser** (push straight to the phone) → **QR**; on a mobile user agent the deep link is used instead. Web Bluetooth is never automatic: it needs a user gesture and opens the browser's device chooser, so it runs only when you call `session.useBluetooth()` (Chromium; `state.bluetoothAvailable` says whether it can). Returns a `LoginSession`:

```ts fragment="true"
import { createIdentizen } from '@identizen/sdk';

const identizen = createIdentizen({ indexUrl, clientId });
const session = identizen.startLogin({
  redirectUri, // OIDC redirect_uri registered for the site
  state,
  nonce,
  codeChallenge, // PKCE S256; the verifier stays on your side
  scope: 'openid handle',
  // acr: 'idz:mfa', loginHint: sub   -> step-up
  // prompt: 'enroll'                  -> enrollment
  // reason: 'Approve wire of $12,000?' (≤ 140 chars, shown on the phone)
  // discovery: { paired: true, bluetooth: true }
});

const unsubscribe = session.subscribe((s) => {
  s.status; // 'starting' | 'discovering' | 'waiting' | 'approved' | 'denied' | 'expired' | 'error' | 'cancelled'
  s.challengeId; // challenge id
  s.code; // 2-digit match code
  s.qrSvg; // inline SVG of the deep link
  s.deepLink; // https://app.identizen.com/l/<challenge id>
  s.expiresAt; // unix seconds
  s.method; // 'paired' | 'bluetooth' | 'qr' | 'deeplink' | 'push' | null
  s.useDeepLink; // true on mobile: navigate to deepLink
  s.bluetoothAvailable; // true when session.useBluetooth() can be offered
  s.redirect; // set on 'approved' when redirectUri was given
  s.error; // { code, message } on 'error'
});
const final = await session.done; // terminal state
await session.useBluetooth(); // Promise<boolean>; Chromium, call from a user gesture while the QR shows
session.cancel();
unsubscribe();
```

Also: `identizen.enroll(options)` (= `prompt: 'enroll'`), `identizen.stepUp(sub, options)` (= `acr: 'idz:mfa', loginHint: sub`), `identizen.unpair()` (forget this browser's pairing).

Pairing stores a non-extractable P-256 key in IndexedDB and the pairing record next to it, per origin. `transports` lets tests inject `fetch`, `WebSocket`, `bluetooth`, `storage`, `userAgent`, and `crypto`. Helpers: `qrSvg(text)`, `authorizationUrl(req)`, `pkceChallenge(verifier)`, `randomString(bytes)`, `readRotatingIdViaBluetooth(navigator.bluetooth)`, `BLE_ROTATING_ID_CHARACTERISTIC`, `browserStorage()` (IndexedDB, the default), `memoryStorage()` (tests and non-browser hosts).

## `@identizen/sdk/server` — Node, Bun, Workers

```ts
import { createIdentizenServer } from '@identizen/sdk/server';

const identizen = createIdentizenServer({
  indexUrl: 'https://index.identizen.com',
  clientId: 'idz_live_…',
  clientSecret: process.env.IDENTIZEN_CLIENT_SECRET, // omit for public clients
});
```

| Method                                                                                              | What it does                                                                        |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `authorizationUrl({ redirectUri, state, nonce, codeChallenge, scope?, acr?, loginHint?, prompt? })` | Builds the `/authorize` URL                                                         |
| `exchangeCode({ code, redirectUri, codeVerifier, nonce? })`                                         | `POST /token`, verifies the id_token against the JWKS, returns tokens plus `claims` |
| `verifyIdToken(idToken, nonce?)`                                                                    | Verifies issuer, audience, signature, nonce                                         |
| `userinfo(accessToken)`                                                                             | `GET /userinfo`                                                                     |
| `verify({ sub, reason? })`                                                                          | `POST /v1/verify`                                                                   |
| `getVerification(id)` / `waitForVerification(id, { timeoutMs?, intervalMs? })`                      | Poll the Verification API                                                           |
| `verifyWebhook(body)`                                                                               | Verifies a webhook JWT (`typ: idz-webhook+jwt`) and returns the event               |
| `verifyLogoutToken(token)`                                                                          | Verifies a back-channel logout token and returns `{ sid }`                          |

Every failure throws an `IdentizenError` with `code`, `message`, `status` (HTTP, when applicable), and `docsUrl` pointing at the [errors page](/errors/).

## `@identizen/react`

```tsx
import {
  IdentizenProvider,
  IdentizenButton,
  IdentizenStepUp,
  useIdentizen,
} from '@identizen/react';

export function Login() {
  return (
    <IdentizenProvider indexUrl="https://index.identizen.com" clientId="idz_live_…">
      <IdentizenButton
        label="Continue with Identizen"
        login={{
          redirectUri: 'https://app.example.com/api/auth/callback',
          state: 's',
          nonce: 'n',
          codeChallenge: 'c',
        }}
        onSuccess={(s) => console.info('approved', s.redirect)}
        onError={(s) => console.warn(s.status)}
      />
      <IdentizenStepUp sub={'S'.repeat(32)} reason="Approve wire of $12,000?" auto={false} />
    </IdentizenProvider>
  );
}

export function CustomUi() {
  const { state, busy, startLogin, cancel } = useIdentizen();
  return busy ? (
    <button onClick={cancel}>Cancel ({state?.code})</button>
  ) : (
    <button onClick={() => void startLogin()}>Sign in with your phone</button>
  );
}
```

- `<IdentizenProvider indexUrl clientId pairing? transports? client?>` — one per app; `transports` is passed through to `createIdentizen`; `client` injects a pre-built client (tests).
- `<IdentizenButton label? login? onSuccess? onError? followRedirect? className? panelClassName?>` — idle button → panel with a live-region status, the match code, the QR (or deep link, or "waiting on your phone" when pushed) → approved / denied / expired / error with retry. `followRedirect` (default `true`) navigates to `state.redirect` on approval.
- `<IdentizenStepUp sub reason? redirectUri? state? nonce? codeChallenge? auto? onApproved? onError? label? className?>` — Path B step-up; starts on mount unless `auto={false}`.
- `useIdentizen()` → `{ client, state, busy, startLogin, enroll, stepUp, cancel, reset, findPhoneOverBluetooth }`. `findPhoneOverBluetooth` calls `session.useBluetooth()` on the current login; call it from a click.

Style through your own classes or the `data-idz` attributes (`button`, `panel`, `status`, `code`, `qr`, `bluetooth`, `deeplink`, `cancel`, `retry`, `step-up`, `reason`, `start`).

## `identizen` CLI

```bash
npx identizen init [--index <url>] [--name <site name>] [--site-url <url>] [--framework next|express] [--force] [--token <t>] [--dir <path>]
npx identizen dev [--index <url>] [--port 4400] [--policy approve|deny|manual|ignore] [--local] [--dir <path>]
npx identizen register-site --name <n> --rp-id <host> --redirect-uri <uri> [<uri>…] \
  [--index <url>] [--backchannel-logout-uri <uri>] [--webhook-url <uri>] [--public] [--live] [--token <t>]
```

`--dir` sets the project directory for `init` and `dev` (default: the current directory). `--redirect-uri` takes one URI; pass additional redirect URIs as bare arguments after the command (`register-site https://a.example/cb https://b.example/cb --redirect-uri https://c.example/cb …`). Repeating `--redirect-uri` keeps only the last value.

- `init` detects Next.js (app router) or Express, registers the site with the index (`--index`, else `IDENTIZEN_INDEX_URL`, else `http://localhost:8787`), writes `IDENTIZEN_INDEX_URL`, `IDENTIZEN_CLIENT_ID`, `IDENTIZEN_CLIENT_SECRET`, `IDENTIZEN_SITE_URL` to `.env.local` (Next) or `.env` (Express), scaffolds the auth routes, and adds dependencies. Existing files are kept unless `--force`. Sites on `localhost` get `idz_test_…` ids.
- `dev` runs a fake phone at `http://localhost:4400` registered with the index. It auto-approves by default; open it in a browser to approve or deny by hand. Against a hosted index it polls its inbox (no inbound connectivity needed). `--local` also starts a local index from the monorepo.
- `register-site` prints the credentials once as JSON. `--live` issues an `idz_live_…` id; `--public` creates a PKCE-only client with no secret.
