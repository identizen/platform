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

/**
 * Build the index. Without options this is the hosted single-tenant index. A host that embeds
 * the index (docs: "Embedding the index") passes `resolveEnv` to pick per-request bindings,
 * `hooks` to take part in enrolment, logins and token issuance, `extend` to mount routes, and
 * `stores` to keep in-flight sessions and guards somewhere other than Durable Objects.
 */
export function createApp(options: AppOptions = {}): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const hooks = resolveHooks(options.hooks);

  app.use(
    '*',
    cors({ origin: (o) => o, allowHeaders: ['Content-Type', 'Authorization', 'Idz-Signature'] }),
  );

  app.use('*', async (c, next) => {
    if (options.resolveEnv) c.env = await options.resolveEnv(c.req.raw, c.env);
    const services = createServices(c.env, hooks, options.stores?.(c.env));
    c.set('services', services);
    try {
      await next();
    } finally {
      c.executionCtx.waitUntil(services.close());
    }
  });

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
