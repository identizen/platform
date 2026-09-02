/**
 * docs:verify — every ```ts / ```tsx / ```js code block in the docs must compile.
 *
 * TS/TSX blocks are extracted into a temp workspace (one file per block) and typechecked with
 * `tsc --noEmit` against the real workspace packages; JS blocks get a syntax check. A block may
 * opt out with `check="false"` in its fence meta. A block marked `fragment="true"` is wrapped so
 * free-standing statements and JSX typecheck; otherwise blocks must be complete modules.
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const docsRoot = resolve(here, '../src/content/docs');
const outDir = resolve(here, '../.verify');
const repoRoot = resolve(here, '../../..');

interface Block {
  file: string;
  line: number;
  lang: 'ts' | 'tsx' | 'js';
  meta: Record<string, string>;
  code: string;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.mdx?$/.test(name)) out.push(p);
  }
  return out;
}

function parseMeta(s: string): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const m of s.matchAll(/(\w+)="([^"]*)"/g)) meta[m[1] ?? ''] = m[2] ?? '';
  return meta;
}

function extract(file: string): Block[] {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const blocks: Block[] = [];
  for (let i = 0; i < lines.length; i++) {
    const open = /^(\s*)```(ts|tsx|js|typescript|javascript)\b(.*)$/.exec(lines[i] ?? '');
    if (!open) continue;
    const indent = open[1] ?? '';
    const langRaw = open[2] ?? 'ts';
    const lang =
      langRaw === 'typescript'
        ? 'ts'
        : langRaw === 'javascript'
          ? 'js'
          : (langRaw as Block['lang']);
    const meta = parseMeta(open[3] ?? '');
    const start = i + 1;
    let end = start;
    while (end < lines.length && !/^\s*```\s*$/.test(lines[end] ?? '')) end++;
    // Blocks nested in <Steps> lists are indented; strip the fence indent so the sample compiles.
    const code = lines
      .slice(start, end)
      .map((l) => (indent && l.startsWith(indent) ? l.slice(indent.length) : l))
      .join('\n');
    blocks.push({ file, line: start + 1, lang, meta, code });
    i = end;
  }
  return blocks;
}

const FRAGMENT_HEADER = `// docs:verify fragment wrapper
import * as React from 'react';
export {};
declare const request: Request;
declare const req: Request;
declare const router: { push(url: string): void };
declare const sub: string;
declare const state: string;
declare const nonce: string;
declare const codeChallenge: string;
declare const codeVerifier: string;
declare const code: string;
declare const redirectUri: string;
declare const indexUrl: string;
declare const clientId: string;
declare const clientSecret: string;
declare const logoutToken: string;
declare const accessToken: string;
declare const boundSub: string;
declare const user: { enrolledSub: string };
async function __fragment() {
`;

/** Hoist import declarations (single or multi-line) above the async wrapper. */
function wrapFragment(code: string): string {
  const imports: string[] = [];
  const body: string[] = [];
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (/^import\s/.test(line)) {
      let stmt = line;
      while (!/;\s*$/.test(stmt) && i + 1 < lines.length) stmt += '\n' + (lines[++i] ?? '');
      imports.push(stmt);
    } else body.push(line);
  }
  return imports.join('\n') + '\n' + FRAGMENT_HEADER + body.join('\n') + '\n}\nvoid __fragment;\n';
}

const blocks = walk(docsRoot)
  .flatMap(extract)
  .filter((b) => b.meta.check !== 'false');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const tsFiles: string[] = [];
let jsCount = 0;
let failures = 0;

for (const [i, b] of blocks.entries()) {
  const rel = relative(docsRoot, b.file)
    .replace(/[\\/]/g, '__')
    .replace(/\.mdx?$/, '');
  const name = `${String(i).padStart(3, '0')}_${rel}_L${b.line}.${b.lang}`;
  const path = join(outDir, name);
  if (b.lang === 'js') {
    jsCount++;
    try {
      // Syntax-only check: parse as a module via TypeScript's transpiler in the tsc pass below.
      writeFileSync(path.replace(/\.js$/, '.mjs'), b.code);
      execFileSync(process.execPath, ['--check', path.replace(/\.js$/, '.mjs')], { stdio: 'pipe' });
    } catch (err) {
      failures++;
      console.error(`✖ ${relative(repoRoot, b.file)}:${b.line} (js syntax)\n${String(err)}`);
    }
    continue;
  }
  const isFragment = b.meta.fragment === 'true';
  const code = isFragment ? wrapFragment(b.code) : b.code;
  writeFileSync(path, code);
  tsFiles.push(path);
}

if (tsFiles.length) {
  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      jsx: 'react-jsx',
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      esModuleInterop: true,
      allowImportingTsExtensions: false,
      lib: ['ES2023', 'DOM', 'DOM.Iterable'],
      types: ['node', 'react'],
      baseUrl: '.',
      paths: { '@/*': ['./stubs/*'] },
    },
    include: ['*.ts', '*.tsx', 'stubs/**/*.ts'],
  };
  writeFileSync(join(outDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));
  // Stubs for `@/lib/identizen` and `@/lib/session` imports used by scaffold-style samples.
  mkdirSync(join(outDir, 'stubs', 'lib'), { recursive: true });
  writeFileSync(
    join(outDir, 'stubs', 'lib', 'identizen.ts'),
    `import { createIdentizenServer } from '@identizen/sdk/server';
export const identizen = createIdentizenServer({ indexUrl: 'http://localhost:8787', clientId: 'idz_test_x', clientSecret: 'x' });
export const SITE_URL = 'http://localhost:3000';
export const REDIRECT_URI = SITE_URL + '/api/auth/callback';
export interface IdentizenSession { sub: string; sid: string; acr: string; amr: string[]; handle?: string }
export async function getIdentizenSession(): Promise<IdentizenSession | null> { return null; }
export async function setIdentizenSession(_s: IdentizenSession): Promise<void> {}
export async function clearIdentizenSession(): Promise<void> {}
export const revokedSids = new Set<string>();
`,
  );
  // node_modules resolution: point at the workspace root so @identizen/* and react resolve.
  const nm = join(outDir, 'node_modules');
  if (!existsSync(nm)) {
    try {
      execFileSync(
        process.platform === 'win32' ? 'cmd' : 'ln',
        process.platform === 'win32'
          ? ['/c', 'mklink', '/J', nm, join(repoRoot, 'node_modules')]
          : ['-s', join(repoRoot, 'node_modules'), nm],
        { stdio: 'pipe' },
      );
    } catch (err) {
      console.error('could not link node_modules', String(err));
    }
  }
  try {
    execFileSync(
      process.execPath,
      [
        join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
        '-p',
        join(outDir, 'tsconfig.json'),
      ],
      { stdio: 'pipe', cwd: outDir },
    );
  } catch (err) {
    failures++;
    const out = (err as { stdout?: Buffer }).stdout?.toString() ?? String(err);
    console.error(out);
  }
}

console.info(
  `docs:verify checked ${tsFiles.length} TS/TSX blocks and ${jsCount} JS blocks from ${new Set(blocks.map((b) => b.file)).size} pages`,
);
if (failures) {
  console.error(`docs:verify failed`);
  process.exit(1);
}
