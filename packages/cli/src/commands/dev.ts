import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { FakePhone, startPhoneServer, type Policy } from '@identizen/fake-phone';
import { indexHealthy } from '../lib/index-client';

export interface DevOptions {
  dir: string;
  /** Index to register the fake phone with. Defaults to IDENTIZEN_INDEX_URL from .env(.local). */
  indexUrl?: string | undefined;
  port?: number | undefined;
  policy?: Policy | undefined;
  /** Also start a local index (`wrangler dev` in this monorepo) before the phone. */
  local?: boolean | undefined;
  log?: ((line: string) => void) | undefined;
}

export interface DevHandle {
  phone: FakePhone;
  url: string;
  close: () => void;
}

/** Read IDENTIZEN_INDEX_URL from .env.local / .env in the project. */
export function readIndexUrl(dir: string): string | null {
  for (const f of ['.env.local', '.env']) {
    const p = join(dir, f);
    if (!existsSync(p)) continue;
    const m = /^\s*IDENTIZEN_INDEX_URL\s*=\s*"?([^"\n]+)"?/m.exec(readFileSync(p, 'utf8'));
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

/**
 * `identizen dev`: run a fake phone that receives challenges from the index and approves them
 * (or asks you in its browser UI). With a remote index the phone polls its inbox; with a local
 * index it also accepts web pushes.
 */
export async function dev(opts: DevOptions): Promise<DevHandle> {
  const log = opts.log ?? ((l: string) => console.info(l));
  const indexUrl = (opts.indexUrl ?? readIndexUrl(opts.dir) ?? 'http://localhost:8787').replace(
    /\/+$/,
    '',
  );
  const port = opts.port ?? 4400;
  const url = `http://localhost:${port}`;
  let child: ChildProcess | null = null;

  if (opts.local) {
    const wranglerDir = findIndexApp(opts.dir);
    if (!wranglerDir)
      throw new Error(
        '--local needs the Identizen monorepo (apps/index) — use a hosted index instead',
      );
    log(`Starting local index from ${wranglerDir}…`);
    child = spawn('npx', ['wrangler', 'dev', '--port', '8787'], {
      cwd: wranglerDir,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
  }

  for (let i = 0; i < 60 && !(await indexHealthy(indexUrl)); i++) {
    if (i === 0) log(`Waiting for the index at ${indexUrl}…`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!(await indexHealthy(indexUrl))) throw new Error(`Index at ${indexUrl} is not reachable.`);

  const remote = !/localhost|127\.0\.0\.1/.test(indexUrl);
  const phone = new FakePhone({
    indexUrl,
    pushUrl: remote ? null : url,
    policy: opts.policy ?? 'approve',
    poll: remote,
  });
  const server = startPhoneServer({ phone, port });
  await phone.register();
  log(
    `Fake phone ready at ${url}  (index ${indexUrl}, policy ${phone.policy}${remote ? ', polling inbox' : ''})`,
  );
  log('Open it in a browser to approve or deny sign-ins by hand, or leave it to auto-approve.');

  return {
    phone,
    url,
    close: () => {
      phone.stopPolling();
      server.close();
      child?.kill();
    },
  };
}

function findIndexApp(start: string): string | null {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'apps', 'index');
    if (existsSync(join(candidate, 'wrangler.jsonc'))) return candidate;
    const parent = join(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
