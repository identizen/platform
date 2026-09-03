import { browserLabel } from '../lib/util';
import {
  bindOrVerify,
  BindingConflictError,
  createPairing,
  getDevice,
  recordAudit,
  touchDevice,
  type Device,
} from '@identizen/db';
import {
  fromBase64Url,
  pairingId as newPairingId,
  signPairing,
  verifyAssertion,
  type Assertion,
  type SignedChallenge,
  type SignedPairing,
} from '@identizen/protocol';
import type { ChallengeSession, SessionState } from '../do/challenge-session';
import { ApiError } from '../lib/errors';
import type { Services } from '../lib/services';

export interface AssertOutcome {
  state: SessionState;
  assertion: Assertion;
  device: Device;
  pairing: SignedPairing | null;
  bindingCreated: boolean;
  /** The raw double-signed assertion as received (stored on Verification API records). */
  signedAssertion: Record<string, unknown>;
}

/**
 * PROTOCOL.md section 4.1: schema -> challenge -> device + revocation -> device_sig ->
 * site_sig + sub -> TOFU binding -> resolve. Every failure writes `login.denied`.
 */
export async function processAssertion(
  services: Services,
  stub: DurableObjectStub<ChallengeSession>,
  challengeId: string,
  body: unknown,
): Promise<AssertOutcome> {
  const { db, now, indexKey } = services;
  const signed: SignedChallenge | null = await stub.getSigned();
  const state = await stub.getState();
  const deny = async (
    code: string,
    message: string,
    status = 400,
    deviceId: string | null = null,
    idz: string | null = null,
  ) => {
    await recordAudit(db, {
      kind: 'login.denied',
      clientId: state?.clientId ?? null,
      deviceId,
      idz,
      detail: { challenge_id: challengeId, reason: code },
    });
    return new ApiError(status, code, message);
  };

  if (!signed || !state) throw new ApiError(404, 'unknown_challenge', 'no such challenge');
  if (state.status !== 'pending')
    throw await deny('challenge_' + state.status, `challenge is ${state.status}`, 410);
  const challenge = signed.payload;

  // Device lookup and revocation first, so we can attribute the audit event.
  const claimedDeviceId =
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { payload?: { device_id?: unknown } }).payload?.device_id === 'string'
      ? (body as { payload: { device_id: string } }).payload.device_id
      : null;
  const device = claimedDeviceId ? await getDevice(db, claimedDeviceId) : null;
  if (!device) throw await deny('unknown_device', 'assertion names an unregistered device', 401);
  if (device.status !== 'active')
    throw await deny('device_inactive', `device is ${device.status}`, 403, device.id, device.idz);
  if (state.targetDeviceId && state.targetDeviceId !== device.id) {
    throw await deny(
      'wrong_device',
      'challenge was issued to a different device',
      403,
      device.id,
      device.idz,
    );
  }

  const verified = verifyAssertion(body, challenge, device.devicePubkey, { now: now() });
  if (!verified.ok) {
    const status =
      verified.error === 'expired' ? 410 : verified.error.startsWith('bad_') ? 401 : 400;
    throw await deny(
      verified.error,
      `assertion rejected: ${verified.error}`,
      status,
      device.id,
      device.idz,
    );
  }
  const assertion = verified.value;

  let bindingCreated = false;
  try {
    const r = await bindOrVerify(db, {
      rpId: challenge.rp_id,
      sub: assertion.sub,
      idz: device.idz,
      sitePubkey: fromBase64Url(assertion.site_pubkey),
    });
    bindingCreated = r.created;
  } catch (err) {
    if (err instanceof BindingConflictError) {
      throw await deny(
        'binding_conflict',
        'sub is bound to a different key or identity',
        409,
        device.id,
        device.idz,
      );
    }
    throw err;
  }

  let pairing: SignedPairing | null = null;
  if (state.browserPubkey) {
    const id = newPairingId();
    await createPairing(db, {
      id,
      deviceId: device.id,
      browserPubkey: fromBase64Url(state.browserPubkey),
      // Described from the browser's own request (User-Agent, IP), never the phone's.
      label: state.browser?.ua ? browserLabel(state.browser.ua) : null,
      userAgent: state.browser?.ua ?? null,
      lastIp: state.browser?.ip ?? null,
    });
    pairing = signPairing(
      {
        type: 'pairing',
        pairing_id: id,
        device_id: device.id,
        browser_pubkey: state.browserPubkey,
        issued_at: now(),
      },
      indexKey.privateKey,
    );
    await recordAudit(db, {
      kind: 'pairing.created',
      idz: device.idz,
      deviceId: device.id,
      clientId: state.clientId,
      detail: { pairing_id: id },
    });
  }

  await touchDevice(db, device.id);
  await recordAudit(db, {
    kind: 'login.success',
    idz: device.idz,
    deviceId: device.id,
    clientId: state.clientId,
    detail: {
      challenge_id: challengeId,
      acr: assertion.acr,
      sub: assertion.sub,
      binding_created: bindingCreated,
    },
  });
  return {
    state,
    assertion,
    device,
    pairing,
    bindingCreated,
    signedAssertion: body as Record<string, unknown>,
  };
}
