import { SELF, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { limits } from '../src/middleware/rate-limit';
import { BASE, json, registerPhone, registerSite, resetDb } from './helpers';

beforeEach(resetDb);

const L = limits(env);

async function start(clientId: string, ip: string): Promise<Response> {
  return SELF.fetch(`${BASE}/challenge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify({ client_id: clientId }),
  });
}

describe('abuse limits (M10.2)', () => {
  it('limits challenge issuance per source IP; other addresses are unaffected', async () => {
    const site = await registerSite();
    let limited = 0;
    for (let i = 0; i < L.requestsPerIp + 3; i++) {
      const res = await start(site.client_id, '203.0.113.7');
      if (res.status === 429) {
        limited++;
        expect(await json(res)).toMatchObject({ error: 'rate_limited' });
      }
    }
    expect(limited).toBe(3);
    expect((await start(site.client_id, '203.0.113.8')).status).toBe(201);
  });

  it('limits BLE discovery per source IP', async () => {
    const site = await registerSite();
    await registerPhone();
    const { challenge_id } = await json<{ challenge_id: string }>(
      await start(site.client_id, '198.51.100.1'),
    );
    let limited = 0;
    for (let i = 0; i < L.requestsPerIp + 2; i++) {
      const res = await SELF.fetch(`${BASE}/discover/ble`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cf-connecting-ip': '198.51.100.9' },
        body: JSON.stringify({ challenge_id, rotating_id: 'AAAAAAAAAAAAAAAAAAAAAA' }),
      });
      if (res.status === 429) limited++;
      else expect(res.status).toBe(404);
    }
    expect(limited).toBe(2);
  });

  it('limits challenge issuance per site client across addresses', async () => {
    const site = await registerSite();
    const other = await registerSite({ rp_id: 'other.example.com' });
    let limited = 0;
    for (let i = 0; i < L.challengesPerClient + 2; i++) {
      const res = await start(site.client_id, `10.0.0.${i}`);
      if (res.status === 429) {
        limited++;
        expect(await json(res)).toMatchObject({ error: 'client_rate_limited' });
      }
    }
    expect(limited).toBe(2);
    expect((await start(other.client_id, '10.1.0.1')).status).toBe(201);
  });

  it('limits are configurable per environment', () => {
    expect(limits({})).toEqual({ challengesPerClient: 300, requestsPerIp: 60 });
    expect(
      limits({ RATE_LIMIT_CHALLENGES_PER_CLIENT: '5', RATE_LIMIT_REQUESTS_PER_IP: 'x' }),
    ).toEqual({
      challengesPerClient: 5,
      requestsPerIp: 60,
    });
  });
});
