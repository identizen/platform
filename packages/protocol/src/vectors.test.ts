import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fromBase64Url, fromHex } from './encoding.js';
import { keyPairFromPrivateKey, mnemonicToSeed } from './keys.js';
import { verifyAssertion, verifyChallenge, verifyPairing } from './sign.js';
import { VECTOR_INDEX_KEY_HEX, VECTOR_NOW, generateVectors, vectorFileText } from './vectors.js';

const vectorsDir = join(import.meta.dirname, '..', '..', '..', 'spec', 'vectors');

describe('spec/vectors', () => {
  const generated = generateVectors();

  it('reproduces every committed vector file byte for byte', () => {
    const files = readdirSync(vectorsDir).filter((f) => f.endsWith('.json'));
    expect(files.sort()).toEqual(Object.keys(generated).sort());
    for (const f of files) {
      const onDisk = readFileSync(join(vectorsDir, f), 'utf8');
      expect(onDisk, `spec/vectors/${f} is stale; run npm run vectors -w @identizen/protocol`).toBe(
        vectorFileText(generated[f]),
      );
    }
  });

  it('vectors are internally consistent (verify with the index and device keys)', () => {
    const keys = generated['keys.json'] as {
      seed_hex: string;
      mnemonic: string;
      device: { public_b64url: string };
    };
    expect(mnemonicToSeed(keys.mnemonic)).toEqual(fromHex(keys.seed_hex));
    const index = keyPairFromPrivateKey(fromHex(VECTOR_INDEX_KEY_HEX));
    const devicePub = fromBase64Url(keys.device.public_b64url);

    const ch = generated['challenge.json'] as Record<
      'login' | 'mfa',
      { challenge: unknown; sig: string }
    >;
    const as = generated['assertion.json'] as Record<
      'login' | 'mfa',
      { assertion: unknown; site_sig: string; device_sig: string }
    >;
    for (const kind of ['login', 'mfa'] as const) {
      const c = verifyChallenge(
        { payload: ch[kind].challenge, sig: ch[kind].sig },
        index.publicKey,
        {
          now: VECTOR_NOW + 10,
        },
      );
      expect(c.ok).toBe(true);
      if (!c.ok) return;
      const a = verifyAssertion(
        {
          payload: as[kind].assertion,
          site_sig: as[kind].site_sig,
          device_sig: as[kind].device_sig,
        },
        c.value,
        devicePub,
        { now: VECTOR_NOW + 20 },
      );
      expect(a.ok).toBe(true);
    }

    const pr = generated['pairing.json'] as { pairing: unknown; sig: string };
    expect(verifyPairing({ payload: pr.pairing, sig: pr.sig }, index.publicKey).ok).toBe(true);
  });
});
