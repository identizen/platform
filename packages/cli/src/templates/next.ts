/** Files scaffolded into a Next.js (app router) project by `identizen init`. */
export interface TemplateFile {
  path: string;
  content: string;
}

export function nextTemplate(opts: { appDir: string; libDir: string }): TemplateFile[] {
  const lib = opts.libDir.replace(/\\/g, '/');
  const app = opts.appDir.replace(/\\/g, '/');
  const importLib = lib.startsWith('src/') ? '@/lib/identizen' : `@/${lib}/identizen`;
  return [
    {
      path: `${lib}/identizen.ts`,
      content: `import { createIdentizenServer } from '@identizen/sdk/server';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(\`Missing \${k}. Run \\\`npx identizen init\\\` or set it in .env.local.\`);
  return v;
};

/** Server-side Identizen client. */
export const identizen = createIdentizenServer({
  indexUrl: env('IDENTIZEN_INDEX_URL'),
  clientId: env('IDENTIZEN_CLIENT_ID'),
  clientSecret: process.env.IDENTIZEN_CLIENT_SECRET,
});

export const SITE_URL = process.env.IDENTIZEN_SITE_URL ?? 'http://localhost:3000';
export const REDIRECT_URI = \`\${SITE_URL}/api/auth/callback\`;

export interface IdentizenSession {
  sub: string;
  sid: string;
  acr: string;
  amr: string[];
  handle?: string;
}

const COOKIE = 'identizen_session';
const SECURE = SITE_URL.startsWith('https');
/** Cookie signing key: its own secret, never the OIDC client secret. \`identizen init\` writes one. */
const key = () => new TextEncoder().encode(env('IDENTIZEN_SESSION_SECRET'));

/**
 * Where sessions ended by back-channel logout are recorded. The index POSTs a logout token when
 * the person revokes a device or a session in the Identizen app; every instance of your app must
 * see that. The default below lives in one process, so it is for development only: with
 * NODE_ENV=production it refuses to run until you replace it with your database or cache (the
 * interface is two calls). IDENTIZEN_ALLOW_MEMORY_REVOCATIONS=true is the explicit opt-out for
 * a single-instance deployment that accepts losing revocations on restart.
 */
export interface RevocationStore {
  revoke(sid: string): Promise<void>;
  isRevoked(sid: string): Promise<boolean>;
}
const memory = new Set<string>();
function requireSharedStore(): void {
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.IDENTIZEN_ALLOW_MEMORY_REVOCATIONS !== 'true'
  ) {
    throw new Error(
      'identizen: the default revocation store lives in one process and forgets on restart; ' +
        'replace \`revocations\` with your database or cache before production ' +
        '(or set IDENTIZEN_ALLOW_MEMORY_REVOCATIONS=true for a single instance).',
    );
  }
}
export const revocations: RevocationStore = {
  revoke: async (sid) => {
    requireSharedStore();
    memory.add(sid);
  },
  isRevoked: async (sid) => {
    requireSharedStore();
    return memory.has(sid);
  },
};

/** Read the signed session cookie (null when signed out or revoked). Replace with your own session store any time. */
export async function getIdentizenSession(): Promise<IdentizenSession | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    if (await revocations.isRevoked(String(payload.sid))) return null;
    return payload as unknown as IdentizenSession;
  } catch {
    return null;
  }
}

/** Sessions last a day by default (IDENTIZEN_SESSION_TTL, seconds); a revocation ends them sooner. */
export async function setIdentizenSession(session: IdentizenSession): Promise<void> {
  const ttl = Number(process.env.IDENTIZEN_SESSION_TTL ?? 86_400);
  const token = await new SignJWT({ ...session }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(Math.floor(Date.now() / 1000) + ttl).sign(key());
  const jar = await cookies();
  jar.set(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: SECURE, path: '/', maxAge: ttl });
}

export async function clearIdentizenSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export const TX_COOKIE = { httpOnly: true, sameSite: 'lax' as const, secure: SECURE, path: '/', maxAge: 600 };
`,
    },
    {
      path: `${app}/api/auth/login/route.ts`,
      content: `import { cookies } from 'next/headers';
import { pkceChallenge, randomString } from '@identizen/sdk/server';
import { identizen, REDIRECT_URI, TX_COOKIE } from '${importLib}';

/** GET /api/auth/login -> redirect to Identizen. Add ?mode=stepup&sub=… for Path B step-up. */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const state = randomString(16);
  const nonce = randomString(16);
  const verifier = randomString(32);
  const jar = await cookies();
  jar.set('identizen_tx', JSON.stringify({ state, nonce, verifier }), TX_COOKIE);
  const stepUpSub = url.searchParams.get('mode') === 'stepup' ? url.searchParams.get('sub') : null;
  return Response.redirect(
    identizen.authorizationUrl({
      redirectUri: REDIRECT_URI,
      state,
      nonce,
      codeChallenge: await pkceChallenge(verifier),
      scope: 'openid handle',
      ...(stepUpSub ? { acr: 'idz:mfa', loginHint: stepUpSub } : {}),
      ...(url.searchParams.get('mode') === 'enroll' ? { prompt: 'enroll' } : {}),
    }),
    302,
  );
}
`,
    },
    {
      path: `${app}/api/auth/callback/route.ts`,
      content: `import { cookies } from 'next/headers';
import { identizen, REDIRECT_URI, SITE_URL, setIdentizenSession } from '${importLib}';

/** GET /api/auth/callback?code=&state= -> exchange the code, set the session, go home. */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const jar = await cookies();
  const raw = jar.get('identizen_tx')?.value;
  jar.delete('identizen_tx');
  const tx = raw ? (JSON.parse(raw) as { state: string; nonce: string; verifier: string }) : null;
  const error = url.searchParams.get('error');
  if (error) return Response.redirect(\`\${SITE_URL}/?error=\${encodeURIComponent(error)}\`, 302);
  const code = url.searchParams.get('code');
  if (!tx || !code || url.searchParams.get('state') !== tx.state) {
    return Response.redirect(\`\${SITE_URL}/?error=state_mismatch\`, 302);
  }
  const { claims } = await identizen.exchangeCode({ code, redirectUri: REDIRECT_URI, codeVerifier: tx.verifier, nonce: tx.nonce });
  await setIdentizenSession({ sub: claims.sub, sid: claims.sid, acr: claims.acr, amr: claims.amr, ...(claims.idz_handle ? { handle: claims.idz_handle } : {}) });
  return Response.redirect(\`\${SITE_URL}/\`, 302);
}
`,
    },
    {
      path: `${app}/api/auth/logout/route.ts`,
      content: `import { clearIdentizenSession, SITE_URL } from '${importLib}';

export async function POST(): Promise<Response> {
  await clearIdentizenSession();
  return Response.redirect(\`\${SITE_URL}/\`, 303);
}
`,
    },
    {
      path: `${app}/api/auth/backchannel-logout/route.ts`,
      content: `import { identizen, revocations } from '${importLib}';

/** Identizen posts a logout token here when the user revokes a device or session. */
export async function POST(req: Request): Promise<Response> {
  const form = await req.formData();
  const token = form.get('logout_token');
  if (typeof token !== 'string') return Response.json({ error: 'invalid_request' }, { status: 400 });
  try {
    const { sid } = await identizen.verifyLogoutToken(token);
    await revocations.revoke(sid);
    return new Response(null, { status: 200, headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    return Response.json({ error: 'invalid_request', detail: String(err) }, { status: 400 });
  }
}
`,
    },
  ];
}
