import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateVectors, vectorFileText } from '../src/vectors/generate';

const vectorsDir = join(__dirname, '..', '..', '..', 'spec', 'vectors');

/**
 * Interop gate (M8.5): the mobile copy of the vector generator, running through the published
 * @identizen/protocol API, must reproduce spec/vectors byte for byte. The same code runs on Hermes
 * via `npm run test:hermes`.
 */
describe('spec/vectors on the mobile JS side', () => {
  const generated = generateVectors();

  it('reproduces every committed vector file byte for byte', () => {
    const files = readdirSync(vectorsDir).filter((f: string) => f.endsWith('.json'));
    expect(files.sort()).toEqual(Object.keys(generated).sort());
    for (const f of files) {
      expect(readFileSync(join(vectorsDir, f), 'utf8')).toBe(vectorFileText(generated[f]));
    }
  });
});
