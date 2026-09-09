import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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

/** The index migrations up to (not including) the one named, in a folder of their own. */
function migrationsBefore(tag: string): string {
  const src = resolveMigrationsDir();
  const dir = mkdtempSync(join(tmpdir(), 'idz-partial-migrations-'));
  mkdirSync(join(dir, 'meta'));
  const journal = JSON.parse(readFileSync(join(src, 'meta', '_journal.json'), 'utf8')) as {
    entries: { tag: string }[];
  };
  const keep = journal.entries.slice(
    0,
    journal.entries.findIndex((e) => e.tag === tag),
  );
  writeFileSync(join(dir, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries: keep }));
  for (const e of keep) copyFileSync(join(src, `${e.tag}.sql`), join(dir, `${e.tag}.sql`));
  return dir;
}

describe('0003_device_pubkey_unique', () => {
  let handle: DbHandle;
  let partial: string;
  beforeAll(async () => {
    handle = createDb(TEST_DATABASE_URL, { max: 2 });
    await handle.db.execute(sql`drop schema if exists public cascade`);
    await handle.db.execute(sql`drop schema if exists drizzle cascade`);
    await handle.db.execute(sql`create schema public`);
    partial = migrationsBefore('0003_device_pubkey_unique');
  });
  afterAll(async () => {
    await handle.close();
    rmSync(partial, { recursive: true, force: true });
  });

  it('tombstones duplicate device rows, keeps the one in use, and then enforces uniqueness', async () => {
    await migrateDb(handle.db, partial);
    const key = Buffer.alloc(32, 7);
    await handle.db.execute(
      sql`insert into identities (idz, master_pubkey, kind) values ('idz_dup', ${Buffer.alloc(32, 1)}, 'personal')`,
    );
    // Three rows for one key: the newest-used one survives; one twin was revoked, so the key is
    // revoked as a whole and the survivor with it.
    await handle.db.execute(sql`
      insert into devices (id, idz, device_pubkey, status, last_seen_at, created_at) values
        ('dev_old',  'idz_dup', ${key}, 'active',  now() - interval '2 days', now() - interval '3 days'),
        ('dev_used', 'idz_dup', ${key}, 'active',  now(),                     now() - interval '3 days'),
        ('dev_gone', 'idz_dup', ${key}, 'revoked', now() - interval '1 day',  now() - interval '3 days')
    `);
    await handle.db.execute(
      sql`insert into sites (client_id, rp_id, name, redirect_uris) values ('idz_live_s', 's.example', 's', '{https://s.example/cb}')`,
    );
    await handle.db.execute(sql`
      insert into sessions (sid, idz, device_id, client_id, expires_at) values
        ('sid_old', 'idz_dup', 'dev_old', 'idz_live_s', now() + interval '1 hour'),
        ('sid_used', 'idz_dup', 'dev_used', 'idz_live_s', now() + interval '1 hour')
    `);
    await handle.db.execute(
      sql`insert into pairings (id, device_id, browser_pubkey) values ('pr_old', 'dev_old', ${Buffer.alloc(65, 2)})`,
    );

    await migrateDb(handle.db);

    const rows = Array.from(
      await handle.db.execute<{ id: string; status: string; same: boolean }>(
        sql`select id, status, device_pubkey = ${key} as same from devices order by id`,
      ),
    );
    expect(rows).toEqual([
      { id: 'dev_gone', status: 'revoked', same: false },
      { id: 'dev_old', status: 'revoked', same: false },
      { id: 'dev_used', status: 'revoked', same: true },
    ]);
    const tombstones = Array.from(
      await handle.db.execute<{ n: number }>(
        sql`select count(distinct device_pubkey)::int as n from devices`,
      ),
    );
    expect(tombstones[0]?.n).toBe(3);
    const sessions = Array.from(
      await handle.db.execute<{ sid: string; dead: boolean }>(
        sql`select sid, revoked_at is not null as dead from sessions order by sid`,
      ),
    );
    expect(sessions).toEqual([
      { sid: 'sid_old', dead: true },
      { sid: 'sid_used', dead: false },
    ]);
    expect(
      Array.from(await handle.db.execute<{ status: string }>(sql`select status from pairings`))[0]
        ?.status,
    ).toBe('revoked');
    // The unique index now holds the line.
    await expect(
      handle.db.execute(
        sql`insert into devices (id, idz, device_pubkey) values ('dev_again', 'idz_dup', ${key})`,
      ),
    ).rejects.toThrow();
  });
});
