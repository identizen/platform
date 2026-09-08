import { parseIdzSignature } from '@identizen/protocol';
import * as Notifications from 'expo-notifications';
import { api, IndexError, setApiFetch, signedFetch } from '../src/api/client';
import { createIdentity, register, setFetch } from '../src/identity/identity';
import { readDevice } from '../src/identity/store';
import {
  drainInboxOnce,
  obtainPushToken,
  pickPushPayload,
  startInboxPolling,
  syncPushToken,
} from '../src/push';

const INDEX = 'http://index.test';
const ORG = 'https://acme.index.test';

interface Call {
  host: string;
  path: string;
  method: string;
  body: unknown;
  headers: Record<string, string>;
}

function fakeIndex() {
  const calls: Call[] = [];
  const inbox = new Map<string, string[]>([
    [INDEX, ['ch_01K3ZB2N9G0000000000000009']],
    [ORG, ['ch_01K3ZB2N9G000000000000000A']],
  ]);
  const ids = new Map([
    [INDEX, 'dev_01K3ZB2N9G0000000000000001'],
    [ORG, 'dev_01K3ZB2N9G0000000000000002'],
  ]);
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const host = [INDEX, ORG].find((h) => url.startsWith(`${h}/`)) ?? '';
    const path = url.slice(host.length);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    const headers = (init?.headers as Record<string, string> | undefined) ?? {};
    calls.push({ host, path, method, body, headers });
    if (!host) return Response.json({ error: 'unknown_host' }, { status: 502 });
    if (path === '/devices/nonce')
      return Response.json({ nonce: 'n'.repeat(40), exp: Math.floor(Date.now() / 1000) + 120 });
    if (path === '/devices')
      return Response.json(
        {
          device_id: ids.get(host),
          idz: 'I'.repeat(32),
          index_pubkey: 'A'.repeat(43),
          handle: null,
        },
        { status: 201 },
      );
    if (path.endsWith('/inbox')) {
      const queued = inbox.get(host) ?? [];
      inbox.set(host, []);
      return Response.json({ challenge_ids: queued });
    }
    if (path.endsWith('/push-token')) return Response.json({ device_id: ids.get(host) });
    if (path === '/me') return Response.json({ idz: 'I'.repeat(32), handle: null, device: null });
    if (path === '/me/handle') {
      const h = (body as { handle: string | null }).handle;
      return h === 'taken'
        ? Response.json({ error: 'handle_taken', error_description: 'taken' }, { status: 409 })
        : Response.json({ idz: 'I'.repeat(32), handle: h });
    }
    return Response.json({ error: 'not_found', error_description: 'nope' }, { status: 404 });
  };
  return { fetchImpl, calls, ids };
}

let index: ReturnType<typeof fakeIndex>;

beforeEach(async () => {
  index = fakeIndex();
  setFetch(index.fetchImpl);
  setApiFetch(index.fetchImpl);
  await createIdentity({
    activeIndexUrl: INDEX,
    biometricRequired: false,
    bluetoothEnabled: false,
  });
});

const calls = () => index.calls;

const grantPush = () => {
  jest
    .mocked(Notifications.getPermissionsAsync)
    .mockResolvedValueOnce({ status: 'granted', granted: true } as never);
  jest
    .mocked(Notifications.getDevicePushTokenAsync)
    .mockResolvedValueOnce({ type: 'ios', data: 'abc123' });
};

