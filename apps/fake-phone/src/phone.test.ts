import { describe, expect, it } from 'vitest';
import {
  createChallenge,
  keyPairFromPrivateKey,
  fromHex,
  signChallenge,
  toBase64Url,
  verifyAssertion,
  challengeId as newChallengeId,
  randomBytes,
} from '@identizen/protocol';
import { FakePhone } from './phone.js';

const indexKey = keyPairFromPrivateKey(fromHex('40'.repeat(32)));
const INDEX = 'http://index.test';

/** Minimal in-memory index: registration, challenge fetch, assert, deny. */
function fakeIndex() {
  const calls: { path: string; method: string; body: unknown }[] = [];
  const challenges = new Map<string, ReturnType<typeof signChallenge>>();
  const devices = new Map<string, Uint8Array>();
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    calls.push({ path: url.pathname, method, body });
    if (url.pathname === '/devices' && method === 'POST') {
      const b = body as { device_pubkey: string };
      const id = `dev_${newChallengeId().slice(3)}`;
      devices.set(
        id,
        Uint8Array.from(atob(b.device_pubkey.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
          c.charCodeAt(0),
        ),
      );
      return Response.json(
        {
          device_id: id,
          idz: 'I'.repeat(32),
          index_pubkey: toBase64Url(indexKey.publicKey),
          handle: null,
        },
        { status: 201 },
      );
    }
    const m = /^\/challenge\/(ch_[0-9A-Z]{26})(\/assert|\/deny)?$/.exec(url.pathname);
    if (m?.[1]) {
      const signed = challenges.get(m[1]);
      if (!signed) return Response.json({ error: 'unknown_challenge' }, { status: 404 });
      if (!m[2]) return Response.json({ ...signed, status: 'pending' });
      if (m[2] === '/assert') {
        const sigHeader = (init?.headers as Record<string, string>)['Idz-Signature'] ?? '';
        const devId = /d=(dev_[0-9A-Z]{26})/.exec(sigHeader)?.[1] ?? '';
        const pub = devices.get(devId);
        const v = pub
          ? verifyAssertion(body, signed.payload, pub)
          : { ok: false as const, error: 'unknown_device' };
        return v.ok
          ? Response.json({ status: 'approved', sub: v.value.sub })
          : Response.json({ error: v.error }, { status: 400 });
      }
      return Response.json({ status: 'denied' });
    }
    return Response.json({ error: 'not_found' }, { status: 404 });
  };
  const issue = (over: Partial<Parameters<typeof createChallenge>[0]> = {}) => {
    const c = createChallenge({
      id: newChallengeId(),
      rp_id: 'app.example.com',
      rp_name: 'Example',
      nonce: toBase64Url(randomBytes(32)),
      code: '42',
      iat: Math.floor(Date.now() / 1000),
      index: INDEX,
      acr: 'idz:login',
      ...over,
    });
    const signed = signChallenge(c, indexKey.privateKey);
    challenges.set(c.id, signed);
    return c;
  };
  return { fetchImpl, calls, issue };
}

describe('FakePhone', () => {
  it('registers, auto-approves a pushed challenge, and records the log', async () => {
    const index = fakeIndex();
    const phone = new FakePhone({
      indexUrl: INDEX,
      pushUrl: 'http://phone.test',
      fetchImpl: index.fetchImpl,
    });
    expect(phone.registered).toBe(false);
    expect(phone.mnemonic.split(' ')).toHaveLength(24);
    await phone.register();
    expect(phone.registered).toBe(true);
    expect(index.calls[0]?.body).toMatchObject({
      push_platform: 'web',
      push_token: 'http://phone.test/push',
    });
    const c = index.issue();
    const p = await phone.onPush(c.id);
    expect(p.via).toBe('push');
    expect(phone.pending.size).toBe(0);
    expect(phone.log.map((l) => l.event)).toEqual(['registered', 'challenge', 'approved']);
    expect(index.calls.at(-1)?.path).toBe(`/challenge/${c.id}/assert`);
  });

  it('scan parses deep links; deny and manual policies', async () => {
    const index = fakeIndex();
    const phone = new FakePhone({ indexUrl: INDEX, policy: 'deny', fetchImpl: index.fetchImpl });
    await phone.register();
    const c = index.issue({ acr: 'idz:mfa', reason: 'Pay $5' });
    await phone.scan(`https://app.identizen.com/l/${c.id}`);
    expect(index.calls.at(-1)?.path).toBe(`/challenge/${c.id}/deny`);

    phone.policy = 'manual';
    const c2 = index.issue();
    const waiting = phone.waitForChallenge();
    await phone.scan(c2.id);
    expect((await waiting).challenge.id).toBe(c2.id);
    expect(phone.pending.has(c2.id)).toBe(true);
    const r = await phone.approve(c2.id);
    expect(r.status).toBe(200);
    expect(phone.pending.has(c2.id)).toBe(false);
    await expect(phone.scan('garbage')).rejects.toThrow();
  });

  it('rejects challenges from an untrusted index key', async () => {
    const index = fakeIndex();
    const phone = new FakePhone({ indexUrl: INDEX, fetchImpl: index.fetchImpl });
    await phone.register();
    const other = keyPairFromPrivateKey(fromHex('41'.repeat(32)));
    const c = createChallenge({
      id: newChallengeId(),
      rp_id: 'x.example',
      rp_name: 'X',
      nonce: toBase64Url(randomBytes(32)),
      code: '00',
      iat: Math.floor(Date.now() / 1000),
      index: INDEX,
      acr: 'idz:login',
    });
    const forged = signChallenge(c, other.privateKey);
    const badFetch: typeof fetch = async () => Response.json({ ...forged, status: 'pending' });
    const p2 = new FakePhone({ indexUrl: INDEX, fetchImpl: badFetch, state: phone.snapshot });
    await expect(p2.onPush(c.id)).rejects.toThrow(/bad_index_signature/);
  });

  it('reset produces a new identity', async () => {
    const index = fakeIndex();
    const phone = new FakePhone({ indexUrl: INDEX, fetchImpl: index.fetchImpl });
    await phone.register();
    const before = phone.snapshot;
    phone.reset('george');
    expect(phone.registered).toBe(false);
    expect(phone.snapshot.seedHex).not.toBe(before.seedHex);
    expect(phone.snapshot.handle).toBe('george');
    expect(phone.bleId()).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });
});
