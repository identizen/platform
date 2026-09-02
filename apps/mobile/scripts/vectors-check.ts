/**
 * Entry point bundled for the Hermes run (see hermes-vectors.mjs). The vectors JSON is inlined
 * at bundle time; the script prints "VECTORS_OK" or a diff and exits non-zero via a thrown error.
 */
import assertionJson from '../../../spec/vectors/assertion.json';
import bleJson from '../../../spec/vectors/ble.json';
import canonicalizeJson from '../../../spec/vectors/canonicalize.json';
import challengeJson from '../../../spec/vectors/challenge.json';
import keysJson from '../../../spec/vectors/keys.json';
import pairingJson from '../../../spec/vectors/pairing.json';
import requestJson from '../../../spec/vectors/request.json';
import { generateVectors, vectorFileText } from '../src/vectors/generate';

const expected: Record<string, unknown> = {
  'keys.json': keysJson,
  'canonicalize.json': canonicalizeJson,
  'challenge.json': challengeJson,
  'assertion.json': assertionJson,
  'pairing.json': pairingJson,
  'request.json': requestJson,
  'ble.json': bleJson,
};

const generated = generateVectors();
const failures: string[] = [];
for (const [name, value] of Object.entries(expected)) {
  const want = vectorFileText(value);
  const got = vectorFileText(generated[name]);
  if (want !== got)
    failures.push(
      `${name}: mismatch\n--- expected\n${want.slice(0, 400)}\n--- got\n${got.slice(0, 400)}`,
    );
}
if (failures.length) {
  throw new Error(`VECTORS_FAIL\n${failures.join('\n')}`);
}
// eslint-disable-next-line no-console
console.log(`VECTORS_OK ${Object.keys(expected).length} files`);
