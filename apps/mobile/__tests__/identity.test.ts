import {
  createChallenge,
  deriveMasterKey,
  fromBase64Url,
  fromHex,
  identityId,
  keyPairFromPrivateKey,
  parseIdzSignature,
  randomBytes,
  signChallenge,
  toBase64Url,
  verifyAssertion,
  verifyIdentityProof,
  verifyRequestSignature,
  challengeId as newChallengeId,
} from '@identizen/protocol';
import * as SecureStore from 'expo-secure-store';
import { setApiFetch, signedFetch } from '../src/api/client';
import {
  approveChallenge,
  denyChallenge,
  parseChallengeId,
  receiveChallenge,
} from '../src/challenges/receive';
import { challengeStore } from '../src/challenges/store';
import {
  createIdentity,
  forgetIdentity,
  getMnemonic,
  getSummary,
  hasIdentity,
  register,
  restoreIdentity,
  setFetch,
} from '../src/identity/identity';
import { readDevice, readSeedHex } from '../src/identity/store';

const INDEX = 'http://index.test';
const indexKey = keyPairFromPrivateKey(fromHex('40'.repeat(32)));

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** Scripted index. */
function fakeIndex() {
  const calls: Call[] = [];
  const challenges = new Map<string, ReturnType<typeof signChallenge>>();
  let devicePub: Uint8Array | null = null;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? 'GET';
    const headers = (init?.headers as Record<string, string> | undefined) ?? {};
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    calls.push({ url, method, headers, body });
    const path = url.replace(INDEX, '');
    if (path === '/devices' && method === 'POST') {
      const b = body as { device_pubkey: string; master_pubkey: string; master_sig: string };
      if (!verifyIdentityProof(b.device_pubkey, b.master_sig, fromBase64Url(b.master_pubkey))) {
        return Response.json({ error: 'bad_identity_proof' }, { status: 400 });
      }
      devicePub = fromBase64Url(b.device_pubkey);
      return Response.json(
        {
          device_id: 'dev_01K3ZB2N9G0000000000000001',
          idz: identityId(fromBase64Url(b.master_pubkey)),
          index_pubkey: toBase64Url(indexKey.publicKey),
          handle: null,
        },
        { status: 201 },
      );
    }
    const m = /^\/challenge\/(ch_[0-9A-Z]{26})(\/assert|\/deny)?$/.exec(path);
    if (m?.[1]) {
      const signed = challenges.get(m[1]);
      if (!signed) return Response.json({ error: 'unknown_challenge' }, { status: 404 });
      if (!m[2]) return Response.json({ ...signed, status: 'pending' });
      const parsed = parseIdzSignature(headers['Idz-Signature']);
      if (!parsed || !devicePub)
        return Response.json({ error: 'missing_signature' }, { status: 401 });
      const sig = verifyRequestSignature(
        parsed,
        { method, path, body: init?.body as string, timestamp: parsed.timestamp },
        devicePub,
      );
      if (!sig.ok) return Response.json({ error: sig.error }, { status: 401 });
      if (m[2] === '/deny') return Response.json({ status: 'denied' });
      const v = verifyAssertion(body, signed.payload, devicePub);
      return v.ok
        ? Response.json({
            status: 'approved',
            sub: v.value.sub,
            redirect: 'https://site.test/cb?code=1',
          })
        : Response.json({ error: v.error }, { status: 400 });
    }
    if (path === '/me/devices') return Response.json({ devices: [] });
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
    challenges.set(c.id, signChallenge(c, indexKey.privateKey));
    return c;
  };
  return { fetchImpl, calls, issue };
}

const settings = { indexUrl: INDEX, biometricRequired: true };

beforeEach(() => {
  challengeStore.reset();
});

