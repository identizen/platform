// Write an iOS over-the-air install manifest for the latest finished preview build, so a phone
// can install it from Safari without going through Expo's dashboard:
//   itms-services://?action=download-manifest&url=https://app.identizen.com/install.plist
// Run from apps/mobile after a build: `node scripts/install-manifest.mjs`, then deploy the web app.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const out = new URL('../../web/public/', import.meta.url);
const raw = execFileSync(
  'npx',
  [
    'eas',
    'build:list',
    '--platform',
    'ios',
    '--status',
    'finished',
    '--build-profile',
    'preview',
    '--limit',
    '1',
    '--json',
    '--non-interactive',
  ],
  { encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'inherit'] },
);
const [build] = JSON.parse(raw);
if (!build?.artifacts?.buildUrl) throw new Error('no finished iOS build with an artifact');

// Android: the preview profile builds an APK, which installs straight from the phone's browser.
const rawAndroid = execFileSync(
  'npx',
  [
    'eas',
    'build:list',
    '--platform',
    'android',
    '--status',
    'finished',
    '--build-profile',
    'preview',
    '--limit',
    '1',
    '--json',
    '--non-interactive',
  ],
  { encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'inherit'] },
);
const [android] = JSON.parse(rawAndroid || '[]');
const apkUrl = android?.artifacts?.buildUrl ?? null;

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
  'itms-services://?action=download-manifest&url=https://app.identizen.com/install.plist';
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
h2{font-size:1.15rem;margin-top:2.5rem;letter-spacing:-.01em}
p{color:var(--muted)}
a.btn{display:block;text-align:center;background:var(--accent);color:#fff;text-decoration:none;font-weight:600;padding:1rem;border-radius:.75rem;margin:2rem 0 1rem}
code{font:.9em ui-monospace,Menlo,monospace}
dl{display:grid;grid-template-columns:auto 1fr;gap:.25rem 1rem;margin:1.5rem 0;font-size:.9375rem}
dt{color:var(--muted)}dd{margin:0}
ol{padding-left:1.25rem;color:var(--muted)}
#steps{display:none}#steps.on{display:block}
#steps li{margin:.5rem 0}#steps li.done{color:var(--fg)}
.hidden{display:none}
</style>
</head>
<body>
<main>
<h1>Install Identizen</h1>
<p>Internal iOS build for registered test devices. Open this page in Safari.</p>
<dl>
  <dt>Version</dt><dd>${esc(build.appVersion)} (${esc(build.appBuildVersion)})</dd>
  <dt>Built</dt><dd><time datetime="${esc(build.completedAt)}">${esc(new Date(build.completedAt).toUTCString())}</time></dd>
  <dt>Commit</dt><dd><code>${esc(String(build.gitCommitHash).slice(0, 7))}</code></dd>
</dl>
<a class="btn" id="install" href="${link}">Install Identizen ${esc(build.appVersion)} (${esc(build.appBuildVersion)})</a>
<ol id="steps" aria-live="polite">
  <li id="s1">Waiting for iOS to ask "app.identizen.com would like to install Identizen". Tap <strong>Install</strong>.</li>
  <li id="s2">Go to the home screen: the Identizen icon is dimmed while it downloads, then fills in. That is the install completing; Safari cannot see it.</li>
  <li id="s3">Open Identizen and check Settings: the last line should read <code>${esc(build.appVersion)} (${esc(build.appBuildVersion)})</code>.</li>
</ol>
${
  apkUrl
    ? `<h2>Android</h2>
<dl>
  <dt>Version</dt><dd>${esc(android.appVersion)} (${esc(android.appBuildVersion)})</dd>
  <dt>Built</dt><dd><time datetime="${esc(android.completedAt)}">${esc(new Date(android.completedAt).toUTCString())}</time></dd>
  <dt>Commit</dt><dd><code>${esc(String(android.gitCommitHash).slice(0, 7))}</code></dd>
</dl>
<a class="btn" href="${esc(apkUrl)}">Download the Android APK</a>
<p>Open this page in Chrome on the phone, download, then open the file and allow installs from Chrome when asked. Android shows its own progress for the download and the install.</p>`
    : ''
}
<p id="nothing" class="hidden">Nothing happened? iOS ignores an install when the same version and build are already on the phone, and when this device is not in the provisioning profile. Delete the existing Identizen app and tap again.</p>
<script>
(function(){
  var a=document.getElementById('install'),steps=document.getElementById('steps'),nothing=document.getElementById('nothing');
  a.addEventListener('click',function(){
    a.textContent='Install started… look for the iOS prompt';a.style.opacity='.7';steps.classList.add('on');
    setTimeout(function(){document.getElementById('s1').classList.add('done');},1500);
    setTimeout(function(){nothing.classList.remove('hidden');},12000);
  });
})();
</script>
</main>
</body>
</html>
`;

mkdirSync(out, { recursive: true });
writeFileSync(new URL('install.plist', out), plist);
writeFileSync(new URL('install.html', out), html);
console.info(
  `install manifest -> iOS ${build.id.slice(0, 8)} v${build.appVersion} (${build.appBuildVersion})${apkUrl ? `, Android ${android.id.slice(0, 8)} (${android.appBuildVersion})` : ', no Android build yet'}`,
);
console.info(
  'deploy: npx turbo run build --filter=@identizen/web && npm run deploy -w @identizen/web',
);
console.info('link:   https://app.identizen.com/install');
