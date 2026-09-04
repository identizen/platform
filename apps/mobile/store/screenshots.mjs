/**
 * App Store and Play Store screenshots, composed from the app's real screens (same tokens, brand
 * and copy) and rendered with Playwright at each store's required sizes. No simulator needed.
 * Android also gets the Play feature graphic (1024×500) and the 512 px listing icon.
 *
 *   node store/screenshots.mjs        # writes store/screenshots/<size>/<n>-<name>.png
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';
import {
  Bluetooth,
  ChevronLeft,
  Globe,
  House,
  KeyRound,
  QrCode,
  Settings2,
  Smartphone,
} from 'lucide-react';

const require = createRequire(import.meta.url);
const { light: T } = require('../src/theme/tokens.js');
const here = fileURLToPath(new URL('.', import.meta.url));
const brand = (f) =>
  readFileSync(new URL(`../../../packages/ui/brand/${f}`, import.meta.url), 'utf8');
const font = (pkg, file) =>
  `file:///${require.resolve(`${pkg}/files/${file}`).replace(/\\/g, '/')}`;

const SIZES = [
  { dir: 'iphone-6.7', w: 1290, h: 2796, platform: 'ios' },
  { dir: 'iphone-6.5', w: 1242, h: 2688, platform: 'ios' },
  // Play accepts 320–3840 px with the long side at most twice the short side; 1:2 fits the design.
  { dir: 'android-phone', w: 1080, h: 2160, platform: 'android' },
];

/** Apple's names on iOS; the generic term on Android (mirrors src/biometrics biometricName). */
const localize = (html, platform) =>
  platform === 'android' ? html.replaceAll('Face ID', 'your fingerprint') : html;

const icon = (Cmp, size, color) =>
  renderToStaticMarkup(createElement(Cmp, { size, color, strokeWidth: 2 }));
const mark = (size, color) =>
  brand('kimi-mark.svg')
    .replace(/width="100" height="100"/, `width="${size}" height="${size}"`)
    .replaceAll('currentColor', color);
const wordmark = (h, color) =>
  brand('identizen-wordmark.svg')
    .replace(/width="[\d.]+" height="[\d.]+"/, `height="${h}"`)
    .replaceAll('currentColor', color);
const seal = (size) =>
  brand('kimi-seal.svg').replace(/width="100" height="100"/, `width="${size}" height="${size}"`);

const tabs = (active) => {
  const items = [
    ['Home', House],
    ['Devices', Smartphone],
    ['Browsers', Globe],
    ['Sessions', KeyRound],
    ['Settings', Settings2],
  ];
  return `<nav class="tabs">${items
    .map(
      ([label, Cmp]) =>
        `<div class="tab ${label === active ? 'on' : ''}">${icon(Cmp, 44, label === active ? T.accent : T['fg-muted'])}<span>${label}</span></div>`,
    )
    .join('')}</nav>`;
};

const statusBar = `<div class="status"><span>9:41</span><span class="dots">●●● ᯤ ▮</span></div>`;
const topBar = (title) =>
  `<div class="topbar"><span class="back">${icon(ChevronLeft, 52, T.fg)}</span><span class="title">${title}</span><span></span></div>`;
const badge = (label, tone = 'neutral') => `<span class="badge ${tone}">${label}</span>`;

