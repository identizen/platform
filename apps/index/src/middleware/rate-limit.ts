import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../app';
import type { Env } from '../env';
import { tooMany } from '../lib/errors';

/** Per-minute limits (PRD 12: rate limiting on challenge issuance; M10.2). Overridable per env. */
export const DEFAULT_LIMITS = {
  /** Challenges one site may start per minute. */
  challengesPerClient: 300,
  /** Challenges / discovery calls one source IP may make per minute. */
  requestsPerIp: 60,
} as const;

export function limits(
  env: Pick<Env, 'RATE_LIMIT_CHALLENGES_PER_CLIENT' | 'RATE_LIMIT_REQUESTS_PER_IP'>,
): {
  challengesPerClient: number;
  requestsPerIp: number;
} {
  const n = (v: string | undefined, d: number) => {
    const x = Number(v);
    return Number.isFinite(x) && x > 0 ? x : d;
  };
  return {
    challengesPerClient: n(
      env.RATE_LIMIT_CHALLENGES_PER_CLIENT,
      DEFAULT_LIMITS.challengesPerClient,
    ),
    requestsPerIp: n(env.RATE_LIMIT_REQUESTS_PER_IP, DEFAULT_LIMITS.requestsPerIp),
  };
}

function clientIp(headers: Headers): string {
  return (
    headers.get('cf-connecting-ip') ??
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

/** Limit by source IP (CF-Connecting-IP). Requests without a resolvable IP are not limited. */
export function ipRateLimit(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const ip = clientIp(c.req.raw.headers);
    if (ip !== 'unknown') {
      const ok = await c.env.REQUEST_GUARD.getByName(`ip:${ip}`).allowRate(
        'ip',
        limits(c.env).requestsPerIp,
      );
      if (!ok)
        throw tooMany('rate_limited', 'too many requests from this address; try again in a minute');
    }
    await next();
  };
}

/** Limit challenge issuance per site client. */
export async function checkClientRate(
  env: Pick<
    Env,
    'REQUEST_GUARD' | 'RATE_LIMIT_CHALLENGES_PER_CLIENT' | 'RATE_LIMIT_REQUESTS_PER_IP'
  >,
  clientId: string,
): Promise<void> {
  const ok = await env.REQUEST_GUARD.getByName(`client:${clientId}`).allowRate(
    'client',
    limits(env).challengesPerClient,
  );
  if (!ok) throw tooMany('client_rate_limited', 'this site is starting too many logins; slow down');
}
