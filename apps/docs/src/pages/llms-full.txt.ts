import type { APIRoute } from 'astro';
import { INTRO, SITE_URL, orderedDocs, pagePath, renderPage } from '../lib/llms';

/** /llms-full.txt — every docs page as one Markdown document. */
export const GET: APIRoute = async () => {
  const docs = await orderedDocs();
  let out = INTRO + '\n---\n\n';
  for (const d of docs) {
    out += `<!-- ${SITE_URL}${pagePath(d)} -->\n\n`;
    out += renderPage(d) + '\n---\n\n';
  }
  return new Response(out, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
};
