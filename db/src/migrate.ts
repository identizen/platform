import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { Db } from './client.js';

/** Absolute path to `db/migrations`, valid whether running from `src/` or `dist/src/`. */
export function resolveMigrationsDir(): string {
  const here = fileURLToPath(import.meta.url);
  const rel = /[\\/]dist[\\/]/.test(here) ? '../../migrations' : '../migrations';
  return fileURLToPath(new URL(rel, import.meta.url));
}

/** Apply pending migrations. Safe to call repeatedly (idempotent). */
export async function migrateDb(
  db: Db,
  migrationsFolder: string = resolveMigrationsDir(),
): Promise<void> {
  await migrate(db, { migrationsFolder });
}
