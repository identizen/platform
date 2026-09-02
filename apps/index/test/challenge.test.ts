import { SELF, env, runDurableObjectAlarm } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { getBinding, listAuditForIdentity, listAuditForSite } from '@identizen/db';
import {
  challengeId,
  deriveSiteKey,
  fromBase64Url,
  signAssertion,
  verifyChallenge,
} from '@identizen/protocol';
import {
  BASE,
  approve,
  buildAssertion,
  dbHandle,
  fetchChallenge,
  json,
  registerPhone,
  registerSite,
  resetDb,
  signedFetch,
  startChallenge,
} from './helpers';

beforeEach(resetDb);

describe('ChallengeSession DO', () => {
  it('creates a signed challenge with a 60s TTL and serves it to the phone', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const started = await startChallenge({ client_id: site.client_id });
    expect(started.challenge_id).toMatch(/^ch_/);
    expect(started.code).toMatch(/^[0-9]{2}$/);
    expect(started.deep_link).toBe(`http://app.test/l/${started.challenge_id}`);
    expect(started.ws_url).toBe(`ws://index.test/challenge/${started.challenge_id}/ws`);
    expect(started.pushed).toBe(false);

    const fetched = await fetchChallenge(started.challenge_id);
    expect(fetched.status).toBe('pending');
    expect(fetched.payload.rp_id).toBe('app.example.com');
    expect(fetched.payload.rp_name).toBe('Example App');
    expect(fetched.payload.exp - fetched.payload.iat).toBe(60);
    expect(fetched.payload.acr).toBe('idz:login');
    expect(fetched.payload.reason).toBeNull();
    const v = verifyChallenge(
      { payload: fetched.payload, sig: fetched.sig },
      fromBase64Url(phone.indexPubkey),
      { index: BASE },
    );
    expect(v.ok).toBe(true);
  });

  it('carries acr and reason for step-up challenges', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    // bind first so login_hint resolves
    const first = await startChallenge({ client_id: site.client_id });
    const approved = await json<{ sub: string }>(await approve(phone, first.challenge_id));
    const mfa = await startChallenge({
      client_id: site.client_id,
      acr: 'idz:mfa',
      login_hint: approved.sub,
      reason: 'Approve wire of $12,000?',
    });
    expect(mfa.pushed).toBe(true);
    const fetched = await fetchChallenge(mfa.challenge_id);
    expect(fetched.payload.acr).toBe('idz:mfa');
    expect(fetched.payload.reason).toBe('Approve wire of $12,000?');
  });

  it('step-up on an unbound sub is login_required', async () => {
    const site = await registerSite();
    const res = await SELF.fetch(`${BASE}/challenge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: site.client_id,
        acr: 'idz:mfa',
        login_hint: 'A'.repeat(32),
      }),
    });
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ error: 'login_required' });
    const noHint = await SELF.fetch(`${BASE}/challenge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: site.client_id, acr: 'idz:mfa' }),
    });
    expect(await json(noHint)).toMatchObject({ error: 'login_hint_required' });
  });

  it('unknown client is 404; unknown challenge is 404', async () => {
    const res = await SELF.fetch(`${BASE}/challenge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: 'idz_live_nope' }),
    });
    expect(res.status).toBe(404);
    expect((await SELF.fetch(`${BASE}/challenge/${challengeId()}`)).status).toBe(404);
    expect((await SELF.fetch(`${BASE}/challenge/${challengeId()}/state`)).status).toBe(404);
  });

  it('expires at the alarm and notifies the browser over WebSocket', async () => {
    const site = await registerSite();
    const started = await startChallenge({ client_id: site.client_id });
    const stub = env.CHALLENGE_SESSION.getByName(started.challenge_id);

    const ws = await SELF.fetch(`${BASE}/challenge/${started.challenge_id}/ws`, {
      headers: { Upgrade: 'websocket' },
    });
    expect(ws.status).toBe(101);
    const socket = ws.webSocket;
    if (!socket) throw new Error('no websocket');
    socket.accept();
    const messages: string[] = [];
    const closed = new Promise<void>((resolve) => {
      socket.addEventListener('message', (e) => {
        messages.push(String(e.data));
      });
      socket.addEventListener('close', () => resolve());
    });

    expect(await runDurableObjectAlarm(stub)).toBe(true);
    await closed;
    const events = messages.map((m) => JSON.parse(m) as { type: string });
    expect(events[0]?.type).toBe('pending');
    expect(events.at(-1)?.type).toBe('expired');
    expect((await stub.getState())?.status).toBe('expired');

    const state = await json<{ status: string }>(
      await SELF.fetch(`${BASE}/challenge/${started.challenge_id}/state`),
    );
    expect(state.status).toBe('expired');
  });

  it('a non-websocket request to /ws is 426', async () => {
    const site = await registerSite();
    const started = await startChallenge({ client_id: site.client_id });
    expect((await SELF.fetch(`${BASE}/challenge/${started.challenge_id}/ws`)).status).toBe(426);
  });
});

describe('POST /challenge/:id/assert', () => {
  it('happy path: approves, binds TOFU, notifies WebSocket, audits login.success', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const started = await startChallenge({ client_id: site.client_id });

    const ws = await SELF.fetch(`${BASE}/challenge/${started.challenge_id}/ws`, {
      headers: { Upgrade: 'websocket' },
    });
    const socket = ws.webSocket;
    if (!socket) throw new Error('no websocket');
    socket.accept();
    const approvedEvent = new Promise<{ type: string; pairing: unknown }>((resolve) => {
      socket.addEventListener('message', (e) => {
        const ev = JSON.parse(String(e.data)) as { type: string; pairing: unknown };
        if (ev.type !== 'pending') resolve(ev);
      });
    });

    const res = await approve(phone, started.challenge_id);
    expect(res.status).toBe(200);
    const body = await json<{ status: string; sub: string; acr: string; pairing: unknown }>(res);
    expect(body.status).toBe('approved');
    expect(body.acr).toBe('idz:login');
    expect(body.pairing).toBeNull();
    const ev = await approvedEvent;
    expect(ev.type).toBe('approved');

    const h = dbHandle();
    try {
      const binding = await getBinding(h.db, 'app.example.com', body.sub);
      expect(binding?.idz).toBe(phone.idz);
      const audit = await listAuditForIdentity(h.db, phone.idz);
      expect(audit[0]?.kind).toBe('login.success');
      expect(audit[0]?.detail).toMatchObject({ binding_created: true, acr: 'idz:login' });
    } finally {
      await h.close();
    }

    // Second approval of the same challenge is refused.
    const again = await approve(phone, started.challenge_id, 2);
    expect(again.status).toBe(410);
    expect(await json(again)).toMatchObject({ error: 'challenge_approved' });
  });

  it('every failure branch returns the right 4xx and writes login.denied', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const other = await registerPhone();
    const h = dbHandle();
    const deniedCount = async () =>
      (await listAuditForSite(h.db, site.client_id)).filter((a) => a.kind === 'login.denied')
        .length;
    try {
      let expectedDenied = 0;

      // Wrong rp_id: sign for a different site.
      const s1 = await startChallenge({ client_id: site.client_id });
      const { payload: c1 } = await fetchChallenge(s1.challenge_id);
      const wrongRp = buildAssertion(phone, { ...c1, rp_id: 'evil.example.com' });
      const r1 = await signedFetch(phone, 'POST', `/challenge/${s1.challenge_id}/assert`, wrongRp);
      expect(r1.status).toBe(400);
      expect(await json(r1)).toMatchObject({ error: 'rp_id_mismatch' });
      expect(await deniedCount()).toBe(++expectedDenied);

      // Bad site signature: site_sig from another key.
      const goodPayload = buildAssertion(phone, c1).payload;
      const forged = signAssertion(
        goodPayload,
        deriveSiteKey(other.seed, 'app.example.com').privateKey,
        phone.device.privateKey,
      );
      const r2 = await signedFetch(phone, 'POST', `/challenge/${s1.challenge_id}/assert`, forged);
      expect(r2.status).toBe(401);
      expect(await json(r2)).toMatchObject({ error: 'bad_site_signature' });
      expect(await deniedCount()).toBe(++expectedDenied);

      // Device signature from a different device than device_id claims.
      const sigMismatch = signAssertion(
        goodPayload,
        deriveSiteKey(phone.seed, 'app.example.com').privateKey,
        other.device.privateKey,
      );
      const r3 = await signedFetch(
        phone,
        'POST',
        `/challenge/${s1.challenge_id}/assert`,
        sigMismatch,
      );
      expect(r3.status).toBe(401);
      expect(await json(r3)).toMatchObject({ error: 'bad_device_signature' });
      expect(await deniedCount()).toBe(++expectedDenied);

      // Assertion device_id != signing device -> 403 before verification.
      const otherClaims = buildAssertion(phone, c1, { deviceId: other.deviceId });
      const r4 = await signedFetch(
        phone,
        'POST',
        `/challenge/${s1.challenge_id}/assert`,
        otherClaims,
      );
      expect(r4.status).toBe(403);

      // Malformed body.
      const r5 = await signedFetch(phone, 'POST', `/challenge/${s1.challenge_id}/assert`, {
        payload: { device_id: phone.deviceId },
        site_sig: 'x',
      });
      expect(r5.status).toBe(400);
      expect(await json(r5)).toMatchObject({ error: 'malformed_assertion' });
      expect(await deniedCount()).toBe(++expectedDenied);

      // Expired iat.
      const late = buildAssertion(phone, c1, { iat: c1.exp + 100 });
      const r6 = await signedFetch(phone, 'POST', `/challenge/${s1.challenge_id}/assert`, late);
      expect(r6.status).toBe(400);
      expect(await json(r6)).toMatchObject({ error: 'iat_too_late' });
      expect(await deniedCount()).toBe(++expectedDenied);

      // Revoked device.
      const seed = phone.seed;
      const second = await registerPhone({ seed });
      await signedFetch(second, 'POST', `/devices/${phone.deviceId}/revoke`, {});
      const r7 = await signedFetch(
        phone,
        'POST',
        `/challenge/${s1.challenge_id}/assert`,
        buildAssertion(phone, c1),
      );
      expect(r7.status).toBe(403);
      expect(await json(r7)).toMatchObject({ error: 'device_inactive' });

      // TOFU conflict: bind sub with identity A, then identity B presents the same sub? Not possible
      // (sub is a key hash), so simulate: same identity, different site key for the same sub is
      // impossible too; the DB-level conflict is covered in db tests. Here: wrong device for an
      // MFA challenge targeted at another device.
      const bound = await startChallenge({ client_id: site.client_id });
      const approved = await json<{ sub: string }>(await approve(second, bound.challenge_id));
      const third = await registerPhone();
      const mfa = await startChallenge({
        client_id: site.client_id,
        acr: 'idz:mfa',
        login_hint: approved.sub,
      });
      const { payload: cm } = await fetchChallenge(mfa.challenge_id);
      const r8 = await signedFetch(
        third,
        'POST',
        `/challenge/${mfa.challenge_id}/assert`,
        buildAssertion(third, cm),
      );
      expect(r8.status).toBe(403);
      expect(await json(r8)).toMatchObject({ error: 'wrong_device' });

      // Expired challenge (alarm fired).
      const exp = await startChallenge({ client_id: site.client_id });
      await runDurableObjectAlarm(env.CHALLENGE_SESSION.getByName(exp.challenge_id));
      const r9 = await approve(second, exp.challenge_id);
      expect(r9.status).toBe(410);
      expect(await json(r9)).toMatchObject({ error: 'challenge_expired' });

      // Unknown challenge.
      const r10 = await signedFetch(
        second,
        'POST',
        `/challenge/${challengeId()}/assert`,
        buildAssertion(second, c1),
      );
      expect(r10.status).toBe(404);
    } finally {
      await h.close();
    }
  });

  it('deny resolves the session and notifies', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const started = await startChallenge({ client_id: site.client_id });
    const res = await signedFetch(phone, 'POST', `/challenge/${started.challenge_id}/deny`, {});
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ status: 'denied' });
    const state = await json<{ status: string }>(
      await SELF.fetch(`${BASE}/challenge/${started.challenge_id}/state`),
    );
    expect(state.status).toBe('denied');
    const again = await approve(phone, started.challenge_id, 2);
    expect(again.status).toBe(410);
  });

  it('issues a pairing when the browser supplied a key, and returns an OIDC redirect when asked', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const browserKey = (await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign', 'verify'],
    )) as CryptoKeyPair;
    const raw = new Uint8Array(
      (await crypto.subtle.exportKey('raw', browserKey.publicKey)) as ArrayBuffer,
    );
    const { toBase64Url } = await import('@identizen/protocol');
    const started = await startChallenge({
      client_id: site.client_id,
      browser_pubkey: toBase64Url(raw),
      redirect_uri: 'https://app.example.com/callback',
      state: 'xyz',
      code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      code_challenge_method: 'S256',
    });
    const res = await approve(phone, started.challenge_id);
    const body = await json<{
      pairing: { payload: { pairing_id: string; device_id: string }; sig: string } | null;
      redirect: string | null;
    }>(res);
    expect(body.pairing?.payload.device_id).toBe(phone.deviceId);
    expect(body.pairing?.payload.pairing_id).toMatch(/^pr_/);
    expect(body.redirect).toMatch(
      /^https:\/\/app\.example\.com\/callback\?code=[A-Za-z0-9_-]+&state=xyz$/,
    );
    const pairings = await json<{ pairings: { id: string; label: string | null }[] }>(
      await signedFetch(phone, 'GET', '/me/pairings'),
    );
    expect(pairings.pairings).toHaveLength(1);
  });
});
