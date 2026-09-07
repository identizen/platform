import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { sql } from 'drizzle-orm';
import { decodeJwt } from 'jose';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { AppOptions } from '../src/hooks';
import { ApiError, forbidden } from '../src/lib/errors';
import {
  BASE,
  approve,
  authorizeAndApprove,
  dbHandle,
  exchange,
  json,
  loginAndExchange,
  registerPhone,
  registerSite,
  request,
  resetDb,
  startChallenge,
  useFetcher,
} from './helpers';

/** Route the helpers through an index built with options instead of the deployed Worker. */
function appFetcher(options: AppOptions) {
  const app = createApp(options);
  return async (input: string, init?: RequestInit): Promise<Response> => {
    const ctx = createExecutionContext();
    const res = await app.fetch(new Request(input, init), env, ctx);
    await waitOnExecutionContext(ctx);
    return res;
  };
}

async function lastDenialReason(): Promise<string | undefined> {
  const handle = dbHandle();
  try {
    const rows = await handle.db.execute<{ detail: { reason?: string } }>(
      sql`select detail from audit_events where kind = 'login.denied' order by id desc limit 1`,
    );
    return Array.from(rows)[0]?.detail.reason;
  } finally {
    await handle.close();
  }
}

describe('createApp(options)', () => {
  beforeEach(resetDb);
  afterEach(() => useFetcher(null));

  it('resolveEnv picks the bindings for a request', async () => {
    useFetcher(
      appFetcher({
        resolveEnv: (_req, base) => ({ ...base, INDEX_URL: 'https://acme.index.test' }),
      }),
    );
    const doc = await json<{ issuer: string }>(
      await request(`${BASE}/.well-known/openid-configuration`),
    );
    expect(doc.issuer).toBe('https://acme.index.test');
  });

  it('resolveEnv refuses with an ApiError before anything else runs', async () => {
    useFetcher(
      appFetcher({
        resolveEnv: () => {
          throw new ApiError(404, 'tenant_not_found', 'no such tenant');
        },
      }),
    );
    const res = await request(`${BASE}/health`);
    expect(res.status).toBe(404);
    expect((await json<{ error: string }>(res)).error).toBe('tenant_not_found');
  });

  it('extend mounts routes after the built-in ones', async () => {
    useFetcher(appFetcher({ extend: (app) => app.get('/orgs/ping', (c) => c.text('pong')) }));
    expect(await (await request(`${BASE}/orgs/ping`)).text()).toBe('pong');
    expect((await request(`${BASE}/health`)).status).toBe(200);
  });

  it('TENANT_KEY keeps challenge sessions apart', async () => {
    const site = await registerSite();
    const tenantA = appFetcher({ resolveEnv: (_r, base) => ({ ...base, TENANT_KEY: 'a' }) });
    useFetcher(tenantA);
    const started = await startChallenge({ client_id: site.client_id });
    expect((await tenantA(`${BASE}/challenge/${started.challenge_id}`)).status).toBe(200);
    useFetcher(null);
    // The plain index (no key) and another tenant cannot see it.
    expect((await request(`${BASE}/challenge/${started.challenge_id}`)).status).toBe(404);
    const tenantB = appFetcher({ resolveEnv: (_r, base) => ({ ...base, TENANT_KEY: 'b' }) });
    expect((await tenantB(`${BASE}/challenge/${started.challenge_id}`)).status).toBe(404);
  });

  it('onChallengeStart can refuse a login', async () => {
    const site = await registerSite();
    useFetcher(
      appFetcher({
        hooks: {
          onChallengeStart: ({ site: s }) => {
            if (s.clientId === site.client_id)
              throw forbidden('workforce_only', 'this site only accepts org identities');
          },
        },
      }),
    );
    const res = await request(`${BASE}/challenge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: site.client_id }),
    });
    expect(res.status).toBe(403);
    expect((await json<{ error: string }>(res)).error).toBe('workforce_only');
  });

  it('onEnroll can refuse a device', async () => {
    useFetcher(
      appFetcher({
        hooks: {
          onEnroll: () => {
            throw forbidden('enrollment_closed', 'enrol through your organisation');
          },
        },
      }),
    );
    await expect(registerPhone()).rejects.toThrow('403');
  });

  it('onAssert denies with an audited reason', async () => {
    const phone = await registerPhone();
    const site = await registerSite();
    useFetcher(
      appFetcher({
        hooks: {
          onAssert: () => {
            throw forbidden('policy_blocked', 'outside the allowed login window');
          },
        },
      }),
    );
    const started = await startChallenge({ client_id: site.client_id });
    const res = await approve(phone, started.challenge_id);
    expect(res.status).toBe(403);
    expect((await json<{ error: string }>(res)).error).toBe('policy_blocked');
    expect(await lastDenialReason()).toBe('policy_blocked');
  });

  it('onTokenClaims adds claims and never overrides standard ones', async () => {
    const phone = await registerPhone({ handle: 'ada' });
    const site = await registerSite();
    useFetcher(
      appFetcher({
        hooks: { onTokenClaims: () => ({ idz_role: 'admin', sub: 'not-the-sub', sid: 'x' }) },
      }),
    );
    const { tokens } = await loginAndExchange(site, phone);
    const claims = decodeJwt(tokens.id_token);
    expect(claims.idz_role).toBe('admin');
    expect(claims.sub).not.toBe('not-the-sub');
    expect(claims.sid).not.toBe('x');
    const info = await json<Record<string, unknown>>(
      await request(`${BASE}/userinfo`, {
        headers: { authorization: `Bearer ${tokens.access_token}` },
      }),
    );
    expect(info.idz_role).toBe('admin');
    expect(info.sub).toBe(claims.sub);
  });

  it('onSessionCreate can refuse the exchange', async () => {
    const phone = await registerPhone();
    const site = await registerSite();
    useFetcher(
      appFetcher({
        hooks: {
          onSessionCreate: () => {
            throw forbidden('session_policy', 'sessions are not allowed for this site');
          },
        },
      }),
    );
    const login = await authorizeAndApprove(site, phone);
    const res = await exchange(site, login.code);
    expect(res.status).toBe(403);
    expect((await json<{ error: string }>(res)).error).toBe('session_policy');
  });
});
