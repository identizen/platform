import { SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { listAuditForIdentity } from '@identizen/db';
import {
  deriveMasterKey,
  generateKeyPair,
  generateSeed,
  signIdentityProof,
  signRequest,
  toBase64Url,
} from '@identizen/protocol';
import { BASE, dbHandle, json, registerPhone, resetDb, signedFetch } from './helpers';

beforeEach(resetDb);

describe('POST /devices', () => {
  it('registers device + identity, returns ids and the pinned index key', async () => {
    const phone = await registerPhone({ handle: 'george' });
    expect(phone.deviceId).toMatch(/^dev_/);
    expect(phone.idz).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(phone.indexPubkey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const h = dbHandle();
    try {
      const audit = await listAuditForIdentity(h.db, phone.idz);
      expect(audit.map((a) => a.kind).sort()).toEqual(['device.enrolled', 'identity.created']);
    } finally {
      await h.close();
    }
  });

  it('a second device for the same seed joins the existing identity', async () => {
    const seed = generateSeed();
    const a = await registerPhone({ seed });
    const b = await registerPhone({ seed });
    expect(a.idz).toBe(b.idz);
    expect(a.deviceId).not.toBe(b.deviceId);
    const res = await signedFetch(a, 'GET', '/me/devices');
    const body = await json<{ devices: { id: string; current: boolean }[] }>(res);
    expect(body.devices.map((d) => d.id).sort()).toEqual([a.deviceId, b.deviceId].sort());
    expect(body.devices.find((d) => d.id === a.deviceId)?.current).toBe(true);
  });

  it('rejects a bad identity proof and a taken handle', async () => {
    const master = deriveMasterKey(generateSeed());
    const device = generateKeyPair();
    const bad = await SELF.fetch(`${BASE}/devices`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        device_pubkey: toBase64Url(device.publicKey),
        master_pubkey: toBase64Url(master.publicKey),
        master_sig: signIdentityProof('A'.repeat(43), master.privateKey),
      }),
    });
    expect(bad.status).toBe(400);
    expect(await json(bad)).toMatchObject({ error: 'bad_identity_proof' });

    await registerPhone({ handle: 'taken' });
    const master2 = deriveMasterKey(generateSeed());
    const device2 = generateKeyPair();
    const dup = await SELF.fetch(`${BASE}/devices`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        device_pubkey: toBase64Url(device2.publicKey),
        master_pubkey: toBase64Url(master2.publicKey),
        master_sig: signIdentityProof(toBase64Url(device2.publicKey), master2.privateKey),
        handle: 'taken',
      }),
    });
    expect(dup.status).toBe(409);
    expect(await json(dup)).toMatchObject({ error: 'handle_taken' });
  });

  it('validates the body', async () => {
    const res = await SELF.fetch(`${BASE}/devices`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ device_pubkey: 'short' }),
    });
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ error: 'invalid_request' });
  });
});

