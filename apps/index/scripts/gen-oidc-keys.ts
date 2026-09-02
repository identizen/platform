/**
 * Generate OIDC signing keys for `OIDC_SIGNING_KEYS`.
 *   npm run keys -w @identizen/index            -> prints a JSON array with two fresh ES256 keys
 *   npm run keys -w @identizen/index -- rotate  -> reads OIDC_SIGNING_KEYS from stdin, prepends a new key
 * Store the output with `wrangler secret put OIDC_SIGNING_KEYS` or in `.dev.vars`.
 */
import { exportJWK, generateKeyPair } from 'jose';

async function fresh(kid: string) {
  const { privateKey } = await generateKeyPair('ES256', { extractable: true });
  return { ...(await exportJWK(privateKey)), kid, alg: 'ES256', use: 'sig' };
}

const mode = process.argv[2];
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
if (mode === 'rotate') {
  const input = await new Promise<string>((resolve) => {
    let s = '';
    process.stdin.on('data', (d) => (s += String(d)));
    process.stdin.on('end', () => resolve(s));
  });
  const existing = JSON.parse(input || '[]') as unknown[];
  console.info(JSON.stringify([await fresh(`k-${stamp}`), ...existing.slice(0, 1)]));
} else {
  console.info(JSON.stringify([await fresh(`k-${stamp}-a`), await fresh(`k-${stamp}-b`)]));
}
