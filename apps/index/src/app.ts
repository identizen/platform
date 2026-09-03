import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './env';
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

export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use(
    '*',
    cors({ origin: (o) => o, allowHeaders: ['Content-Type', 'Authorization', 'Idz-Signature'] }),
  );

  app.use('*', async (c, next) => {
    const services = createServices(c.env);
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

  return app;
}
