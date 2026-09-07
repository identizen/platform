---
title: MFA and step-up on a tenant index
description: The recipe for a SaaS that already has logins and wants Identizen as the phone-backed second factor and as step-up for sensitive actions, against its own tenant issuer.
---

Your SaaS keeps its password, magic-link or SSO login. Identizen adds two things on top of it: a second factor at sign-in, and a fresh phone approval before a sensitive action. Both run against your tenant issuer, `https://acme.index.identizen.com`, and both are the same [Path B](/add-mfa/) integration the public index offers; this page is the concrete sequence with the claims you have to check.

You store one thing per user: the per-site `sub` that enrollment returns. No secrets, no phone numbers, no TOTP seeds.

## 1. Enrol: bind the phone to an existing account

The user is signed in by your own means; that session is the proof of who they are. Send them through an Identizen login with `prompt=enroll` and save the returned `sub` on the user record.

```ts title="lib/identizen.ts"
import { createIdentizenServer, pkceChallenge, randomString } from '@identizen/sdk/server';

export const identizen = createIdentizenServer({
  indexUrl: process.env.IDENTIZEN_INDEX_URL ?? 'https://acme.index.identizen.com',
  clientId: process.env.IDENTIZEN_CLIENT_ID ?? '',
  clientSecret: process.env.IDENTIZEN_CLIENT_SECRET,
});

export const REDIRECT_URI = 'https://app.example.com/api/auth/callback';

export interface PendingAuth {
  url: string;
  state: string;
  nonce: string;
  verifier: string;
}

/** Enrollment: a normal login whose `sub` becomes the binding you store. */
export async function enrollmentUrl(): Promise<PendingAuth> {
  const state = randomString(16);
  const nonce = randomString(16);
  const verifier = randomString(32);
  const url = identizen.authorizationUrl({
    redirectUri: REDIRECT_URI,
    state,
    nonce,
    codeChallenge: await pkceChallenge(verifier),
    prompt: 'enroll',
  });
  return { url, state, nonce, verifier };
}

/** Step-up: push straight to the phone bound to `sub` and require a verifying method. */
export async function stepUpUrl(sub: string): Promise<PendingAuth> {
  const state = randomString(16);
  const nonce = randomString(16);
  const verifier = randomString(32);
  const url = identizen.authorizationUrl({
    redirectUri: REDIRECT_URI,
    state,
    nonce,
    codeChallenge: await pkceChallenge(verifier),
    acr: 'idz:mfa',
    loginHint: sub,
  });
  return { url, state, nonce, verifier };
}
```

Keep `state`, `nonce` and `verifier` in a short-lived cookie or server-side transaction. In the callback, exchange the code and store `claims.sub`:

```ts title="Server: enrollment callback" fragment="true"
import { createIdentizenServer } from '@identizen/sdk/server';

const identizen = createIdentizenServer({ indexUrl, clientId, clientSecret });
const { claims } = await identizen.exchangeCode({ code, redirectUri, codeVerifier, nonce });
// claims.sub is the per-site identifier to store on the user record
user.enrolledSub = claims.sub;
```

Enrollment does not need a bound `sub` yet, so it goes through the normal discovery flow (QR or the paired browser). Every later step-up pushes straight to the phone.

## 2. Second factor at sign-in

After your primary login succeeds, redirect to `stepUpUrl(user.enrolledSub)`. The index pushes to the bound phone (no QR), the user approves with Face ID, a fingerprint or the device passcode, and you get an id_token whose `acr` is `idz:mfa`. Verify it in the callback and check the claims that make it a second factor:

```ts title="lib/step-up.ts"
import { createIdentizenServer, type IdentizenIdToken } from '@identizen/sdk/server';

const identizen = createIdentizenServer({
  indexUrl: process.env.IDENTIZEN_INDEX_URL ?? 'https://acme.index.identizen.com',
  clientId: process.env.IDENTIZEN_CLIENT_ID ?? '',
  clientSecret: process.env.IDENTIZEN_CLIENT_SECRET,
});

/** How old an approval may be and still count for this action, in seconds. */
const STEP_UP_MAX_AGE = 120;

export interface StepUpResult {
  ok: boolean;
  claims: IdentizenIdToken;
}

/**
 * Exchange the step-up code and decide whether it satisfies the second factor for
 * `expectedSub`. `exchangeCode` already verified the signature against your issuer's JWKS,
 * `iss`, `aud`, `exp`, the nonce and the claim types.
 */
export async function completeStepUp(input: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
  nonce: string;
  expectedSub: string;
}): Promise<StepUpResult> {
  const { code, redirectUri, codeVerifier, nonce, expectedSub } = input;
  const { claims } = await identizen.exchangeCode({ code, redirectUri, codeVerifier, nonce });
  const now = Math.floor(Date.now() / 1000);
  const ok =
    claims.sub === expectedSub && // the phone that answered is the one bound to this account
    claims.acr === 'idz:mfa' && // the index asserted a user-verifying second factor
    now - claims.auth_time <= STEP_UP_MAX_AGE; // and the approval is fresh
  return { ok, claims };
}
```

