import { SELF } from 'cloudflare:test';
import { validate } from '@readme/openapi-parser';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import specYaml from '../../../spec/openapi.yaml?raw';
import { createApp } from '../src/app';
import { OPENAPI_DOCUMENT } from '../src/openapi.generated';
import { BASE, json } from './helpers';

interface Spec {
  openapi: string;
  info: { version: string };
  paths: Record<string, Record<string, unknown>>;
}

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

const spec = parse(specYaml) as Spec;

/** `METHOD /path/{param}` for every concrete route on the Hono app (middleware entries skipped). */
function servedRoutes(): Set<string> {
  const out = new Set<string>();
  for (const route of createApp().routes) {
    if (route.method === 'ALL' || route.path.includes('*')) continue;
    out.add(`${route.method.toUpperCase()} ${route.path.replace(/:([A-Za-z_]+)/g, '{$1}')}`);
  }
  return out;
}

function specRoutes(): Set<string> {
  const out = new Set<string>();
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const method of Object.keys(item)) {
      if (HTTP_METHODS.includes(method)) out.add(`${method.toUpperCase()} ${path}`);
    }
  }
  return out;
}

describe('spec/openapi.yaml', () => {
  it('is a valid OpenAPI 3.1 document', async () => {
    expect(spec.openapi).toMatch(/^3\.1\./);
    const result = await validate(structuredClone(spec) as never);
    expect(result.valid, JSON.stringify(result, null, 2)).toBe(true);
  });

  it('describes every route the app serves, and nothing else', () => {
    const served = [...servedRoutes()].sort();
    const described = [...specRoutes()].sort();
    expect(served.length).toBeGreaterThan(30);
    expect(described).toEqual(served);
  });

  it('is embedded unchanged in src/openapi.generated.ts (run `npm run openapi`)', () => {
    expect(OPENAPI_DOCUMENT).toEqual(spec);
  });
});

describe('GET /openapi.json', () => {
  it('serves the document as JSON', async () => {
    const res = await SELF.fetch(`${BASE}/openapi.json`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    const body = await json<Spec>(res);
    expect(body.openapi).toBe(spec.openapi);
    expect(body.info.version).toBe(spec.info.version);
    expect(Object.keys(body.paths)).toContain('/openapi.json');
  });

  it('is listed on the landing page and in the service descriptor', async () => {
    const html = await (await SELF.fetch(`${BASE}/`, { headers: { accept: 'text/html' } })).text();
    expect(html).toContain('href="/openapi.json"');
    const descriptor = await json<{ endpoints: Record<string, string> }>(
      await SELF.fetch(`${BASE}/`),
    );
    expect(descriptor.endpoints['/openapi.json']).toContain('OpenAPI');
  });
});
