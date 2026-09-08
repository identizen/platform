/**
 * Receive -> verify -> approve/deny. The phone only honors challenges signed by the index whose
 * public key it pinned at registration (PROTOCOL.md section 3).
 *
 * Which index a challenge belongs to: the `index` field of the signed payload is the authority.
 * A push or an inbox poll already knows the index it came from; a scanned code or a link may
 * carry it as `?index=`; otherwise every registered index is asked for the id, active one first.
 * Approving and denying always go to `challenge.index`, and refuse when the phone holds no
 * registered device there.
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
import { normalizeIndexUrl, parseQuery } from '../enrollment/links';
import {
  getDeviceKey,
  registeredDevices,
  requireDevice,
  type RegisteredDevice,
} from '../identity/identity';
import { readSeedHex } from '../identity/store';
import { challengeStore, type PendingChallenge } from './store';

export interface ApproveResult {
  status: number;
  sub?: string;
  redirect?: string | null;
  error?: string;
}

interface SignedChallengeBody {
  payload: unknown;
  sig: string;
  status: string;
}

async function fetchFrom(
  device: RegisteredDevice,
  challengeId: string,
): Promise<{ device: RegisteredDevice; res: Response }> {
  const res = await indexFetch(`/challenge/${challengeId}`, undefined, device.indexUrl);
  return { device, res };
}

/** Ask each registered index for the challenge, active index first; the first 200 wins. */
async function locate(challengeId: string): Promise<{ device: RegisteredDevice; res: Response }> {
  const devices = await registeredDevices();
  if (devices.length === 0) throw new Error('device is not registered');
  let last: { device: RegisteredDevice; res: Response } | null = null;
  for (const device of devices) {
    try {
      const hit = await fetchFrom(device, challengeId);
      if (hit.res.status === 200) return hit;
      last = hit;
    } catch (err) {
      if (devices.length === 1) throw err;
      /* one index unreachable: keep asking the others */
    }
  }
  if (last) return last;
  throw new Error('challenge fetch failed: no registered index could be reached');
}

/**
 * Fetch and verify a challenge by id (from a push, poll, scan, or link). `indexUrl` is the index
 * the id came from when the entry path knows it; otherwise the registered indexes are probed.
 */
export async function receiveChallenge(
  challengeId: string,
  via: PendingChallenge['via'],
  indexUrl?: string | null,
): Promise<PendingChallenge> {
  const { device, res } = indexUrl
    ? await fetchFrom(await requireDevice(indexUrl), challengeId)
    : await locate(challengeId);
  if (res.status !== 200) throw new Error(`challenge fetch failed: ${res.status}`);
  const body = (await res.json()) as SignedChallengeBody;
  const verified = verifyChallenge(
    { payload: body.payload, sig: body.sig },
    fromBase64Url(device.indexPubkey),
    { index: device.indexUrl },
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
  const device = await requireDevice(challenge.index);
  const deviceKey = await getDeviceKey(device.indexUrl);
  const site = deriveSiteKey(fromHex(seedHex), challenge.rp_id);
  const assertion = createAssertion({
    challenge,
    sitePublicKey: site.publicKey,
    deviceId: device.deviceId,
    amr,
  });
  const signed = signAssertion(assertion, site.privateKey, deviceKey.privateKey);
  const res = await signedFetch(
    'POST',
    `/challenge/${challenge.id}/assert`,
    signed,
    device.indexUrl,
  );
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
  const device = await requireDevice(challenge.index);
  const res = await signedFetch('POST', `/challenge/${challenge.id}/deny`, {}, device.indexUrl);
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

export interface ChallengeLink {
  id: string;
  /** The issuing index when the link carries `?index=…`; null means "ask the registered ones". */
  index: string | null;
}

/** A sign-in link or QR: the id, plus the index when the link names one. */
export function parseChallengeLink(input: string): ChallengeLink | null {
  const id = parseChallengeId(input);
  if (!id) return null;
  const q = input.indexOf('?');
  const index = q >= 0 ? normalizeIndexUrl(parseQuery(input.slice(q)).get('index') ?? '') : null;
  return { id, index };
}
