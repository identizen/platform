import { sql } from 'drizzle-orm';
import { createDb, migrateDb } from '@identizen/db';

const url = process.env.DATABASE_URL ?? 'postgres://identizen:identizen@localhost:5433/identizen';
const handle = createDb(url, { max: 1 });
try {
  await handle.db.execute(sql`drop schema if exists public cascade`);
  await handle.db.execute(sql`drop schema if exists drizzle cascade`);
  await handle.db.execute(sql`create schema public`);
  await migrateDb(handle.db);
  console.info('e2e database reset and migrated');
} finally {
  await handle.close();
}
