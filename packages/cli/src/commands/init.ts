import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { detectProject, type Framework } from '../lib/detect';
import { upsertEnv } from '../lib/env';
import { registerSite, type RegisteredSite } from '../lib/index-client';
import { expressTemplate } from '../templates/express';
import { nextTemplate, type TemplateFile } from '../templates/next';

export interface InitOptions {
  dir: string;
  indexUrl: string;
  /** Site display name (defaults to the package name). */
  name?: string | undefined;
  /** Public origin of the site during development. */
  siteUrl?: string | undefined;
  framework?: Framework | 'auto' | undefined;
  force?: boolean | undefined;
  registrationToken?: string | null | undefined;
  environment?: 'live' | 'test' | undefined;
  fetchImpl?: typeof fetch | undefined;
  log?: ((line: string) => void) | undefined;
}

export interface InitResult {
  framework: Framework;
  site: RegisteredSite;
  envFile: string;
  written: string[];
  skipped: string[];
  addedDependencies: string[];
}

/**
 * `identizen init`: register the site with the index, write env vars, scaffold the auth routes,
 * and add the SDK dependencies. Idempotent: existing files are left alone unless `force`.
 */
export async function init(opts: InitOptions): Promise<InitResult> {
  const log = opts.log ?? ((l: string) => console.info(l));
  const project = detectProject(opts.dir);
  const framework: Framework =
    opts.framework && opts.framework !== 'auto' ? opts.framework : project.framework;
  if (framework === 'unknown') {
    throw new Error(
      'Could not detect Next.js or Express in package.json. Pass --framework next|express.',
    );
  }
  const siteUrl = (opts.siteUrl ?? 'http://localhost:3000').replace(/\/+$/, '');
  const name =
    opts.name ??
    (typeof project.packageJson?.name === 'string' ? project.packageJson.name : 'My App');

  log(`Registering "${name}" with ${opts.indexUrl}…`);
  const site = await registerSite({
    indexUrl: opts.indexUrl,
    name,
    rpId: new URL(siteUrl).hostname,
    redirectUris: [`${siteUrl}/api/auth/callback`],
    backchannelLogoutUri: `${siteUrl}/api/auth/backchannel-logout`,
    environment: opts.environment ?? (siteUrl.includes('localhost') ? 'test' : 'live'),
    registrationToken: opts.registrationToken ?? null,
    ...(opts.fetchImpl && { fetchImpl: opts.fetchImpl }),
  });
  log(`  client_id ${site.client_id}`);

  const envFile = join(opts.dir, framework === 'next' ? '.env.local' : '.env');
  upsertEnv(envFile, {
    IDENTIZEN_INDEX_URL: opts.indexUrl,
    IDENTIZEN_CLIENT_ID: site.client_id,
    IDENTIZEN_CLIENT_SECRET: site.client_secret ?? '',
    IDENTIZEN_SITE_URL: siteUrl,
  });
  log(`  wrote ${envFile}`);

  const files: TemplateFile[] =
    framework === 'next'
      ? nextTemplate({
          appDir: project.appDir ?? 'app',
          libDir: project.usesSrc ? 'src/lib' : 'lib',
        })
      : expressTemplate({ typescript: project.typescript });
  const written: string[] = [];
  const skipped: string[] = [];
  for (const f of files) {
    const target = join(opts.dir, f.path);
    if (existsSync(target) && !opts.force) {
      skipped.push(f.path);
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, f.content);
    written.push(f.path);
  }
  for (const p of written) log(`  + ${p}`);
  for (const p of skipped) log(`  = ${p} (exists, kept)`);

  const addedDependencies = addDependencies(
    opts.dir,
    framework === 'next' ? ['@identizen/sdk', '@identizen/react', 'jose'] : ['@identizen/sdk'],
  );
  if (addedDependencies.length)
    log(`  added ${addedDependencies.join(', ')} to package.json — run npm install`);

  log('');
  log('Next: npm install, then start your app and open /api/auth/login.');
  log('No phone yet? `npx identizen dev` runs a fake phone that approves logins.');
  return { framework, site, envFile, written, skipped, addedDependencies };
}

function addDependencies(dir: string, names: string[]): string[] {
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) return [];
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  pkg.dependencies ??= {};
  const added: string[] = [];
  for (const n of names) {
    if (pkg.dependencies[n] || pkg.devDependencies?.[n]) continue;
    pkg.dependencies[n] = n === 'jose' ? '^6.0.0' : '^0.1.0';
    added.push(n);
  }
  if (added.length) writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  return added;
}