describe('Idz-Signature middleware', () => {
  it('valid signature passes; replayed timestamp fails; wrong key fails; stale fails', async () => {
    const phone = await registerPhone();
    const t = Math.floor(Date.now() / 1000);
    const ok = await signedFetch(phone, 'GET', '/me/devices', undefined, t - 1);
    expect(ok.status).toBe(200);

    // Exact replay (same timestamp, same signature) is rejected.
    const header = signRequest(
      { method: 'GET', path: '/me/devices', body: '', timestamp: t },
      phone.deviceId,
      phone.device.privateKey,
    );
    const first = await SELF.fetch(`${BASE}/me/devices`, { headers: { 'Idz-Signature': header } });
    expect(first.status).toBe(200);
    const replay = await SELF.fetch(`${BASE}/me/devices`, { headers: { 'Idz-Signature': header } });
    expect(replay.status).toBe(401);
    expect(await json(replay)).toMatchObject({ error: 'replayed_request' });

    // Wrong key.
    const impostor = { ...phone, device: generateKeyPair() };
    const wrong = await signedFetch(impostor, 'GET', '/me/devices');
    expect(wrong.status).toBe(401);
    expect(await json(wrong)).toMatchObject({ error: 'bad_signature' });

    // Stale timestamp.
    const stale = await signedFetch(phone, 'GET', '/me/devices', undefined, t - 600);
    expect(stale.status).toBe(401);
    expect(await json(stale)).toMatchObject({
      error: 'bad_signature',
      error_description: expect.stringContaining('stale'),
    });

    // Missing / malformed header, unknown device.
    expect((await SELF.fetch(`${BASE}/me/devices`)).status).toBe(401);
    expect(
      (
        await SELF.fetch(`${BASE}/me/devices`, {
          headers: { 'Idz-Signature': 'v1,d=dev_nope,t=1,s=x' },
        })
      ).status,
    ).toBe(401);

    // Body is covered by the signature.
    const bodyHeader = signRequest(
      { method: 'POST', path: '/identities', body: '{"handle":"a"}', timestamp: t + 1 },
      phone.deviceId,
      phone.device.privateKey,
    );
    const tampered = await SELF.fetch(`${BASE}/identities`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idz-Signature': bodyHeader },
      body: '{"handle":"b"}',
    });
    expect(tampered.status).toBe(401);
  });

  it('inactive devices are refused', async () => {
    const seed = generateSeed();
    const a = await registerPhone({ seed });
    const b = await registerPhone({ seed });
    const revoke = await signedFetch(a, 'POST', `/devices/${b.deviceId}/revoke`, {});
    expect(revoke.status).toBe(200);
    expect(await json(revoke)).toMatchObject({ device_id: b.deviceId, status: 'revoked' });
    const denied = await signedFetch(b, 'GET', '/me/devices');
    expect(denied.status).toBe(403);
    expect(await json(denied)).toMatchObject({ error: 'device_inactive' });
    // /me still answers so a revoked phone can learn its state.
    const me = await signedFetch(b, 'GET', '/me');
    expect(me.status).toBe(200);
    expect(await json(me)).toMatchObject({ device: { status: 'revoked' } });
  });

  it("cannot revoke another identity's device", async () => {
    const a = await registerPhone();
    const b = await registerPhone();
    const res = await signedFetch(a, 'POST', `/devices/${b.deviceId}/revoke`, {});
    expect(res.status).toBe(403);
  });
});

describe('identities and handles', () => {
  it('registers, changes, clears a handle; duplicates 409', async () => {
    const a = await registerPhone();
    const b = await registerPhone();
    const set = await signedFetch(a, 'POST', '/identities', { handle: 'george' });
    expect(set.status).toBe(200);
    expect(await json(set)).toMatchObject({ idz: a.idz, handle: 'george' });
    const dup = await signedFetch(b, 'POST', '/identities', { handle: 'george' });
    expect(dup.status).toBe(409);
    expect(await json(dup)).toMatchObject({ error: 'handle_taken' });
    const clear = await signedFetch(a, 'POST', '/identities', { handle: null });
    expect(await json(clear)).toMatchObject({ handle: null });
    const now = await signedFetch(
      b,
      'POST',
      '/identities',
      { handle: 'george' },
      Math.floor(Date.now() / 1000) + 1,
    );
    expect(now.status).toBe(200);
    const bad = await signedFetch(b, 'POST', '/identities', { handle: 'x' });
    expect(bad.status).toBe(400);
  });

  it('push token update requires the same device', async () => {
    const a = await registerPhone();
    const b = await registerPhone();
    const ok = await signedFetch(a, 'POST', `/devices/${a.deviceId}/push-token`, {
      push_token: 'tok',
      push_platform: 'apns',
    });
    expect(ok.status).toBe(200);
    expect(await json(ok)).toMatchObject({ push_platform: 'apns' });
    const other = await signedFetch(a, 'POST', `/devices/${b.deviceId}/push-token`, {
      push_token: 'tok',
      push_platform: 'apns',
    });
    expect(other.status).toBe(403);
  });
});
