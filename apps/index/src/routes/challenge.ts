import { recordAudit } from '@identizen/db';
import { AcrSchema, REASON_MAX_LENGTH } from '@identizen/protocol';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../app';
import { forbidden, notFound } from '../lib/errors';
import { browserLabel } from '../lib/util';
import { deviceAuth } from '../middleware/idz-signature';
import { processAssertion } from '../services/assert';
import { completeApproval, onSessionDenied } from '../services/sessions';
import { startChallenge } from '../services/challenge';

const StartSchema = z
  .object({
    client_id: z.string().min(1),
    acr: AcrSchema.default('idz:login'),
    reason: z.string().min(1).max(REASON_MAX_LENGTH).nullable().optional(),
    login_hint: z.string().min(1).optional(),
    browser_pubkey: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
    redirect_uri: z.string().url().optional(),
    state: z.string().max(512).optional(),
    nonce: z.string().max(512).optional(),
    code_challenge: z.string().min(43).max(128).optional(),
    code_challenge_method: z.literal('S256').optional(),
    scope: z.string().max(256).optional(),
    prompt: z.enum(['enroll', 'login', 'none', 'consent']).optional(),
  })
  .strict();

export function challengeRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  /**
   * Start a login (the JSON twin of `/authorize`; the SDK and `/authorize` both use it).
   * Returns the ids the browser needs; the phone fetches the signed challenge itself.
   */
  r.post('/challenge', async (c) => {
    const services = c.get('services');
    const body = StartSchema.parse(await c.req.json());
    const result = await startChallenge(
      services,
      {
        clientId: body.client_id,
        acr: body.acr,
        reason: body.reason ?? null,
        loginHint: body.login_hint ?? null,
        browserPubkey: body.browser_pubkey ?? null,
        oidc: body.redirect_uri
          ? {
              client_id: body.client_id,
              ...(body.redirect_uri !== undefined && { redirect_uri: body.redirect_uri }),
              ...(body.state !== undefined && { state: body.state }),
              ...(body.nonce !== undefined && { nonce: body.nonce }),
              ...(body.code_challenge !== undefined && { code_challenge: body.code_challenge }),
              ...(body.code_challenge_method !== undefined && {
                code_challenge_method: body.code_challenge_method,
              }),
              ...(body.scope !== undefined && { scope: body.scope }),
              ...(body.prompt !== undefined && { prompt: body.prompt }),
              ...(body.login_hint !== undefined && { login_hint: body.login_hint }),
            }
          : null,
      },
      c.env,
    );
    const id = result.signed.payload.id;
    const wsUrl = new URL(`/challenge/${id}/ws`, services.indexUrl);
    wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    return c.json(
      {
        challenge_id: id,
        code: result.signed.payload.code,
        exp: result.signed.payload.exp,
        acr: result.signed.payload.acr,
        rp_name: result.site.name,
        deep_link: `${services.appUrl}/l/${id}`,
        ws_url: wsUrl.toString(),
        pushed: result.pushedTo !== null,
      },
      201,
    );
  });

  /** Phone fetches the signed challenge (after push, deep link, or QR). */
  r.get('/challenge/:id', async (c) => {
    const stub = c.env.CHALLENGE_SESSION.getByName(c.req.param('id'));
    const [signed, state] = await Promise.all([stub.getSigned(), stub.getState()]);
    if (!signed || !state) throw notFound('unknown_challenge', 'no such challenge');
    return c.json({ ...signed, status: state.status });
  });

  /** Browser polls (fallback for environments without WebSocket). */
  r.get('/challenge/:id/state', async (c) => {
    const stub = c.env.CHALLENGE_SESSION.getByName(c.req.param('id'));
    const state = await stub.getState();
    if (!state) throw notFound('unknown_challenge', 'no such challenge');
    return c.json({
      challenge_id: state.challengeId,
      status: state.status,
      pairing: state.pairing,
    });
  });

  /** Hosted page: attach the browser P-256 key so approval issues a pairing. */
  r.post('/challenge/:id/browser-key', async (c) => {
    const body = z
      .object({ browser_pubkey: z.string().regex(/^[A-Za-z0-9_-]{80,100}$/) })
      .strict()
      .parse(await c.req.json());
    const stub = c.env.CHALLENGE_SESSION.getByName(c.req.param('id'));
    const state = await stub.getState();
    if (!state) throw notFound('unknown_challenge', 'no such challenge');
    const ok = await stub.setBrowserPubkey(body.browser_pubkey);
    return c.json({ ok });
  });

  /** Browser WebSocket to the session DO. */
  r.get('/challenge/:id/ws', (c) => {
    const stub = c.env.CHALLENGE_SESSION.getByName(c.req.param('id'));
    return stub.fetch(c.req.raw);
  });

  /** Phone submits the signed assertion. Signed request (device auth) + double-signed body. */
  r.post('/challenge/:id/assert', deviceAuth(), async (c) => {
    const services = c.get('services');
    const id = c.req.param('id');
    const stub = c.env.CHALLENGE_SESSION.getByName(id);
    const body: unknown = JSON.parse(c.get('rawBody') || '{}');
    const caller = c.get('device');
    const claimed = (body as { payload?: { device_id?: string } }).payload?.device_id;
    if (claimed !== caller.id)
      throw forbidden('wrong_device', 'assertion device_id does not match the signing device');
    const outcome = await processAssertion(services, stub, id, body, {
      browserLabel: browserLabel(c.req.header('user-agent')),
    });
    const completed = await completeApproval(services, c.env, stub, outcome);
    return c.json({
      status: 'approved',
      challenge_id: id,
      sub: outcome.assertion.sub,
      acr: outcome.assertion.acr,
      pairing: outcome.pairing,
      redirect: completed.redirect,
    });
  });

  /** Phone declines. */
  r.post('/challenge/:id/deny', deviceAuth(), async (c) => {
    const { db } = c.get('services');
    const id = c.req.param('id');
    const stub = c.env.CHALLENGE_SESSION.getByName(id);
    const state = await stub.getState();
    if (!state) throw notFound('unknown_challenge', 'no such challenge');
    if (state.status !== 'pending') return c.json({ status: state.status, challenge_id: id });
    const device = c.get('device');
    await stub.deny();
    await recordAudit(db, {
      kind: 'login.denied',
      idz: device.idz,
      deviceId: device.id,
      clientId: state.clientId,
      detail: { challenge_id: id, reason: 'user_denied' },
    });
    await onSessionDenied(c.get('services'), state);
    return c.json({ status: 'denied', challenge_id: id });
  });

  return r;
}
