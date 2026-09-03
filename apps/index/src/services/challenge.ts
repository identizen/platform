import {
  getBinding,
  getSite,
  listDevicesForIdentity,
  recordAudit,
  requireDevice,
  type Device,
  type Site,
} from '@identizen/db';
import {
  challengeId as newChallengeId,
  createChallenge,
  matchCode,
  randomBytes,
  signChallenge,
  toBase64Url,
  type Acr,
  type SignedChallenge,
} from '@identizen/protocol';
import type { OidcParams, SessionState } from '../do/challenge-session';
import type { Env } from '../env';
import { ApiError, badRequest, notFound } from '../lib/errors';
import type { Services } from '../lib/services';
import { checkClientRate } from '../middleware/rate-limit';

export interface StartChallengeInput {
  clientId: string;
  acr: Acr;
  reason?: string | null;
  /** Step-up / verification: the bound per-site `sub` whose device receives the push. */
  loginHint?: string | null;
  browserPubkey?: string | null;
  oidc?: OidcParams | null;
  verificationId?: string | null;
}

export interface StartChallengeResult {
  site: Site;
  signed: SignedChallenge;
  state: SessionState;
  /** Device pushed at creation (MFA / verification), if any. */
  pushedTo: Device | null;
}

/** Create a ChallengeSession for a site and, for step-up, push to the bound device. */
export async function startChallenge(
  services: Services,
  input: StartChallengeInput,
  env: Pick<
    Env,
    | 'CHALLENGE_SESSION'
    | 'REQUEST_GUARD'
    | 'RATE_LIMIT_CHALLENGES_PER_CLIENT'
    | 'RATE_LIMIT_REQUESTS_PER_IP'
  >,
): Promise<StartChallengeResult> {
  const { db, indexKey, indexUrl, now } = services;
  const site = await getSite(db, input.clientId);
  if (!site) throw notFound('unknown_client', `no site with client_id ${input.clientId}`);
  await checkClientRate(env, site.clientId);

  let target: Device | null = null;
  if (input.acr === 'idz:mfa' || input.loginHint) {
    if (!input.loginHint)
      throw badRequest('login_hint_required', 'acr idz:mfa requires login_hint=<sub>');
    const binding = await getBinding(db, site.rpId, input.loginHint);
    if (!binding)
      throw new ApiError(400, 'login_required', 'no device is bound to this sub for this site');
    const devices = await listDevicesForIdentity(db, binding.idz);
    target = devices.find((d) => d.status === 'active') ?? null;
    if (!target) throw new ApiError(400, 'login_required', 'no active device for this identity');
  }

  const id = newChallengeId();
  const challenge = createChallenge({
    id,
    rp_id: site.rpId,
    rp_name: site.name,
    nonce: toBase64Url(randomBytes(32)),
    code: matchCode(),
    iat: now(),
    index: indexUrl,
    acr: input.acr,
    reason: input.reason ?? null,
  });
  const signed = signChallenge(challenge, indexKey.privateKey);
  const stub = env.CHALLENGE_SESSION.getByName(id);
  const state = await stub.create({
    signed,
    clientId: site.clientId,
    targetDeviceId: target?.id ?? null,
    browserPubkey: input.browserPubkey ?? null,
    oidc: input.oidc ?? null,
    verificationId: input.verificationId ?? null,
  });
  await recordAudit(db, {
    kind: 'login.challenge_created',
    clientId: site.clientId,
    deviceId: target?.id ?? null,
    idz: target?.idz ?? null,
    detail: { challenge_id: id, acr: input.acr, reason: input.reason ?? null },
  });
  if (target) await pushChallenge(services, target, id);
  return { site, signed, state, pushedTo: target };
}

/**
 * Deliver `{ challenge_id }` to a device. The device's inbox is the delivery of record: every
 * enrolled phone drains it while in the foreground, whatever push platform it registered with.
 * A provider push (APNs / FCM / web) only wakes the phone sooner, so a missing or failing provider
 * never loses a request; it is logged and the inbox carries it.
 */
export async function pushChallenge(
  services: Services,
  device: Device,
  challengeId: string,
): Promise<boolean> {
  await services.env.REQUEST_GUARD.getByName(device.id).enqueue(challengeId);
  const result = await services.push.send(device, { challenge_id: challengeId });
  if (!result.ok)
    console.warn(`push to ${device.id} via ${result.provider} failed: ${result.detail ?? ''}`);
  return true;
}

export async function loadDeviceForPush(services: Services, deviceId: string): Promise<Device> {
  return requireDevice(services.db, deviceId);
}
