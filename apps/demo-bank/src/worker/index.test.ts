import { describe, expect, it, vi } from 'vitest';
import { handleDemoEmail, handleRequest, type Env } from './index';

function makeEnv(
  opts: { ipOk?: boolean; toOk?: boolean } = {},
): Env & { assets: ReturnType<typeof vi.fn> } {
  const assets = vi.fn(async () => new Response('asset'));
  return {
    RESEND_API_KEY: 're_test',
    FROMENANCE_API_KEY: 'fr_test_x',
    FROMENANCE_TENANT_SECRET: 'secret',
    DEMO_MAIL_FROM: 'JT Merlin Bank <alerts@jtmerlin.com>',
    ASSETS: { fetch: assets },
    DEMO_MAIL_IP_LIMIT: { limit: async () => ({ success: opts.ipOk ?? true }) },
    DEMO_MAIL_TO_LIMIT: { limit: async () => ({ success: opts.toOk ?? true }) },
    assets,
  };
}

const urlOf = (i: RequestInfo | URL) =>
  typeof i === 'string' ? i : i instanceof URL ? i.href : i.url;

const okFetch = async (input: RequestInfo | URL) => {
  const url = urlOf(input);
  if (url.endsWith('/v1/communications')) {
    return new Response(JSON.stringify({ id: 'com_1', verify_code: 'KX73-PQ9G' }), { status: 201 });
  }
  return new Response('{}', { status: 200 });
};

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://jtmerlin.com/api/demo-email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://jtmerlin.com', ...headers },
    body: JSON.stringify(body),
  });
}

describe('handleRequest', () => {
  it('serves everything but the API from assets', async () => {
    const env = makeEnv();
    const res = await handleRequest(new Request('https://jtmerlin.com/verify'), env);
    expect(await res.text()).toBe('asset');
    expect(env.assets).toHaveBeenCalledTimes(1);
  });
});

describe('handleDemoEmail', () => {
  it('sends and never reveals the kind', async () => {
    const res = await handleDemoEmail(post({ email: 'jane@example.com' }), makeEnv(), {
      fetch: okFetch,
      random: () => 0.1,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: true });
  });

  it('rejects other methods, other origins, and bad addresses', async () => {
    const env = makeEnv();
    const get = new Request('https://jtmerlin.com/api/demo-email');
    expect((await handleDemoEmail(get, env)).status).toBe(405);
    const cross = post({ email: 'jane@example.com' }, { origin: 'https://evil.example' });
    expect((await handleDemoEmail(cross, env)).status).toBe(403);
    expect((await handleDemoEmail(post({ email: 'not-an-address' }), env)).status).toBe(400);
    expect((await handleDemoEmail(post({}), env)).status).toBe(400);
  });

  it('answers 429 with Retry-After when either limit trips', async () => {
    const byIp = await handleDemoEmail(
      post({ email: 'jane@example.com' }),
      makeEnv({ ipOk: false }),
    );
    expect(byIp.status).toBe(429);
    expect(byIp.headers.get('retry-after')).toBe('60');
    const byTo = await handleDemoEmail(
      post({ email: 'jane@example.com' }),
      makeEnv({ toOk: false }),
    );
    expect(byTo.status).toBe(429);
  });

  it('maps provider failures to 502 with a plain message', async () => {
    const failing = (async () => new Response('{}', { status: 500 })) as unknown as typeof fetch;
    const res = await handleDemoEmail(post({ email: 'jane@example.com' }), makeEnv(), {
      fetch: failing,
      random: () => 0.9,
    });
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toMatch(/mail provider/);
  });
});
