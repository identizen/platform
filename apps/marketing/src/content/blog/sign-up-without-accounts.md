---
title: Sign-up without accounts
description: The first objection to accountless identity is practical. A business needs a name, an email, and a billing address. Here is how a site gets all of that, and why the sign-up form gets shorter, not longer.
date: 2026-09-06
author: George Rios
---

When we say Identizen is accountless, the first question from anyone who has built a product is the right one: "My app needs to know who the customer is. Where does the name go?"

The answer is that the name goes exactly where it always went, in your database. What changes is what protects it.

## An account is two things glued together

Every account you have ever created is really two records. One is the profile: your name, your email, your billing address, your preferences. The other is the credential: a password, or a passkey, or a link to a Google account. The profile is what the business needs. The credential is what lets you prove you are the person the profile belongs to.

Traditional identity glues these together and calls the pair an account. Then it protects the glue: password rules, reset emails, two-factor codes, recovery questions, breach notifications. Most of the cost of running a login system is the cost of protecting the credential half.

Accountless identity separates them. The profile stays with the business. The credential stops existing. What replaces it is a key on the person's phone and a signature the phone produces when the person approves a request.

## What the site actually receives

After a person approves a sign-in, the site gets a standard OpenID Connect token. The claim that matters is `sub`. It is the hash of a public key that the phone derives from its seed and the site's own registered host. Three properties fall out of that construction, and they are the whole story:

- It is unique to your site. Another site derives a different key from the same seed, so it gets a different `sub`. No two sites can match a person by it.
- It is stable across phones. Restore the 24 words on a new phone and the same key comes out, so the same `sub`. Your records do not move.
- It cannot be hijacked. The index binds your site and that `sub` to the key that first produced it, and rejects any later assertion signed by a different key.

There is no email in the token, no name, no phone number. That is not an omission. It is what keeps the identifier from being matched across sites. (The token also carries a device id, derived per site the same way.)

## Sign-up is a lookup miss

So the sign-up flow is not a flow at all. It is one branch in your callback handler:

```ts
const claims = await idz.exchangeCode({ code, codeVerifier, redirectUri });
const user = await users.findBySub(claims.sub);
if (user) return signIn(user);
return redirect('/signup');
```

A known `sub` is a returning customer. The redirect is the sign-up: an unknown `sub` is a new person, and you ask them for whatever your product needs: a name for the statement, an email for notices, an address for shipping. Store it under the `sub`. From then on the phone recognizes them and so do you.

Notice what is not on the form. No password to choose. No password strength meter. No "confirm your email to activate your account", because there is no account to activate and the email is not a credential. You can still verify the email address if you want notices to arrive, but a typo in it does not lock anyone out.

We built exactly this into the demonstration bank at [jtmerlin.com](https://jtmerlin.com). Sign in with the app for the first time and the bank asks for a name, a statement email, and a mobile number. Sign in again and it greets you by name. The [developer page](https://jtmerlin.com/docs/customers) shows the real source, including the directory keyed by `sub`.

## Existing users are a bind, not a migration

If you already have a million accounts, you do not migrate them. You let each person bind a phone from inside a session they already hold. The site sends them through an enrollment login, gets back a `sub`, and writes it on the existing record. From then on the phone can be their login, their second factor, or their approval step for the actions that matter. Nothing else about the record changes, and people who never bind a phone keep logging in the old way.

## The hard case, honestly

What about the person who loses the phone and the 24 words? The identity is gone. A new one has a new `sub`, and your site will see them as a stranger.

This is the same situation as a customer who has lost every credential, and the answer is the same as it has always been: your own identity-proofing process, whatever your policy says that is, followed by binding the new `sub` to the old record. Identizen cannot do this step for you, and that is deliberate. Nothing at the index can vouch for a person, which means nothing at the index can be tricked into handing an identity to someone else.

The full recipe, including the claim table and what to store, is in [Users, sign-up, and linking identities](https://docs.identizen.com/users/).
