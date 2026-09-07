import { SELF, env } from 'cloudflare:test';
import { sql } from 'drizzle-orm';
import { createDb } from '@identizen/db';
import {
  createAssertion,
  deriveMasterKey,
  deriveSiteKey,
  generateKeyPair,
  generateSeed,
  randomBytes,
  sha256,
  signAssertion,
  signIdentityProof,
  signRequest,
  toBase64Url,
  utf8Encode,
  type Challenge,
  type KeyPair,
  type SignedAssertion,
  type Amr,
} from '@identizen/protocol';

export const BASE = 'http://index.test';

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
let fetcher: Fetcher = (input, init) => SELF.fetch(input, init);
/** Route the helpers through an app built with `createApp(options)` instead of the deployed Worker. */
export function useFetcher(next: Fetcher | null): void {
  fetcher = next ?? ((input, init) => SELF.fetch(input, init));
}
export const request: Fetcher = (input, init) => fetcher(input, init);

/** Wipe all rows between tests (the schema is created once by global-setup). */
export async function resetDb(): Promise<void> {
  const handle = createDb(env.HYPERDRIVE.connectionString, { max: 1 });
  try {
    await handle.db.execute(
      sql`truncate table audit_events, sessions, verifications, pairings, site_bindings, sites, devices, identities, orgs restart identity cascade`,
    );
  } finally {
    await handle.close();
  }
}

export function dbHandle() {
  return createDb(env.HYPERDRIVE.connectionString, { max: 1 });
}

export async function json<T = unknown>(res: Response): Promise<T> {
  return await res.json();
}

export interface Phone {
  seed: Uint8Array;
  master: KeyPair;
  device: KeyPair;
  bleKey: Uint8Array;
  deviceId: string;
  idz: string;
  indexPubkey: string;
}

/** Register a device + identity like the app would. */
/** A fresh registration nonce from the index under test. */
export async function registrationNonce(): Promise<string> {
  const res = await request(`${BASE}/devices/nonce`, { method: 'POST' });
  if (res.status !== 200) throw new Error(`nonce failed: ${res.status}`);
  return (await json<{ nonce: string }>(res)).nonce;
}

export async function registerPhone(
  opts: {
    handle?: string;
    pushToken?: string;
    pushPlatform?: 'apns' | 'fcm' | 'web';
    seed?: Uint8Array;
  } = {},
): Promise<Phone> {
  const seed = opts.seed ?? generateSeed();
  const master = deriveMasterKey(seed);
  const device = generateKeyPair();
  const bleKey = generateSeed();
  const devicePub = toBase64Url(device.publicKey);
  const nonce = await registrationNonce();
  const res = await request(`${BASE}/devices`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      device_pubkey: devicePub,
      master_pubkey: toBase64Url(master.publicKey),
      master_sig: signIdentityProof(devicePub, master.privateKey, { index: BASE, nonce }),
      nonce,
      ble_key: toBase64Url(bleKey),
      ...(opts.handle && { handle: opts.handle }),
      ...(opts.pushToken && {
        push_token: opts.pushToken,
        push_platform: opts.pushPlatform ?? 'web',
      }),
    }),
  });
  if (res.status !== 201)
    throw new Error(`registerPhone failed: ${res.status} ${await res.text()}`);
  const body = await json<{ device_id: string; idz: string; index_pubkey: string }>(res);
  return {
    seed,
    master,
    device,
    bleKey,
    deviceId: body.device_id,
    idz: body.idz,
    indexPubkey: body.index_pubkey,
  };
}

/** Signed request as the phone. */
export function signedFetch(
  phone: Phone,
  method: string,
  path: string,
  body?: unknown,
  timestamp?: number,
): Promise<Response> {
  const raw = body === undefined ? '' : JSON.stringify(body);
  const t = timestamp ?? Math.floor(Date.now() / 1000);
  const header = signRequest(
    { method, path, body: raw, timestamp: t },
    phone.deviceId,
    phone.device.privateKey,
  );
  return request(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'Idz-Signature': header },
    ...(body !== undefined && { body: raw }),
  });
}

export interface RegisteredSite {
  client_id: string;
  client_secret: string | null;
  rp_id: string;
  name: string;
}

export async function registerSite(
  over: Partial<{
    name: string;
    rp_id: string;
    redirect_uris: string[];
    public: boolean;
    backchannel_logout_uri: string;
    webhook_url: string;
  }> = {},
): Promise<RegisteredSite> {
  const res = await request(`${BASE}/sites`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Example App',
      rp_id: 'app.example.com',
      redirect_uris: ['https://app.example.com/callback'],
      ...over,
    }),
  });
  if (res.status !== 201) throw new Error(`registerSite failed: ${res.status} ${await res.text()}`);
  return json<RegisteredSite>(res);
}

export interface StartedChallenge {
  challenge_id: string;
  code: string;
  exp: number;
  acr: string;
  deep_link: string;
  ws_url: string;
  pushed: boolean;
}

/** A realistic browser identity for pairing tests (the SDK call comes from the browser). */
export const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
export const BROWSER_IP = '203.0.113.9';

