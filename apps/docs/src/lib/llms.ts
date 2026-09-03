import { getCollection, type CollectionEntry } from 'astro:content';

export const SITE_URL = 'https://docs.identizen.com';

/** Sidebar order; anything not listed follows alphabetically. */
const ORDER = [
  'index',
  'quickstart',
  'guides/react',
  'add-mfa',
  'guides/nextjs',
  'guides/express',
  'guides/aspnet-core',
  'guides/django',
  'guides/plain-html',
  'reference/sdk',
  'reference/oidc',
  'reference/verification-api',
  'reference/index-api',
  'errors',
  'self-hosting',
  'examples',
  'enterprise',
  'protocol',
  'ai-assistants',
];

export type DocEntry = CollectionEntry<'docs'>;

export async function orderedDocs(): Promise<DocEntry[]> {
  const docs = await getCollection('docs');
  const rank = (id: string) => {
    const i = ORDER.indexOf(id);
    return i === -1 ? ORDER.length : i;
  };
  return docs
    .filter((d) => d.body && d.body.trim().length > 0)
    .sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));
}

/** Path of a page's HTML version, with a trailing slash. */
export function pagePath(entry: DocEntry): string {
  return entry.id === 'index' ? '/' : `/${entry.id}/`;
}

/** Path of a page's Markdown version. */
export function markdownPath(entry: DocEntry): string {
  return entry.id === 'index' ? '/index.md' : `/${entry.id}.md`;
}

/**
 * Turn an MDX/Markdown body into plain Markdown a model can read: drop component imports and
 * JSX comments, flatten Starlight's Steps/Tabs/Aside components, and remove fence flags that
 * only the docs build uses.
 */
export function cleanMarkdown(body: string): string {
  return (
    body
      .replace(/^import .*$/gm, '')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/<\/?Steps>/g, '')
      .replace(/<\/?Tabs>/g, '')
      .replace(/<TabItem label="([^"]*)">/g, '**$1**\n')
      .replace(/<\/TabItem>/g, '')
      .replace(/<Aside[^>]*title="([^"]*)"[^>]*>/g, '> **$1**\n>')
      .replace(/<Aside[^>]*>/g, '> **Note**\n>')
      .replace(/<\/Aside>/g, '')
      .replace(/ fragment="true"| check="false"/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n'
  );
}

/** One page as Markdown with its title and description on top. */
export function renderPage(entry: DocEntry): string {
  const head = `# ${entry.data.title}\n\n> ${entry.data.description ?? ''}\n\n`;
  return head + cleanMarkdown(entry.body ?? '');
}

export const INTRO = `# Identizen

> Identizen is open-source, device-based login. The user's phone holds the key, your site is a standard OpenID Connect relying party with PKCE, and the hosted index at https://index.identizen.com is the OpenID Provider. One tap plus Face ID. No password, no email, no Google or Microsoft account, and nothing on the index worth stealing. Apache-2.0.

Facts that shape every integration:

- The id_token is signed ES256 and carries exactly: iss, sub (stable per site), aud, iat, exp, nonce, sid, amr, acr (idz:login or idz:mfa), at_hash, idz_device, optional idz_handle and idz_org. There is never an email.
- Endpoints: GET /authorize, POST /token, GET /userinfo, GET /.well-known/openid-configuration, GET /.well-known/jwks.json. Only response_type=code with code_challenge_method=S256. No refresh tokens.
- Packages: @identizen/react (in-page button and hooks), @identizen/sdk (browser client and helpers), @identizen/sdk/server (code exchange, token and webhook verification, Verification API), identizen CLI (register-site, init for Next.js and Express, dev fake phone).
- The phone must approve every login; prompt=none always returns interaction_required. On the first login a browser is paired, so later logins push straight to the phone.
- Step-up for a known user: acr_values=idz:mfa with login_hint=<sub>. Enrollment for an existing account: prompt=enroll. Server-driven approval: POST /v1/verify { sub, reason }.
`;
