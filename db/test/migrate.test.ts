import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type DbHandle } from '../src/client';
import { migrateDb, resolveMigrationsDir } from '../src/migrate';
import { TEST_DATABASE_URL } from './setup';

/** A host's migration folder: one migration created after every index migration. */
function hostFolder(): string {
  const dir = mkdtempSync(join(tmpdir(), 'idz-host-migrations-'));
  mkdirSync(join(dir, 'meta'));
  writeFileSync(
    join(dir, 'meta', '_journal.json'),
    JSON.stringify({
      version: '7',
      dialect: 'postgresql',
      entries: [
        { idx: 0, version: '7', when: Date.now(), tag: '9000_host_probe', breakpoints: true },
      ],
    }),
  );
  writeFileSync(
    join(dir, '9000_host_probe.sql'),
    'create table host_probe (id text primary key, org_id text references orgs(id));\n',
  );
  return dir;
}

async function regclass(handle: DbHandle, name: string): Promise<string | null> {
  const rows = await handle.db.execute<{ ok: string | null }>(
    sql`select to_regclass(${'public.' + name})::text as ok`,
  );
  return Array.from(rows)[0]?.ok ?? null;
}

describe('migrateDb with several folders', () => {
  let handle: DbHandle;
  let extra: string;

  beforeAll(async () => {
    handle = createDb(TEST_DATABASE_URL, { max: 2 });
    await handle.db.execute(sql`drop schema if exists public cascade`);
    await handle.db.execute(sql`drop schema if exists drizzle cascade`);
    await handle.db.execute(sql`create schema public`);
    extra = hostFolder();
  });

  afterAll(async () => {
    await handle.close();
    rmSync(extra, { recursive: true, force: true });
  });

  it('applies the index migrations, then the host folder, exactly once', async () => {
    const folders = [resolveMigrationsDir(), extra];
    await migrateDb(handle.db, folders);
    expect(await regclass(handle, 'sites')).toBe('sites');
    expect(await regclass(handle, 'host_probe')).toBe('host_probe');

    await migrateDb(handle.db, folders); // idempotent
    const applied = await handle.db.execute<{ n: string }>(
      sql`select count(*)::text as n from drizzle.__drizzle_migrations`,
    );
    const open = readdirSync(resolveMigrationsDir()).filter((f) => f.endsWith('.sql')).length;
    expect(Number(Array.from(applied)[0]?.n)).toBe(open + 1);
  });
});
