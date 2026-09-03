import { SELF, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  challengeId,
  pairedSignatureBytes,
  rotatingBleIdString,
  toBase64Url,
} from '@identizen/protocol';
import {
  BASE,
  approve,
  json,
  registerPhone,
  registerSite,
  resetDb,
  signedFetch,
  startChallenge,
} from './helpers';

beforeEach(resetDb);

async function post(path: string, body: unknown): Promise<Response> {
  return SELF.fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /discover/ble', () => {
  it('resolves the current and +/-1 windows and pushes; unknown and disabled -> 404', async () => {
    const site = await registerSite();
    const phone = await registerPhone({ pushToken: 'http://phone.test/push' });
    const now = Math.floor(Date.now() / 1000);
    for (const offset of [0, -900, 900]) {
      const started = await startChallenge({ client_id: site.client_id });
      const res = await post('/discover/ble', {
        challenge_id: started.challenge_id,
        rotating_id: rotatingBleIdString(phone.bleKey, now + offset),
      });
      expect(res.status, `offset ${offset}`).toBe(202);
      const state = await env.CHALLENGE_SESSION.getByName(started.challenge_id).getState();
      expect(state?.targetDeviceId).toBe(phone.deviceId);
    }
    const far = await startChallenge({ client_id: site.client_id });
    expect(
      (
        await post('/discover/ble', {
          challenge_id: far.challenge_id,
          rotating_id: rotatingBleIdString(phone.bleKey, now + 1800),
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await post('/discover/ble', {
          challenge_id: far.challenge_id,
          rotating_id: toBase64Url(new Uint8Array(16)),
        })
      ).status,
    ).toBe(404);

    // Disabled device: revoke via a second device.
    const second = await registerPhone({ seed: phone.seed });
    await signedFetch(second, 'POST', `/devices/${phone.deviceId}/revoke`, {});
    const after = await startChallenge({ client_id: site.client_id });
    expect(
      (
        await post('/discover/ble', {
          challenge_id: after.challenge_id,
          rotating_id: rotatingBleIdString(phone.bleKey, now),
        })
      ).status,
    ).toBe(404);

    // Unknown challenge.
    expect(
      (
        await post('/discover/ble', {
          challenge_id: challengeId(),
          rotating_id: rotatingBleIdString(second.bleKey, now),
        })
      ).status,
    ).toBe(404);
  });

  it('rate-limits pushes to one device', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const now = Math.floor(Date.now() / 1000);
    let limited = 0;
    for (let i = 0; i < 12; i++) {
      const started = await startChallenge({ client_id: site.client_id });
      const res = await post('/discover/ble', {
        challenge_id: started.challenge_id,
        rotating_id: rotatingBleIdString(phone.bleKey, now),
      });
      if (res.status === 429) limited++;
    }
    expect(limited).toBeGreaterThan(0);
  });
});

describe('POST /discover/paired', () => {
  async function browserKeyPair() {
    const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
      'sign',
      'verify',
    ]);
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key.publicKey));
    const sign = async (cid: string) =>
      toBase64Url(
        new Uint8Array(
          await crypto.subtle.sign(
            { name: 'ECDSA', hash: 'SHA-256' },
            key.privateKey,
            new Uint8Array(pairedSignatureBytes(cid)),
          ),
        ),
      );
    return { raw, sign };
  }

  it('paired login pushes without discovery; revoked pairing -> 401; revoked device -> pairings inactive', async () => {
    const site = await registerSite();
    const phone = await registerPhone();
    const browser = await browserKeyPair();

    // First login with QR + browser key -> pairing issued.
    const first = await startChallenge({
      client_id: site.client_id,
      browser_pubkey: toBase64Url(browser.raw),
    });
    const approved = await json<{ pairing: { payload: { pairing_id: string } } }>(
      await approve(phone, first.challenge_id),
    );
    const pairingId = approved.pairing.payload.pairing_id;

    // Second login: paired discovery pushes straight to the device.
    const second = await startChallenge({ client_id: site.client_id });
    const res = await post('/discover/paired', {
      challenge_id: second.challenge_id,
      pairing_id: pairingId,
      sig: await browser.sign(second.challenge_id),
    });
    expect(res.status).toBe(202);
    expect(
      (await env.CHALLENGE_SESSION.getByName(second.challenge_id).getState())?.targetDeviceId,
    ).toBe(phone.deviceId);
    expect(
      (
        await json<{ challenge_ids: string[] }>(
          await signedFetch(phone, 'GET', `/devices/${phone.deviceId}/inbox`),
        )
      ).challenge_ids,
    ).toEqual([second.challenge_id]);
    expect((await approve(phone, second.challenge_id)).status).toBe(200);

    // Wrong signature / wrong challenge id in signature.
    const third = await startChallenge({ client_id: site.client_id });
    const bad = await post('/discover/paired', {
      challenge_id: third.challenge_id,
      pairing_id: pairingId,
      sig: await browser.sign(second.challenge_id),
    });
    expect(bad.status).toBe(401);
    expect(await json(bad)).toMatchObject({ error: 'bad_signature' });

    // Revoke the pairing -> 401.
    const revoke = await signedFetch(phone, 'POST', `/me/pairings/${pairingId}/revoke`, {});
    expect(revoke.status).toBe(200);
    const afterRevoke = await post('/discover/paired', {
      challenge_id: third.challenge_id,
      pairing_id: pairingId,
      sig: await browser.sign(third.challenge_id),
    });
    expect(afterRevoke.status).toBe(401);
    expect(await json(afterRevoke)).toMatchObject({ error: 'pairing_inactive' });

    // New pairing, then revoke the device -> pairing inactive.
    const fourth = await startChallenge({
      client_id: site.client_id,
      browser_pubkey: toBase64Url(browser.raw),
    });
    const approved2 = await json<{ pairing: { payload: { pairing_id: string } } }>(
      await approve(phone, fourth.challenge_id),
    );
    const pairing2 = approved2.pairing.payload.pairing_id;
    const other = await registerPhone({ seed: phone.seed });
    await signedFetch(other, 'POST', `/devices/${phone.deviceId}/revoke`, {});
    const list = await json<{ pairings: { id: string; status: string }[] }>(
      await signedFetch(other, 'GET', '/me/pairings'),
    );
    expect(list.pairings.find((p) => p.id === pairing2)?.status).toBe('revoked');
    const fifth = await startChallenge({ client_id: site.client_id });
    expect(
      (
        await post('/discover/paired', {
          challenge_id: fifth.challenge_id,
          pairing_id: pairing2,
          sig: await browser.sign(fifth.challenge_id),
        })
      ).status,
    ).toBe(401);

    // Unknown pairing.
    expect(
      (
        await post('/discover/paired', {
          challenge_id: fifth.challenge_id,
          pairing_id: 'pr_01K3ZB2N9G0000000000000000',
          sig: 'AA',
        })
      ).status,
    ).toBe(401);
  });
});
