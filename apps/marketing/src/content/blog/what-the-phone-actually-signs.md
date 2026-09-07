---
title: What the phone actually signs
description: >-
  Approve with Face ID hides a precise claim. Here is the exact set of bytes the phone signs, why each field is there, and what that makes impossible.
date: 2026-09-06
author: George Rios
---

Most login systems ask you to prove you are you. Identizen asks the phone to sign a statement about one specific request. The difference sounds small. It is the whole security model, so it is worth being exact about what is in the statement.

## The challenge comes first

Nothing gets signed until a site asks. When you click "Continue with Identizen", the site's server asks the index for a challenge. The index signs it with its own key and it looks like this:

```json
{
  "type": "challenge",
  "id": "ch_01K3ZB2N9G…",
  "rp_id": "jtmerlin.com",
  "rp_name": "JT Merlin Bank",
  "nonce": "…",
  "code": "47",
  "iat": 1757116800,
  "exp": 1757116860,
  "index": "https://index.identizen.com",
  "acr": "idz:mfa",
  "reason": "Approve wire of $12,000.00 to Acme Supply Co.?"
}
```

Three things to notice. The host of the site is in it, as `rp_id`, and the index put it there from the site's registration, not from anything the browser sent. The two-digit code is in it. The lifetime is sixty seconds, no exceptions. And when the request is an approval rather than a login, the text the person will read is in it too, composed by the site's server.

The phone checks the index's signature on this before it shows you anything. A challenge signed by any other key is dropped, which is why the index key is pinned when the phone registers.

## What you see is what gets signed

When you tap Approve, the phone produces an assertion:

```json
{
  "type": "assertion",
  "challenge_id": "ch_01K3ZB2N9G…",
  "nonce": "…",
  "rp_id": "jtmerlin.com",
  "sub": "NcSuRV6Y3pDcgKd0-mbxGnDqXf9E9k5w",
  "site_pubkey": "…",
  "device_id": "dev_01M1…",
  "iat": 1757116812,
  "amr": ["face"],
  "acr": "idz:mfa",
  "reason_hash": "…"
}
```

It is signed twice: once with a key derived for this site alone, and once with the key of this particular phone. Every field is there to make a specific attack fail.

**`rp_id`** is the site's host, copied from the challenge and checked against it. The key that signs the assertion was derived from the same host. A phishing site at a lookalike domain can start a login, but the resulting signature is for its own host, and it verifies for nothing else. There is no way to trick the phone into signing for the real site, because the phone signs what the index put in the challenge.

**`nonce`** and **`challenge_id`** tie the assertion to one challenge, and the index accepts each challenge once. Capture the assertion and replay it and you get nothing.

**`sub`** and **`site_pubkey`** are the per-site identity. The index binds them to each other the first time it sees them for this site. A later assertion for the same `sub` with a different key is rejected. That is how a stolen identifier stays useless.

**`device_id`** and the second signature name the phone. Revoke the phone and its signatures stop verifying, everywhere, at once.

**`amr`** says what verified the person: `face`, `fingerprint`, `iris`, or `pin` for the device passcode. The app reports what actually happened and never more. If it had to fall back to the passcode it says `pin`; if the platform cannot say which biometric it used it says `user`; a development build that skipped the prompt says `swk`, and the index refuses that for a step-up. It does not claim a hardware-isolated key, because the keys are not in one yet; `hwk` stays reserved until they are.

**`reason_hash`** is the one people care about most. It is the hash of the exact text the phone showed. Change one character of the amount or the payee and the hash changes, the signature fails, and the approval is worthless. An approval for "$12,000.00 to Acme" cannot be reused for "$120,000.00 to Acme", or for anything at all.

## Why the server writes the text

There is one rule that keeps `reason_hash` meaningful: the site's server composes the reason, never the client, never a form field, and never an agent acting for the user. The server writes what it is about to do, the phone shows it, the person approves it, and the server checks the hash before acting.

If a piece of client-side code could write that text, it could show the person one thing and execute another. Keeping composition on the server is the difference between a signature that means something and a signature that decorates a request. This is also why the same primitive works for [agents](https://identizen.com/agent-authorization/): the agent asks, the server composes, the person approves what the server will actually do.

## What is deliberately not in it

No email. No name. No cross-site identifier. No timestamp older than sixty seconds. No field the browser or the site could set on the phone's behalf. The assertion is a signed statement of the form "this phone, holding this site's key, approved this challenge, showing this text, at this moment", and nothing more.

Every field, every check, and the order the index runs them in are in the [protocol specification](https://docs.identizen.com/protocol/), with test vectors you can run against your own implementation. If a claim on this page does not match the spec, the spec wins, and we would like to hear about it.
