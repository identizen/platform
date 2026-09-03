import { Hono } from 'hono';
import type { AppEnv } from '../app';

const DOCS_URL = 'https://docs.identizen.com';
const SITE_URL = 'https://identizen.com';
const SOURCE_URL = 'https://github.com/identizen/platform';
const PROTOCOL = 'identizen/v1';

interface Endpoint {
  path: string;
  what: string;
}

const ENDPOINTS: Endpoint[] = [
  { path: '/.well-known/openid-configuration', what: 'OpenID Connect discovery document' },
  { path: '/.well-known/jwks.json', what: 'Public keys that sign id_tokens' },
  { path: '/.well-known/identizen', what: 'Pinned index key and app URL' },
  {
    path: '/.well-known/webfinger?resource=acct:handle@host',
    what: 'Resolve a handle to an identity',
  },
  { path: '/health', what: 'Service and database status' },
];

/** Path (without query) -> description, for the JSON descriptor. */
const ENDPOINT_MAP: Record<string, string> = {};
for (const e of ENDPOINTS) ENDPOINT_MAP[e.path.split('?')[0] ?? e.path] = e.what;

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const MARK =
  '<svg viewBox="0 0 100 100" width="28" height="28" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M22 15 H72"/><path d="M10 31 H90"/><path d="M25 47 H66"/>' +
  '<path d="M47 12 C46 32 44 54 9 74"/><rect x="35" y="61" width="42" height="31" rx="5.5"/></svg>';

/* Token values mirror packages/ui/src/tokens.css so this page matches the other surfaces. */
const CSS = `
:root{color-scheme:light dark;--surface-0:oklch(.995 .002 250);--surface-1:oklch(.975 .003 250);--fg:oklch(.2 .02 260);--fg-muted:oklch(.48 .02 260);--border:oklch(.89 .006 250);--accent:oklch(.55 .19 30);--accent-soft:oklch(.95 .035 30)}
@media(prefers-color-scheme:dark){:root{--surface-0:oklch(.17 .012 260);--surface-1:oklch(.2 .013 260);--fg:oklch(.96 .005 250);--fg-muted:oklch(.72 .015 260);--border:oklch(.28 .014 260);--accent:oklch(.7 .17 30);--accent-soft:oklch(.28 .07 30)}}
*{box-sizing:border-box}
body{margin:0;background:var(--surface-0);color:var(--fg);font:16px/1.55 'Inter Variable',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:42rem;margin:0 auto;padding:4rem 1.25rem 5rem}
header{display:flex;align-items:center;gap:.6rem;color:var(--accent);font-weight:600;letter-spacing:-.01em}
h1{font-size:1.75rem;line-height:1.2;letter-spacing:-.02em;margin:2rem 0 .75rem}
p{margin:0 0 1rem;color:var(--fg-muted)}
h2{font-size:.8125rem;text-transform:uppercase;letter-spacing:.06em;color:var(--fg-muted);margin:2.5rem 0 .75rem}
ul{list-style:none;margin:0;padding:0;border:1px solid var(--border);border-radius:.75rem;background:var(--surface-1)}
li{display:flex;flex-wrap:wrap;gap:.25rem 1rem;justify-content:space-between;padding:.75rem 1rem;border-top:1px solid var(--border)}
li:first-child{border-top:0}
a{color:var(--accent);text-decoration:none}
a:hover,a:focus-visible{text-decoration:underline}
code{font:.875rem ui-monospace,'JetBrains Mono','SF Mono',Menlo,Consolas,monospace;word-break:break-all}
small{color:var(--fg-muted)}
footer{margin-top:3rem;padding-top:1.25rem;border-top:1px solid var(--border);font-size:.875rem;color:var(--fg-muted)}
.tag{display:inline-block;background:var(--accent-soft);color:var(--accent);border-radius:999px;padding:.1rem .6rem;font-size:.75rem;font-weight:600}
`;

function page(indexUrl: string, appUrl: string): string {
  const host = escapeHtml(new URL(indexUrl).host);
  const endpoints = ENDPOINTS.map(
    (e) =>
      `<li><a href="${escapeHtml(e.path)}"><code>${escapeHtml(e.path)}</code></a><small>${escapeHtml(e.what)}</small></li>`,
  ).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Identizen index · ${host}</title>
<style>${CSS}</style>
</head>
<body>
<main>
<header>${MARK}<span>Identizen index</span></header>
<h1>This is an Identizen index.</h1>
<p><strong>${host}</strong> holds the public keys of identities that live on people's phones and issues OpenID Connect tokens for them. There is nothing to sign in to here: apps reach it through the Identizen SDK and phones reach it through the Identizen app.</p>
<p><span class="tag">Public API</span> &nbsp;No passwords, seeds, or private keys are stored on this host.</p>
<h2>Looking for something else?</h2>
<ul>
<li><a href="${escapeHtml(appUrl)}">Dashboard</a><small>Register a site, manage devices and sessions</small></li>
<li><a href="${DOCS_URL}">Documentation</a><small>Quickstart, SDKs, and the protocol spec</small></li>
<li><a href="${SITE_URL}">identizen.com</a><small>What Identizen is and how it works</small></li>
<li><a href="${SOURCE_URL}">Source</a><small>Open source under Apache-2.0</small></li>
</ul>
<h2>Discovery endpoints</h2>
<ul>${endpoints}</ul>
<footer>Issuer <code>${escapeHtml(indexUrl)}</code> · Protocol <code>${PROTOCOL}</code></footer>
</main>
</body>
</html>
`;
}

export function rootRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  /** Landing page for humans; a JSON service descriptor for everything else. */
  r.get('/', (c) => {
    const { indexUrl, appUrl } = c.get('services');
    const accept = c.req.header('accept') ?? '';
    c.header('Cache-Control', 'public, max-age=300');
    if (!accept.includes('text/html')) {
      return c.json({
        service: 'identizen-index',
        issuer: indexUrl,
        protocol: PROTOCOL,
        app: appUrl,
        docs: DOCS_URL,
        source: SOURCE_URL,
        endpoints: ENDPOINT_MAP,
      });
    }
    return c.html(page(indexUrl, appUrl));
  });

  return r;
}
