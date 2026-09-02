/**
 * Receive -> verify -> approve/deny. The phone only honours challenges signed by the index whose
 * public key it pinned at registration (PROTOCOL.md section 3).
 */
import {
  createAssertion,
  deriveSiteKey,
  fromBase64Url,
  fromHex,
  signAssertion,
  verifyChallenge,
  type Amr,
  type Challenge,
} from '@identizen/protocol';
import { indexFetch, signedFetch } from '../api/client';
import { getDeviceKey, requireDevice } from '../identity/identity';
import { readSeedHex } from '../identity/store';
import { challengeStore, type PendingChallenge } from './store';

export interface ApproveResult {
  status: number;
  sub?: string;
  redirect?: string | null;
  error?: string;
}

/** Fetch and verify a challenge by id (from a push, poll, scan, or link). */
export async function receiveChallenge(
  challengeId: string,
  via: PendingChallenge['via'],
): Promise<PendingChallenge> {
  const device = await requireDevice();
  const res = await indexFetch(`/challenge/${challengeId}`);
  if (res.status !== 200) throw new Error(`challenge fetch failed: ${res.status}`);
  const body = (await res.json()) as { payload: unknown; sig: string; status: string };
  const verified = verifyChallenge(
    { payload: body.payload, sig: body.sig },
    fromBase64Url(device.indexPubkey),
    {
      index: device.indexUrl,
    },
  );
  if (!verified.ok) throw new Error(`challenge rejected: ${verified.error}`);
  const pending: PendingChallenge = { challenge: verified.value, receivedAt: Date.now(), via };
  if (body.status === 'pending') challengeStore.add(pending);
  await challengeStore.record({
    at: Date.now(),
    kind: 'received',
    rpName: verified.value.rp_name,
    acr: verified.value.acr,
    reason: verified.value.reason,
    challengeId,
  });
  return pending;
}

/** Sign with the per-site key and the device key and submit. Call only after the biometric gate. */
export async function approveChallenge(challenge: Challenge, amr: Amr[]): Promise<ApproveResult> {
  const seedHex = await readSeedHex();
  if (!seedHex) throw new Error('no identity on this phone');
  const device = await requireDevice();
  const deviceKey = await getDeviceKey();
  const site = deriveSiteKey(fromHex(seedHex), challenge.rp_id);
  const assertion = createAssertion({
    challenge,
    sitePublicKey: site.publicKey,
    deviceId: device.deviceId,
    amr,
  });
  const signed = signAssertion(assertion, site.privateKey, deviceKey.privateKey);
  const res = await signedFetch('POST', `/challenge/${challenge.id}/assert`, signed);
  const body = (await res.json()) as { sub?: string; redirect?: string | null; error?: string };
  challengeStore.remove(challenge.id);
  await challengeStore.record({
    at: Date.now(),
    kind: res.ok ? 'approved' : 'failed',
    rpName: challenge.rp_name,
    acr: challenge.acr,
    reason: challenge.reason,
    challengeId: challenge.id,
  });
  return {
    status: res.status,
    ...(body.sub !== undefined && { sub: body.sub }),
    ...(body.redirect !== undefined && { redirect: body.redirect }),
    ...(body.error !== undefined && { error: body.error }),
  };
}

export async function denyChallenge(challenge: Challenge): Promise<number> {
  const res = await signedFetch('POST', `/challenge/${challenge.id}/deny`, {});
  challengeStore.remove(challenge.id);
  await challengeStore.record({
    at: Date.now(),
    kind: 'denied',
    rpName: challenge.rp_name,
    acr: challenge.acr,
    reason: challenge.reason,
    challengeId: challenge.id,
  });
  return res.status;
}

/** `https://app.identizen.com/l/<id>`, `identizen://l/<id>`, or a bare id. */
export function parseChallengeId(input: string): string | null {
  const m = /(ch_[0-9A-HJKMNP-TV-Z]{26})/.exec(input);
  return m?.[1] ?? null;
}
