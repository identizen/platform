// Write an iOS over-the-air install manifest for the latest finished preview build, so a phone
// can install it from Safari without going through Expo's dashboard:
//   itms-services://?action=download-manifest&url=https://app.identizen.com/install/identizen.plist
// Run from apps/mobile after a build: `node scripts/install-manifest.mjs`, then deploy the web app.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const out = new URL('../../web/public/install/', import.meta.url);
const raw = execFileSync(
  'npx',
  [
    'eas',
    'build:list',
    '--platform',
    'ios',
    '--status',
    'finished',
    '--limit',
    '1',
    '--json',
    '--non-interactive',
  ],
  { encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'inherit'] },
);
const [build] = JSON.parse(raw);
if (!build?.artifacts?.buildUrl) throw new Error('no finished iOS build with an artifact');

const esc = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;');
const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>items</key>
  <array>
    <dict>
      <key>assets</key>
      <array>
        <dict>
          <key>kind</key><string>software-package</string>
          <key>url</key><string>${esc(build.artifacts.buildUrl)}</string>
        </dict>
      </array>
      <key>metadata</key>
      <dict>
        <key>bundle-identifier</key><string>${esc(build.appIdentifier)}</string>
        <key>bundle-version</key><string>${esc(build.appVersion)}</string>
        <key>kind</key><string>software</string>
        <key>title</key><string>Identizen</string>
      </dict>
    </dict>
  </array>
</dict>
</plist>
`;

const link =
  'itms-services://?action=download-manifest&url=https://app.identizen.com/install/identizen.plist';
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Install Identizen</title>
<style>
:root{color-scheme:light dark;--bg:oklch(.995 .002 250);--fg:oklch(.2 .02 260);--muted:oklch(.48 .02 260);--accent:oklch(.55 .19 30)}
@media(prefers-color-scheme:dark){:root{--bg:oklch(.17 .012 260);--fg:oklch(.96 .005 250);--muted:oklch(.72 .015 260);--accent:oklch(.7 .17 30)}}
body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.5 ui-sans-serif,system-ui,-apple-system,sans-serif}
main{max-width:28rem;margin:0 auto;padding:4rem 1.5rem}
h1{font-size:1.5rem;letter-spacing:-.02em}
p{color:var(--muted)}
a.btn{display:block;text-align:center;background:var(--accent);color:#fff;text-decoration:none;font-weight:600;padding:1rem;border-radius:.75rem;margin:2rem 0 1rem}
code{font:.9em ui-monospace,Menlo,monospace}
</style>
</head>
<body>
<main>
<h1>Install Identizen</h1>
<p>Internal build ${esc(build.appVersion)} (${esc(build.appBuildVersion)}), iOS, for registered test devices only. Open this page in Safari.</p>
<a class="btn" href="${link}">Install Identizen</a>
<p>iOS asks to confirm, then the icon appears on your home screen. If nothing happens, delete the existing Identizen app and try again. Built from <code>${esc(String(build.gitCommitHash).slice(0, 7))}</code>.</p>
</main>
</body>
</html>
`;

mkdirSync(out, { recursive: true });
writeFileSync(new URL('identizen.plist', out), plist);
writeFileSync(new URL('index.html', out), html);
console.info(
  `install manifest -> build ${build.id.slice(0, 8)} v${build.appVersion} (${build.appBuildVersion})`,
);
console.info(
  'deploy: npx turbo run build --filter=@identizen/web && npm run deploy -w @identizen/web',
);
console.info('link:   https://app.identizen.com/install');
