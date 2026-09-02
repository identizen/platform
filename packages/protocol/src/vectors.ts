/**
 * Deterministic test-vector generation from fixed inputs.
 *
 * `spec/vectors/*.json` are produced by `npm run vectors -w @identizen/protocol` and are the
 * interop contract: the mobile app (Hermes) and any third-party implementation must
 * reproduce them byte for byte.
 */
import { canonicalize } from './canonicalize';
import { fromHex, toBase64Url, toHex } from './encoding';
import {
  deriveMasterKey,
  deriveSiteKey,
  identityId,
  keyPairFromPrivateKey,
  seedToMnemonic,
  siteSub,
} from './keys';
import { bleWindow, rotatingBleIdForWindow } from './ble';
import {
  createAssertion,
  createChallenge,
  reasonHash,
  signAssertion,
  signChallenge,
  signIdentityProof,
  signPairing,
  signRequest,
  signingBytes,
} from './sign';

export const VECTOR_SEED_HEX = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
export const VECTOR_DEVICE_KEY_HEX =
  '202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f';
export const VECTOR_INDEX_KEY_HEX =
  '404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f';
export const VECTOR_BLE_KEY_HEX =
  '606162636465666768696a6b6c6d6e6f707172737475767778797a7b7c7d7e7f';
export const VECTOR_NOW = 1756560000;
export const VECTOR_CHALLENGE_ID = 'ch_01K3ZB2N9G0000000000000000';
export const VECTOR_DEVICE_ID = 'dev_01K3ZB2N9G0000000000000001';
export const VECTOR_PAIRING_ID = 'pr_01K3ZB2N9G0000000000000002';
export const VECTOR_NONCE_HEX = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
export const VECTOR_INDEX_URL = 'https://index.identizen.com';
export const VECTOR_RP_IDS = ['app.example.com', 'login.example.org'] as const;

export type VectorFiles = Record<string, unknown>;

