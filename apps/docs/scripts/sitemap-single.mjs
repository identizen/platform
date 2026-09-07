// One sitemap. @astrojs/sitemap writes an index plus numbered parts; this site has one part and
// wants a single /sitemap.xml that robots.txt, the page <link>, and search consoles all name.
// Fails loudly if the site ever grows past one part (50,000 URLs), which is when an index is due.
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const parts = readdirSync(dist).filter((f) => /^sitemap-\d+\.xml$/.test(f));
if (parts.length !== 1) {
  console.error(`sitemap-single: expected one sitemap part in dist, found ${parts.length}`);
  process.exit(1);
}
writeFileSync(join(dist, 'sitemap.xml'), readFileSync(join(dist, parts[0])));
rmSync(join(dist, parts[0]));
if (existsSync(join(dist, 'sitemap-index.xml'))) rmSync(join(dist, 'sitemap-index.xml'));

// Any page that still links the index (themes inject it) points at the single file instead.
let rewritten = 0;
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (entry.endsWith('.html')) {
      const html = readFileSync(p, 'utf8');
      if (html.includes('/sitemap-index.xml')) {
        writeFileSync(p, html.split('/sitemap-index.xml').join('/sitemap.xml'));
        rewritten++;
      }
    }
  }
};
walk(dist);
console.info(
  `sitemap-single: wrote dist/sitemap.xml, removed ${parts[0]} and the index, rewrote ${rewritten} page(s)`,
);