describe('identity lifecycle', () => {
  it('creates a 24-word identity, stores the seed under biometric protection, and registers', async () => {
    const index = fakeIndex();
    setFetch(index.fetchImpl);
    setApiFetch(index.fetchImpl);
    expect(await hasIdentity()).toBe(false);
    const mnemonic = await createIdentity(settings);
    expect(mnemonic.split(' ')).toHaveLength(24);
    expect(await hasIdentity()).toBe(true);
    expect(await getMnemonic()).toBe(mnemonic);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'idz.seed',
      expect.any(String),
      expect.objectContaining({ requireAuthentication: true }),
    );

    const reg = await register({ platform: 'apns', token: 'apns-token' });
    expect(reg.deviceId).toBe('dev_01K3ZB2N9G0000000000000001');
    const body = index.calls[0]?.body as Record<string, unknown>;
    expect(body).toMatchObject({
      push_platform: 'apns',
      push_token: 'apns-token',
      label: 'Identizen app',
    });
    expect(typeof body.ble_key).toBe('string');
    const seedHex = await readSeedHex();
    expect(reg.idz).toBe(identityId(deriveMasterKey(fromHex(seedHex ?? '')).publicKey));
    expect((await getSummary()).registered).toBe(true);
    expect((await readDevice())?.pushMode).toBe('apns');

    // Idempotent: a second call does not hit the index again.
    await register(null);
    expect(index.calls.filter((c) => c.url.endsWith('/devices'))).toHaveLength(1);
  });

  it('restores from a phrase and rejects invalid ones', async () => {
    const index = fakeIndex();
    setFetch(index.fetchImpl);
    const mnemonic = await createIdentity(settings);
    const seedBefore = await readSeedHex();
    await forgetIdentity();
    expect(await hasIdentity()).toBe(false);
    await restoreIdentity(mnemonic, settings);
    expect(await readSeedHex()).toBe(seedBefore);
    await expect(restoreIdentity('abandon abandon', settings)).rejects.toThrow();
  });

  it('signed requests carry a valid Idz-Signature over method, path, body and timestamp', async () => {
    const index = fakeIndex();
    setFetch(index.fetchImpl);
    setApiFetch(index.fetchImpl);
    await createIdentity(settings);
    await register({ platform: 'web', token: 'poll' });
    const res = await signedFetch('GET', '/me/devices');
    expect(res.status).toBe(200);
    const header = index.calls.at(-1)?.headers['Idz-Signature'] ?? '';
    expect(header).toMatch(/^v1,d=dev_[0-9A-Z]{26},t=\d+,s=[A-Za-z0-9_-]{86}$/);
    expect((await readDevice())?.pushMode).toBe('poll');
  });

  it('verifies challenges against the pinned index key, approves with the per-site key, and denies', async () => {
    const index = fakeIndex();
    setFetch(index.fetchImpl);
    setApiFetch(index.fetchImpl);
    await createIdentity(settings);
    await register(null);

    const c = index.issue({ acr: 'idz:mfa', reason: 'Approve wire of $12,000?' });
    const pending = await receiveChallenge(c.id, 'push');
    expect(pending.challenge.reason).toBe('Approve wire of $12,000?');
    expect(challengeStore.find(c.id)).toBeDefined();

    const result = await approveChallenge(pending.challenge, ['face', 'hwk']);
    expect(result.status).toBe(200);
    expect(result.sub).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(result.redirect).toBe('https://site.test/cb?code=1');
    expect(challengeStore.find(c.id)).toBeUndefined();
    expect(challengeStore.getActivity()[0]).toMatchObject({
      kind: 'approved',
      rpName: 'Example',
      acr: 'idz:mfa',
    });

    const c2 = index.issue();
    const p2 = await receiveChallenge(c2.id, 'scan');
    expect(await denyChallenge(p2.challenge)).toBe(200);
    expect(challengeStore.getActivity()[0]?.kind).toBe('denied');

    // A challenge signed by a different index key is rejected before anything is shown.
    const other = keyPairFromPrivateKey(fromHex('41'.repeat(32)));
    const forged = signChallenge(index.issue(), other.privateKey);
    setApiFetch(async () => Response.json({ ...forged, status: 'pending' }));
    await expect(receiveChallenge(forged.payload.id, 'link')).rejects.toThrow(
      /bad_index_signature/,
    );
  });

  it('parses deep links', () => {
    expect(parseChallengeId('https://app.identizen.com/l/ch_01K3ZB2N9G0000000000000000')).toBe(
      'ch_01K3ZB2N9G0000000000000000',
    );
    expect(parseChallengeId('identizen://l/ch_01K3ZB2N9G0000000000000000')).toBe(
      'ch_01K3ZB2N9G0000000000000000',
    );
    expect(parseChallengeId('nope')).toBeNull();
  });
});
