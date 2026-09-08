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
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { setApiFetch, signedFetch } from '../src/api/client';
import {
  approveChallenge,
  denyChallenge,
  parseChallengeId,
  parseChallengeLink,
  receiveChallenge,
} from '../src/challenges/receive';
import { challengeStore } from '../src/challenges/store';
import {
  createIdentity,
  forgetIdentity,
  getMnemonic,
  getSummary,
  hasIdentity,
  listIndexes,
  register,
  restoreIdentity,
  setFetch,
} from '../src/identity/identity';
import { forgetIndex, setActiveIndex } from '../src/identity/indexes';
import {
  readDevice,
  readDevices,
  readEnrollment,
  readSeedHex,
  readSettings,
  writeEnrollment,
} from '../src/identity/store';

const INDEX = 'http://index.test';
const ORG = 'https://acme.index.test';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** Scripted index, or several: each host has its own signing key and device ids. */
function fakeIndex(hosts: string[] = [INDEX]) {
  const calls: Call[] = [];
  const challenges = new Map<string, { host: string; signed: ReturnType<typeof signChallenge> }>();
  const keys = new Map(
    hosts.map((h, i) => [h, keyPairFromPrivateKey(fromHex((0x40 + i).toString(16).repeat(32)))]),
  );
  const devicePubs = new Map<string, Uint8Array>();
  const deviceIds = new Map(hosts.map((h, i) => [h, `dev_01K3ZB2N9G000000000000000${i + 1}`]));
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? 'GET';
    const headers = (init?.headers as Record<string, string> | undefined) ?? {};
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    calls.push({ url, method, headers, body });
    const host = hosts.find((h) => url.startsWith(`${h}/`));
    if (!host) return Response.json({ error: 'unknown_host' }, { status: 502 });
    const key = keys.get(host)!;
    const path = url.slice(host.length);
    if (path === '/devices/nonce' && method === 'POST') {
      return Response.json({ nonce: 'n'.repeat(40), exp: Math.floor(Date.now() / 1000) + 120 });
    }
    if (path === '/devices' && method === 'POST') {
      const b = body as {
        device_pubkey: string;
        master_pubkey: string;
        master_sig: string;
        nonce?: string;
      };
      if (b.nonce !== 'n'.repeat(40)) {
        return Response.json({ error: 'bad_nonce' }, { status: 400 });
      }
      const binding = { index: host, nonce: b.nonce };
      if (
        !verifyIdentityProof(b.device_pubkey, b.master_sig, fromBase64Url(b.master_pubkey), binding)
      ) {
        return Response.json({ error: 'bad_identity_proof' }, { status: 400 });
      }
      devicePubs.set(host, fromBase64Url(b.device_pubkey));
      return Response.json(
        {
          device_id: deviceIds.get(host),
          idz: identityId(fromBase64Url(b.master_pubkey)),
          index_pubkey: toBase64Url(key.publicKey),
          handle: null,
        },
        { status: 201 },
      );
    }
    const signedPaths = /^\/challenge\/(ch_[0-9A-Z]{26})(\/assert|\/deny)$|^\/me\//;
    const devicePub = devicePubs.get(host);
    if (signedPaths.test(path)) {
      const parsed = parseIdzSignature(headers['Idz-Signature']);
      if (!parsed || !devicePub)
        return Response.json({ error: 'missing_signature' }, { status: 401 });
      if (parsed.device_id !== deviceIds.get(host))
        return Response.json({ error: 'wrong_device' }, { status: 401 });
      const sig = verifyRequestSignature(
        parsed,
        {
          method,
          path,
          body: (init?.body as string | undefined) ?? '',
          timestamp: parsed.timestamp,
        },
        devicePub,
      );
      if (!sig.ok) return Response.json({ error: sig.error }, { status: 401 });
    }
    const m = /^\/challenge\/(ch_[0-9A-Z]{26})(\/assert|\/deny)?$/.exec(path);
    if (m?.[1]) {
      const entry = challenges.get(m[1]);
      if (!entry || entry.host !== host)
        return Response.json({ error: 'unknown_challenge' }, { status: 404 });
      if (!m[2]) return Response.json({ ...entry.signed, status: 'pending' });
      if (m[2] === '/deny') return Response.json({ status: 'denied' });
      const v = verifyAssertion(body, entry.signed.payload, devicePub!);
      return v.ok
        ? Response.json({
            status: 'approved',
            sub: v.value.sub,
            redirect: 'https://site.test/cb?code=1',
          })
        : Response.json({ error: v.error }, { status: 400 });
    }
    if (path === '/me/devices') return Response.json({ devices: [] });
    if (/^\/me\/devices\/dev_[0-9A-Z]+\/revoke$/.test(path))
      return Response.json({ device_id: deviceIds.get(host), status: 'revoked' });
    return Response.json({ error: 'not_found' }, { status: 404 });
  };
  const issue = (over: Partial<Parameters<typeof createChallenge>[0]> = {}, host = hosts[0]!) => {
    const c = createChallenge({
      id: newChallengeId(),
      rp_id: 'app.example.com',
      rp_name: 'Example',
      nonce: toBase64Url(randomBytes(32)),
      code: '42',
      iat: Math.floor(Date.now() / 1000),
      index: host,
      acr: 'idz:login',
      ...over,
    });
    challenges.set(c.id, { host, signed: signChallenge(c, keys.get(host)!.privateKey) });
    return c;
  };
  return { fetchImpl, calls, issue, devicePubs, deviceIds, keys };
}

