/**
 * Enrollment state machine: begin -> (register on the org's index) -> attest -> claim ->
 * approved | waiting -> poll status. Every step maps index errors to one `EnrollmentErrorCode`
 * with copy the screen can show as is.
 *
 * Index model: the store holds one device record, registered on one index (`DeviceRecord.indexUrl`,
 * which `signedFetch` uses). An unregistered phone is pointed at the enrollment's index the way
 * Settings does; a phone already registered elsewhere cannot enrol without forgetting the
 * identity and restoring it against the org's index, so that case is refused with a message.
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
  readDevice,
  readEnrollment,
  readSettings,
  writeDevice,
  writeEnrollment,
  writeSettings,
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
  | 'index_mismatch'
  | 'no_identity'
  | 'network'
  | 'unknown';

export const ENROLLMENT_MESSAGES: Record<EnrollmentErrorCode, string> = {
  invalid_enrollment: 'This enrolment link is not valid. Ask your administrator for a new one.',
  enrollment_expired: 'This enrolment link has expired. Ask your administrator for a new one.',
  enrollment_used: 'This enrolment link has already been used by another phone.',
  attestation_required:
    'This organisation only enrols verified devices. This build of Identizen cannot prove the phone is genuine yet, so it cannot enrol here.',
  attestation_failed:
    'The organisation could not verify this phone. Try again, or ask your administrator.',
  device_already_enrolled: 'This phone is already enrolled with someone else in this organisation.',
  index_mismatch:
    'This phone is registered with a different index. To enrol here, forget the identity in Settings, then restore it from your 24 words with the index set to the one in this link.',
  no_identity: 'Create or restore an identity before enrolling.',
  network: 'Could not reach the organisation. Check your connection and try again.',
  unknown: 'Enrolment failed. Try again, or ask your administrator.',
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

/** Anything thrown by a step, normalised to a code and user-facing copy. */
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

const sameIndex = (a: string, b: string) =>
  a.replace(/\/+$/, '').toLowerCase() === b.replace(/\/+$/, '').toLowerCase();

/**
 * Make this phone a registered device of `indexUrl`. Unregistered: point settings and the device
 * record there and register (nonce-bound `POST /devices/nonce` + `POST /devices`). Registered
 * elsewhere: refuse.
 */
export async function ensureRegisteredOn(indexUrl: string): Promise<void> {
  const device = await readDevice();
  if (!device) throw new EnrollmentError('no_identity');
  if (device.deviceId) {
    if (!sameIndex(device.indexUrl, indexUrl)) throw new EnrollmentError('index_mismatch');
    return;
  }
  const settings = await readSettings();
  await writeSettings({ ...settings, indexUrl });
  await writeDevice({ ...device, indexUrl });
  await register(await obtainPushToken());
}

export type ClaimOutcome = { kind: 'approved'; org: string } | { kind: 'waiting'; org: string };

/** The "Enrol" tap: register if needed, attest if possible, claim, remember the result. */
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
    const attestation =
      platform && canAttest
        ? await getAttestation({
            platform,
            nonce: info.nonce,
            devicePubkeyHash: devicePubkeyHash((await getDeviceKey()).publicKey),
          })
        : null;
    if (info.policy.require_attestation && !attestation)
      throw new EnrollmentError('attestation_required');
    const res = await claimEnrollmentRequest(link.token, attestation);
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

export type PollResult = 'approved' | 'denied' | 'expired' | 'timeout' | 'cancelled';

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
    status = (await enrollmentStatusRequest(pending.token)).status;
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
    if (opts.signal?.aborted) return 'cancelled';
    const result = await checkPendingEnrollment(pending);
    if (result !== 'waiting') return result;
    if (now() + interval > deadline) return 'timeout';
    await sleep(interval, opts.signal);
  }
}
