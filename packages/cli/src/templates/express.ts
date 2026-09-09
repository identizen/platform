import type { TemplateFile } from './next.js';

/** Express router scaffolded by `identizen init`. Mount with `app.use(identizenRouter())`. */
export function expressTemplate(opts: { typescript: boolean }): TemplateFile[] {
  const ext = opts.typescript ? 'ts' : 'js';
  return [
    {
      path: `identizen.${ext}`,
      content: `import { Router } from 'express';
import { createIdentizenServer, pkceChallenge, randomString } from '@identizen/sdk/server';

const env = (k${opts.typescript ? ': string' : ''}) => {
  const v = process.env[k];
  if (!v) throw new Error(\`Missing \${k}. Run \\\`npx identizen init\\\` or set it in .env.\`);
  return v;
};

export const identizen = createIdentizenServer({
  indexUrl: env('IDENTIZEN_INDEX_URL'),
  clientId: env('IDENTIZEN_CLIENT_ID'),
  clientSecret: process.env.IDENTIZEN_CLIENT_SECRET,
});

const SITE_URL = process.env.IDENTIZEN_SITE_URL ?? 'http://localhost:3000';
const REDIRECT_URI = \`\${SITE_URL}/api/auth/callback\`;

/**
 * Where sessions ended by back-channel logout are recorded. The index POSTs a logout token when
 * the person revokes a device or a session in the Identizen app; every instance of your app must
 * see that. The default lives in one process, so it is for development only: with
 * NODE_ENV=production it refuses to run until you replace it with your database or cache (two
 * calls: revoke(sid) and isRevoked(sid)). IDENTIZEN_ALLOW_MEMORY_REVOCATIONS=true is the
 * explicit opt-out for a single-instance deployment that accepts losing revocations on restart.
 */
const memory = new Set${opts.typescript ? '<string>' : ''}();
function requireSharedStore() {
  if (process.env.NODE_ENV === 'production' && process.env.IDENTIZEN_ALLOW_MEMORY_REVOCATIONS !== 'true') {
    throw new Error(
      'identizen: the default revocation store lives in one process and forgets on restart; ' +
        'replace \`revocations\` with your database or cache before production ' +
        '(or set IDENTIZEN_ALLOW_MEMORY_REVOCATIONS=true for a single instance).',
    );
  }
}
export const revocations = {
  revoke: async (sid${opts.typescript ? ': string' : ''}) => { requireSharedStore(); memory.add(sid); },
  isRevoked: async (sid${opts.typescript ? ': string' : ''}) => { requireSharedStore(); return memory.has(sid); },
};

/**
 * Routes: GET /api/auth/login, GET /api/auth/callback, POST /api/auth/logout,
 * POST /api/auth/backchannel-logout. Requires express.urlencoded() and a session middleware
 * (e.g. express-session) that provides req.session.
 */
export function identizenRouter() {
  const r = Router();

  r.get('/api/auth/login', async (req, res) => {
    const state = randomString(16);
    const nonce = randomString(16);
    const verifier = randomString(32);
    req.session.identizenTx = { state, nonce, verifier };
    const stepUpSub = req.query.mode === 'stepup' ? String(req.query.sub ?? '') : '';
    res.redirect(
      identizen.authorizationUrl({
        redirectUri: REDIRECT_URI,
        state,
        nonce,
        codeChallenge: await pkceChallenge(verifier),
        scope: 'openid handle',
        ...(stepUpSub ? { acr: 'idz:mfa', loginHint: stepUpSub } : {}),
        ...(req.query.mode === 'enroll' ? { prompt: 'enroll' } : {}),
      }),
    );
  });

  r.get('/api/auth/callback', async (req, res) => {
    const tx = req.session.identizenTx;
    delete req.session.identizenTx;
    if (req.query.error) return res.redirect(\`/?error=\${encodeURIComponent(String(req.query.error))}\`);
    if (!tx || typeof req.query.code !== 'string' || req.query.state !== tx.state) return res.redirect('/?error=state_mismatch');
    const { claims } = await identizen.exchangeCode({ code: req.query.code, redirectUri: REDIRECT_URI, codeVerifier: tx.verifier, nonce: tx.nonce });
    // A fresh session id after authentication, so a pre-login session fixation cannot follow the person in.
    req.session.regenerate((err${opts.typescript ? ': unknown' : ''}) => {
      if (err) return res.redirect('/?error=session');
      req.session.identizen = { sub: claims.sub, sid: claims.sid, acr: claims.acr, amr: claims.amr };
      res.redirect('/');
    });
  });

  r.post('/api/auth/logout', (req, res) => {
    delete req.session.identizen;
    res.redirect('/');
  });

  r.post('/api/auth/backchannel-logout', async (req, res) => {
    try {
      const { sid } = await identizen.verifyLogoutToken(String(req.body?.logout_token ?? ''));
      await revocations.revoke(sid);
      res.status(200).end();
    } catch (err) {
      res.status(400).json({ error: 'invalid_request', detail: String(err) });
    }
  });

  return r;
}

/** Middleware: exposes req.identizen (null when signed out or revoked). */
export function identizenSession() {
  return async (req${opts.typescript ? ': any' : ''}, _res${opts.typescript ? ': any' : ''}, next${opts.typescript ? ': () => void' : ''}) => {
    const s = req.session?.identizen ?? null;
    req.identizen = s && !(await revocations.isRevoked(s.sid)) ? s : null;
    next();
  };
}
`,
    },
  ];
}
