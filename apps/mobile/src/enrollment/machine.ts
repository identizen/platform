/**
 * Enrollment state machine: begin -> (register on the org's index) -> attest -> claim ->
 * approved | waiting -> poll status. Every step maps index errors to one `EnrollmentErrorCode`
 * with copy the screen can show as is.
 *
 * Index model: the store holds one device record per index (`readDevices`), and the phone can be
 * registered on several at once. Enrolling registers the identity on the organization's index if
 * it is not there yet, next to the personal one, and makes it the active index; nothing already
 * registered is touched. The claim and status calls are signed with that index's device key.
 */
import { IndexError } from '../api/client';
import {
  attestationPlatform,
  devicePubkeyHash,
  getAttestation,
  hasAttestationProvider,
} from '../attestation';
import { getDeviceKey, register } from '../identity/identity';
import {
  indexKey,
  readDevices,
  readEnrollment,
  setActiveIndexUrl,
  writeEnrollment,
  type PendingEnrollment,
} from '../identity/store';
import { obtainPushToken } from '../push';
import { beginEnrollment, claimEnrollmentRequest, enrollmentStatusRequest } from './api';
import type { EnrollmentInfo } from './api';
import type { EnrollmentLink } from './links';

export { beginEnrollment };

export type EnrollmentErrorCode =
  | 'invalid_enrollment'
  | 'enrollment_expired'
  | 'enrollment_used'
  | 'attestation_required'
  | 'attestation_failed'
  | 'device_already_enrolled'
  | 'no_identity'
  | 'network'
  | 'unknown';

export const ENROLLMENT_MESSAGES: Record<EnrollmentErrorCode, string> = {
  invalid_enrollment: 'This enrollment link is not valid. Ask your administrator for a new one.',
  enrollment_expired: 'This enrollment link has expired. Ask your administrator for a new one.',
  enrollment_used: 'This enrollment link has already been used by another phone.',
  attestation_required:
    'This organization only enrolls verified devices. This build of Identizen cannot prove the phone is genuine yet, so it cannot enroll here.',
  attestation_failed:
    'The organization could not verify this phone. Try again, or ask your administrator.',
  device_already_enrolled: 'This phone is already enrolled with someone else in this organization.',
  no_identity: 'Create or restore an identity before enrolling.',
  network: 'Could not reach the organization. Check your connection and try again.',
  unknown: 'Enrollment failed. Try again, or ask your administrator.',
};

export class EnrollmentError extends Error {
  constructor(
    public readonly code: EnrollmentErrorCode,
    message: string = ENROLLMENT_MESSAGES[code],
  ) {
    super(message);
    this.name = 'EnrollmentError';
  }
}

const KNOWN: ReadonlySet<string> = new Set<EnrollmentErrorCode>([
  'invalid_enrollment',
  'enrollment_expired',
  'enrollment_used',
  'attestation_required',
  'attestation_failed',
  'device_already_enrolled',
]);

/** Anything thrown by a step, normalized to a code and user-facing copy. */
export function toEnrollmentError(err: unknown): EnrollmentError {
  if (err instanceof EnrollmentError) return err;
  if (err instanceof IndexError) {
    if (KNOWN.has(err.code)) return new EnrollmentError(err.code as EnrollmentErrorCode);
    if (err.status === 404) return new EnrollmentError('invalid_enrollment');
    return new EnrollmentError('unknown', `${ENROLLMENT_MESSAGES.unknown} (${err.code})`);
  }
  if (err instanceof TypeError) return new EnrollmentError('network');
  return new EnrollmentError('unknown');
}

/**
 * Make this phone a registered device of `indexUrl` and the active index. Already registered
 * there (as the active index or another one): just switch. Not yet: register there with the
 * nonce-bound proof (`POST /devices/nonce` + `POST /devices`), keeping every other index.
 */
