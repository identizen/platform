import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DbHandle } from '../src/client';
import { migrateDb, resolveMigrationsDir } from '../src/migrate';
import { freshDatabase } from './setup';

/**
 * Reference: planning/identizen-implementation-plan.md section 3.
 * column -> [data_type, is_nullable, column_default (substring) | null]
 */
const REFERENCE: Record<string, Record<string, [string, 'YES' | 'NO', string | null]>> = {
  identities: {
    idz: ['text', 'NO', null],
    master_pubkey: ['bytea', 'NO', null],
    handle: ['text', 'YES', null],
    kind: ['text', 'NO', null],
    org_id: ['text', 'YES', null],
    created_at: ['timestamp with time zone', 'NO', 'now()'],
  },
  devices: {
    id: ['text', 'NO', null],
    idz: ['text', 'NO', null],
    device_pubkey: ['bytea', 'NO', null],
    ble_key: ['bytea', 'YES', null],
    push_token: ['text', 'YES', null],
    push_platform: ['text', 'YES', null],
    attestation: ['jsonb', 'YES', null],
    status: ['text', 'NO', "'active'"],
    last_seen_at: ['timestamp with time zone', 'YES', null],
    created_at: ['timestamp with time zone', 'NO', 'now()'],
  },
  sites: {
    client_id: ['text', 'NO', null],
    client_secret_hash: ['text', 'YES', null],
    rp_id: ['text', 'NO', null],
    name: ['text', 'NO', null],
    redirect_uris: ['ARRAY', 'NO', null],
    backchannel_logout_uri: ['text', 'YES', null],
    webhook_url: ['text', 'YES', null],
    webhook_secret_hash: ['text', 'YES', null],
    org_id: ['text', 'YES', null],
    created_at: ['timestamp with time zone', 'NO', 'now()'],
  },
  site_bindings: {
    rp_id: ['text', 'NO', null],
    sub: ['text', 'NO', null],
    idz: ['text', 'NO', null],
    site_pubkey: ['bytea', 'NO', null],
    first_seen_at: ['timestamp with time zone', 'NO', 'now()'],
  },
  pairings: {
    id: ['text', 'NO', null],
    device_id: ['text', 'NO', null],
    browser_pubkey: ['bytea', 'NO', null],
    label: ['text', 'YES', null],
    status: ['text', 'NO', "'active'"],
    last_used_at: ['timestamp with time zone', 'YES', null],
    created_at: ['timestamp with time zone', 'NO', 'now()'],
  },
  verifications: {
    id: ['text', 'NO', null],
    client_id: ['text', 'NO', null],
    sub: ['text', 'NO', null],
    reason: ['text', 'YES', null],
    status: ['text', 'NO', "'pending'"],
    assertion: ['jsonb', 'YES', null],
    created_at: ['timestamp with time zone', 'NO', 'now()'],
    resolved_at: ['timestamp with time zone', 'YES', null],
  },
  sessions: {
    sid: ['text', 'NO', null],
    idz: ['text', 'NO', null],
    device_id: ['text', 'NO', null],
    client_id: ['text', 'NO', null],
    created_at: ['timestamp with time zone', 'NO', 'now()'],
    expires_at: ['timestamp with time zone', 'NO', null],
    revoked_at: ['timestamp with time zone', 'YES', null],
  },
  orgs: {
    id: ['text', 'NO', null],
    name: ['text', 'NO', null],
    created_at: ['timestamp with time zone', 'NO', 'now()'],
  },
  audit_events: {
    id: ['bigint', 'NO', 'nextval'],
    at: ['timestamp with time zone', 'NO', 'now()'],
    idz: ['text', 'YES', null],
    device_id: ['text', 'YES', null],
    client_id: ['text', 'YES', null],
    org_id: ['text', 'YES', null],
    kind: ['text', 'NO', null],
    detail: ['jsonb', 'YES', null],
  },
};

const REFERENCE_CONSTRAINTS: [table: string, type: string, columns: string][] = [
  ['identities', 'PRIMARY KEY', 'idz'],
  ['identities', 'UNIQUE', 'handle'],
  ['identities', 'FOREIGN KEY', 'org_id'],
  ['devices', 'PRIMARY KEY', 'id'],
  ['devices', 'FOREIGN KEY', 'idz'],
  ['sites', 'PRIMARY KEY', 'client_id'],
  ['sites', 'UNIQUE', 'rp_id'],
  ['sites', 'FOREIGN KEY', 'org_id'],
  ['site_bindings', 'PRIMARY KEY', 'rp_id,sub'],
  ['site_bindings', 'FOREIGN KEY', 'idz'],
  ['pairings', 'PRIMARY KEY', 'id'],
  ['pairings', 'FOREIGN KEY', 'device_id'],
  ['verifications', 'PRIMARY KEY', 'id'],
  ['verifications', 'FOREIGN KEY', 'client_id'],
  ['sessions', 'PRIMARY KEY', 'sid'],
  ['sessions', 'FOREIGN KEY', 'idz'],
  ['sessions', 'FOREIGN KEY', 'device_id'],
  ['sessions', 'FOREIGN KEY', 'client_id'],
  ['orgs', 'PRIMARY KEY', 'id'],
  ['audit_events', 'PRIMARY KEY', 'id'],
];

