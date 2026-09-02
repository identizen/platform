# @identizen/protocol

The Identizen protocol, implemented once. Keys and identifiers, JCS canonical encoding (RFC 8785), challenge / assertion / pairing signing and verification, `Idz-Signature` request authentication, and rotating BLE identifiers.

Specification: `spec/PROTOCOL.md`. Test vectors: `spec/vectors/*.json` — this package reproduces them byte for byte, and so must every other implementation.

```ts
import {
  generateSeed,
  seedToMnemonic,
  deriveMasterKey,
  deriveSiteKey,
  identityId,
  createAssertion,
  signAssertion,
} from '@identizen/protocol';

const seed = generateSeed(); // 32 bytes, shown once as 24 words
const words = seedToMnemonic(seed);
const master = deriveMasterKey(seed);
const idz = identityId(master.publicKey);
const site = deriveSiteKey(seed, 'app.example.com');
```

Dependencies are limited to `@noble/ed25519`, `@noble/hashes`, `@scure/bip39`, and `zod`. Runs in browsers, Cloudflare Workers, Node, and React Native (Hermes) with a `crypto.getRandomValues` polyfill.
