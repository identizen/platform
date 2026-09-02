// Minimal static server for the built site (e2e + Lighthouse). Serves dist/ with clean URLs.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.argv[2] ?? 4321);
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.webmanifest': 'application/manifest+json',
};

function resolve(pathname) {
  const clean = normalize(decodeURIComponent(pathname.split('?')[0])).replace(/^([\\/])+/, '');
  const candidates = [
    join(root, clean),
    join(root, clean, 'index.html'),
    join(root, `${clean}.html`),
  ];
  for (const c of candidates) {
    if (c.startsWith(root) && existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

createServer((req, res) => {
  const file = resolve(req.url ?? '/');
  if (!file) {
    const notFound = join(root, '404.html');
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    if (existsSync(notFound)) createReadStream(notFound).pipe(res);
    else res.end('Not found');
    return;
  }
  res.writeHead(200, {
    'content-type': types[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-cache',
  });
  createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.info(`serving dist on http://localhost:${port}`));