const REFERENCE_CHECKS: [table: string, mustContain: string][] = [
  ['identities', "'personal'"],
  ['devices', "'apns'"],
  ['devices', "'revoked'"],
  ['pairings', "'revoked'"],
  ['verifications', "'timeout'"],
];

interface ColumnRow {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: 'YES' | 'NO';
  column_default: string | null;
}

describe('schema migration', () => {
  let handle: DbHandle;

  beforeAll(async () => {
    handle = await freshDatabase();
  });

  afterAll(async () => {
    await handle.close();
  });

  it('has exactly one committed migration that creates every section-3 table', () => {
    const dir = resolveMigrationsDir();
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql'));
    expect(files.length).toBeGreaterThanOrEqual(1);
    const text = files.map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
    for (const table of Object.keys(REFERENCE)) {
      expect(text, `migration creates ${table}`).toMatch(new RegExp(`CREATE TABLE "${table}"`));
    }
    expect(text).toMatch(/CREATE INDEX "audit_events_idz_at_idx"/);
  });

  it('columns match the reference SQL (type, nullability, default)', async () => {
    const rows = (await handle.db.execute(sql`
      select table_name, column_name, data_type, is_nullable, column_default
      from information_schema.columns
      where table_schema = 'public'
      order by table_name, ordinal_position
    `)) as unknown as ColumnRow[];
    const byTable = new Map<string, Map<string, ColumnRow>>();
    for (const r of rows) {
      if (!byTable.has(r.table_name)) byTable.set(r.table_name, new Map());
      byTable.get(r.table_name)?.set(r.column_name, r);
    }
    expect([...byTable.keys()].sort()).toEqual(Object.keys(REFERENCE).sort());
    for (const [table, cols] of Object.entries(REFERENCE)) {
      const actual = byTable.get(table);
      expect(actual, table).toBeDefined();
      if (!actual) continue;
      expect([...actual.keys()].sort(), `${table} columns`).toEqual(Object.keys(cols).sort());
      for (const [col, [type, nullable, def]] of Object.entries(cols)) {
        const a = actual.get(col);
        expect(a?.data_type, `${table}.${col} type`).toBe(type);
        expect(a?.is_nullable, `${table}.${col} nullable`).toBe(nullable);
        if (def === null) expect(a?.column_default, `${table}.${col} default`).toBeNull();
        else expect(a?.column_default ?? '', `${table}.${col} default`).toContain(def);
      }
    }
  });

  it('constraints match the reference SQL', async () => {
    const rows = (await handle.db.execute(sql`
      select tc.table_name, tc.constraint_type,
             string_agg(kcu.column_name, ',' order by kcu.ordinal_position) as columns
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
      where tc.table_schema = 'public'
        and tc.constraint_type in ('PRIMARY KEY','UNIQUE','FOREIGN KEY')
      group by tc.table_name, tc.constraint_name, tc.constraint_type
    `)) as unknown as { table_name: string; constraint_type: string; columns: string }[];
    const set = new Set(rows.map((r) => `${r.table_name}|${r.constraint_type}|${r.columns}`));
    for (const [t, type, cols] of REFERENCE_CONSTRAINTS) {
      expect(set.has(`${t}|${type}|${cols}`), `${t} ${type} (${cols})`).toBe(true);
    }
    const checks = (await handle.db.execute(sql`
      select tc.table_name, cc.check_clause
      from information_schema.table_constraints tc
      join information_schema.check_constraints cc on cc.constraint_name = tc.constraint_name
      where tc.table_schema = 'public' and tc.constraint_type = 'CHECK'
        and tc.constraint_name not like '%not_null%'
    `)) as unknown as { table_name: string; check_clause: string }[];
    for (const [t, needle] of REFERENCE_CHECKS) {
      expect(
        checks.some((c) => c.table_name === t && c.check_clause.includes(needle)),
        `${t} check contains ${needle}`,
      ).toBe(true);
    }
  });

  it('migrate is idempotent', async () => {
    await expect(migrateDb(handle.db)).resolves.toBeUndefined();
    await expect(migrateDb(handle.db)).resolves.toBeUndefined();
  });
});
