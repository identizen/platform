import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { AppEnv } from '../app';

export function healthRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get('/health', async (c) => {
    const { db, indexUrl } = c.get('services');
    let database: 'ok' | 'error' = 'ok';
    try {
      await db.execute(sql`select 1`);
    } catch {
      database = 'error';
    }
    return c.json(
      { ok: database === 'ok', service: 'identizen-index', issuer: indexUrl, database },
      database === 'ok' ? 200 : 503,
    );
  });

  return r;
}
