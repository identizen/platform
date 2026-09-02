#!/usr/bin/env node
import { dev } from './commands/dev.js';
import { init } from './commands/init.js';
import { registerSiteCommand } from './commands/register-site.js';
import { boolFlag, flag, parseArgs } from './lib/args.js';

const HELP = `identizen — login with your phone

Usage:
  identizen init [--index <url>] [--name <site name>] [--site-url <url>] [--framework next|express] [--force]
      Register this site with an index, write .env(.local), scaffold /api/auth routes.
  identizen dev [--index <url>] [--port 4400] [--policy approve|deny|manual|ignore] [--local]
      Run a fake phone that approves sign-ins so you can develop without a device.
  identizen register-site --name <n> --rp-id <host> --redirect-uri <uri> [--redirect-uri <uri>…]
      [--index <url>] [--backchannel-logout-uri <uri>] [--webhook-url <uri>] [--public] [--live]

Flags:
  --index          Index URL (default: IDENTIZEN_INDEX_URL, else http://localhost:8787)
  --token          Registration token for indexes with closed site registration
  -h, --help       Show this help
`;

export async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (!args.command || args.command === 'help' || args.flags.help || args.flags.h) {
    console.info(HELP);
    return 0;
  }
  const indexUrl =
    flag(args.flags, 'index', process.env.IDENTIZEN_INDEX_URL ?? 'http://localhost:8787') ??
    'http://localhost:8787';
  const cwd = flag(args.flags, 'dir', process.cwd()) ?? process.cwd();
  try {
    switch (args.command) {
      case 'init': {
        await init({
          dir: cwd,
          indexUrl,
          name: flag(args.flags, 'name'),
          siteUrl: flag(args.flags, 'site-url'),
          framework: flag(args.flags, 'framework') as 'next' | 'express' | undefined,
          force: boolFlag(args.flags, 'force'),
          registrationToken: flag(args.flags, 'token') ?? null,
        });
        return 0;
      }
      case 'dev': {
        const handle = await dev({
          dir: cwd,
          indexUrl: flag(args.flags, 'index'),
          port: Number(flag(args.flags, 'port', '4400')),
          policy: flag(args.flags, 'policy') as
            'approve' | 'deny' | 'manual' | 'ignore' | undefined,
          local: boolFlag(args.flags, 'local'),
        });
        const stop = () => {
          handle.close();
          process.exit(0);
        };
        process.on('SIGINT', stop);
        process.on('SIGTERM', stop);
        return await new Promise<number>(() => undefined);
      }
      case 'register-site': {
        const redirectUris = args.positionals.length ? args.positionals : [];
        const single = flag(args.flags, 'redirect-uri');
        if (single) redirectUris.push(single);
        const name = flag(args.flags, 'name');
        const rpId = flag(args.flags, 'rp-id');
        if (!name || !rpId || redirectUris.length === 0) {
          console.error('register-site needs --name, --rp-id, and at least one --redirect-uri');
          return 2;
        }
        const site = await registerSiteCommand({
          indexUrl,
          name,
          rpId,
          redirectUris,
          backchannelLogoutUri: flag(args.flags, 'backchannel-logout-uri') ?? null,
          webhookUrl: flag(args.flags, 'webhook-url') ?? null,
          environment: boolFlag(args.flags, 'live') ? 'live' : 'test',
          public: boolFlag(args.flags, 'public'),
          registrationToken: flag(args.flags, 'token') ?? null,
        });
        console.info(JSON.stringify(site, null, 2));
        return 0;
      }
      default:
        console.error(`Unknown command: ${args.command}\n`);
        console.info(HELP);
        return 2;
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

const invokedDirectly = process.argv[1] && /cli\.(js|ts)$/.test(process.argv[1]);
if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    (code) => {
      if (code !== 0) process.exit(code);
    },
    (err: unknown) => {
      console.error(err);
      process.exit(1);
    },
  );
}
