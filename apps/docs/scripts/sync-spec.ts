/**
 * Copy spec/PROTOCOL.md and spec/THREAT-MODEL.md into the docs content tree with Starlight
 * frontmatter. The spec is the source of truth; never hand-edit the generated copies.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tick = '`';

interface Page {
  spec: string;
  out: string;
  title: string;
  description: string;
}

const PAGES: Page[] = [
  {
    spec: 'PROTOCOL.md',
    out: 'protocol/index.md',
    title: 'Protocol v1',
    description:
      'The Identizen protocol — keys, canonical encoding, challenge and assertion signing, discovery, pairing, and request authentication.',
  },
  {
    spec: 'THREAT-MODEL.md',
    out: 'protocol/threat-model.md',
    title: 'Threat model',
    description:
      'Assets, trust boundaries, the attackers considered, how each guarantee holds in the code, the residual risks we accept, and the open items.',
  },
];

for (const page of PAGES) {
  const specPath = resolve(here, '../../../spec', page.spec);
  const outPath = resolve(here, '../src/content/docs', page.out);
  const spec = readFileSync(specPath, 'utf8');
  // Drop the H1 (Starlight renders the frontmatter title); fix the repo-relative SECURITY link.
  const body = spec
    .replace(/^# .*\n/, '')
    .replace('](../SECURITY.md)', '](https://github.com/identizen/platform/blob/main/SECURITY.md)');
  const frontmatter = [
    '---',
    `title: ${page.title}`,
    `description: ${page.description}`,
    'tableOfContents:',
    '  maxHeadingLevel: 3',
    '---',
    '',
    ':::note',
    `Generated from [${tick}spec/${page.spec}${tick}](https://github.com/identizen/platform/blob/main/spec/${page.spec}) by ${tick}npm run sync-spec -w @identizen/docs${tick}. Edit the spec, not this page.`,
    ':::',
    '',
    '',
  ].join('\n');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, frontmatter + body);
  console.info(`synced ${specPath} -> ${outPath}`);
}
