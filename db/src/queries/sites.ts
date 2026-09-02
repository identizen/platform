import { eq } from 'drizzle-orm';
import type { Db } from '../client';
import { ConflictError, NotFoundError, isUniqueViolation } from '../errors';
import { sites, type Site } from '../../schema';

export interface CreateSiteInput {
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
  if (Object.keys(set).length === 0) return requireSite(db, clientId);
  const [row] = await db.update(sites).set(set).where(eq(sites.clientId, clientId)).returning();
  if (!row) throw new NotFoundError('site', clientId);
  return row;
}

export async function listSites(db: Db): Promise<Site[]> {
  return db.select().from(sites).orderBy(sites.createdAt);
}
