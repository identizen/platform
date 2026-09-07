import type { Env } from '../env';

/**
 * Namespace a Durable Object name or a rate-limit bucket. A single-tenant index has no
 * TENANT_KEY and the name is used as is; a multi-tenant host sets TENANT_KEY per request
 * (`createApp({ resolveEnv })`) so two tenants can never share a session, a guard or a bucket.
 */
export function nsName(env: Pick<Env, 'TENANT_KEY'>, name: string): string {
  return env.TENANT_KEY ? `${env.TENANT_KEY}:${name}` : name;
}