const settings = { activeIndexUrl: INDEX, biometricRequired: true, bluetoothEnabled: false };

function arrange(hosts?: string[]) {
  const index = fakeIndex(hosts);
  setFetch(index.fetchImpl);
  setApiFetch(index.fetchImpl);
  return index;
}

beforeEach(() => {
  challengeStore.reset();
});

describe('identity lifecycle', () => {
  it('creates a 24-word identity, stores the seed under biometric protection, and registers', async () => {
    const index = arrange();
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
    const body = index.calls.find((c) => c.url.endsWith('/devices'))?.body as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({
      nonce: 'n'.repeat(40),
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

  it('falls back to a plain keystore entry when the phone has no strong biometric', async () => {
    const canUse = SecureStore.canUseBiometricAuthentication as jest.Mock;
    canUse.mockReturnValueOnce(false);
    await createIdentity(settings);
    const seedWrites = (SecureStore.setItemAsync as jest.Mock).mock.calls.filter(
      ([k]: [string]) => k === 'idz.seed',
    ) as [string, string, Record<string, unknown>][];
    const [, , opts] = seedWrites[seedWrites.length - 1]!;
    expect(opts.requireAuthentication).toBeUndefined();
    (SecureStore.getItemAsync as jest.Mock).mockClear();
    expect(await hasIdentity()).toBe(true);
    // Checking for an identity never touches the (possibly biometric-gated) seed entry.
    expect(SecureStore.getItemAsync).not.toHaveBeenCalledWith('idz.seed', expect.anything());
  });

  it('restores from a phrase and rejects invalid ones', async () => {
    arrange();
    const mnemonic = await createIdentity(settings);
    const seedBefore = await readSeedHex();
    await forgetIdentity();
    expect(await hasIdentity()).toBe(false);
    await restoreIdentity(mnemonic, settings);
    expect(await readSeedHex()).toBe(seedBefore);
    expect((await readSettings()).activeIndexUrl).toBe(INDEX);
    await expect(restoreIdentity('abandon abandon', settings)).rejects.toThrow();
  });

  it('signed requests carry a valid Idz-Signature over method, path, body and timestamp', async () => {
    const index = arrange();
    await createIdentity(settings);
    await register({ platform: 'web', token: 'poll' });
    const res = await signedFetch('GET', '/me/devices');
    expect(res.status).toBe(200);
    const header = index.calls.at(-1)?.headers['Idz-Signature'] ?? '';
    expect(header).toMatch(/^v1,d=dev_[0-9A-Z]{26},t=\d+,s=[A-Za-z0-9_-]{86}$/);
    expect((await readDevice())?.pushMode).toBe('poll');
  });

  it('verifies challenges against the pinned index key, approves with the per-site key, and denies', async () => {
    const index = arrange();
    await createIdentity(settings);
    await register(null);

    const c = index.issue({ acr: 'idz:mfa', reason: 'Approve wire of $12,000?' });
    const pending = await receiveChallenge(c.id, 'push');
    expect(pending.challenge.reason).toBe('Approve wire of $12,000?');
    expect(challengeStore.find(c.id)).toBeDefined();

    const result = await approveChallenge(pending.challenge, ['face']);
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

  it('parses deep links, with or without the issuing index', () => {
    expect(parseChallengeId('https://app.identizen.com/l/ch_01K3ZB2N9G0000000000000000')).toBe(
      'ch_01K3ZB2N9G0000000000000000',
    );
    expect(parseChallengeId('identizen://l/ch_01K3ZB2N9G0000000000000000')).toBe(
      'ch_01K3ZB2N9G0000000000000000',
    );
    expect(parseChallengeId('nope')).toBeNull();
    expect(parseChallengeLink('identizen://l/ch_01K3ZB2N9G0000000000000000')).toEqual({
      id: 'ch_01K3ZB2N9G0000000000000000',
      index: null,
    });
    expect(
      parseChallengeLink(
        `https://acme.app.identizen.com/l/ch_01K3ZB2N9G0000000000000000?index=${encodeURIComponent(`${ORG}/`)}`,
      ),
    ).toEqual({ id: 'ch_01K3ZB2N9G0000000000000000', index: ORG });
    // A non-https index in the link is ignored rather than trusted.
    expect(
      parseChallengeLink('identizen://l/ch_01K3ZB2N9G0000000000000000?index=http://evil.test'),
    ).toEqual({ id: 'ch_01K3ZB2N9G0000000000000000', index: null });
    expect(parseChallengeLink('nope')).toBeNull();
  });
});

describe('several indexes, one seed', () => {
  it('migrates the single legacy record into the per-index map on first read', async () => {
    const legacy = {
      devicePrivHex: '11'.repeat(32),
      bleKeyHex: '22'.repeat(32),
      deviceId: 'dev_01LEGACY',
      idz: 'idz_legacy',
      indexUrl: `${ORG}/`,
      indexPubkey: 'A'.repeat(43),
      handle: 'george',
      pushMode: 'poll',
    };
    await SecureStore.setItemAsync('idz.device', JSON.stringify(legacy));
    await AsyncStorage.setItem(
      'idz.settings',
      JSON.stringify({ indexUrl: `${ORG}/`, biometricRequired: false, bluetoothEnabled: true }),
    );

    expect(await readDevices()).toEqual({ [ORG]: legacy });
    expect(await SecureStore.getItemAsync('idz.device')).toBeNull();
    expect(await readSettings()).toEqual({
      activeIndexUrl: `${ORG}/`,
      biometricRequired: false,
      bluetoothEnabled: true,
    });
    const summary = await getSummary();
    expect(summary).toMatchObject({ registered: true, handle: 'george', idz: 'idz_legacy' });
    expect(summary.indexes).toHaveLength(1);
    expect(summary.indexes[0]).toMatchObject({ indexUrl: `${ORG}/`, active: true });
    // None of that reads the (possibly biometric-gated) seed entry.
    (SecureStore.getItemAsync as jest.Mock).mockClear();
    expect(await hasIdentity()).toBe(true);
    expect((await getSummary()).registered).toBe(true);
    expect(SecureStore.getItemAsync).not.toHaveBeenCalledWith('idz.seed', expect.anything());
  });

  it('registers the same identity on a second index with its own device key, and switches the active one', async () => {
    const index = arrange([INDEX, ORG]);
    await createIdentity(settings);
    const first = await register(null);
    const second = await register(null, { indexUrl: `${ORG}/` });
    expect(second.idz).toBe(first.idz);
    expect(second.deviceId).not.toBe(first.deviceId);
    expect(toBase64Url(index.devicePubs.get(INDEX)!)).not.toBe(
      toBase64Url(index.devicePubs.get(ORG)!),
    );
    // The proof for the second index is bound to that index's URL and nonce.
    const orgReg = index.calls.find((c) => c.url === `${ORG}/devices`);
    expect(orgReg?.body).toMatchObject({ nonce: 'n'.repeat(40) });

    let indexes = await listIndexes();
    expect(indexes.map((i) => [i.indexUrl, i.active, i.registered])).toEqual([
      [ORG, true, true],
      [INDEX, false, true],
    ]);
    expect((await getSummary()).indexUrl).toBe(ORG);

    await setActiveIndex(INDEX);
    indexes = await listIndexes();
    expect(indexes[0]).toMatchObject({ indexUrl: INDEX, active: true });
    // Registering again on the org index is idempotent and, told not to, leaves the active one.
    const before = index.calls.length;
    await register(null, { indexUrl: ORG, makeActive: false });
    expect(index.calls.length).toBe(before);
    expect((await readSettings()).activeIndexUrl).toBe(INDEX);
    await expect(setActiveIndex('https://nowhere.test')).rejects.toThrow(/not registered/);
    // Handles are per index.
    expect((await readDevice(ORG))?.handle).toBeNull();
  });

  it('finds, verifies and approves a challenge on the index that issued it, whatever is active', async () => {
    const index = arrange([INDEX, ORG]);
    await createIdentity(settings);
    await register(null);
    await register(null, { indexUrl: ORG, makeActive: false });
    expect((await readSettings()).activeIndexUrl).toBe(INDEX);

    // No index given (a scanned code, a bare link): asked in order, active index first.
    const c = index.issue({}, ORG);
    const start = index.calls.length;
    const pending = await receiveChallenge(c.id, 'scan');
    expect(index.calls.slice(start).map((x) => x.url)).toEqual([
      `${INDEX}/challenge/${c.id}`,
      `${ORG}/challenge/${c.id}`,
    ]);
    expect(pending.challenge.index).toBe(ORG);

    // Approval goes to the challenge's index, signed by the device this phone holds there.
    const result = await approveChallenge(pending.challenge, ['face']);
    expect(result.status).toBe(200);
    const assert = index.calls.at(-1);
    expect(assert?.url).toBe(`${ORG}/challenge/${c.id}/assert`);
    expect(parseIdzSignature(assert?.headers['Idz-Signature'])?.device_id).toBe(
      index.deviceIds.get(ORG),
    );

    // With the index known (push payload, inbox, `?index=` link) only that index is asked.
    const c2 = index.issue({}, ORG);
    const start2 = index.calls.length;
    const p2 = await receiveChallenge(c2.id, 'push', ORG);
    expect(index.calls.slice(start2).map((x) => x.url)).toEqual([`${ORG}/challenge/${c2.id}`]);
    expect(await denyChallenge(p2.challenge)).toBe(200);
    expect(index.calls.at(-1)?.url).toBe(`${ORG}/challenge/${c2.id}/deny`);

    // A challenge from an index this phone is not on cannot be acted on.
    const stray = { ...pending.challenge, index: 'https://other.test' };
    await expect(approveChallenge(stray, ['face'])).rejects.toThrow(
      /not registered on https:\/\/other\.test/,
    );
    await expect(receiveChallenge(c.id, 'link', 'https://other.test')).rejects.toThrow(
      /not registered/,
    );
  });

  it('forgets one index (revoking there, moving the active one), never the last', async () => {
    const index = arrange([INDEX, ORG]);
    await createIdentity(settings);
    await register(null);
    await register(null, { indexUrl: ORG });
    await writeEnrollment({ pending: null, managedBy: { org: 'Acme', index: ORG } });
    expect((await readSettings()).activeIndexUrl).toBe(ORG);

    await forgetIndex(ORG);
    expect(index.calls.at(-1)?.url).toBe(`${ORG}/me/devices/${index.deviceIds.get(ORG)}/revoke`);
    expect(Object.keys(await readDevices())).toEqual([INDEX]);
    expect((await readSettings()).activeIndexUrl).toBe(INDEX);
    expect((await readEnrollment()).managedBy).toBeNull();
    expect((await getSummary()).registered).toBe(true);

    await expect(forgetIndex(INDEX)).rejects.toThrow(/only index/);
    await expect(forgetIndex('https://nowhere.test')).rejects.toThrow(/no identity on/);
    expect(Object.keys(await readDevices())).toEqual([INDEX]);

    // Revocation is best effort: an unreachable index still gets forgotten locally.
    await register(null, { indexUrl: ORG });
    setApiFetch(() => Promise.reject(new TypeError('Network request failed')));
    await forgetIndex(ORG);
    expect(Object.keys(await readDevices())).toEqual([INDEX]);

    await forgetIdentity();
    expect(await hasIdentity()).toBe(false);
    expect(await readDevices()).toEqual({});
  });
});
