import { describe, expect, it } from 'vitest';
import { clientIp } from '../src/lib/util';

/** F09: a caller cannot pick their own rate-limit bucket with X-Forwarded-For. */
describe('clientIp', () => {
  const h = (init: Record<string, string>) => new Headers(init);

  it("believes Cloudflare's header, and X-Forwarded-For only behind a declared proxy", () => {
    expect(clientIp(h({ 'cf-connecting-ip': '203.0.113.9' }), {})).toBe('203.0.113.9');
    expect(clientIp(h({ 'x-forwarded-for': '198.51.100.7, 10.0.0.1' }), {})).toBeNull();
    expect(
      clientIp(h({ 'x-forwarded-for': '198.51.100.7, 10.0.0.1' }), { TRUST_PROXY_HEADERS: 'true' }),
    ).toBe('198.51.100.7');
    expect(
      clientIp(h({ 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '198.51.100.7' }), {
        TRUST_PROXY_HEADERS: 'true',
      }),
    ).toBe('203.0.113.9');
    expect(clientIp(h({}), { TRUST_PROXY_HEADERS: 'true' })).toBeNull();
  });
});

/** F09: the capped read feeds Hono's body cache, so a route may still parse the body afterwards. */
describe('readBodyCapped', () => {
  it('leaves the body readable for the route and refuses one past the cap', async () => {
    const { Hono } = await import('hono');
    const { readBodyCapped } = await import('../src/lib/util');
    const { errorToResponse } = await import('../src/lib/errors');
    const app = new Hono();
    app.onError(errorToResponse);
    app.use('*', async (c, next) => {
      c.set('raw' as never, (await readBodyCapped(c, 32)) as never);
      await next();
    });
    app.post('/echo', async (c) =>
      c.json({ parsed: await c.req.json(), raw: c.get('raw' as never) }),
    );
    const ok = await app.request('/echo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ a: 1 }),
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ parsed: { a: 1 }, raw: '{"a":1}' });
    const big = await app.request('/echo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ a: 'x'.repeat(64) }),
    });
    expect(big.status).toBe(413);
  });
});