const SCREENS = [
  {
    name: 'home',
    headline: 'Your phone is the login.',
    sub: 'One tap and Face ID. No password, no code to type.',
    body: `${statusBar}
      <div class="page">
        <div class="row between"><span class="lockup">${mark(44, T.fg)}${wordmark(38, T.fg)}</span>${badge('Registered', 'success')}</div>
        <div class="card">
          <p class="h-md">@george</p>
          <p class="mono muted">idz_01M1HQ9AR0Q1R196G54T9YZ5MY</p>
          <p class="muted">index.identizen.com</p>
          <div class="row between"><span class="row gap muted">${icon(Bluetooth, 28, T['fg-muted'])} Nearby</span>${badge('Visible to nearby computers', 'success')}</div>
        </div>
        <p class="label">Waiting for you</p>
        <div class="card accent"><p class="h-sm">JT Merlin Bank</p><p class="muted">wants to sign you in</p></div>
        <div class="btn primary lg">${icon(QrCode, 44, '#fff')} Scan a sign-in code</div>
        <p class="label">Recent activity</p>
        <div class="list">
          <div class="li"><div><p class="h-sm">JT Merlin Bank</p><p class="tiny muted">Today, 9:12 AM · Wire $12,000.00 to Acme Supply Co.</p></div>${badge('approved', 'success')}</div>
          <div class="li"><div><p class="h-sm">Identizen Dashboard</p><p class="tiny muted">Today, 8:40 AM</p></div>${badge('approved', 'success')}</div>
          <div class="li"><div><p class="h-sm">Example App</p><p class="tiny muted">Yesterday, 6:03 PM</p></div>${badge('denied', 'warning')}</div>
        </div>
      </div>
      ${tabs('Home')}`,
  },
  {
    name: 'approve',
    headline: 'Read it. Then approve it.',
    sub: 'The site, the amount and the match code are on your phone before you say yes.',
    body: `${statusBar}${topBar('Sign-in request')}
      <div class="page center">
        <p class="muted">Approve for</p>
        <p class="h-lg">JT Merlin Bank</p>
        <p class="muted">jtmerlin.com</p>
        <div class="reason">Wire $12,000.00 to Acme Supply Co. (···4471)</div>
        <p class="code">47</p>
        <p class="muted">Make sure your screen shows the same code.</p>
        <div class="grow"></div>
        <div class="btn primary">Approve</div>
        <div class="btn secondary">Deny</div>
      </div>`,
  },
  {
    name: 'onboarding',
    headline: 'Set up in under a minute.',
    sub: 'A key is created on your phone and never leaves it.',
    body: `${statusBar}
      <div class="page center-v">
        <div class="hero-brand">${seal(150)}${wordmark(60, T.fg)}</div>
        <p class="h-xl">Your phone is your identity.</p>
        <p class="body">No password. No email. No Google or Microsoft account. One tap, Face ID, in.</p>
        <p class="muted">Your identity is a key that never leaves this phone. Sites only ever see a per-site identifier.</p>
        <div class="grow"></div>
        <div class="btn primary lg">Create your identity</div>
        <div class="btn secondary">Restore an identity</div>
      </div>`,
  },
  {
    name: 'browsers',
    headline: 'See every browser that can sign you in.',
    sub: 'Paired browsers skip the QR. Unpair any of them in one tap.',
    body: `${statusBar}
      <div class="page">
        <p class="h-xl">Browsers</p>
        <p class="muted">Browsers paired to this phone. Later logins from them push straight here. Unpairing ends that.</p>
        <div class="list">
          <div class="li"><div><p class="h-sm">Chrome 128 on macOS</p><p class="tiny muted">from 203.0.113.9 · last used 2 minutes ago</p></div><span class="row gap">${badge('active', 'success')}<span class="chip">Unpair</span></span></div>
          <div class="li"><div><p class="h-sm">Safari 17 on macOS</p><p class="tiny muted">from 198.51.100.24 · last used yesterday</p></div><span class="row gap">${badge('active', 'success')}<span class="chip">Unpair</span></span></div>
          <div class="li"><div><p class="h-sm">Edge 128 on Windows</p><p class="tiny muted">from 192.0.2.77 · last used 3 days ago</p></div><span class="row gap">${badge('revoked', 'danger')}</span></div>
        </div>
        <p class="muted center-text">Pull down to refresh.</p>
      </div>
      ${tabs('Browsers')}`,
  },
  {
    name: 'settings',
    headline: 'You hold the keys.',
    sub: 'Recovery phrase, Face ID, and nearby sign-in, all under your control.',
    body: `${statusBar}
      <div class="page">
        <p class="h-xl">Settings</p>
        <div class="card"><p class="h-sm">Handle</p><p class="muted">Optional. A site only sees it if you release it.</p><div class="input mono">george</div></div>
        <div class="card row between"><div><p class="h-sm">Require Face ID</p><p class="muted">Every approval asks for biometrics.</p></div><span class="switch on"></span></div>
        <div class="card row between"><div><p class="h-sm">Nearby sign-in over Bluetooth</p><p class="muted">A computer next to you can find this phone. Nothing identifying is broadcast.</p></div><span class="switch on"></span></div>
        <div class="card"><p class="h-sm">Recovery phrase</p><p class="muted">Shown after Face ID. Never share it.</p><div class="btn secondary sm">Show recovery phrase</div></div>
        <p class="tiny muted mono center-text">Identizen 0.1.0 (8) · built 3 Sep 2026, 14:02 · 8bced45</p>
      </div>
      ${tabs('Settings')}`,
  },
];

