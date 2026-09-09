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
  generateKeyPair,
  signRotation,
  type KeyPair,
  type SignedRotation,
} from '@identizen/protocol';
import { FakePhone } from './phone.js';

const indexKey = keyPairFromPrivateKey(fromHex('40'.repeat(32)));
const INDEX = 'http://index.test';

/** Minimal in-memory index: registration, challenge fetch, assert, deny. */
function fakeIndex() {
  const calls: { path: string; method: string; body: unknown }[] = [];
  const challenges = new Map<string, ReturnType<typeof signChallenge>>();
  const devices = new Map<string, Uint8Array>();
  // The current signing key and the rotation chain (PROTOCOL.md §3.1) published at well-known.
  let signer: KeyPair = indexKey;
  const rotations: SignedRotation[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    calls.push({ path: url.pathname, method, body });
    if (url.pathname === '/.well-known/identizen') {
      return Response.json({
        index: INDEX,
        app: 'http://app.test',
        index_pubkey: toBase64Url(signer.publicKey),
        rotations,
        protocol: 'identizen/v1',
      });
    }
    if (url.pathname === '/devices/nonce' && method === 'POST') {
      return Response.json({ nonce: 'n'.repeat(40), exp: Math.floor(Date.now() / 1000) + 120 });
    }
    if (url.pathname === '/devices' && method === 'POST') {
      const b = body as { device_pubkey: string; nonce?: string };
      if (b.nonce !== 'n'.repeat(40)) return Response.json({ error: 'bad_nonce' }, { status: 400 });
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
    const signed = signChallenge(c, signer.privateKey);
    challenges.set(c.id, signed);
    return c;
  };
  /** Rotate the index key: the retiring key signs a statement naming its successor. */
  const rotate = (over: Partial<SignedRotation['payload']> = {}) => {
    const next = generateKeyPair();
    rotations.push(
      signRotation(
        {
          type: 'rotation',
          index: INDEX,
          prev_pubkey: toBase64Url(signer.publicKey),
          next_pubkey: toBase64Url(next.publicKey),
          iat: Math.floor(Date.now() / 1000),
          ...over,
        },
        signer.privateKey,
      ),
    );
    signer = next;
    return next;
  };
  return { fetchImpl, calls, issue, rotate, rotations };
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
    expect(index.calls.find((c) => c.path === '/devices')?.body).toMatchObject({
      nonce: 'n'.repeat(40),
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

  it('follows a published key rotation chain and re-pins (PROTOCOL.md §3.1)', async () => {
    const index = fakeIndex();
    const phone = new FakePhone({ indexUrl: INDEX, fetchImpl: index.fetchImpl });
    await phone.register();
    expect(phone.snapshot.indexPubkey).toBe(toBase64Url(indexKey.publicKey));

    // Two rotations while the phone was away: it walks the whole chain in one step.
    index.rotate();
    const current = index.rotate();
    const c = index.issue();
    const p = await phone.onPush(c.id);
    expect(p.challenge.id).toBe(c.id);
    expect(phone.snapshot.indexPubkey).toBe(toBase64Url(current.publicKey));
    expect(index.calls.filter((x) => x.path === '/.well-known/identizen')).toHaveLength(1);

    // Already re-pinned: the next challenge needs no discovery round trip.
    const c2 = index.issue();
    await phone.onPush(c2.id);
    expect(index.calls.filter((x) => x.path === '/.well-known/identizen')).toHaveLength(1);
  });

  it('does not re-pin on a chain that fails to verify or names another index', async () => {
    const index = fakeIndex();
    const phone = new FakePhone({ indexUrl: INDEX, fetchImpl: index.fetchImpl });
    await phone.register();
    const pinned = phone.snapshot.indexPubkey;

    // A statement for a different issuer, even when properly signed, must not move the pin.
    index.rotate({ index: 'http://other.test' });
    const c = index.issue();
    await expect(phone.onPush(c.id)).rejects.toThrow(/bad_index_signature/);
    expect(phone.snapshot.indexPubkey).toBe(pinned);

    // Tamper with the statement: the signature no longer covers it, so the chain is broken.
    const good = index.rotations[0]!;
    index.rotations[0] = {
      ...good,
      payload: { ...good.payload, index: INDEX },
    };
    await expect(phone.onPush(c.id)).rejects.toThrow(/bad_index_signature/);
    expect(phone.snapshot.indexPubkey).toBe(pinned);
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
