import { describe, expect, it } from 'vitest';
import { ExpoPushSender, NoopPushSender, RoutingPushSender, isExpoPushToken } from '../src/push';

const payload = { challenge_id: 'ch_01K3ZB2N9G0000000000000000' };

function fakeFetch(reply: (req: { url: string; init: RequestInit }) => Response) {
  const seen: { url: string; init: RequestInit }[] = [];
  const fetchImpl: typeof fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const req = { url, init: init ?? {} };
    seen.push(req);
    return Promise.resolve(reply(req));
  };
  return { fetchImpl, seen };
}

describe('Expo push relay', () => {
  it('recognises Expo push tokens and nothing else', () => {
    expect(isExpoPushToken('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]')).toBe(true);
    expect(isExpoPushToken('ExpoPushToken[abc]')).toBe(true);
    expect(isExpoPushToken('a'.repeat(64))).toBe(false);
    expect(isExpoPushToken('poll')).toBe(false);
    expect(isExpoPushToken(null)).toBe(false);
  });

  it('posts only the challenge id, with the access token when configured', async () => {
    const { fetchImpl, seen } = fakeFetch(() =>
      Response.json({ data: { status: 'ok', id: 'ticket' } }),
    );
    const sender = new ExpoPushSender('expo-secret', fetchImpl);
    const result = await sender.send(
      { id: 'dev_1', pushToken: 'ExponentPushToken[abc]', pushPlatform: 'apns' },
      payload,
    );
    expect(result).toEqual({ ok: true, provider: 'expo' });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe('https://exp.host/--/api/v2/push/send');
    const headers = seen[0]?.init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer expo-secret');
    const body = JSON.parse(seen[0]?.init.body as string) as { to: string; data: unknown };
    expect(body.to).toBe('ExponentPushToken[abc]');
    expect(body.data).toEqual(payload);
    expect(JSON.stringify(body)).not.toMatch(/rp_|code|nonce/);
  });

  it('reports a rejected ticket or transport failure as a failed push', async () => {
    const rejected = new ExpoPushSender(
      null,
      fakeFetch(() => Response.json({ data: { status: 'error', message: 'DeviceNotRegistered' } }))
        .fetchImpl,
    );
    expect(
      await rejected.send(
        { id: 'dev_1', pushToken: 'ExponentPushToken[abc]', pushPlatform: 'apns' },
        payload,
      ),
    ).toMatchObject({ ok: false, provider: 'expo', detail: 'DeviceNotRegistered' });

    const down = new ExpoPushSender(null, () => Promise.reject(new Error('boom')));
    expect(
      await down.send(
        { id: 'dev_1', pushToken: 'ExponentPushToken[abc]', pushPlatform: 'apns' },
        payload,
      ),
    ).toMatchObject({ ok: false, provider: 'expo' });
  });
});

describe('routing', () => {
  it('sends Expo tokens to the relay whatever platform they registered under', async () => {
    const { fetchImpl, seen } = fakeFetch(() => Response.json({ data: { status: 'ok' } }));
    const noop = new NoopPushSender();
    const router = new RoutingPushSender({ expo: new ExpoPushSender(null, fetchImpl) }, noop);
    const viaExpo = await router.send(
      { id: 'dev_1', pushToken: 'ExponentPushToken[abc]', pushPlatform: 'fcm' },
      payload,
    );
    expect(viaExpo.ok).toBe(true);
    expect(seen).toHaveLength(1);
  });

  it('reports an unconfigured platform as a failed push instead of a silent success', async () => {
    const noop = new NoopPushSender();
    const router = new RoutingPushSender({}, noop);
    const result = await router.send(
      { id: 'dev_1', pushToken: 'a'.repeat(64), pushPlatform: 'apns' },
      payload,
    );
    expect(result).toMatchObject({ ok: false, provider: 'apns' });
    expect(noop.sent).toHaveLength(0);

    const untyped = await router.send(
      { id: 'dev_2', pushToken: null, pushPlatform: null },
      payload,
    );
    expect(untyped.ok).toBe(true);
    expect(noop.sent).toHaveLength(1);
  });
});
