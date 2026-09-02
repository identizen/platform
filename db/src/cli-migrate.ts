/**
 * Run migrations against DATABASE_URL. Used by CI, the self-host container, and `identizen dev`.
 */
import { createDb } from './client.js';
import { migrateDb } from './migrate.js';

const url = process.env.DATABASE_URL ?? 'postgres://identizen:identizen@localhost:5433/identizen';
const handle = createDb(url, { max: 1 });
try {
  await migrateDb(handle.db);
  console.info('migrations applied');
} finally {
  await handle.close();
}
