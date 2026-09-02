import { sql } from 'drizzle-orm';
import { createDb, type DbHandle } from '../src/client';
import { migrateDb } from '../src/migrate';

export const TEST_DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://identizen:identizen@localhost:5433/identizen';

/** Drop everything and migrate from scratch. */
export async function freshDatabase(): Promise<DbHandle> {
  const handle = createDb(TEST_DATABASE_URL, { max: 2 });
  await handle.db.execute(sql`drop schema if exists public cascade`);
  await handle.db.execute(sql`drop schema if exists drizzle cascade`);
  await handle.db.execute(sql`create schema public`);
  await migrateDb(handle.db);
  return handle;
}

/** Truncate all data tables between tests (faster than re-migrating). */
export async function truncateAll(handle: DbHandle): Promise<void> {
  await handle.db.execute(
    sql`truncate table audit_events, sessions, verifications, pairings, site_bindings, sites, devices, identities, orgs restart identity cascade`,
  );
}

export const bytes = (fill: number, n = 32): Uint8Array => new Uint8Array(n).fill(fill);
