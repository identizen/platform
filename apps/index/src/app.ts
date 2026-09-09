import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './env';
import { resolveHooks, type AppOptions } from './hooks';
import { errorToResponse } from './lib/errors';
import { createServices, type Services } from './lib/services';
import { challengeRoutes } from './routes/challenge';
import { devicesRoutes } from './routes/devices';
import { discoverRoutes } from './routes/discover';
import { healthRoutes } from './routes/health';
import { identitiesRoutes } from './routes/identities';
import { meRoutes } from './routes/me';
import { oidcRoutes } from './routes/oidc';
import { rootRoutes } from './routes/root';
import { verifyRoutes } from './routes/verify';
import { sitesRoutes } from './routes/sites';
import { wellKnownRoutes } from './routes/wellknown';

export interface AppVariables {
  services: Services;
}

export interface AppEnv {
  Bindings: Env;
  Variables: AppVariables;
}

/** Declared request bodies past this are refused before any route runs (F09). */
export const MAX_REQUEST_BYTES = 1024 * 1024;

/** The dashboard's origin plus `CORS_ALLOWED_ORIGINS`: who may call `/me/*` from a browser. */
export function allowedAccountOrigins(env: {
  APP_URL?: string | undefined;
  CORS_ALLOWED_ORIGINS?: string | undefined;
}): Set<string> {
  const origins = new Set<string>();
  const add = (value: string | undefined) => {
    if (!value) return;
    try {
      origins.add(new URL(value).origin);
    } catch {
      /* not a URL: ignored */
    }
  };
  add(env.APP_URL);
  for (const o of (env.CORS_ALLOWED_ORIGINS ?? '').split(',')) add(o.trim());
  return origins;
}

/**
 * Build the index. Without options this is the hosted single-tenant index. A host that embeds
 * the index (docs: "Embedding the index") passes `resolveEnv` to pick per-request bindings,
 * `hooks` to take part in enrollment, logins and token issuance, `extend` to mount routes, and
 * `stores` to keep in-flight sessions and guards somewhere other than Durable Objects.
 */
export function createApp(options: AppOptions = {}): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const hooks = resolveHooks(options.hooks);

  // Header baseline for every response (F08) and a size ceiling on declared bodies (F09):
  // JSON is never sniffed or framed, transport stays strict, and pages carry their own CSP.
  app.use('*', async (c, next) => {
    const declared = Number(c.req.header('content-length') ?? '0');
    if (declared > MAX_REQUEST_BYTES)
      return c.json(
        { error: 'payload_too_large', error_description: 'request body is too large' },
        413,
      );
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
    if (!c.res.headers.has('X-Frame-Options')) c.header('X-Frame-Options', 'DENY');
    if (c.req.url.startsWith('https://'))
      c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  });

  // The per-request env comes first (a multi-tenant host resolves APP_URL and the rest of the
  // bindings here), so the origin policy below judges the tenant's dashboard, not the host's.
  app.use('*', async (c, next) => {
    if (options.resolveEnv) c.env = await options.resolveEnv(c.req.raw, c.env);
    const services = createServices(c.env, hooks, options.stores);
    c.set('services', services);
    try {
      await next();
    } finally {
      c.executionCtx.waitUntil(services.close());
    }
  });

  // CORS by route (F08): the login, discovery and token endpoints answer any origin, because an
  // OIDC public client is whatever site the person is on; the bearer-authenticated account
  // routes answer only the dashboard's origin and the origins the operator lists.
  app.use(
    '*',
    cors({
      origin: (origin, c) => {
        if (!c.req.path.startsWith('/me')) return origin;
        return allowedAccountOrigins(c.env as Env).has(origin) ? origin : null;
      },
      allowHeaders: ['Content-Type', 'Authorization', 'Idz-Signature'],
    }),
  );

  app.onError(errorToResponse);
  app.notFound((c) => c.json({ error: 'not_found', error_description: 'no such route' }, 404));

  app.route('/', rootRoutes());
  app.route('/', healthRoutes());
  app.route('/', wellKnownRoutes());
  app.route('/', devicesRoutes());
  app.route('/', identitiesRoutes());
  app.route('/', challengeRoutes());
  app.route('/', discoverRoutes());
  app.route('/', meRoutes());
  app.route('/', sitesRoutes());
  app.route('/', oidcRoutes());
  app.route('/', verifyRoutes());
  options.extend?.(app);

  return app;
}
