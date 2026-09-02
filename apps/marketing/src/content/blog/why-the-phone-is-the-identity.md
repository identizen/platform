---
title: Why the phone is the identity
description: Passwords are secrets you share. Passkeys are keys someone else syncs. Identizen starts from a simpler place — the device in your pocket already is you.
date: 2026-09-01
author: George Rios
---

Every login system is an argument about where the secret lives.

Passwords put it in your head, and then in a database the site has to protect. Magic links put it in your inbox. "Sign in with Google" puts it with Google, along with a map of everywhere you go. Passkeys got the cryptography right and then handed the keys to the same three companies to sync.

We think the honest answer has been sitting in your pocket the whole time.

## A phone is a key store with a face

A modern phone has a secure enclave, a biometric sensor, a push channel, and a radio that can see across a room. That is everything an authenticator needs, and it is already the thing you check a hundred times a day. Identizen treats it as what it is: the identity.

At install, the app generates an Ed25519 key pair. The private key never leaves the device. The public key goes to an index — a directory that maps "this person" to "this device is reachable here". The index stores public keys, push tokens, rotating Bluetooth identifiers, and revocation state. **Nothing in it can be used to log in as you.** A breach of the index yields a phonebook.

## The site sees plain OIDC

None of this leaks into your integration. A site registers with an index and gets a standard OpenID Connect provider. `npm install @identizen/react`, one component, done. The `id_token` carries a stable per-site `sub` and nothing else — no email, no name, no cross-site identifier. Two sites cannot correlate a user without the user's consent, because the key each site sees is derived for that site alone.

## One tap, Face ID, in

Click **Continue with Identizen**. If this browser has logged in before, the request goes straight to your phone. If not, Chromium finds the phone over Bluetooth, or you scan a QR. The phone shows the site name, a two-digit match code, and the biometric prompt. That is the entire user interface, on purpose.

The site's origin is inside the signed challenge, so a phished login on a lookalike domain produces a signature the real site rejects. The match code defeats push bombing. There is no code to type and no secret to reuse.

## Or keep your login and add the factor

Most teams do not want to replace their login this quarter. They want to replace SMS codes. Identizen runs in that mode too: after your own password or SSO, redirect with `acr_values=idz:mfa` or call `POST /v1/verify { sub, reason }` from your backend. The `reason` — "Approve wire transfer of $12,000 to Acme?" — is shown on the phone and signed into the assertion, so you hold non-repudiable evidence of what was approved.

## What we are not doing

We are not building a blockchain. We are not asking you to trust a new company with your users. Everything ships under Apache-2.0 in one repository: the protocol, the index, the app, the SDKs. Run the index yourself with one Worker deploy or one container. If Identizen the company disappeared tomorrow, your users would still be able to log in.

The phone is the identity. The rest is standards.
