import type { APIRoute, GetStaticPaths } from 'astro';
import { orderedDocs, renderPage } from '../lib/llms';

/** /<page>.md — any docs page as plain Markdown. */
export const getStaticPaths: GetStaticPaths = async () => {
  const docs = await orderedDocs();
  return docs.map((entry) => ({ params: { slug: entry.id }, props: { body: renderPage(entry) } }));
};

export const GET: APIRoute = ({ props }) =>
  new Response((props as { body: string }).body, {
    headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
