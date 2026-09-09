export { createDb, type CreateDbOptions, type Db, type DbHandle, schema } from './client.js';
export { migrateDb, resolveMigrationsDir } from './migrate.js';
export * from './errors.js';
export * from './queries/identities.js';
export * from './queries/devices.js';
export * from './queries/sites.js';
export * from './queries/bindings.js';
export * from './queries/pairings.js';
export * from './queries/verifications.js';
export * from './queries/sessions.js';
export * from './queries/audit.js';
export * from './queries/deliveries.js';
export * from './queries/retention.js';
export type {
  AuditEvent,
  Device,
  DeviceStatus,
  Identity,
  IdentityKind,
  Org,
  PairingRow,
  PairingStatus,
  PushPlatform,
  Session,
  Delivery,
  DeliveryKind,
  DeliveryStatus,
  IdentityTombstone,
  TombstoneReason,
  Site,
  SiteBinding,
  Verification,
  VerificationStatus,
} from '../schema.js';
