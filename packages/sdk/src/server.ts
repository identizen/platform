/**
 * Server helpers for Node, Bun, Deno, and Cloudflare Workers: OIDC code exchange and token
 * verification, the Verification API (Path B), and webhook / back-channel logout verification.
 */
import { createRemoteJWKSet, customFetch, jwtVerify, type JWTPayload } from 'jose';
import { IdentizenError, errorFromResponse } from './errors.js';
import {
  authorizationUrl,
  pkceChallenge,
  randomString,
  type AuthorizationRequest,
} from './oidc.js';

export { authorizationUrl, pkceChallenge, randomString, IdentizenError };
export type { AuthorizationRequest };

export interface ServerConfig {
  indexUrl: string;
  clientId: string;
  /** Required for confidential clients, the Verification API, and webhook verification. */
  clientSecret?: string;
  fetch?: typeof fetch;
}

export interface IdentizenIdToken extends JWTPayload {
  sub: string;
  sid: string;
  acr: 'idz:login' | 'idz:mfa';
  amr: string[];
  idz_device: string;
  idz_handle?: string;
  idz_org?: string;
}

export interface TokenResponse {
  access_token: string;
  id_token: string;
  token_type: 'Bearer';
  expires_in: number;
  scope: string;
  /** Verified id_token claims. */
  claims: IdentizenIdToken;
}

export interface VerifyRequest {
  /** The per-site sub bound at enrollment or first login. */
  sub: string;
  /** Shown on the phone and bound into the signed assertion (≤ 140 chars). */
  reason?: string | null;
}

export type VerificationStatus = 'pending' | 'approved' | 'denied' | 'timeout';

export interface Verification {
  verification_id: string;
  status: VerificationStatus;
  sub: string;
  reason: string | null;
  created_at: string;
  resolved_at: string | null;
  /** The double-signed assertion when approved. */
  assertion: { payload: Record<string, unknown>; site_sig: string; device_sig: string } | null;
  challenge_id?: string;
  code?: string;
  expires_at?: number;
}

export interface WebhookEvent extends JWTPayload {
  event: 'verification.resolved';
  verification_id: string;
  status: VerificationStatus;
  sub: string;
  reason: string | null;
  assertion: Verification['assertion'];
}

export interface LogoutToken extends JWTPayload {
  sid: string;
  events: Record<string, unknown>;
}

export class IdentizenServer {
  readonly indexUrl: string;
  readonly clientId: string;
  private readonly clientSecret: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

  constructor(config: ServerConfig) {
    if (!config.indexUrl) throw new IdentizenError('config_index_url', 'indexUrl is required');
    if (!config.clientId) throw new IdentizenError('config_client_id', 'clientId is required');
    this.indexUrl = config.indexUrl.replace(/\/+$/, '');
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.fetchImpl = config.fetch ?? ((input, init) => fetch(input, init));
  }

  /** `/authorize` URL builder with this client's id and index. */
  authorizationUrl(req: Omit<AuthorizationRequest, 'indexUrl' | 'clientId'>): string {
    return authorizationUrl({ ...req, indexUrl: this.indexUrl, clientId: this.clientId });
  }

