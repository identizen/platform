// Run the spec/vectors check on the Hermes engine (the JS runtime of the React Native app).
//
// 1. esbuild bundles scripts/vectors-check.ts + @identizen/protocol into one ES2017 IIFE.
// 2. Babel (@babel/preset-env) lowers it the way Metro does for Hermes: classes, async/await,
//    generators (regenerator-runtime is prepended), optional chaining, etc. BigInt stays native.
// 3. hermes-engine-cli's `hermes` VM executes it. TextEncoder/TextDecoder are polyfilled in the
//    harness because the standalone CLI predates their arrival in Hermes; React Native's bundled
//    Hermes (>= 0.77) has them natively. crypto.getRandomValues is not needed by the vector
//    generator (all inputs are fixed), so no polyfill is installed for it.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformAsync } from '@babel/core';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDir = join(root, 'node_modules', '.cache', 'identizen-hermes');
mkdirSync(outDir, { recursive: true });
const bundle = join(outDir, 'vectors-check.js');
const lowered = join(outDir, 'vectors-check.hermes.js');

await build({
  entryPoints: [join(here, 'vectors-check.ts')],
  bundle: true,
  format: 'iife',
  platform: 'neutral',
  target: ['es2017'],
  mainFields: ['module', 'main'],
  conditions: ['import', 'default'],
  outfile: bundle,
  logLevel: 'error',
});

const require = createRequire(import.meta.url);
const babel = await transformAsync(readFileSync(bundle, 'utf8'), {
  babelrc: false,
  configFile: false,
  compact: false,
  presets: [
    [
      require.resolve('@babel/preset-env'),
      {
        targets: { ie: '11' },
        modules: false,
        exclude: ['transform-typeof-symbol', 'transform-exponentiation-operator'],
      },
    ],
  ],
});
const polyfill = readFileSync(join(here, 'hermes-polyfill.js'), 'utf8');
const regenerator = readFileSync(require.resolve('regenerator-runtime/runtime.js'), 'utf8');
writeFileSync(lowered, `${polyfill}\n${regenerator}\n${babel?.code ?? ''}`);

const cliDir = dirname(require.resolve('hermes-engine-cli/package.json'));
const bin =
  process.platform === 'win32'
    ? join(cliDir, 'win64-bin', 'hermes.exe')
    : process.platform === 'darwin'
      ? join(cliDir, 'osx-bin', 'hermes')
      : join(cliDir, 'linux64-bin', 'hermes');
if (!existsSync(bin)) {
  console.error(`hermes binary not found at ${bin}; install hermes-engine-cli for this platform`);
  process.exit(2);
}
const out = execFileSync(bin, [lowered], { encoding: 'utf8' });
process.stdout.write(out);
if (!out.includes('VECTORS_OK')) process.exit(1);
