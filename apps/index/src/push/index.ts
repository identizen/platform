import type { Device } from '@identizen/db';
import { fromBase64Url, toBase64Url, utf8Encode } from '@identizen/protocol';
import { SignJWT, importPKCS8 } from 'jose';
import type { RequestGuard } from '../do/request-guard';
import type { Env } from '../env';

/** The only payload that transits APNs / FCM / Web Push (PROTOCOL.md section 7). */
export interface PushPayload {
  challenge_id: string;
}

export type PushTarget = Pick<Device, 'id' | 'pushToken' | 'pushPlatform'>;

export interface PushResult {
  ok: boolean;
  provider: string;
  detail?: string;
}

export interface PushSender {
  send: (device: PushTarget, payload: PushPayload) => Promise<PushResult>;
}

/** Dev / test: records sends, delivers nothing. */
export class NoopPushSender implements PushSender {
  readonly sent: { device: PushTarget; payload: PushPayload }[] = [];
  send(device: PushTarget, payload: PushPayload): Promise<PushResult> {
    this.sent.push({ device, payload });
    return Promise.resolve({ ok: true, provider: 'noop' });
  }
}

/**
 * Web platform. Two token shapes:
 * - an http(s) URL: plain JSON POST of the payload (used by the fake phone and local dev);
 * - a JSON PushSubscription `{ endpoint, keys: { p256dh, auth } }`: real Web Push (RFC 8291/8292)
 *   is wired in a later milestone; until then it is reported as unsupported rather than faked.
 */
export class WebPushSender implements PushSender {
  constructor(
    private readonly guards: DurableObjectNamespace<RequestGuard> | null = null,
    private readonly fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  ) {}
  async send(device: PushTarget, payload: PushPayload): Promise<PushResult> {
    const token = device.pushToken ?? '';
    if (token === 'poll') {
      if (!this.guards) return { ok: false, provider: 'web', detail: 'inbox unavailable' };
      await this.guards.getByName(device.id).enqueue(payload.challenge_id);
      return { ok: true, provider: 'web', detail: 'queued for polling' };
    }
    if (/^https?:\/\//.test(token)) {
      try {
        const res = await this.fetchImpl(token, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        return { ok: res.ok, provider: 'web', detail: `status ${res.status}` };
      } catch (err) {
        return { ok: false, provider: 'web', detail: String(err) };
      }
    }
    return { ok: false, provider: 'web', detail: 'web push subscriptions are not supported yet' };
  }
}

/** APNs HTTP/2 provider API with token-based (p8) auth. `[cc+human]`: needs keys and a real device. */
export class ApnsPushSender implements PushSender {
  constructor(
    private readonly cfg: {
      keyId: string;
      teamId: string;
      privateKeyPem: string;
      topic: string;
      sandbox: boolean;
    },
    private readonly fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  ) {}
  async send(device: PushTarget, payload: PushPayload): Promise<PushResult> {
    if (!device.pushToken) return { ok: false, provider: 'apns', detail: 'no token' };
    const key = await importPKCS8(this.cfg.privateKeyPem, 'ES256');
    const jwt = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: this.cfg.keyId })
      .setIssuer(this.cfg.teamId)
      .setIssuedAt()
      .sign(key);
    const host = this.cfg.sandbox ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';
    const res = await this.fetchImpl(`https://${host}/3/device/${device.pushToken}`, {
      method: 'POST',
      headers: {
        authorization: `bearer ${jwt}`,
        'apns-topic': this.cfg.topic,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        aps: {
          alert: { title: 'Identizen', body: 'Approve sign-in' },
          sound: 'default',
          'mutable-content': 1,
        },
        ...payload,
      }),
    });
    return { ok: res.ok, provider: 'apns', detail: `status ${res.status}` };
  }
}

