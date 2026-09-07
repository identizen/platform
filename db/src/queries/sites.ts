import { and, eq, isNull, lt } from 'drizzle-orm';
import type { Db } from '../client.js';
import { ConflictError, NotFoundError, isUniqueViolation } from '../errors.js';
import { sites, type Site } from '../../schema.js';

export interface CreateSiteInput {
  verificationToken?: string | null;
  verificationMethod?: string | null;
  verifiedAt?: Date | null;
  clientId: string;
  clientSecretHash?: string | null;
  rpId: string;
  name: string;
  redirectUris: string[];
  backchannelLogoutUri?: string | null;
  webhookUrl?: string | null;
  webhookSecretHash?: string | null;
  orgId?: string | null;
}

export async function createSite(db: Db, input: CreateSiteInput): Promise<Site> {
  try {
    const [row] = await db
      .insert(sites)
      .values({
        clientId: input.clientId,
        clientSecretHash: input.clientSecretHash ?? null,
        rpId: input.rpId,
        name: input.name,
        redirectUris: input.redirectUris,
        backchannelLogoutUri: input.backchannelLogoutUri ?? null,
        webhookUrl: input.webhookUrl ?? null,
        webhookSecretHash: input.webhookSecretHash ?? null,
        orgId: input.orgId ?? null,
        verificationToken: input.verificationToken ?? null,
        verificationMethod: input.verificationMethod ?? null,
        verifiedAt: input.verifiedAt ?? null,
      })
      .returning();
    if (!row) throw new Error('insert returned no row');
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError(`site already registered: ${input.rpId}`);
    throw err;
  }
}

export async function getSite(db: Db, clientId: string): Promise<Site | null> {
  const [row] = await db.select().from(sites).where(eq(sites.clientId, clientId)).limit(1);
  return row ?? null;
}

export async function requireSite(db: Db, clientId: string): Promise<Site> {
  const row = await getSite(db, clientId);
  if (!row) throw new NotFoundError('site', clientId);
  return row;
}

export async function getSiteByRpId(db: Db, rpId: string): Promise<Site | null> {
  const [row] = await db.select().from(sites).where(eq(sites.rpId, rpId)).limit(1);
  return row ?? null;
}

export type UpdateSiteInput = Partial<
  Pick<
    CreateSiteInput,
    | 'name'
    | 'redirectUris'
    | 'backchannelLogoutUri'
    | 'webhookUrl'
    | 'webhookSecretHash'
    | 'clientSecretHash'
    | 'verificationToken'
    | 'verificationMethod'
    | 'verifiedAt'
  >
>;

export async function updateSite(db: Db, clientId: string, patch: UpdateSiteInput): Promise<Site> {
  const set: Partial<typeof sites.$inferInsert> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.redirectUris !== undefined) set.redirectUris = patch.redirectUris;
  if (patch.backchannelLogoutUri !== undefined)
    set.backchannelLogoutUri = patch.backchannelLogoutUri;
  if (patch.webhookUrl !== undefined) set.webhookUrl = patch.webhookUrl;
  if (patch.webhookSecretHash !== undefined) set.webhookSecretHash = patch.webhookSecretHash;
  if (patch.clientSecretHash !== undefined) set.clientSecretHash = patch.clientSecretHash;
  if (patch.verificationToken !== undefined) set.verificationToken = patch.verificationToken;
  if (patch.verificationMethod !== undefined) set.verificationMethod = patch.verificationMethod;
  if (patch.verifiedAt !== undefined) set.verifiedAt = patch.verifiedAt;
  if (Object.keys(set).length === 0) return requireSite(db, clientId);
  const [row] = await db.update(sites).set(set).where(eq(sites.clientId, clientId)).returning();
  if (!row) throw new NotFoundError('site', clientId);
  return row;
}

/** Every registration for a host, verified or not. */
export async function listSitesByRpId(db: Db, rpId: string): Promise<Site[]> {
  return db.select().from(sites).where(eq(sites.rpId, rpId)).orderBy(sites.createdAt);
}

/** Drop registrations for a host that never proved the domain and are older than `before`. */
export async function deleteStalePendingSites(db: Db, rpId: string, before: Date): Promise<number> {
  const rows = await db
    .delete(sites)
    .where(and(eq(sites.rpId, rpId), isNull(sites.verifiedAt), lt(sites.createdAt, before)))
    .returning({ clientId: sites.clientId });
  return rows.length;
}

export async function listSites(db: Db): Promise<Site[]> {
  return db.select().from(sites).orderBy(sites.createdAt);
}