export async function ensureRegisteredOn(indexUrl: string): Promise<void> {
  const devices = await readDevices();
  if (Object.keys(devices).length === 0) throw new EnrollmentError('no_identity');
  const existing = devices[indexKey(indexUrl)];
  if (existing?.deviceId) {
    await setActiveIndexUrl(existing.indexUrl);
    return;
  }
  await register(await obtainPushToken(), { indexUrl, makeActive: true });
}

export type ClaimOutcome = { kind: 'approved'; org: string } | { kind: 'waiting'; org: string };

/** The "Enroll" tap: register if needed, attest if possible, claim, remember the result. */
export async function claimEnrollment(
  link: EnrollmentLink,
  info: EnrollmentInfo,
  os?: string,
): Promise<ClaimOutcome> {
  const platform = attestationPlatform(os);
  const canAttest = platform !== null && hasAttestationProvider();
  // Do not register or switch index for an org that will refuse this build anyway.
  if (info.policy.require_attestation && !canAttest)
    throw new EnrollmentError('attestation_required');
  try {
    await ensureRegisteredOn(link.index);
    // The attestation binds the device key this phone uses on the org's index, not another one.
    const attestation =
      platform && canAttest
        ? await getAttestation({
            platform,
            nonce: info.nonce,
            devicePubkeyHash: devicePubkeyHash((await getDeviceKey(link.index)).publicKey),
          })
        : null;
    if (info.policy.require_attestation && !attestation)
      throw new EnrollmentError('attestation_required');
    const res = await claimEnrollmentRequest(link.token, attestation, link.index);
    const org = info.org.display_name;
    const current = await readEnrollment();
    if (res.enrollment.status === 'approved') {
      await writeEnrollment({ pending: null, managedBy: { org, index: link.index } });
      return { kind: 'approved', org };
    }
    await writeEnrollment({
      ...current,
      pending: { token: link.token, indexUrl: link.index, org, claimedAt: Date.now() },
    });
    return { kind: 'waiting', org };
  } catch (err) {
    throw toEnrollmentError(err);
  }
}

export type PollResult = 'approved' | 'denied' | 'expired' | 'timeout' | 'canceled';

export interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
}

export const POLL_INTERVAL_MS = 5_000;
export const POLL_TIMEOUT_MS = 10 * 60_000;

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(done, ms);
    function done() {
      signal?.removeEventListener('abort', done);
      clearTimeout(t);
      resolve();
    }
    signal?.addEventListener('abort', done);
  });
}

/** One status check. Settles the stored state on a decision; 'claimed' means keep waiting. */
export async function checkPendingEnrollment(
  pending: PendingEnrollment,
): Promise<'approved' | 'denied' | 'expired' | 'waiting'> {
  let status: string;
  try {
    status = (await enrollmentStatusRequest(pending.token, pending.indexUrl)).status;
  } catch (err) {
    const e = toEnrollmentError(err);
    if (e.code === 'network' || e.code === 'unknown') return 'waiting';
    status = 'expired';
  }
  if (status === 'approved') {
    await writeEnrollment({
      pending: null,
      managedBy: { org: pending.org, index: pending.indexUrl },
    });
    return 'approved';
  }
  if (status === 'pending' || status === 'claimed') return 'waiting';
  const current = await readEnrollment();
  await writeEnrollment({ ...current, pending: null });
  return status === 'denied' ? 'denied' : 'expired';
}

/** Poll `GET /enroll/:token/status` every 5 s for up to 10 minutes, or until aborted. */
export async function pollEnrollment(
  pending: PendingEnrollment,
  opts: PollOptions = {},
): Promise<PollResult> {
  const interval = opts.intervalMs ?? POLL_INTERVAL_MS;
  const timeout = opts.timeoutMs ?? POLL_TIMEOUT_MS;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? defaultSleep;
  const deadline = now() + timeout;
  for (;;) {
    if (opts.signal?.aborted) return 'canceled';
    const result = await checkPendingEnrollment(pending);
    if (result !== 'waiting') return result;
    if (now() + interval > deadline) return 'timeout';
    await sleep(interval, opts.signal);
  }
}
