import { http, HttpResponse, type HttpHandler } from 'msw';
import { freshFixtures, mockIdToken, type Fixtures } from './fixtures';

/**
 * In-memory mock of the index endpoints the dashboard uses. `state` is mutable so tests can
 * reset it; the browser worker and the Node server share this module.
 */
export const state: { fixtures: Fixtures } = { fixtures: freshFixtures() };

export function resetFixtures(): void {
  state.fixtures = freshFixtures();
}

function authorized(request: Request): boolean {
  const auth = request.headers.get('authorization') ?? '';
  return auth === `Bearer mock-access-token`;
}

const unauthorized = () =>
  HttpResponse.json(
    { error: 'invalid_token', error_description: 'access token is invalid or expired' },
    { status: 401 },
  );

export function createHandlers(indexUrl: string): HttpHandler[] {
  const u = (p: string) => `${indexUrl}${p}`;
  return [
    http.post(u('/sites'), () =>
      HttpResponse.json({ client_id: 'idz_test_dashboard', client_secret: null }, { status: 201 }),
    ),

    http.post(u('/token'), async ({ request }) => {
      const form = new URLSearchParams(await request.text());
      if (form.get('code') !== 'good-code') {
        return HttpResponse.json(
          { error: 'invalid_grant', error_description: 'bad code' },
          { status: 400 },
        );
      }
      // Tests seed the OIDC transaction with this nonce; the mock echoes it in the id_token.
      return HttpResponse.json({
        access_token: 'mock-access-token',
        id_token: mockIdToken('mock-nonce'),
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'openid handle',
      });
    }),

    http.get(u('/me'), ({ request }) =>
      authorized(request) ? HttpResponse.json(state.fixtures.me) : unauthorized(),
    ),
    http.get(u('/me/devices'), ({ request }) =>
      authorized(request) ? HttpResponse.json({ devices: state.fixtures.devices }) : unauthorized(),
    ),
    http.get(u('/me/pairings'), ({ request }) =>
      authorized(request)
        ? HttpResponse.json({ pairings: state.fixtures.pairings })
        : unauthorized(),
    ),
    http.get(u('/me/sessions'), ({ request }) =>
      authorized(request)
        ? HttpResponse.json({ sessions: state.fixtures.sessions })
        : unauthorized(),
    ),
    http.get(u('/me/audit'), ({ request }) =>
      authorized(request) ? HttpResponse.json({ events: state.fixtures.audit }) : unauthorized(),
    ),

    http.post(u('/me/handle'), async ({ request }) => {
      if (!authorized(request)) return unauthorized();
      const body = (await request.json()) as { handle: string | null };
      if (body.handle === 'taken')
        return HttpResponse.json(
          { error: 'handle_taken', error_description: 'handle already taken: taken' },
          { status: 409 },
        );
      state.fixtures.me.handle = body.handle;
      state.fixtures.audit.unshift({
        id: 100 + state.fixtures.audit.length,
        at: new Date().toISOString(),
        kind: 'identity.handle_changed',
        device_id: null,
        client_id: null,
        detail: { handle: body.handle },
      });
      return HttpResponse.json({ idz: state.fixtures.me.idz, handle: body.handle });
    }),

    http.post(u('/me/devices/:id/revoke'), ({ request, params }) => {
      if (!authorized(request)) return unauthorized();
      const d = state.fixtures.devices.find((x) => x.id === params.id);
      if (!d) return HttpResponse.json({ error: 'not_your_device' }, { status: 403 });
      d.status = 'revoked';
      const ended = state.fixtures.sessions.filter((s) => s.device_id === d.id).length;
      state.fixtures.sessions = state.fixtures.sessions.filter((s) => s.device_id !== d.id);
      for (const p of state.fixtures.pairings) if (p.device_id === d.id) p.status = 'revoked';
      return HttpResponse.json({ device_id: d.id, status: 'revoked', sessions_revoked: ended });
    }),

    http.post(u('/me/pairings/:id/revoke'), ({ request, params }) => {
      if (!authorized(request)) return unauthorized();
      const p = state.fixtures.pairings.find((x) => x.id === params.id);
      if (!p) return HttpResponse.json({ error: 'unknown_pairing' }, { status: 404 });
      p.status = 'revoked';
      return HttpResponse.json({ id: p.id, status: 'revoked' });
    }),

    http.post(u('/me/sessions/:sid/revoke'), ({ request, params }) => {
      if (!authorized(request)) return unauthorized();
      const i = state.fixtures.sessions.findIndex((x) => x.sid === params.sid);
      if (i < 0) return HttpResponse.json({ error: 'unknown_session' }, { status: 404 });
      state.fixtures.sessions.splice(i, 1);
      return HttpResponse.json({ sid: params.sid, revoked_at: new Date().toISOString() });
    }),

    http.get(u('/challenge/:id/state'), ({ params }) => {
      const c = state.fixtures.challenges[String(params.id)];
      if (!c) return HttpResponse.json({ error: 'unknown_challenge' }, { status: 404 });
      return HttpResponse.json({ challenge_id: params.id, status: c.status, redirect: null });
    }),
    http.get(u('/challenge/:id'), ({ params }) => {
      const c = state.fixtures.challenges[String(params.id)];
      if (!c) return HttpResponse.json({ error: 'unknown_challenge' }, { status: 404 });
      return HttpResponse.json({ ...c });
    }),
  ];
}
