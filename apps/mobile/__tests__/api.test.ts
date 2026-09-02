import * as Notifications from 'expo-notifications';
import { api, IndexError, setApiFetch } from '../src/api/client';
import { createIdentity, register, setFetch } from '../src/identity/identity';
import { readDevice } from '../src/identity/store';
import { obtainPushToken, startInboxPolling, syncPushToken } from '../src/push';

const INDEX = 'http://index.test';

function fakeIndex() {
  const calls: { path: string; method: string; body: unknown }[] = [];
  let inbox: string[] = ['ch_01K3ZB2N9G0000000000000009'];
  const fetchImpl: typeof fetch = async (input, init) => {
    const path = (
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    ).replace(INDEX, '');
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    calls.push({ path, method, body });
    if (path === '/devices')
      return Response.json(
        {
          device_id: 'dev_01K3ZB2N9G0000000000000001',
          idz: 'I'.repeat(32),
          index_pubkey: 'A'.repeat(43),
          handle: null,
        },
        { status: 201 },
      );
    if (path.endsWith('/inbox')) {
      const ids = inbox;
      inbox = [];
      return Response.json({ challenge_ids: ids });
    }
    if (path.endsWith('/push-token'))
      return Response.json({ device_id: 'dev_01K3ZB2N9G0000000000000001' });
    if (path === '/me/handle') {
      const h = (body as { handle: string | null }).handle;
      return h === 'taken'
        ? Response.json({ error: 'handle_taken', error_description: 'taken' }, { status: 409 })
        : Response.json({ idz: 'I'.repeat(32), handle: h });
    }
    return Response.json({ error: 'not_found', error_description: 'nope' }, { status: 404 });
  };
  return { fetchImpl, calls };
}

beforeEach(async () => {
  const index = fakeIndex();
  setFetch(index.fetchImpl);
  setApiFetch(index.fetchImpl);
  await createIdentity({ indexUrl: INDEX, biometricRequired: false });
  (globalThis as { __calls?: unknown }).__calls = index.calls;
});

const calls = () =>
  (globalThis as { __calls?: { path: string; method: string; body: unknown }[] }).__calls ?? [];

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

  it('syncs a real APNs token once permissions are granted', async () => {
    await register({ platform: 'web', token: 'poll' });
    jest
      .mocked(Notifications.getPermissionsAsync)
      .mockResolvedValueOnce({ status: 'granted', granted: true } as never);
    jest
      .mocked(Notifications.getDevicePushTokenAsync)
      .mockResolvedValueOnce({ type: 'ios', data: 'abc123' });
    await syncPushToken();
    const push = calls().find((c) => c.path.endsWith('/push-token'));
    expect(push?.body).toMatchObject({
      push_token: 'abc123',
      push_platform: expect.stringMatching(/apns|fcm/),
    });
    expect((await readDevice())?.pushMode).toMatch(/apns|fcm/);
  });
});