const css = (W, H) => {
  const s = Math.min(W / 1290, H / 2796); // scale the 6.7" design to fit, centred
  const x = Math.round((W - 1290 * s) / 2);
  return `
  html{background:linear-gradient(180deg,#fbf3ef 0%,${T['surface-1']} 55%,${T['surface-2']} 100%)}
  @font-face{font-family:Inter;src:url(${font('@fontsource-variable/inter', 'inter-latin-wght-normal.woff2')});font-weight:100 900}
  @font-face{font-family:Bricolage;src:url(${font('@fontsource-variable/bricolage-grotesque', 'bricolage-grotesque-latin-wght-normal.woff2')});font-weight:100 900}
  *{box-sizing:border-box;margin:0}
  html,body{width:${W}px;height:${H}px;overflow:hidden}
  body{font-family:Inter,system-ui,sans-serif;background:linear-gradient(180deg,#fbf3ef 0%,${T['surface-1']} 55%,${T['surface-2']} 100%);color:${T.fg};transform:translateX(${x}px) scale(${s});transform-origin:top left;width:1290px;height:2796px}
  .caption{padding:150px 100px 0;text-align:center}
  .caption h1{font-family:Bricolage,Inter,sans-serif;font-size:96px;line-height:1.05;letter-spacing:-.02em;font-weight:600}
  .caption p{margin-top:28px;font-size:40px;line-height:1.35;color:${T['fg-muted']}}
  .frame{position:absolute;left:125px;top:610px;width:1040px;height:2120px;border-radius:120px;background:#0f1115;padding:22px;box-shadow:0 60px 120px rgba(0,0,0,.25)}
  .screen{position:relative;width:100%;height:100%;border-radius:100px;background:${T['surface-0']};overflow:hidden;display:flex;flex-direction:column}
  .status{display:flex;justify-content:space-between;padding:52px 70px 0;font-size:32px;font-weight:600}
  .dots{font-size:26px;letter-spacing:2px}
  .topbar{display:flex;align-items:center;justify-content:space-between;padding:20px 30px 0;height:110px}
  .topbar .title{font-size:34px;font-weight:600}.topbar .back{width:100px}.topbar span:last-child{width:100px}
  .page{flex:1;display:flex;flex-direction:column;gap:30px;padding:36px 50px 60px}
  .page.center{align-items:center;text-align:center;justify-content:center;gap:22px;padding-bottom:70px}
  .page.center-v{justify-content:center;gap:26px;padding-bottom:70px}
  .grow{flex:1}
  .row{display:flex;align-items:center}.between{justify-content:space-between}.gap{gap:12px}
  .lockup{display:flex;align-items:center;gap:16px}
  .card{display:flex;flex-direction:column;gap:14px;border:2px solid ${T.border};background:${T['surface-1']};border-radius:28px;padding:34px}
  .card.row{flex-direction:row;gap:30px}
  .card.accent{border-color:${T.accent}66;background:${T['accent-soft']}}
  .label{font-size:24px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:${T['fg-muted']}}
  .h-xl{font-size:64px;font-weight:600;letter-spacing:-.02em;line-height:1.1}
  .h-lg{font-size:56px;font-weight:600;letter-spacing:-.02em}
  .h-md{font-size:44px;font-weight:600}
  .h-sm{font-size:34px;font-weight:600}
  .body{font-size:34px;line-height:1.45}
  .muted{font-size:28px;line-height:1.4;color:${T['fg-muted']}}
  .tiny{font-size:24px}.mono{font-family:ui-monospace,Menlo,Consolas,monospace}
  .center-text{text-align:center}
  .badge{display:inline-block;border-radius:10px;padding:6px 14px;font-size:22px;font-weight:500;letter-spacing:.04em;text-transform:uppercase;white-space:nowrap}
  .badge.neutral{background:${T['surface-2']};color:${T['fg-muted']}}
  .badge.success{background:${T['success-soft']};color:${T['success-soft-fg']}}
  .badge.warning{background:${T['warning-soft']};color:${T['warning-soft-fg']}}
  .badge.danger{background:${T['danger-soft']};color:${T['danger-soft-fg']}}
  .btn{display:flex;align-items:center;justify-content:center;gap:16px;height:96px;border-radius:20px;font-size:34px;font-weight:600;width:100%}
  .btn.lg{height:112px;border-radius:26px;font-size:38px}
  .btn.sm{height:84px;font-size:30px}
  .btn.primary{background:${T.accent};color:${T['accent-fg']}}
  .btn.secondary{border:2px solid ${T['border-strong']};background:${T['surface-0']};color:${T.fg}}
  .list{display:flex;flex-direction:column}
  .li{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:26px 0;border-bottom:2px solid ${T.border}}
  .chip{border:2px solid ${T['border-strong']};border-radius:12px;padding:8px 18px;font-size:24px;font-weight:500}
  .reason{width:100%;border:2px solid ${T['border-strong']};background:${T['surface-2']};border-radius:20px;padding:30px;font-size:34px;line-height:1.4;text-align:left}
  .code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:170px;font-weight:600;letter-spacing:.2em;padding-left:.2em;line-height:1;margin-top:20px}
  .input{border:2px solid ${T.border};border-radius:16px;padding:22px 26px;font-size:32px;background:${T['surface-0']}}
  .switch{width:104px;height:62px;border-radius:40px;background:${T['surface-4']};position:relative;flex-shrink:0}
  .switch.on{background:${T.accent}}
  .switch::after{content:'';position:absolute;top:6px;left:6px;width:50px;height:50px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.3)}
  .switch.on::after{left:48px}
  .hero-brand{display:flex;flex-direction:column;align-items:flex-start;gap:36px;margin-bottom:10px}
  .tabs{display:flex;justify-content:space-around;padding:22px 20px 44px;border-top:2px solid ${T.border};background:${T['surface-0']}}
  .tab{display:flex;flex-direction:column;align-items:center;gap:8px;font-size:22px;font-weight:500;color:${T['fg-muted']}}
  .tab.on{color:${T.accent}}
  `;
};