What each check means:

| Claim       | Check                               | Why                                                                                                                                                                                                                                                                               |
| ----------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sub`       | equals the `sub` stored on the user | `login_hint` targets that phone, but your own session is what says which account is acting; the two must agree.                                                                                                                                                                   |
| `acr`       | `'idz:mfa'`                         | The index sets `idz:mfa` only when the phone approved with a user-verifying method. An approval that did not verify the person (`amr: ["swk"]`, a development phone that skipped its prompt) is refused with 403 `insufficient_amr` and never reaches your callback as `idz:mfa`. |
| `amr`       | informational                       | `["face"]`, `["fingerprint"]`, `["pin"]`, … : which method verified the person. Log it; do not build policy on a specific value unless you need to (the [roadmap](/enterprise/#on-the-roadmap) puts `allowed_amr` policy on the index).                                           |
| `auth_time` | recent                              | When the person approved on the phone, in unix seconds. Every `/authorize` round trip is a fresh approval, so the token is never older than the approval it records; the check guards against a stale token being replayed into your callback.                                    |

If the `sub` is not bound to an active device (the user revoked the phone, or never enrolled), `/authorize` redirects back with `error=login_required`; send the user through enrollment again. The full claim list and the error table are in the [OIDC reference](/reference/oidc/) and [errors](/errors/#insufficient_amr).

## 3. Step-up before a sensitive action

For a wire transfer, a role change or an export, run the same step-up again at the moment of the action, and apply a tighter `STEP_UP_MAX_AGE`. There is no session at the index to reuse: `prompt=none` always returns `interaction_required`, and a repeat `/authorize` always pushes a new approval to the phone, so `max_age=0` and `prompt=login` are accepted but change nothing. What guarantees freshness is `auth_time` on the new token, checked as above.

Two ways to phrase the action to the user:

- **OIDC step-up** (browser flow): redirect with `stepUpUrl(sub)`, check `acr` and `auth_time` in the callback, then perform the action in the same request.
- **Verification API** (server-driven, or when you want a signed record of what was approved): `POST /v1/verify { sub, reason }`, which shows `reason` on the phone and binds its SHA-256 into the assertion the phone signs.

```ts title="Server: verify a transaction"
import { createIdentizenServer } from '@identizen/sdk/server';

const identizen = createIdentizenServer({
  indexUrl: process.env.IDENTIZEN_INDEX_URL ?? 'http://localhost:8787',
  clientId: process.env.IDENTIZEN_CLIENT_ID ?? '',
  clientSecret: process.env.IDENTIZEN_CLIENT_SECRET,
});

export async function approveTransfer(sub: string): Promise<boolean> {
  const started = await identizen.verify({
    sub,
    reason: 'Approve wire transfer of $12,000 to Acme?',
  });
  const result = await identizen.waitForVerification(started.verification_id, {
    timeoutMs: 65_000,
  });
  if (result.status !== 'approved' || !result.assertion) return false;
  // result.assertion.payload.reason_hash === base64url(sha256(reason))
  return true;
}
```

Statuses are `pending`, `approved`, `denied` and `timeout` (the challenge lives 60 seconds). The Verification API reports an unbound `sub` as `unknown_sub`. For a webhook instead of polling, register a webhook URL for the site and verify deliveries with `identizen.verifyWebhook`; the shapes are in the [Verification API reference](/reference/verification-api/).

## What to store, and what not to

- Store the per-site `sub` on the user. That is all Identizen needs to target the phone.
- Log `acr`, `amr`, `auth_time` and `idz_device` with the action they authorised; they are the evidence of what verified the person.
- Do not store anything from Identizen as a secret; there are none. The client secret is your site's, for `/token` and the Verification API.
- Keep your own account recovery (email, recovery codes) for users who lose the phone. In Path B Identizen owns the factor, not the account.

## `idz_org`

The id_token and `/userinfo` carry `idz_org` for identities with an `org_id`, and the SDK types it as `idz_org?: string`. Nothing assigns an `org_id` today: org enrollment, workforce-only sites and `allowed_amr` policy are on the [roadmap](/enterprise/#on-the-roadmap). Treat `idz_org` as optional and absent, and use your own user record to decide who may act.
