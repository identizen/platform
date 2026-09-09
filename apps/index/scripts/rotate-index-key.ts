/**
 * Rotate the index signing key (PROTOCOL.md §3.1) without stranding phones.
 *
 *   npm run keys:index -w @identizen/index                  -> prints a fresh INDEX_SIGNING_KEY (hex)
 *   INDEX_SIGNING_KEY=<current hex> INDEX_URL=https://index.example.com \
 *     npm run keys:index -w @identizen/index -- rotate      -> prints the new key and the rotation
 *                                                              statement, signed by the current key
 *
 * Then, in this order: append the statement to INDEX_KEY_ROTATIONS (a JSON array; keep every
 * earlier statement), deploy that, and only then `wrangler secret put INDEX_SIGNING_KEY` with the
 * new key. Phones that pinned the old key verify the statement with it and re-pin the new one.
 */
import {
  generateKeyPair,
  keyPairFromPrivateKey,
  signRotation,
  toBase64Url,
  toHex,
} from '@identizen/protocol';

const mode = process.argv[2];
const fresh = generateKeyPair();
if (mode !== 'rotate') {
  console.info(toHex(fresh.privateKey));
} else {
  const currentHex = process.env.INDEX_SIGNING_KEY;
  const index = process.env.INDEX_URL;
  if (!currentHex || !index) {
    console.error('set INDEX_SIGNING_KEY (current key, hex) and INDEX_URL (issuer URL)');
    process.exit(2);
  }
  const current = keyPairFromPrivateKey(fromHexStrict(currentHex));
  const statement = signRotation(
    {
      type: 'rotation',
      index,
      prev_pubkey: toBase64Url(current.publicKey),
      next_pubkey: toBase64Url(fresh.publicKey),
      iat: Math.floor(Date.now() / 1000),
    },
    current.privateKey,
  );
  console.info(
    JSON.stringify(
      {
        INDEX_SIGNING_KEY: toHex(fresh.privateKey),
        append_to_INDEX_KEY_ROTATIONS: statement,
        order: [
          'append the statement to INDEX_KEY_ROTATIONS and deploy',
          'then set the new INDEX_SIGNING_KEY',
        ],
      },
      null,
      2,
    ),
  );
}

function fromHexStrict(hex: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('INDEX_SIGNING_KEY must be 32 bytes of hex');
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
