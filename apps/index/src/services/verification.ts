import {
  createVerification,
  getVerification,
  recordAudit,
  resolveVerification,
  type Site,
  type Verification,
} from '@identizen/db';
import {
  CHALLENGE_TTL_SECONDS,
  verificationId as newVerificationId,
  toBase64Url,
} from '@identizen/protocol';
import type { Env } from '../env';
import type { Services } from '../lib/services';
import { createServices } from '../lib/services';
import { startChallenge } from './challenge';

export interface VerifyRequest {
  sub: string;
  reason?: string | null;
}

export interface VerifyStarted {
  verification: Verification;
  challengeId: string;
  code: string;
  expiresAt: number;
}

/** `POST /v1/verify`: create the record, then the challenge (acr idz:mfa) pushed to the bound device. */
export async function startVerification(
  services: Services,
  env: Env,
  site: Site,
  input: VerifyRequest,
): Promise<VerifyStarted> {
  const id = newVerificationId();
  const verification = await createVerification(services.db, {
    id,
    clientId: site.clientId,
    sub: input.sub,
    reason: input.reason ?? null,
  });
  await recordAudit(services.db, {
    kind: 'verification.created',
    clientId: site.clientId,
    detail: { verification_id: id, sub: input.sub },
  });
  try {
    const started = await startChallenge(
      services,
      {
        clientId: site.clientId,
        acr: 'idz:mfa',
        reason: input.reason ?? null,
        loginHint: input.sub,
        verificationId: id,
      },
      env,
    );
    return {
      verification,
      challengeId: started.signed.payload.id,
      code: started.signed.payload.code,
      expiresAt: started.signed.payload.exp,
    };
  } catch (err) {
    await resolveVerification(services.db, id, 'denied').catch(() => undefined);
    throw err;
  }
}

export function publicVerification(
  v: Verification,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    verification_id: v.id,
    status: v.status,
    sub: v.sub,
    reason: v.reason,
    created_at: v.createdAt,
    resolved_at: v.resolvedAt,
    assertion: v.status === 'approved' ? v.assertion : null,
    ...extra,
  };
}

/**
 * Called from the ChallengeSession alarm when a verification's challenge expires unresolved.
 * Runs with its own services since alarms have no request context.
 */
export async function expireVerification(env: Env, id: string): Promise<void> {
  const services = createServices(env);
  try {
    const v = await getVerification(services.db, id);
    if (!v || v.status !== 'pending') return;
    const resolved = await resolveVerification(services.db, id, 'timeout');
    await recordAudit(services.db, {
      kind: 'verification.timeout',
      clientId: v.clientId,
      detail: { verification_id: id },
    });
    await deliverWebhook(services, env, resolved);
  } finally {
    await services.close();
  }
}

import { deliverWebhook } from './deliveries';
export { deliverWebhook };

/** Seconds a verification stays pending before timing out (one challenge lifetime). */
export const VERIFICATION_TTL_SECONDS = CHALLENGE_TTL_SECONDS;
export const webhookEncoding = { toBase64Url };
