import {
  createVerification,
  getSite,
  getVerification,
  recordAudit,
  resolveVerification,
  type Site,
  type Verification,
} from '@identizen/db';
import {
  CHALLENGE_TTL_SECONDS,
  verificationId as newVerificationId,
  sha256,
  toBase64Url,
  toHex,
  utf8Encode,
} from '@identizen/protocol';
import type { Env } from '../env';
import type { Services } from '../lib/services';
import { createServices } from '../lib/services';
import { loadKeyring } from '../oidc/keys';
import { mintWebhookToken } from '../oidc/tokens';
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

const RETRY_DELAYS_MS = [0, 500, 2000];

/** POST the result to the site's webhook as a signed JWT (`application/jwt`) with an HMAC header. */
export async function deliverWebhook(
  services: Services,
  env: Env,
  v: Verification,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const site = await getSite(services.db, v.clientId);
  if (!site?.webhookUrl) return false;
  const ring = await loadKeyring(env);
  const body = await mintWebhookToken(ring, {
    issuer: services.indexUrl,
    clientId: site.clientId,
    now: services.now(),
    claims: {
      event: 'verification.resolved',
      verification_id: v.id,
      status: v.status,
      sub: v.sub,
      reason: v.reason,
      assertion: v.status === 'approved' ? v.assertion : null,
      resolved_at: v.resolvedAt ? Math.floor(v.resolvedAt.getTime() / 1000) : null,
    },
  });
  const sigHeader = site.webhookSecretHash
    ? `sha256=${toHex(sha256(utf8Encode(site.webhookSecretHash + '.' + body)))}`
    : '';
  for (const delay of RETRY_DELAYS_MS) {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    try {
      const res = await fetchImpl(site.webhookUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/jwt',
          'idz-event': 'verification.resolved',
          ...(sigHeader && { 'idz-webhook-signature': sigHeader }),
        },
        body,
      });
      if (res.ok) return true;
      if (res.status >= 400 && res.status < 500 && res.status !== 429) return false;
    } catch {
      /* retry */
    }
  }
  return false;
}

/** Seconds a verification stays pending before timing out (one challenge lifetime). */
export const VERIFICATION_TTL_SECONDS = CHALLENGE_TTL_SECONDS;
export const webhookEncoding = { toBase64Url };
