export { createDb, type CreateDbOptions, type Db, type DbHandle, schema } from './client';
export { migrateDb, resolveMigrationsDir } from './migrate';
export * from './errors';
export * from './queries/identities';
export * from './queries/devices';
export * from './queries/sites';
export * from './queries/bindings';
export * from './queries/pairings';
export * from './queries/verifications';
export * from './queries/sessions';
export * from './queries/audit';
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
  Site,
  SiteBinding,
  Verification,
  VerificationStatus,
} from '../schema';
