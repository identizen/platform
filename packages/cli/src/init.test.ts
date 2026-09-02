import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { init } from './commands/init.js';
import { readIndexUrl } from './commands/dev.js';
import { parseArgs, flag, boolFlag } from './lib/args.js';
import { upsertEnv } from './lib/env.js';
import { detectProject } from './lib/detect.js';

let dir: string;
const calls: { url: string; body: Record<string, unknown> }[] = [];
const fetchImpl: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const raw = typeof init?.body === 'string' ? init.body : '{}';
  calls.push({ url, body: JSON.parse(raw) as Record<string, unknown> });
  if (url.endsWith('/sites')) {
    return Response.json(
      {
        client_id: 'idz_test_01ABC',
        client_secret: 'secret1',
        webhook_secret: null,
        rp_id: 'localhost',
        name: 'demo',
        redirect_uris: [],
      },
      { status: 201 },
    );
  }
  return Response.json({ error: 'not_found' }, { status: 404 });
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'idz-init-'));
  calls.length = 0;
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('identizen init', () => {
  it('scaffolds a Next.js app: registers the site, writes .env.local, routes, and dependencies; idempotent', async () => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'demo', dependencies: { next: '15.0.0', react: '19' } }),
    );
    mkdirSync(join(dir, 'app'));
    const log = vi.fn();
    const r = await init({ dir, indexUrl: 'http://index.test', fetchImpl, log });
    expect(r.framework).toBe('next');
    expect(r.site.client_id).toBe('idz_test_01ABC');
    expect(calls[0]?.body).toMatchObject({
      name: 'demo',
      rp_id: 'localhost',
      redirect_uris: ['http://localhost:3000/api/auth/callback'],
      backchannel_logout_uri: 'http://localhost:3000/api/auth/backchannel-logout',
      environment: 'test',
    });
    const env = readFileSync(join(dir, '.env.local'), 'utf8');
    expect(env).toContain('IDENTIZEN_INDEX_URL=http://index.test');
    expect(env).toContain('IDENTIZEN_CLIENT_ID=idz_test_01ABC');
    expect(env).toContain('IDENTIZEN_CLIENT_SECRET=secret1');
    expect(r.written.sort()).toEqual(
      [
        'app/api/auth/backchannel-logout/route.ts',
        'app/api/auth/callback/route.ts',
        'app/api/auth/login/route.ts',
        'app/api/auth/logout/route.ts',
        'lib/identizen.ts',
      ].sort(),
    );
    expect(readFileSync(join(dir, 'lib/identizen.ts'), 'utf8')).toContain(
      "from '@identizen/sdk/server'",
    );
    expect(readFileSync(join(dir, 'app/api/auth/login/route.ts'), 'utf8')).toContain(
      '@/lib/identizen',
    );
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies).sort()).toEqual([
      '@identizen/react',
      '@identizen/sdk',
      'jose',
      'next',
      'react',
    ]);
    expect(readIndexUrl(dir)).toBe('http://index.test');

    // Second run keeps existing files and re-registers (fresh client id written).
    writeFileSync(join(dir, 'lib/identizen.ts'), '// custom');
    const again = await init({ dir, indexUrl: 'http://index.test', fetchImpl, log });
    expect(again.skipped).toContain('lib/identizen.ts');
    expect(readFileSync(join(dir, 'lib/identizen.ts'), 'utf8')).toBe('// custom');
    expect(again.addedDependencies).toEqual([]);
  });

  it('uses src/app and src/lib when the project has a src directory', async () => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'demo', dependencies: { next: '15' } }),
    );
    mkdirSync(join(dir, 'src', 'app'), { recursive: true });
    const r = await init({ dir, indexUrl: 'http://index.test', fetchImpl, log: () => undefined });
    expect(r.written).toContain('src/lib/identizen.ts');
    expect(r.written).toContain('src/app/api/auth/callback/route.ts');
    expect(readFileSync(join(dir, 'src/app/api/auth/callback/route.ts'), 'utf8')).toContain(
      "'@/lib/identizen'",
    );
  });

  it('scaffolds an Express router and writes .env', async () => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'api', dependencies: { express: '4' } }),
    );
    const r = await init({
      dir,
      indexUrl: 'http://index.test',
      siteUrl: 'https://api.example.com',
      log: () => undefined,
      fetchImpl,
    });
    expect(r.framework).toBe('express');
    expect(r.written).toEqual(['identizen.js']);
    expect(existsSync(join(dir, '.env'))).toBe(true);
    expect(calls[0]?.body).toMatchObject({ rp_id: 'api.example.com', environment: 'live' });
    expect(readFileSync(join(dir, 'identizen.js'), 'utf8')).toContain('identizenRouter');
  });

  it('fails clearly without a supported framework', async () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x' }));
    await expect(
      init({ dir, indexUrl: 'http://index.test', fetchImpl, log: () => undefined }),
    ).rejects.toThrow(/--framework/);
    expect(detectProject(dir).framework).toBe('unknown');
  });

  it('surfaces registration errors', async () => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'x', dependencies: { next: '15' } }),
    );
    const failing: typeof fetch = async () =>
      Response.json(
        { error: 'registration_closed', error_description: 'token required' },
        { status: 403 },
      );
    await expect(
      init({ dir, indexUrl: 'http://index.test', fetchImpl: failing, log: () => undefined }),
    ).rejects.toThrow(/registration_closed/);
  });
});

describe('helpers', () => {
  it('upsertEnv preserves other lines and replaces keys', () => {
    const p = join(dir, '.env');
    writeFileSync(p, '# comment\nFOO=1\nIDENTIZEN_CLIENT_ID=old\n');
    const r = upsertEnv(p, { IDENTIZEN_CLIENT_ID: 'new', IDENTIZEN_SITE_URL: 'http://x y' });
    expect(r.changed.sort()).toEqual(['IDENTIZEN_CLIENT_ID', 'IDENTIZEN_SITE_URL']);
    expect(readFileSync(p, 'utf8')).toBe(
      '# comment\nFOO=1\nIDENTIZEN_CLIENT_ID=new\nIDENTIZEN_SITE_URL="http://x y"\n',
    );
  });

  it('parseArgs handles commands, flags, and booleans', () => {
    const a = parseArgs(['init', '--index', 'http://i', '--force', '--name=My App', 'extra']);
    expect(a.command).toBe('init');
    expect(flag(a.flags, 'index')).toBe('http://i');
    expect(flag(a.flags, 'name')).toBe('My App');
    expect(boolFlag(a.flags, 'force')).toBe(true);
    expect(boolFlag(a.flags, 'nope')).toBe(false);
    expect(a.positionals).toEqual(['extra']);
  });
});