export async function startChallenge(
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<StartedChallenge> {
  const res = await request(`${BASE}/challenge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (res.status !== 201)
    throw new Error(`startChallenge failed: ${res.status} ${await res.text()}`);
  return json<StartedChallenge>(res);
}

export async function fetchChallenge(
  id: string,
): Promise<{ payload: Challenge; sig: string; status: string }> {
  const res = await request(`${BASE}/challenge/${id}`);
  if (res.status !== 200) throw new Error(`fetchChallenge failed: ${res.status}`);
  return json(res);
}

/** Build the phone's double-signed assertion for a challenge. */
export function buildAssertion(
  phone: Phone,
  challenge: Challenge,
  over: Partial<{
    iat: number;
    deviceId: string;
    amr: Amr[];
  }> = {},
): SignedAssertion {
  const site = deriveSiteKey(phone.seed, challenge.rp_id);
  const assertion = createAssertion({
    challenge,
    sitePublicKey: site.publicKey,
    deviceId: over.deviceId ?? phone.deviceId,
    amr: over.amr ?? ['face'],
    ...(over.iat !== undefined && { iat: over.iat }),
  });
  return signAssertion(assertion, site.privateKey, phone.device.privateKey);
}

/** Full approve: fetch challenge, sign, POST assertion. */
export async function approve(
  phone: Phone,
  challengeId: string,
  timestampOffset = 0,
): Promise<Response> {
  const { payload } = await fetchChallenge(challengeId);
  const signed = buildAssertion(phone, payload, {
    iat: Math.floor(Date.now() / 1000) + timestampOffset,
  });
  return signedFetch(
    phone,
    'POST',
    `/challenge/${challengeId}/assert`,
    signed,
    Math.floor(Date.now() / 1000) + timestampOffset,
  );
}

// ---------------------------------------------------------------------------------------------
// OIDC flow helpers (authorization code + PKCE against the hosted login page).

export const REDIRECT_URI = 'https://app.example.com/callback';

/** A fixed RFC 7636 verifier/challenge pair (the RFC's own S256 example). */
export const PKCE = {
  verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
  challenge: toBase64Url(sha256(utf8Encode('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'))),
};

/** Fresh random PKCE pair. */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = toBase64Url(randomBytes(32));
  return { verifier, challenge: toBase64Url(sha256(utf8Encode(verifier))) };
}

export type AuthorizeParams = Record<string, string | undefined>;

/** The standard valid authorization request for a site; override or delete (`undefined`) params. */
export function authorizeParams(clientId: string, over: AuthorizeParams = {}): AuthorizeParams {
  return {
    response_type: 'code',
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: 'openid',
    state: 'st4te',
    nonce: 'n0nce',
    code_challenge: PKCE.challenge,
    code_challenge_method: 'S256',
    ...over,
  };
}

function toSearch(params: AuthorizeParams): URLSearchParams {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, v);
  return q;
}

/** `GET /authorize` (or `POST` with a form body) without following redirects. */
export function authorize(
  params: AuthorizeParams,
  method: 'GET' | 'POST' = 'GET',
): Promise<Response> {
  const q = toSearch(params);
  if (method === 'POST') {
    return request(`${BASE}/authorize`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: q,
      redirect: 'manual',
    });
  }
  return request(`${BASE}/authorize?${q.toString()}`, { redirect: 'manual' });
}

/** Parsed OIDC error redirect from `/authorize`. */
export function redirectParams(res: Response): URLSearchParams {
  const location = res.headers.get('location');
  if (!location) throw new Error(`no location header (status ${res.status})`);
  return new URL(location).searchParams;
}

export interface ApprovedLogin {
  html: string;
  challengeId: string;
  code: string;
  state: string | null;
  redirect: URL;
  sub: string;
}

/** Drive `/authorize` -> fake-phone approval -> authorization code. */
export async function authorizeAndApprove(
  site: { client_id: string },
  phone: Phone,
  over: AuthorizeParams = {},
  method: 'GET' | 'POST' = 'GET',
): Promise<ApprovedLogin> {
  const page = await authorize(authorizeParams(site.client_id, over), method);
  if (page.status !== 200) throw new Error(`authorize: ${page.status} ${await page.text()}`);
  const html = await page.text();
  const challengeId = /"challengeId":"(ch_[0-9A-Z]{26})"/.exec(html)?.[1];
  if (!challengeId) throw new Error('no challenge id in page');
  const res = await approve(phone, challengeId);
  if (res.status !== 200) throw new Error(`approve: ${res.status} ${await res.text()}`);
  const body = await json<{ redirect: string; sub: string }>(res);
  const redirect = new URL(body.redirect);
  return {
    html,
    challengeId,
    code: redirect.searchParams.get('code') ?? '',
    state: redirect.searchParams.get('state'),
    redirect,
    sub: body.sub,
  };
}

/** `POST /token` with client_secret_post (or none for public clients); override or delete fields. */
export function exchange(
  site: { client_id: string; client_secret: string | null },
  code: string,
  over: Record<string, string | undefined> = {},
  headers: Record<string, string> = {},
): Promise<Response> {
  const form = toSearch({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: PKCE.verifier,
    client_id: site.client_id,
    ...(site.client_secret ? { client_secret: site.client_secret } : {}),
    ...over,
  });
  return request(`${BASE}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body: form,
  });
}

export interface TokenResponse {
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  refresh_token?: string;
}

/** Full login + exchange; throws unless the exchange succeeded. */
export async function loginAndExchange(
  site: RegisteredSite,
  phone: Phone,
  over: AuthorizeParams = {},
): Promise<{ login: ApprovedLogin; tokens: TokenResponse; res: Response }> {
  const login = await authorizeAndApprove(site, phone, over);
  const res = await exchange(site, login.code);
  if (res.status !== 200) throw new Error(`token: ${res.status} ${await res.text()}`);
  return { login, tokens: await json<TokenResponse>(res.clone()), res };
}

export interface JwksDocument {
  keys: Record<string, unknown>[];
}

export async function jwks(): Promise<JwksDocument> {
  const res = await request(`${BASE}/.well-known/jwks.json`);
  return json<JwksDocument>(res);
}

export async function discovery(): Promise<Record<string, unknown>> {
  const res = await request(`${BASE}/.well-known/openid-configuration`);
  return json<Record<string, unknown>>(res);
}
