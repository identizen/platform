---
title: Users, sign-up, and linking identities
description: How to attach a real user record, with a name, contact details, and billing, to an accountless identity. Which claim to key on, how sign-up differs from sign-in, and what to do about new or lost phones.
---

Identizen proves that a specific phone-held identity approved a request. It does not tell you who that person is, and it never will: no email, name, or phone number is in the token. Your application still needs a user record for profiles, billing, support, and the law. This page is how the two fit together.

## The one claim to build on: `sub`

Every id_token, and every approval from the Verification API, carries `sub`, the person's identifier at your site. The full claim list with an example token is in the [OIDC reference](/reference/oidc/#id_token-claims); the approval JSON is in the [Verification API](/reference/verification-api/).

| Property                   | Why it holds                                                                                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unique to your site        | `sub = base64url(SHA-256(perSitePublicKey))[0:32]`, and the per-site key is derived from the seed and your registered host. Another site derives a different key.            |
| Stable across phones       | The seed is the identity. A phone restored from the 24 words derives the same key, so the same `sub`. A second phone holding the same identity also produces the same `sub`. |
| Stable across sessions     | `sid`, the session id, changes on every login. `sub` does not.                                                                                                               |
| Cannot be forged or reused | The index binds `(your site, sub)` to the per-site public key on first sight and rejects any later assertion for that `sub` signed by a different key.                       |
| Not correlatable by `sub`  | Two sites comparing their `sub` values learn nothing. (`idz_device` is not yet per-site; see the [threat model](/protocol/threat-model/).)                                   |

Treat `sub` as the primary key of your user table, or as a unique column on an existing one. Keep `sid` and `idz_device` for audit and session management, never as the identity. Do not key on `idz_handle`: it is optional, the person can change it, and it only arrives when you ask for the `handle` scope.

## Sign-up is a lookup miss

There is no separate sign-up flow to build. The button is the same, the phone does the same thing, and your database decides:

```ts title="Callback handler"
const claims = await idz.exchangeCode({ code, codeVerifier, redirectUri });
const user = await users.findBySub(claims.sub);
if (user) {
  await session.start(user.id);
  return redirect('/app');
}
// New identity: collect what your product needs, once.
await session.startPending(claims.sub);
return redirect('/signup');
```

```ts title="Sign-up handler"
export async function signup(pendingSub: string, form: { name: string; email: string }) {
  const user = await users.create({ sub: pendingSub, name: form.name, email: form.email });
  await session.start(user.id);
}
```

Ask for what the product needs and nothing the token already proved. There is no password to set, no security questions, and no verification email is needed for login, because login is the phone. Verify the email address for notices if you want; it is contact information, not a credential.

The demo bank at [jtmerlin.com](https://jtmerlin.com) does exactly this, with the [source on its docs page](https://jtmerlin.com/docs/customers).

## Existing users

Keep your current login. Let each signed-in user bind a phone with `prompt=enroll` and store the returned `sub` on their record. From then on the phone can be their login, their second factor, or their approval step for sensitive actions. The full recipe is in [Add MFA to your existing login](/add-mfa/).

## New phones and lost phones

- **New phone, same identity.** The person restores from the 24 words on the new phone and revokes the old one from the dashboard or another device. Their `sub` is unchanged and your records do not move.
- **Second phone.** Restoring the same words on two phones gives two devices with one identity. Both produce the same `sub`; the person can revoke either.
- **Lost the phone and the words.** The identity is unrecoverable and a new one has a new `sub`. This is the same situation as a customer who lost every credential. Verify who they are through your own process, then bind the new `sub` to the existing record with enrollment, exactly as for an existing user. Identizen cannot do this step for you, by design: nothing at the index can vouch for a person.

## What to store, and what never arrives

| Store                                          | Purpose                                                                          |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| `sub`                                          | The link. Unique, indexed.                                                       |
| `amr`, `acr`, `idz_device`, time, per approval | Audit trail: which phone, how, and when.                                         |
| Signed assertions for consequential actions    | Evidence for disputes; see the [Verification API](/reference/verification-api/). |
| Your own profile, billing, and KYC data        | Under `sub`. Identizen never sees it.                                            |

Never expect an email, name, phone number, or any cross-site identifier from the token. If a form in your product needs one, ask the person.
