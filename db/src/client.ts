import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../schema';

export type Db = PostgresJsDatabase<typeof schema>;

export interface DbHandle {
  db: Db;
  /** Underlying postgres.js client, for `close()` and raw statements in tests. */
  sql: postgres.Sql;
  close(): Promise<void>;
}

export interface CreateDbOptions {
  /** Pool size. Keep small on Workers (Hyperdrive pools for you). */
  max?: number;
}

/**
 * Create a Drizzle client over postgres.js.
 *
 * Works in Node and on Cloudflare Workers via Hyperdrive (`env.HYPERDRIVE.connectionString`).
 * `prepare: false` and `fetch_types: false` are required for Hyperdrive/pgbouncer-style pooling.
 */
export function createDb(connectionString: string, opts: CreateDbOptions = {}): DbHandle {
  const sql = postgres(connectionString, {
    max: opts.max ?? 5,
    prepare: false,
    fetch_types: false,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => undefined,
  });
  const db = drizzle(sql, { schema, casing: 'snake_case' });
  return {
    db,
    sql,
    close: () => sql.end({ timeout: 5 }),
  };
}

export { schema };
