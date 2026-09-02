import { getVerification, recordAudit, resolveVerification, type Session } from '@identizen/db';
import { randomToken } from '../lib/util';
import { backchannelLogout } from './backchannel';
import { deliverWebhook } from './verification';
import type { ChallengeSession, SessionState } from '../do/challenge-session';
import type { Env } from '../env';
import type { Services } from '../lib/services';
import type { AssertOutcome } from './assert';

export interface CompletedApproval {
  /** Where the browser should go next (OIDC redirect with code + state), or null. */
  redirect: string | null;
}

/**
 * Resolve the session after a verified assertion: issue the OIDC authorization code when the
 * session carries an authorization request, resolve a Verification API record when it carries
 * one, and notify the waiting browser. Token issuance itself lives in the OIDC routes (M4).
 */
export async function completeApproval(
  services: Services,
  _env: Env,
  stub: DurableObjectStub<ChallengeSession>,
  outcome: AssertOutcome,
): Promise<CompletedApproval> {
  const { db } = services;
  const state = outcome.state;
  let code: string | null = null;
  let redirect: string | null = null;
  if (state.oidc?.redirect_uri) {
    code = `${state.challengeId}.${randomToken(24)}`;
    redirect = buildRedirect(state.oidc.redirect_uri, { code, state: state.oidc.state });
  }
  if (state.verificationId) {
    const v = await getVerification(db, state.verificationId);
    if (v && v.status === 'pending') {
      const resolved = await resolveVerification(db, v.id, 'approved', outcome.signedAssertion);
      await deliverWebhook(services, _env, resolved);
      await recordAudit(db, {
        kind: 'verification.approved',
        idz: outcome.device.idz,
        deviceId: outcome.device.id,
        clientId: state.clientId,
        detail: { verification_id: v.id },
      });
    }
  }
  await stub.approve(outcome.assertion, outcome.pairing, code, redirect);
  return { redirect };
}

export async function onSessionDenied(services: Services, state: SessionState): Promise<void> {
  if (!state.verificationId) return;
  const v = await getVerification(services.db, state.verificationId);
  if (v && v.status === 'pending') {
    const resolved = await resolveVerification(services.db, v.id, 'denied');
    await deliverWebhook(services, services.env, resolved);
    await recordAudit(services.db, {
      kind: 'verification.denied',
      clientId: state.clientId,
      detail: { verification_id: v.id },
    });
  }
}

/** Back-channel logout dispatch. Fully implemented in M4 (needs OIDC signing keys). */
export async function fireBackchannelLogout(
  services: Services,
  sessions: Session[],
  env: Env,
): Promise<void> {
  if (sessions.length === 0) return;
  await backchannelLogout(services, env, sessions);
}

export function buildRedirect(
  redirectUri: string,
  params: Record<string, string | undefined>,
): string {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, v);
  return url.toString();
}
