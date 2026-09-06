/**
 * Embed spec/openapi.yaml into the Worker as JSON so `GET /openapi.json` can serve it.
 *   npm run openapi -w @identizen/index
 * Runs before dev, build, typecheck, deploy, and the unit tests. The spec is the source of
 * truth; never edit src/openapi.generated.ts by hand (test/openapi.test.ts checks it is in sync).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const here = dirname(fileURLToPath(import.meta.url));
const specPath = resolve(here, '../../../spec/openapi.yaml');
const outPath = resolve(here, '../src/openapi.generated.ts');

const doc = parse(readFileSync(specPath, 'utf8')) as Record<string, unknown>;
const out =
  '// Generated from spec/openapi.yaml by scripts/gen-openapi.ts. Do not edit; run `npm run openapi`.\n' +
  `export const OPENAPI_DOCUMENT: Record<string, unknown> = ${JSON.stringify(doc, null, 2)};\n`;
writeFileSync(outPath, out);
console.info(`wrote ${outPath}`);
