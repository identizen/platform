import { spawnSync } from 'node:child_process';
import { openSync, closeSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const output = dirname(fileURLToPath(import.meta.url));
const root = resolve(output, '../..');
const npm = resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const vitest = resolve(root, 'node_modules/vitest/vitest.mjs');
const database = 'postgres://identizen:identizen@localhost:5433/identizen_security_review_20260906';
const env = { ...process.env, DATABASE_URL: database, CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: database, CI: 'true', TURBO_TELEMETRY_DISABLED: '1' };
function run(name, script, args, cwd = root) {
  const log = openSync(resolve(output, `${name}.log`), 'w');
  const result = spawnSync(process.execPath, [script, ...args], { cwd, env, stdio: ['ignore', log, log], windowsHide: true, timeout: 600000 });
  closeSync(log);
  console.info(JSON.stringify({ name, exit: result.status, error: result.error?.message }));
}
switch (process.argv[2]) {
  case 'units':
    for (const workspace of ['packages/protocol', 'packages/sdk', 'packages/cli', 'packages/dashboard', 'apps/web']) {
      run(workspace.replaceAll('/', '-'), vitest, ['run', '--reporter=verbose'], resolve(root, workspace));
    }
    run('apps-mobile', npm, ['run', 'test:unit', '-w', '@identizen/mobile', '--', '--runInBand']);
    break;
  case 'probes':
    run('adversarial', vitest, ['run', '--config', 'vitest.audit.config.ts', 'test/security-audit-20260908.test.ts', '--reporter=verbose'], resolve(root, 'apps/index'));
    break;
  case 'regressions':
    run('security-regressions', vitest, [
      'run',
      '--config',
      'vitest.audit.config.ts',
      'test/security-regressions.test.ts',
      'test/guard-state.test.ts',
      'test/outbound.test.ts',
      '--reporter=verbose',
    ], resolve(root, 'apps/index'));
    break;
  case 'checks':
    run('audit-production', npm, ['audit', '--omit=dev', '--json']);
    run('lint', npm, ['run', 'lint']);
    run('typecheck', npm, ['run', 'typecheck']);
    break;
  case 'browser':
    run('browser-security', resolve(root, 'node_modules/@playwright/test/cli.js'), ['test', 'security-headers.spec.ts', '--reporter=list'], resolve(root, 'apps/web'));
    break;
  case 'public': {
    const results = [];
    const checks = [
      ['https://index.identizen.com/health', 'GET'],
      ['https://index.identizen.com/.well-known/openid-configuration', 'GET'],
      ['https://index.identizen.com/.well-known/jwks.json', 'GET'],
      ['https://index.identizen.com/me/devices', 'GET'],
      ['https://index.identizen.com/token', 'POST', 'grant_type=invalid-audit-grant'],
      ['https://index.identizen.com/v1/verify/audit-nonexistent', 'GET'],
      ['https://app.identizen.com/', 'HEAD'],
      ['https://identizen.com/', 'HEAD'],
      ['https://docs.identizen.com/', 'HEAD'],
    ];
    for (const [url, method, body] of checks) {
      try {
        const res = await fetch(url, {
          method,
          body,
          redirect: 'manual',
          signal: AbortSignal.timeout(15_000),
          headers: {
            'user-agent': 'Identizen-owner-security-audit/2026-09-08',
            ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
          },
        });
        const allowed = new Set([
          'content-security-policy', 'strict-transport-security', 'x-content-type-options',
          'x-frame-options', 'referrer-policy', 'cache-control', 'access-control-allow-origin',
          'server', 'location', 'content-type',
        ]);
        const headers = Object.fromEntries([...res.headers].filter(([key]) => allowed.has(key)));
        let data;
        if (method === 'GET' && /openid-configuration|jwks\.json/.test(url)) {
          const value = await res.json();
          data = url.includes('jwks')
            ? {
                keys: value.keys?.map((key) => ({
                  kid: key.kid,
                  alg: key.alg,
                  kty: key.kty,
                  containsPrivateMaterial: ['d', 'p', 'q', 'k'].some((field) => field in key),
                })),
              }
            : value;
        } else {
          await res.body?.cancel();
        }
        results.push({ url, method, status: res.status, headers, data });
      } catch (error) {
        results.push({ url, method, error: String(error) });
      }
    }
    writeFileSync(
      resolve(output, 'public-endpoints.json'),
      JSON.stringify({ at: new Date().toISOString(), results }, null, 2),
    );
    console.info(JSON.stringify(results.map(({ url, status, error }) => ({ url, status, error }))));
    break;
  }
  default: throw new Error('Choose units, probes, regressions, checks, browser, or public');
}
