// Every inline <script> and <style> in the built pages must be covered by a hash in that page's
// Content-Security-Policy meta tag (astro.config.mjs, security.csp). Astro hashes what it emits;
// scripts from a library or added by hand need their hashes pinned in the config, and this check
// turns a library upgrade that changes one into a red build instead of a silently broken page.
// Usage: node scripts/check-csp.mjs <dist dir>
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2];
if (!root) {
  console.error('usage: check-csp.mjs <dist dir>');
  process.exit(2);
}

const missing = new Map();
let pages = 0;
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (entry.endsWith('.html')) check(p);
  }
};
const check = (file) => {
  pages += 1;
  const html = readFileSync(file, 'utf8');
  const meta = /<meta http-equiv="content-security-policy" content="([^"]*)"/.exec(html);
  if (!meta) {
    missing.set(`(no CSP meta) ${file}`, '');
    return;
  }
  const hashes = new Set(meta[1].match(/sha256-[A-Za-z0-9+/=]+/g) ?? []);
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].filter(
    (m) => !/type="application\/ld\+json"/.test(m[0]),
  );
  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)];
  for (const m of [...inline, ...styles]) {
    const hash = `sha256-${createHash('sha256').update(m[1]).digest('base64')}`;
    if (!hashes.has(hash))
      missing.set(hash, `${m[0].slice(0, 30)} ${m[1].slice(0, 60)}`.replace(/\s+/g, ' '));
  }
};
walk(root);
if (missing.size > 0) {
  console.error(
    `check-csp: ${missing.size} inline script/style hash(es) missing from the CSP across ${pages} page(s):`,
  );
  for (const [hash, sample] of missing) console.error(`  ${hash}  ${sample}`);
  process.exit(1);
}
console.info(`check-csp: every inline script and style on ${pages} page(s) is covered by the CSP`);
