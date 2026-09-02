import { SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { BASE, json, registerPhone, resetDb } from './helpers';

beforeEach(resetDb);

describe('health and well-known', () => {
  it('GET /health reports the database', async () => {
    const res = await SELF.fetch(`${BASE}/health`);
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({
      ok: true,
      service: 'identizen-index',
      database: 'ok',
      issuer: BASE,
    });
  });

  it('GET /.well-known/identizen exposes the pinned index key', async () => {
    const res = await SELF.fetch(`${BASE}/.well-known/identizen`);
    const body = await json<{ index_pubkey: string; index: string; app: string }>(res);
    expect(body.index).toBe(BASE);
    expect(body.app).toBe('http://app.test');
    expect(body.index_pubkey).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('unknown routes are JSON 404s', async () => {
    const res = await SELF.fetch(`${BASE}/nope`);
    expect(res.status).toBe(404);
    expect(await json(res)).toMatchObject({ error: 'not_found' });
  });

  it('WebFinger resolves a handle on this index and rejects others', async () => {
    await registerPhone({ handle: 'george' });
    const ok = await SELF.fetch(`${BASE}/.well-known/webfinger?resource=acct:George@index.test`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toContain('application/jrd+json');
    const body = await json<{
      subject: string;
      properties: Record<string, string>;
      links: { rel: string; href: string }[];
    }>(ok);
    expect(body.subject).toBe('acct:george@index.test');
    expect(body.properties['https://identizen.com/ns/idz']).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(body.links.some((l) => l.href === BASE)).toBe(true);

    expect(
      (await SELF.fetch(`${BASE}/.well-known/webfinger?resource=acct:nobody@index.test`)).status,
    ).toBe(404);
    expect(
      (await SELF.fetch(`${BASE}/.well-known/webfinger?resource=acct:george@other.test`)).status,
    ).toBe(404);
    expect((await SELF.fetch(`${BASE}/.well-known/webfinger?resource=garbage`)).status).toBe(400);
    expect((await SELF.fetch(`${BASE}/.well-known/webfinger`)).status).toBe(400);
  });
});
