// Rasterise the social card and the icons from the brand SVGs. Social crawlers (X, LinkedIn,
// Slack, iMessage) do not render SVG, so og.png is what they fetch. The card is rendered in
// Chromium with the site's fonts so it matches the pages; the icons go through sharp.
//
//   node scripts/gen-images.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const pub = fileURLToPath(new URL('../public/', import.meta.url));
const font = (pkg, file) =>
  `file:///${require.resolve(`${pkg}/files/${file}`).replace(/\\/g, '/')}`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Inter;src:url(${font('@fontsource-variable/inter', 'inter-latin-wght-normal.woff2')});font-weight:100 900}
@font-face{font-family:"Bricolage Grotesque";src:url(${font('@fontsource-variable/bricolage-grotesque', 'bricolage-grotesque-latin-wght-normal.woff2')});font-weight:100 900}
@font-face{font-family:ui-monospace;src:local("Cascadia Mono"),local("Consolas"),local("Menlo"),local("DejaVu Sans Mono")}
*{margin:0}html,body{width:1200px;height:630px;overflow:hidden}svg{display:block}
</style></head><body>${readFileSync(`${pub}og.svg`, 'utf8')}</body></html>`;
const tmp = `${pub}og.render.html`;
writeFileSync(tmp, html);
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
await page.goto(`file:///${tmp.replace(/\\/g, '/')}`);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: `${pub}og.png`, type: 'png' });
await browser.close();
const { unlinkSync } = await import('node:fs');
unlinkSync(tmp);
console.info('public/og.png 1200x630');

await sharp(readFileSync(`${pub}favicon.svg`), { density: 288 })
  .resize(180, 180)
  .png()
  .toFile(`${pub}apple-touch-icon.png`);
console.info('public/apple-touch-icon.png 180x180');

for (const size of [192, 512]) {
  await sharp(readFileSync(`${pub}favicon.svg`), { density: 288 })
    .resize(size, size)
    .png()
    .toFile(`${pub}icon-${size}.png`);
  console.info(`public/icon-${size}.png`);
}