describe('api', () => {
  it('maps index errors to IndexError with the code', async () => {
    await register(null);
    await expect(api.setHandle('taken')).rejects.toMatchObject({
      code: 'handle_taken',
      status: 409,
    });
    await expect(api.setHandle('taken')).rejects.toBeInstanceOf(IndexError);
    expect((await api.setHandle('george')).handle).toBe('george');
  });

  it('falls back to inbox polling when notifications are denied, and drains the inbox', async () => {
    expect(await obtainPushToken()).toEqual({ platform: 'web', token: 'poll' });
    await register(await obtainPushToken());
    expect((await readDevice())?.pushMode).toBe('poll');
    const seen: string[] = [];
    const stop = startInboxPolling((id) => seen.push(id), 10);
    await new Promise((r) => setTimeout(r, 60));
    stop();
    expect(seen).toEqual(['ch_01K3ZB2N9G0000000000000009']);
  });

  it('an APNs install still drains the inbox: the index queues every request there', async () => {
    await register({ platform: 'apns', token: 'abc123' });
    expect((await readDevice())?.pushMode).toBe('apns');
    const seen: string[] = [];
    const stop = startInboxPolling((id) => seen.push(id), 10);
    await new Promise((r) => setTimeout(r, 60));
    stop();
    expect(seen).toEqual(['ch_01K3ZB2N9G0000000000000009']);
  });

  it('syncs a real APNs token once permissions are granted', async () => {
    await register({ platform: 'web', token: 'poll' });
    grantPush();
    await syncPushToken();
    const push = calls().find((c) => c.path.endsWith('/push-token'));
    expect(push?.body).toMatchObject({
      push_token: 'abc123',
      push_platform: expect.stringMatching(/apns|fcm/),
    });
    expect((await readDevice())?.pushMode).toMatch(/apns|fcm/);
  });

  it('prefers an Expo push token (relayed by the index) over the raw device token', async () => {
    await register({ platform: 'web', token: 'poll' });
    jest
      .mocked(Notifications.getPermissionsAsync)
      .mockResolvedValueOnce({ status: 'granted', granted: true } as never);
    jest
      .mocked(Notifications.getExpoPushTokenAsync)
      .mockResolvedValueOnce({ type: 'expo', data: 'ExponentPushToken[abc]' });
    await syncPushToken();
    const push = calls().find((c) => c.path.endsWith('/push-token'));
    expect(jest.mocked(Notifications.getExpoPushTokenAsync)).toHaveBeenCalledWith({
      projectId: expect.any(String),
    });
    expect(push?.body).toMatchObject({
      push_token: 'ExponentPushToken[abc]',
      push_platform: expect.stringMatching(/apns|fcm/),
    });
  });
});

describe('api across indexes', () => {
  beforeEach(async () => {
    await register(null);
    await register(null, { indexUrl: ORG, makeActive: false });
  });

  it('routes a signed call to the index asked for, with that index’s device', async () => {
    await api.me();
    await api.me(ORG);
    const [active, org] = calls().filter((c) => c.path === '/me');
    expect(active?.host).toBe(INDEX);
    expect(parseIdzSignature(active?.headers['Idz-Signature'])?.device_id).toBe(
      index.ids.get(INDEX),
    );
    expect(org?.host).toBe(ORG);
    expect(parseIdzSignature(org?.headers['Idz-Signature'])?.device_id).toBe(index.ids.get(ORG));
    // A trailing slash or different case names the same index.
    expect((await signedFetch('GET', '/me', undefined, `${ORG.toUpperCase()}/`)).status).toBe(200);
    expect(calls().at(-1)?.host).toBe(ORG);
    await expect(signedFetch('GET', '/me', undefined, 'https://nowhere.test')).rejects.toThrow(
      /not registered on https:\/\/nowhere\.test/,
    );
  });

  it('registers the push token with every index and drains every inbox, tagging each id', async () => {
    grantPush();
    await syncPushToken();
    const pushes = calls().filter((c) => c.path.endsWith('/push-token'));
    expect(pushes.map((c) => [c.host, c.path])).toEqual([
      [INDEX, `/devices/${index.ids.get(INDEX)}/push-token`],
      [ORG, `/devices/${index.ids.get(ORG)}/push-token`],
    ]);
    expect((await readDevice(INDEX))?.pushMode).toMatch(/apns|fcm/);
    expect((await readDevice(ORG))?.pushMode).toMatch(/apns|fcm/);

    const seen: string[] = [];
    await drainInboxOnce((id, indexUrl) => seen.push(`${indexUrl} ${id}`));
    expect(seen).toEqual([
      `${INDEX} ch_01K3ZB2N9G0000000000000009`,
      `${ORG} ch_01K3ZB2N9G000000000000000A`,
    ]);

    // One index down does not stop the others from being polled.
    const fetchImpl = index.fetchImpl;
    setApiFetch((input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith(INDEX)) return Promise.reject(new TypeError('Network request failed'));
      return fetchImpl(input, init);
    });
    const later: string[] = [];
    await drainInboxOnce((id, indexUrl) => later.push(`${indexUrl} ${id}`));
    expect(later).toEqual([]);
    expect(calls().at(-1)).toMatchObject({ host: ORG, path: expect.stringMatching(/\/inbox$/) });
  });

  it('reads the index out of a push payload when the sender includes it', () => {
    expect(pickPushPayload({ challenge_id: 'ch_1' })).toEqual({ id: 'ch_1', index: null });
    expect(pickPushPayload({ challenge_id: 'ch_1', index: ORG })).toEqual({
      id: 'ch_1',
      index: ORG,
    });
    expect(pickPushPayload({ index: ORG })).toBeNull();
    expect(pickPushPayload(null)).toBeNull();
  });
});
