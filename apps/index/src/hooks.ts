import type { Device, Identity, Site } from '@identizen/db';
import type { Assertion } from '@identizen/protocol';
import type { Hono } from 'hono';
import type { AppEnv } from './app';
import type { Env } from './env';
import type { Services } from './lib/services';

/**
 * Extension points for hosts that embed the index (`createApp(options)`). Every hook runs
 * inside the request that triggered it; throwing an `ApiError` refuses that request with the
 * error's status and code, which is how a policy says no. Defaults do nothing, so an index
 * built without options behaves exactly as the hosted one.
 */
export interface ChallengeStartContext {
  services: Services;
  site: Site;
  acr: string;
  loginHint: string | null;
  /** Device the challenge will be pushed to (step-up), if the login named one. */
  target: Device | null;
}

export interface AssertContext {
  services: Services;
  clientId: string;
  challengeId: string;
  device: Device;
  assertion: Assertion;
}

export interface EnrollContext {
  services: Services;
  idz: string;
  kind: 'personal' | 'org';
  /** The identity when this is another device for a known identity; null for a first enrolment. */
  identity: Identity | null;
  attestation: unknown;
}

export interface SessionCreateContext {
  services: Services;
  site: Site;
  identity: Identity;
  device: Device;
  sid: string;
  assertion: Assertion;
}

export interface TokenClaimsContext {
  services: Services;
  site: Site | null;
  identity: Identity;
  device: Device | null;
  sid: string;
  scope: string;
  /** Present for the id_token at code exchange; null for /userinfo. */
  assertion: Assertion | null;
  audience: 'id_token' | 'userinfo';
}

export interface IndexHooks {
  /** Before a challenge is created. Throw to refuse the login. */
  onChallengeStart(ctx: ChallengeStartContext): Promise<void> | void;
  /** After the assertion verified and before the session is approved. Throw to deny. */
  onAssert(ctx: AssertContext): Promise<void> | void;
  /** Before a device (and possibly its identity) is enrolled. Throw to refuse. */
  onEnroll(ctx: EnrollContext): Promise<void> | void;
  /** Before an OIDC session row is written at code exchange. Throw to refuse. */
  onSessionCreate(ctx: SessionCreateContext): Promise<void> | void;
  /**
   * Extra claims for the id_token and /userinfo. Standard claims always win over these, so a
   * hook cannot change sub, sid, amr, acr, auth_time, idz_device, idz_handle, idz_org or at_hash.
   */
  onTokenClaims(
    ctx: TokenClaimsContext,
  ): Promise<Record<string, unknown>> | Record<string, unknown>;
}

const allow = (): void => undefined;

export const defaultHooks: IndexHooks = {
  onChallengeStart: allow,
  onAssert: allow,
  onEnroll: allow,
  onSessionCreate: allow,
  onTokenClaims: () => ({}),
};

export function resolveHooks(partial: Partial<IndexHooks> | undefined): IndexHooks {
  return { ...defaultHooks, ...partial };
}

export interface AppOptions {
  /**
   * Replace the bindings for this request, e.g. a multi-tenant host mapping the Host header to
   * that tenant's INDEX_URL, keys, database and TENANT_KEY. Throw an `ApiError` to refuse the
   * request (404 tenant_not_found) before anything else runs.
   */
  resolveEnv?: (request: Request, env: Env) => Env | Promise<Env>;
  /** Mount additional routers after the built-in ones. */
  extend?: (app: Hono<AppEnv>) => void;
  hooks?: Partial<IndexHooks>;
}