/** FCM HTTP v1 with a service-account JWT. `[cc+human]`: needs a Firebase project. */
export class FcmPushSender implements PushSender {
  constructor(
    private readonly cfg: { projectId: string; clientEmail: string; privateKeyPem: string },
    private readonly fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  ) {}
  async send(device: PushTarget, payload: PushPayload): Promise<PushResult> {
    if (!device.pushToken) return { ok: false, provider: 'fcm', detail: 'no token' };
    const key = await importPKCS8(this.cfg.privateKeyPem, 'RS256');
    const assertion = await new SignJWT({
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(this.cfg.clientEmail)
      .setAudience('https://oauth2.googleapis.com/token')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key);
    const tokenRes = await this.fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    if (!tokenRes.ok) return { ok: false, provider: 'fcm', detail: `oauth ${tokenRes.status}` };
    const { access_token } = await tokenRes.json<{ access_token: string }>();
    const res = await this.fetchImpl(
      `https://fcm.googleapis.com/v1/projects/${this.cfg.projectId}/messages:send`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          message: {
            token: device.pushToken,
            data: payload,
            android: { priority: 'high' },
            notification: { title: 'Identizen', body: 'Approve sign-in' },
          },
        }),
      },
    );
    return { ok: res.ok, provider: 'fcm', detail: `status ${res.status}` };
  }
}

/** Queues for polling devices; hands everything else to the fallback. */
class PollOnlySender implements PushSender {
  constructor(
    private readonly guards: DurableObjectNamespace<RequestGuard>,
    private readonly fallback: PushSender,
  ) {}
  async send(device: PushTarget, payload: PushPayload): Promise<PushResult> {
    if (device.pushToken === 'poll') {
      await this.guards.getByName(device.id).enqueue(payload.challenge_id);
      return { ok: true, provider: 'web', detail: 'queued for polling' };
    }
    return this.fallback.send(device, payload);
  }
}

/**
 * Route by the device's platform. A platform with no configured provider (e.g. an APNs token on
 * an index without APNs keys) is reported as a failed push, never a silent success: the caller
 * has already queued the challenge in the device's inbox, and the log should say why the phone
 * was not woken. `fallback` only serves devices that registered no platform at all.
 */
export class RoutingPushSender implements PushSender {
  constructor(
    private readonly senders: Partial<Record<'apns' | 'fcm' | 'web', PushSender>>,
    private readonly fallback: PushSender,
  ) {}
  send(device: PushTarget, payload: PushPayload): Promise<PushResult> {
    if (!device.pushPlatform) return this.fallback.send(device, payload);
    const sender = this.senders[device.pushPlatform];
    if (!sender) {
      return Promise.resolve({
        ok: false,
        provider: device.pushPlatform,
        detail: `no ${device.pushPlatform} provider configured; inbox only`,
      });
    }
    return sender.send(device, payload);
  }
}

export function createPushSender(env: Env): PushSender {
  const noop = new NoopPushSender();
  if ((env.PUSH_PROVIDER ?? 'noop') === 'noop') {
    // Even with pushes disabled, polling devices (push_token 'poll') get their inbox.
    return new RoutingPushSender({ web: new PollOnlySender(env.REQUEST_GUARD, noop) }, noop);
  }
  const senders: Partial<Record<'apns' | 'fcm' | 'web', PushSender>> = {
    web: new WebPushSender(env.REQUEST_GUARD),
  };
  if (env.APNS_KEY_ID && env.APNS_TEAM_ID && env.APNS_PRIVATE_KEY && env.APNS_TOPIC) {
    senders.apns = new ApnsPushSender({
      keyId: env.APNS_KEY_ID,
      teamId: env.APNS_TEAM_ID,
      privateKeyPem: env.APNS_PRIVATE_KEY,
      topic: env.APNS_TOPIC,
      sandbox: env.APNS_SANDBOX === 'true',
    });
  }
  if (env.FCM_PROJECT_ID && env.FCM_SERVICE_ACCOUNT) {
    const sa = JSON.parse(env.FCM_SERVICE_ACCOUNT) as { client_email: string; private_key: string };
    senders.fcm = new FcmPushSender({
      projectId: env.FCM_PROJECT_ID,
      clientEmail: sa.client_email,
      privateKeyPem: sa.private_key,
    });
  }
  return new RoutingPushSender(senders, noop);
}

/** Helpers re-exported for tests that build fake subscriptions. */
export const pushEncoding = { fromBase64Url, toBase64Url, utf8Encode };