export function generateVectors(): VectorFiles {
  const seed = fromHex(VECTOR_SEED_HEX);
  const device = keyPairFromPrivateKey(fromHex(VECTOR_DEVICE_KEY_HEX));
  const index = keyPairFromPrivateKey(fromHex(VECTOR_INDEX_KEY_HEX));
  const bleKey = fromHex(VECTOR_BLE_KEY_HEX);
  const master = deriveMasterKey(seed);
  const nonce = toBase64Url(fromHex(VECTOR_NONCE_HEX));

  const keys = {
    seed_hex: VECTOR_SEED_HEX,
    mnemonic: seedToMnemonic(seed),
    master: {
      private_hex: toHex(master.privateKey),
      public_b64url: toBase64Url(master.publicKey),
      idz: identityId(master.publicKey),
    },
    sites: VECTOR_RP_IDS.map((rpId) => {
      const k = deriveSiteKey(seed, rpId);
      return {
        rp_id: rpId,
        private_hex: toHex(k.privateKey),
        public_b64url: toBase64Url(k.publicKey),
        sub: siteSub(k.publicKey),
      };
    }),
    device: {
      private_hex: VECTOR_DEVICE_KEY_HEX,
      public_b64url: toBase64Url(device.publicKey),
      device_id: VECTOR_DEVICE_ID,
    },
    index: {
      private_hex: VECTOR_INDEX_KEY_HEX,
      public_b64url: toBase64Url(index.publicKey),
    },
    identity_proof: {
      device_id: VECTOR_DEVICE_ID,
      master_sig: signIdentityProof(VECTOR_DEVICE_ID, master.privateKey),
    },
  };

  const canonicalizeCases = [
    { input: { b: 2, a: 1 }, output: canonicalize({ b: 2, a: 1 }) },
    {
      input: { nested: { z: [1, 2.5, null], y: 'str' }, x: true },
      output: canonicalize({ nested: { z: [1, 2.5, null], y: 'str' }, x: true }),
    },
    {
      input: { unicode: 'café €', escaped: 'a"b\\c\n' },
      output: canonicalize({ unicode: 'café €', escaped: 'a"b\\c\n' }),
    },
    {
      input: { big: 1e30, small: 1e-7, int: 42, neg: -1.5 },
      output: canonicalize({ big: 1e30, small: 1e-7, int: 42, neg: -1.5 }),
    },
  ];

  const site0 = deriveSiteKey(seed, VECTOR_RP_IDS[0]);
  const loginChallenge = createChallenge({
    id: VECTOR_CHALLENGE_ID,
    rp_id: VECTOR_RP_IDS[0],
    rp_name: 'Example App',
    nonce,
    code: '47',
    iat: VECTOR_NOW,
    index: VECTOR_INDEX_URL,
    acr: 'idz:login',
  });
  const loginSigned = signChallenge(loginChallenge, index.privateKey);
  const loginAssertion = createAssertion({
    challenge: loginChallenge,
    sitePublicKey: site0.publicKey,
    deviceId: VECTOR_DEVICE_ID,
    amr: ['face', 'hwk'],
    iat: VECTOR_NOW + 12,
  });
  const loginAssertionSigned = signAssertion(loginAssertion, site0.privateKey, device.privateKey);

  const reason = 'Approve wire transfer of $12,000 to Acme?';
  const mfaChallenge = createChallenge({
    id: VECTOR_CHALLENGE_ID,
    rp_id: VECTOR_RP_IDS[0],
    rp_name: 'Example App',
    nonce,
    code: '08',
    iat: VECTOR_NOW,
    index: VECTOR_INDEX_URL,
    acr: 'idz:mfa',
    reason,
  });
  const mfaSigned = signChallenge(mfaChallenge, index.privateKey);
  const mfaAssertion = createAssertion({
    challenge: mfaChallenge,
    sitePublicKey: site0.publicKey,
    deviceId: VECTOR_DEVICE_ID,
    amr: ['fingerprint', 'hwk'],
    iat: VECTOR_NOW + 7,
  });
  const mfaAssertionSigned = signAssertion(mfaAssertion, site0.privateKey, device.privateKey);

  const challenge = {
    login: {
      challenge: loginSigned.payload,
      signing_input: new TextDecoder().decode(signingBytes('challenge', loginSigned.payload)),
      sig: loginSigned.sig,
    },
    mfa: {
      challenge: mfaSigned.payload,
      signing_input: new TextDecoder().decode(signingBytes('challenge', mfaSigned.payload)),
      sig: mfaSigned.sig,
    },
  };

  const assertion = {
    login: {
      assertion: loginAssertionSigned.payload,
      signing_input: new TextDecoder().decode(
        signingBytes('assertion', loginAssertionSigned.payload),
      ),
      site_sig: loginAssertionSigned.site_sig,
      device_sig: loginAssertionSigned.device_sig,
    },
    mfa: {
      reason,
      reason_hash: reasonHash(reason),
      assertion: mfaAssertionSigned.payload,
      signing_input: new TextDecoder().decode(
        signingBytes('assertion', mfaAssertionSigned.payload),
      ),
      site_sig: mfaAssertionSigned.site_sig,
      device_sig: mfaAssertionSigned.device_sig,
    },
  };

  const pairingPayload = {
    type: 'pairing' as const,
    pairing_id: VECTOR_PAIRING_ID,
    device_id: VECTOR_DEVICE_ID,
    browser_pubkey: toBase64Url(fromHex('04' + '11'.repeat(32) + '22'.repeat(32))),
    issued_at: VECTOR_NOW,
  };
  const pairingSigned = signPairing(pairingPayload, index.privateKey);
  const pairing = {
    pairing: pairingSigned.payload,
    signing_input: new TextDecoder().decode(signingBytes('pairing', pairingSigned.payload)),
    sig: pairingSigned.sig,
    paired_signature_input: `identizen/v1/paired\n${VECTOR_CHALLENGE_ID}`,
  };

  const requestInput = {
    method: 'POST',
    path: '/identities',
    body: '{"master_pubkey":"' + toBase64Url(master.publicKey) + '"}',
    timestamp: VECTOR_NOW,
  };
  const request = {
    ...requestInput,
    header: signRequest(requestInput, VECTOR_DEVICE_ID, device.privateKey),
  };

  const w = bleWindow(VECTOR_NOW);
  const ble = {
    ble_key_hex: VECTOR_BLE_KEY_HEX,
    now: VECTOR_NOW,
    window: w,
    ids: [w - 1, w, w + 1].map((win) => ({
      window: win,
      id_hex: toHex(rotatingBleIdForWindow(bleKey, win)),
      id_b64url: toBase64Url(rotatingBleIdForWindow(bleKey, win)),
    })),
  };

  return {
    'keys.json': keys,
    'canonicalize.json': { cases: canonicalizeCases },
    'challenge.json': challenge,
    'assertion.json': assertion,
    'pairing.json': pairing,
    'request.json': request,
    'ble.json': ble,
  };
}

/** Stable pretty JSON for committing vectors. */
export function vectorFileText(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n';
}
