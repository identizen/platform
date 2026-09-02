import { SELF, env, fetchMock, runDurableObjectAlarm } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createLocalJWKSet, jwtVerify } from 'jose';
import { reasonHash } from '@identizen/protocol';
import {
  BASE,
  approve,
  buildAssertion,
  fetchChallenge,
  json,
  registerPhone,
  registerSite,
  resetDb,
  signedFetch,
  startChallenge,
} from './helpers';

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});
beforeEach(resetDb);
afterEach(() => fetchMock.assertNoPendingInterceptors());

async function bindPhone(
  site: { client_id: string },
  phone: Awaited<ReturnType<typeof registerPhone>>,
): Promise<string> {
  const started = await startChallenge({ client_id: site.client_id });
  const body = await json<{ sub: string }>(await approve(phone, started.challenge_id));
  return body.sub;
}

function siteHeaders(site: {
  client_id: string;
  client_secret: string | null;
}): Record<string, string> {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${site.client_secret ?? ''}`,
    'idz-client-id': site.client_id,
  };
}

async function verifier() {
  const set = await (
    await SELF.fetch(`${BASE}/.well-known/jwks.json`)
  ).json<Parameters<typeof createLocalJWKSet>[0]>();
  return createLocalJWKSet(set);
}

describe('Verification API', () => {
  it('approved path: push, poll pending -> approved with the signed assertion bound to the reason; webhook JWT validates', async () => {
    const site = await registerSite({ webhook_url: 'https://app.example.com/idz/webhook' });
    const phone = await registerPhone();
    const sub = await bindPhone(site, phone);

    let webhookBody: string | null = null;
    let webhookHeaders: Record<string, string> = {};
    fetchMock
      .get('https://app.example.com')
      .intercept({ path: '/idz/webhook', method: 'POST' })
      .reply(200, (opts) => {
        webhookBody = typeof opts.body === 'string' ? opts.body : '';
        webhookHeaders = Object.fromEntries(
          Object.entries(opts.headers as Record<string, string>).map(([k, v]) => [
            k.toLowerCase(),
            v,
          ]),
        );
        return 'ok';
      });

    const reason = 'Approve wire transfer of $12,000 to Acme?';
    const res = await SELF.fetch(`${BASE}/v1/verify`, {
      method: 'POST',
      headers: siteHeaders(site),
      body: JSON.stringify({ sub, reason }),
    });
    expect(res.status, await res.clone().text()).toBe(201);
    const started = await json<{
      verification_id: string;
      status: string;
      challenge_id: string;
      code: string;
    }>(res);
    expect(started.verification_id).toMatch(/^vf_/);
    expect(started.status).toBe('pending');

    const pending = await json<{ status: string; assertion: unknown }>(
      await SELF.fetch(`${BASE}/v1/verify/${started.verification_id}`, {
        headers: siteHeaders(site),
      }),
    );
    expect(pending).toMatchObject({ status: 'pending', assertion: null });

    const challenge = await fetchChallenge(started.challenge_id);
    expect(challenge.payload.acr).toBe('idz:mfa');
    expect(challenge.payload.reason).toBe(reason);

    expect((await approve(phone, started.challenge_id)).status).toBe(200);
    const approved = await json<{
      status: string;
      assertion: {
        payload: { reason_hash: string; acr: string; sub: string };
        site_sig: string;
        device_sig: string;
      };
    }>(
      await SELF.fetch(`${BASE}/v1/verify/${started.verification_id}`, {
        headers: siteHeaders(site),
      }),
    );
    expect(approved.status).toBe('approved');
    expect(approved.assertion.payload.reason_hash).toBe(reasonHash(reason));
    expect(approved.assertion.payload.acr).toBe('idz:mfa');
    expect(approved.assertion.payload.sub).toBe(sub);
    expect(approved.assertion.site_sig).toMatch(/^[A-Za-z0-9_-]{86}$/);

    for (let i = 0; i < 40 && webhookBody === null; i++)
      await new Promise((r) => setTimeout(r, 50));
    expect(webhookBody).not.toBeNull();
    expect(webhookHeaders['content-type']).toBe('application/jwt');
    expect(webhookHeaders['idz-webhook-signature']).toMatch(/^sha256=[0-9a-f]{64}$/);
    const { payload } = await jwtVerify(webhookBody ?? '', await verifier(), {
      issuer: BASE,
      audience: site.client_id,
    });
    expect(payload).toMatchObject({
      event: 'verification.resolved',
      verification_id: started.verification_id,
      status: 'approved',
      sub,
    });
    expect((payload.assertion as { payload: { reason_hash: string } }).payload.reason_hash).toBe(
      reasonHash(reason),
    );
  });

  it('denied path', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const sub = await bindPhone(site, phone);
    const started = await json<{ verification_id: string; challenge_id: string }>(
      await SELF.fetch(`${BASE}/v1/verify`, {
        method: 'POST',
        headers: siteHeaders(site),
        body: JSON.stringify({ sub }),
      }),
    );
    expect(
      (await signedFetch(phone, 'POST', `/challenge/${started.challenge_id}/deny`, {})).status,
    ).toBe(200);
    const v = await json<{ status: string }>(
      await SELF.fetch(`${BASE}/v1/verify/${started.verification_id}`, {
        headers: siteHeaders(site),
      }),
    );
    expect(v.status).toBe('denied');
  });

  it('timeout path: the challenge alarm resolves the verification and posts the webhook', async () => {
    const site = await registerSite({ webhook_url: 'https://app.example.com/idz/webhook' });
    const phone = await registerPhone();
    const sub = await bindPhone(site, phone);
    let status: string | null = null;
    fetchMock
      .get('https://app.example.com')
      .intercept({ path: '/idz/webhook', method: 'POST' })
      .reply(200, (opts) => {
        status = JSON.parse(
          atob(
            ((typeof opts.body === 'string' ? opts.body : '').split('.')[1] ?? '')
              .replace(/-/g, '+')
              .replace(/_/g, '/'),
          ),
        ).status as string;
        return 'ok';
      });
    const started = await json<{ verification_id: string; challenge_id: string }>(
      await SELF.fetch(`${BASE}/v1/verify`, {
        method: 'POST',
        headers: siteHeaders(site),
        body: JSON.stringify({ sub }),
      }),
    );
    expect(await runDurableObjectAlarm(env.CHALLENGE_SESSION.getByName(started.challenge_id))).toBe(
      true,
    );
    for (let i = 0; i < 40 && status === null; i++) await new Promise((r) => setTimeout(r, 50));
    const v = await json<{ status: string }>(
      await SELF.fetch(`${BASE}/v1/verify/${started.verification_id}`, {
        headers: siteHeaders(site),
      }),
    );
    expect(v.status).toBe('timeout');
    expect(status).toBe('timeout');
  });

  it('reason tamper: an assertion signed over a different reason is rejected', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const sub = await bindPhone(site, phone);
    const started = await json<{ verification_id: string; challenge_id: string }>(
      await SELF.fetch(`${BASE}/v1/verify`, {
        method: 'POST',
        headers: siteHeaders(site),
        body: JSON.stringify({ sub, reason: 'Pay $10' }),
      }),
    );
    const { payload } = await fetchChallenge(started.challenge_id);
    const tampered = buildAssertion(phone, { ...payload, reason: 'Pay $10,000' });
    const res = await signedFetch(
      phone,
      'POST',
      `/challenge/${started.challenge_id}/assert`,
      tampered,
    );
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ error: 'reason_mismatch' });
    const v = await json<{ status: string }>(
      await SELF.fetch(`${BASE}/v1/verify/${started.verification_id}`, {
        headers: siteHeaders(site),
      }),
    );
    expect(v.status).toBe('pending');
  });

  it('auth and ownership: wrong secret 401, unknown sub 404, other site cannot read', async () => {
    const site = await registerSite();
    const other = await registerSite({ rp_id: 'other.example.com' });
    const phone = await registerPhone();
    const sub = await bindPhone(site, phone);
    expect(
      (
        await SELF.fetch(`${BASE}/v1/verify`, {
          method: 'POST',
          headers: { ...siteHeaders(site), authorization: 'Bearer nope' },
          body: JSON.stringify({ sub }),
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await SELF.fetch(`${BASE}/v1/verify`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sub }),
        })
      ).status,
    ).toBe(401);
    const unknown = await SELF.fetch(`${BASE}/v1/verify`, {
      method: 'POST',
      headers: siteHeaders(site),
      body: JSON.stringify({ sub: 'B'.repeat(32) }),
    });
    expect(unknown.status).toBe(404);
    const started = await json<{ verification_id: string }>(
      await SELF.fetch(`${BASE}/v1/verify`, {
        method: 'POST',
        headers: siteHeaders(site),
        body: JSON.stringify({ sub }),
      }),
    );
    expect(
      (
        await SELF.fetch(`${BASE}/v1/verify/${started.verification_id}`, {
          headers: siteHeaders(other),
        })
      ).status,
    ).toBe(404);
    // Basic auth form also works.
    const basic = await SELF.fetch(`${BASE}/v1/verify/${started.verification_id}`, {
      headers: { authorization: `Basic ${btoa(`${site.client_id}:${site.client_secret ?? ''}`)}` },
    });
    expect(basic.status).toBe(200);
  });
});
