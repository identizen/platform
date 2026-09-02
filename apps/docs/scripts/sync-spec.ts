/**
 * Copy spec/PROTOCOL.md into the docs content tree with Starlight frontmatter.
 * The spec is the source of truth; never hand-edit the generated copy.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const specPath = resolve(here, '../../../spec/PROTOCOL.md');
const outPath = resolve(here, '../src/content/docs/protocol/index.md');

const spec = readFileSync(specPath, 'utf8');
// Drop the H1 (Starlight renders the frontmatter title); change nothing else.
const body = spec.replace(/^# .*\n/, '');
const tick = '`';
const frontmatter = [
  '---',
  'title: Protocol v1',
  'description: The Identizen protocol — keys, canonical encoding, challenge and assertion signing, discovery, pairing, and request authentication.',
  'tableOfContents:',
  '  maxHeadingLevel: 3',
  '---',
  '',
  ':::note',
  `Generated from [${tick}spec/PROTOCOL.md${tick}](https://github.com/identizen/identizen/blob/main/spec/PROTOCOL.md) by ${tick}npm run sync-spec -w @identizen/docs${tick}. Edit the spec, not this page.`,
  ':::',
  '',
  '',
].join('\n');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, frontmatter + body);
console.info(`synced ${specPath} -> ${outPath}`);
