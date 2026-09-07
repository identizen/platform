import { fileURLToPath } from 'node:url';
import { readMigrationFiles, type MigrationMeta } from 'drizzle-orm/migrator';
import type { Db } from './client.js';

/** Absolute path to `db/migrations`, valid whether running from `src/` or `dist/src/`. */
export function resolveMigrationsDir(): string {
  const here = fileURLToPath(import.meta.url);
  const rel = /[\\/]dist[\\/]/.test(here) ? '../../migrations' : '../migrations';
  return fileURLToPath(new URL(rel, import.meta.url));
}

interface Migrator {
  dialect: {
    migrate(
      migrations: MigrationMeta[],
      session: unknown,
      config: { migrationsFolder: string },
    ): Promise<void>;
  };
  session: unknown;
}

/**
 * Apply pending migrations. Safe to call repeatedly (idempotent).
 *
 * Several folders may be given: a host that ships its own migrations next to the index's (an
 * enterprise edition, a fork) lists them after ours. Entries are merged and ordered by their
 * journal timestamp, exactly as one folder would be, so each migration runs once and in
 * creation order. Drizzle records the last applied timestamp, so a migration created earlier
 * than one already applied is never picked up: every folder must add migrations in time order.
 */
export async function migrateDb(
  db: Db,
  folders: string | readonly string[] = resolveMigrationsDir(),
): Promise<void> {
  const list = typeof folders === 'string' ? [folders] : [...folders];
  const migrations = list
    .flatMap((migrationsFolder) => readMigrationFiles({ migrationsFolder }))
    .sort((a, b) => a.folderMillis - b.folderMillis);
  // drizzle's own migrator is exactly this call with one folder's files.
  const internal = db as unknown as Migrator;
  await internal.dialect.migrate(migrations, internal.session, {
    migrationsFolder: list[0] ?? resolveMigrationsDir(),
  });
}