const page = (
  screen,
  W,
  H,
) => `<!doctype html><html><head><meta charset="utf-8"><style>${css(W, H)}</style></head>
<body><div class="caption"><h1>${screen.headline}</h1><p>${screen.sub}</p></div>
<div class="frame"><div class="screen">${screen.body}</div></div></body></html>`;

const browser = await chromium.launch();
for (const size of SIZES) {
  const out = `${here}screenshots/${size.dir}`;
  mkdirSync(out, { recursive: true });
  const ctx = await browser.newContext({
    viewport: { width: size.w, height: size.h },
    deviceScaleFactor: 1,
  });
  const tab = await ctx.newPage();
  for (const [i, screen] of SCREENS.entries()) {
    const html = `${out}/${i + 1}-${screen.name}.html`;
    writeFileSync(html, localize(page(screen, size.w, size.h), size.platform));
    await tab.goto(`file:///${html.replace(/\\/g, '/')}`);
    await tab.evaluate(() => document.fonts.ready);
    await tab.screenshot({ path: `${out}/${i + 1}-${screen.name}.png`, fullPage: false });
    console.info(`${size.dir}/${i + 1}-${screen.name}.png`);
  }
  await ctx.close();
}

// Play listing extras: feature graphic and hi-res icon.
{
  const out = `${here}screenshots/android-phone`;
  const html = `${out}/feature-graphic.html`;
  writeFileSync(
    html,
    `<!doctype html><html><head><meta charset="utf-8"><style>${css(1290, 2796)}
  html,body{width:1024px;height:500px;transform:none}
  body{display:flex;align-items:center;justify-content:space-between;padding:0 72px}
  .lockup{display:flex;align-items:center;gap:22px}
  h1{font-family:Bricolage,Inter,sans-serif;font-size:54px;line-height:1.05;letter-spacing:-.02em;font-weight:600;max-width:520px}
  p{margin-top:16px;font-size:24px;line-height:1.35;color:${T['fg-muted']};max-width:520px}
  </style></head><body>
  <div><span class="lockup">${mark(64, T.fg)}${wordmark(52, T.fg)}</span><h1 style="margin-top:36px">Your phone is the login.</h1><p>Passwordless sign-in for the web. Open source.</p></div>
  ${seal(300)}</body></html>`,
  );
  const ctx = await browser.newContext({
    viewport: { width: 1024, height: 500 },
    deviceScaleFactor: 1,
  });
  const tab = await ctx.newPage();
  await tab.goto(`file:///${html.replace(/\\/g, '/')}`);
  await tab.evaluate(() => document.fonts.ready);
  await tab.screenshot({ path: `${out}/feature-graphic.png`, fullPage: false });
  await ctx.close();
  console.info('android-phone/feature-graphic.png');
  await sharp(`${here}../assets/icon.png`).resize(512, 512).png().toFile(`${out}/icon-512.png`);
  console.info('android-phone/icon-512.png');
}
await browser.close();