  /** Exchange an authorization code (PKCE) and verify the id_token against the index JWKS. */
  async exchangeCode(input: {
    code: string;
    redirectUri: string;
    codeVerifier: string;
    nonce?: string;
  }): Promise<TokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
      client_id: this.clientId,
      ...(this.clientSecret ? { client_secret: this.clientSecret } : {}),
    });
    const res = await this.fetchImpl(`${this.indexUrl}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw await errorFromResponse(res, 'token_failed');
    const tokens = (await res.json()) as Omit<TokenResponse, 'claims'>;
    const claims = await this.verifyIdToken(tokens.id_token, input.nonce);
    return { ...tokens, claims };
  }

  /** Verify an id_token issued by the index for this client. */
  async verifyIdToken(idToken: string, nonce?: string): Promise<IdentizenIdToken> {
    const { payload } = await jwtVerify(idToken, this.keys(), {
      issuer: this.indexUrl,
      audience: this.clientId,
    });
    if (nonce !== undefined && payload.nonce !== nonce)
      throw new IdentizenError('nonce_mismatch', 'id_token nonce does not match');
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string')
      throw new IdentizenError('invalid_id_token', 'id_token is missing sub or sid');
    return payload as IdentizenIdToken;
  }

  /** Fetch `/userinfo` with an access token. */
  async userinfo(accessToken: string): Promise<Record<string, unknown>> {
    const res = await this.fetchImpl(`${this.indexUrl}/userinfo`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw await errorFromResponse(res, 'userinfo_failed');
    return (await res.json()) as Record<string, unknown>;
  }

  /** Path B, server-to-server: push an approval to the user's phone. */
  async verify(input: VerifyRequest): Promise<Verification> {
    const res = await this.fetchImpl(`${this.indexUrl}/v1/verify`, {
      method: 'POST',
      headers: this.siteHeaders(),
      body: JSON.stringify({ sub: input.sub, reason: input.reason ?? null }),
    });
    if (!res.ok) throw await errorFromResponse(res, 'verify_failed');
    return (await res.json()) as Verification;
  }

  async getVerification(id: string): Promise<Verification> {
    const res = await this.fetchImpl(`${this.indexUrl}/v1/verify/${id}`, {
      headers: this.siteHeaders(),
    });
    if (!res.ok) throw await errorFromResponse(res, 'verification_not_found');
    return (await res.json()) as Verification;
  }

  /** Poll until the verification resolves (or `timeoutMs` elapses -> returns the last state). */
  async waitForVerification(
    id: string,
    opts: { timeoutMs?: number; intervalMs?: number } = {},
  ): Promise<Verification> {
    const deadline = Date.now() + (opts.timeoutMs ?? 65_000);
    for (;;) {
      const v = await this.getVerification(id);
      if (v.status !== 'pending' || Date.now() >= deadline) return v;
      await new Promise((r) => setTimeout(r, opts.intervalMs ?? 1000));
    }
  }

  /** Verify a Verification API webhook delivery (`application/jwt` body). */
  async verifyWebhook(body: string): Promise<WebhookEvent> {
    const { payload } = await jwtVerify(body, this.keys(), {
      issuer: this.indexUrl,
      audience: this.clientId,
      typ: 'idz-webhook+jwt',
    });
    if (payload.event !== 'verification.resolved' || typeof payload.verification_id !== 'string') {
      throw new IdentizenError('invalid_webhook', 'not an Identizen webhook event');
    }
    return payload as WebhookEvent;
  }

  /** Verify an OIDC back-channel logout token; returns the `sid` to end. */
  async verifyLogoutToken(token: string): Promise<LogoutToken> {
    const { payload } = await jwtVerify(token, this.keys(), {
      issuer: this.indexUrl,
      audience: this.clientId,
      typ: 'logout+jwt',
    });
    const events = payload.events as Record<string, unknown> | undefined;
    if (
      !events ||
      !('http://schemas.openid.net/event/backchannel-logout' in events) ||
      typeof payload.sid !== 'string' ||
      payload.nonce !== undefined
    ) {
      throw new IdentizenError('invalid_logout_token', 'not a valid back-channel logout token');
    }
    return payload as LogoutToken;
  }

  private keys(): ReturnType<typeof createRemoteJWKSet> {
    this.jwks ??= createRemoteJWKSet(new URL(`${this.indexUrl}/.well-known/jwks.json`), {
      [customFetch]: this.fetchImpl,
    });
    return this.jwks;
  }

  private siteHeaders(): Record<string, string> {
    if (!this.clientSecret)
      throw new IdentizenError(
        'config_client_secret',
        'clientSecret is required for the Verification API',
      );
    return {
      'content-type': 'application/json',
      authorization: `Bearer ${this.clientSecret}`,
      'idz-client-id': this.clientId,
    };
  }
}

export function createIdentizenServer(config: ServerConfig): IdentizenServer {
  return new IdentizenServer(config);
}
