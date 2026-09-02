import type { APIRoute } from 'astro';
import { INTRO, SITE_URL, cleanMarkdown, markdownPath, orderedDocs } from '../lib/llms';

/**
 * /llms.txt — the llmstxt.org index: what Identizen is, the complete React + TypeScript
 * integration inline, and a link to every page as Markdown.
 */
export const GET: APIRoute = async () => {
  const docs = await orderedDocs();
  const react = docs.find((d) => d.id === 'guides/react');

  let out = INTRO + '\n';
  if (react) {
    out += `## Add Identizen to a React + TypeScript app\n\n`;
    out += `The complete guide, inlined so no further fetch is needed. Also at ${SITE_URL}/guides/react.md\n\n`;
    out += cleanMarkdown(react.body ?? '').replace(/^## /gm, '### ') + '\n';
  }

  const section = (title: string, ids: string[]) => {
    const rows = docs.filter((d) => ids.includes(d.id));
    if (rows.length === 0) return;
    out += `## ${title}\n\n`;
    for (const d of rows)
      out += `- [${d.data.title}](${SITE_URL}${markdownPath(d)}): ${d.data.description ?? ''}\n`;
    out += '\n';
  };
  section('Start here', ['quickstart', 'add-mfa', 'guides/react']);
  section('Framework guides', [
    'guides/nextjs',
    'guides/express',
    'guides/aspnet-core',
    'guides/django',
    'guides/plain-html',
  ]);
  section('Reference', [
    'reference/sdk',
    'reference/oidc',
    'reference/verification-api',
    'reference/index-api',
    'errors',
  ]);
  section('Optional', ['self-hosting', 'enterprise', 'protocol', 'ai-assistants']);
  out += `Everything in one file: ${SITE_URL}/llms-full.txt\n`;

  return new Response(out, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
};
