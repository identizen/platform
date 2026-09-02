/**
 * Regenerate spec/vectors/*.json. Run: npm run vectors -w @identizen/protocol
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateVectors, vectorFileText } from '../src/vectors';

const outDir = join(import.meta.dirname, '..', '..', '..', 'spec', 'vectors');
mkdirSync(outDir, { recursive: true });
const vectors = generateVectors();
for (const [name, value] of Object.entries(vectors)) {
  writeFileSync(join(outDir, name), vectorFileText(value), 'utf8');
  console.info(`wrote spec/vectors/${name}`);
}
