/**
 * Must be imported before anything from @identizen/protocol.
 * - crypto.getRandomValues: Hermes has no WebCrypto; react-native-get-random-values installs a
 *   CSPRNG-backed implementation (the protocol only needs getRandomValues; Ed25519 hashing is sync
 *   via @noble/hashes).
 * - TextEncoder/TextDecoder: shipped by Hermes since React Native 0.74/0.77. We assert rather than
 *   polyfill so a downgrade fails loudly instead of silently mis-encoding signatures.
 */
import 'react-native-get-random-values';

if (
  typeof globalThis.TextEncoder === 'undefined' ||
  typeof globalThis.TextDecoder === 'undefined'
) {
  throw new Error('Identizen needs TextEncoder/TextDecoder (React Native >= 0.77 with Hermes).');
}
if (typeof globalThis.crypto?.getRandomValues !== 'function') {
  throw new Error('Identizen needs crypto.getRandomValues (react-native-get-random-values).');
}
