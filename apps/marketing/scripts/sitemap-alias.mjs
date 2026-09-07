// @astrojs/sitemap writes sitemap-index.xml + sitemap-0.xml. Search consoles and people try
// /sitemap.xml first, so publish the index under that name as well.
import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const index = `${dist}sitemap-index.xml`;
if (!existsSync(index)) {
  console.error('sitemap-alias: dist/sitemap-index.xml not found; did astro build run?');
  process.exit(1);
}
copyFileSync(index, `${dist}sitemap.xml`);
console.info('sitemap-alias: wrote dist/sitemap.xml');
