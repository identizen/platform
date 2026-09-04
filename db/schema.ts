/**
 * Identizen index schema. Reference SQL: the implementation plan (internal), section 3.
 *
 * The index stores no secrets: public keys, push tokens, BLE HMAC keys (resolvable only by the
 * index), revocation state, and audit events. Adding a table or column requires an explicit
 * decision (see CLAUDE.md).
 */
import { sql } from 'drizzle-orm';
import {
  bigserial,
  check,
  customType,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

/** Postgres `bytea` mapped to Uint8Array on both sides. */
export const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType() {
    return 'bytea';
  },
  toDriver(value: Uint8Array): Uint8Array {
    return value;
  },
  fromDriver(value: unknown): Uint8Array {
    if (value instanceof Uint8Array) return new Uint8Array(value);
    if (typeof value === 'string' && value.startsWith('\\x')) {
      const hex = value.slice(2);
      const out = new Uint8Array(hex.length / 2);
      for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      return out;
    }
    throw new TypeError('unexpected bytea driver value');
  },
});

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const IDENTITY_KINDS = ['personal', 'org'] as const;
export const PUSH_PLATFORMS = ['apns', 'fcm', 'web'] as const;
export const DEVICE_STATUSES = ['active', 'disabled', 'revoked'] as const;
export const PAIRING_STATUSES = ['active', 'revoked'] as const;
export const VERIFICATION_STATUSES = ['pending', 'approved', 'denied', 'timeout'] as const;

export type IdentityKind = (typeof IDENTITY_KINDS)[number];
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];
export type DeviceStatus = (typeof DEVICE_STATUSES)[number];
export type PairingStatus = (typeof PAIRING_STATUSES)[number];
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const orgs = pgTable('orgs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});

export const identities = pgTable(
  'identities',
  {
    idz: text('idz').primaryKey(),
    masterPubkey: bytea('master_pubkey').notNull(),
    handle: text('handle').unique(),
    kind: text('kind', { enum: IDENTITY_KINDS }).notNull(),
    orgId: text('org_id').references(() => orgs.id),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [check('identities_kind_check', sql`${t.kind} in ('personal','org')`)],
);

export const devices = pgTable(
  'devices',
  {
    id: text('id').primaryKey(),
    idz: text('idz')
      .notNull()
      .references(() => identities.idz),
    devicePubkey: bytea('device_pubkey').notNull(),
    bleKey: bytea('ble_key'),
    pushToken: text('push_token'),
    pushPlatform: text('push_platform', { enum: PUSH_PLATFORMS }),
    attestation: jsonb('attestation').$type<Record<string, unknown>>(),
    status: text('status', { enum: DEVICE_STATUSES }).notNull().default('active'),
    lastSeenAt: timestamptz('last_seen_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('devices_push_platform_check', sql`${t.pushPlatform} in ('apns','fcm','web')`),
    check('devices_status_check', sql`${t.status} in ('active','disabled','revoked')`),
  ],
);

export const sites = pgTable('sites', {
  clientId: text('client_id').primaryKey(),
  clientSecretHash: text('client_secret_hash'),
  rpId: text('rp_id').notNull().unique(),
  name: text('name').notNull(),
  redirectUris: text('redirect_uris').array().notNull(),
  backchannelLogoutUri: text('backchannel_logout_uri'),
  webhookUrl: text('webhook_url'),
  webhookSecretHash: text('webhook_secret_hash'),
  orgId: text('org_id').references(() => orgs.id),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});

export const siteBindings = pgTable(
  'site_bindings',
  {
    rpId: text('rp_id').notNull(),
    sub: text('sub').notNull(),
    idz: text('idz')
      .notNull()
      .references(() => identities.idz),
    sitePubkey: bytea('site_pubkey').notNull(),
    firstSeenAt: timestamptz('first_seen_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.rpId, t.sub] })],
);

export const pairings = pgTable(
  'pairings',
  {
    id: text('id').primaryKey(),
    deviceId: text('device_id')
      .notNull()
      .references(() => devices.id),
    browserPubkey: bytea('browser_pubkey').notNull(),
    label: text('label'),
    /** Raw User-Agent of the browser that paired; parsed at read time. */
    userAgent: text('user_agent'),
    /** Client IP at pairing, refreshed on each use. */
    lastIp: text('last_ip'),
    status: text('status', { enum: PAIRING_STATUSES }).notNull().default('active'),
    lastUsedAt: timestamptz('last_used_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [check('pairings_status_check', sql`${t.status} in ('active','revoked')`)],
);

export const verifications = pgTable(
  'verifications',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => sites.clientId),
    sub: text('sub').notNull(),
    reason: text('reason'),
    status: text('status', { enum: VERIFICATION_STATUSES }).notNull().default('pending'),
    assertion: jsonb('assertion').$type<Record<string, unknown>>(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    resolvedAt: timestamptz('resolved_at'),
  },
  (t) => [
    check(
      'verifications_status_check',
      sql`${t.status} in ('pending','approved','denied','timeout')`,
    ),
  ],
);

export const sessions = pgTable('sessions', {
  sid: text('sid').primaryKey(),
  idz: text('idz')
    .notNull()
    .references(() => identities.idz),
  deviceId: text('device_id')
    .notNull()
    .references(() => devices.id),
  clientId: text('client_id')
    .notNull()
    .references(() => sites.clientId),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  expiresAt: timestamptz('expires_at').notNull(),
  revokedAt: timestamptz('revoked_at'),
});

export const auditEvents = pgTable(
  'audit_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    at: timestamptz('at').notNull().defaultNow(),
    idz: text('idz'),
    deviceId: text('device_id'),
    clientId: text('client_id'),
    orgId: text('org_id'),
    kind: text('kind').notNull(),
    detail: jsonb('detail').$type<Record<string, unknown>>(),
  },
  (t) => [index('audit_events_idz_at_idx').on(t.idz, t.at.desc())],
);

export type Org = typeof orgs.$inferSelect;
export type Identity = typeof identities.$inferSelect;
export type Device = typeof devices.$inferSelect;
export type Site = typeof sites.$inferSelect;
export type SiteBinding = typeof siteBindings.$inferSelect;
export type PairingRow = typeof pairings.$inferSelect;
export type Verification = typeof verifications.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
