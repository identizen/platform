import type { APIRoute, GetStaticPaths } from 'astro';
import { BRAND_ASSETS } from '../../lib/brand';

/** Serves every brand SVG at /brand/<file> straight from the design system package. */
export const getStaticPaths: GetStaticPaths = () =>
  BRAND_ASSETS.map((asset) => ({ params: { file: asset.file }, props: { svg: asset.svg } }));

export const GET: APIRoute = ({ props }) =>
  new Response((props as { svg: string }).svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=86400',
    },
  });
