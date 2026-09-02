import { Hono } from 'hono';
import { serve, type ServerType } from '@hono/node-server';
import type { FakePhone, Policy } from './phone.js';
import { renderUi } from './ui.js';

export interface PhoneServerOptions {
  phone: FakePhone;
  port: number;
  hostname?: string;
}

/**
 * HTTP surface of the fake phone.
 *  POST /push            {challenge_id}   <- the index (web push token)
 *  POST /scan            {url | challenge_id}  simulate scanning a QR / opening a deep link
 *  POST /approve/:id, POST /deny/:id        manual policy
 *  POST /policy          {policy}
 *  GET  /state, GET /log, GET /pending
 *  POST /reset           {handle?}         new identity, re-registers
 *  POST /revoke-self                       second device revokes this one
 *  POST /me/pairings/:id/revoke, POST /me/sessions/:sid/revoke
 *  GET  /                browser UI
 */
export function createPhoneApp(phone: FakePhone): Hono {
  const app = new Hono();

  app.get('/', (c) => c.html(renderUi()));
  app.get('/health', (c) => c.json({ ok: true, registered: phone.registered }));
  app.get('/state', (c) =>
    c.json({
      registered: phone.registered,
      device_id: phone.deviceId,
      idz: phone.idz,
      handle: phone.snapshot.handle,
      policy: phone.policy,
      index: phone.indexUrl,
      pending: [...phone.pending.entries()].map(([id, p]) => ({
        challenge_id: id,
        ...p.challenge,
        via: p.via,
      })),
    }),
  );
  app.get('/pending', (c) =>
    c.json({
      pending: [...phone.pending.entries()].map(([id, p]) => ({
        challenge_id: id,
        ...p.challenge,
        via: p.via,
      })),
    }),
  );
  app.get('/log', (c) => c.json({ log: phone.log }));
  app.get('/mnemonic', (c) => c.json({ mnemonic: phone.mnemonic }));

  app.post('/push', async (c) => {
    const body = await c.req.json<{ challenge_id?: string }>();
    if (!body.challenge_id) return c.json({ error: 'challenge_id required' }, 400);
    try {
      const p = await phone.onPush(body.challenge_id);
      return c.json({ ok: true, challenge_id: body.challenge_id, code: p.challenge.code });
    } catch (err) {
      return c.json({ ok: false, error: String(err) }, 400);
    }
  });

  app.post('/scan', async (c) => {
    const body = await c.req.json<{ url?: string; challenge_id?: string }>();
    const input = body.url ?? body.challenge_id;
    if (!input) return c.json({ error: 'url or challenge_id required' }, 400);
    try {
      const p = await phone.scan(input);
      return c.json({
        ok: true,
        challenge_id: p.challenge.id,
        code: p.challenge.code,
        rp_name: p.challenge.rp_name,
        acr: p.challenge.acr,
        reason: p.challenge.reason,
      });
    } catch (err) {
      return c.json({ ok: false, error: String(err) }, 400);
    }
  });

  app.post('/approve/:id', async (c) => {
    try {
      const r = await phone.approve(c.req.param('id'));
      return c.json(r.body, r.status as 200);
    } catch (err) {
      return c.json({ error: String(err) }, 400);
    }
  });
  app.post('/deny/:id', async (c) => {
    try {
      const r = await phone.deny(c.req.param('id'));
      return c.json(r.body, r.status as 200);
    } catch (err) {
      return c.json({ error: String(err) }, 400);
    }
  });

  app.post('/policy', async (c) => {
    const body = await c.req.json<{ policy?: Policy }>();
    if (!body.policy || !['approve', 'deny', 'ignore', 'manual'].includes(body.policy))
      return c.json({ error: 'bad policy' }, 400);
    phone.policy = body.policy;
    return c.json({ policy: phone.policy });
  });

  app.post('/reset', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { handle?: string | null };
    phone.reset(body.handle ?? null);
    await phone.register();
    return c.json({ device_id: phone.deviceId, idz: phone.idz });
  });

  app.post('/revoke-self', async (c) => {
    const other = await phone.revokeSelfFromNewDevice();
    return c.json({ revoked: phone.deviceId, by: other.deviceId });
  });

  app.get('/me', async (c) => c.json(await phone.me()));
  app.get('/me/pairings', async (c) => c.json({ pairings: await phone.pairings() }));
  app.get('/me/sessions', async (c) => c.json({ sessions: await phone.sessions() }));
  app.post('/me/pairings/:id/revoke', async (c) =>
    c.json({ status: await phone.revokePairing(c.req.param('id')) }),
  );
  app.post('/me/sessions/:sid/revoke', async (c) =>
    c.json({ status: await phone.revokeSession(c.req.param('sid')) }),
  );

  return app;
}

export function startPhoneServer(opts: PhoneServerOptions): ServerType {
  const app = createPhoneApp(opts.phone);
  return serve({ fetch: app.fetch, port: opts.port, hostname: opts.hostname ?? '127.0.0.1' });
}
