import { eq } from 'drizzle-orm';
import type { Db } from '../client';
import { HandleTakenError, NotFoundError, isUniqueViolation, pgErrorField } from '../errors';
import { identities, type Identity, type IdentityKind } from '../../schema';

export interface CreateIdentityInput {
  idz: string;
  masterPubkey: Uint8Array;
  handle?: string | null;
  kind?: IdentityKind;
  orgId?: string | null;
}

export async function createIdentity(db: Db, input: CreateIdentityInput): Promise<Identity> {
  try {
    const [row] = await db
      .insert(identities)
      .values({
        idz: input.idz,
        masterPubkey: input.masterPubkey,
        handle: input.handle ?? null,
        kind: input.kind ?? 'personal',
        orgId: input.orgId ?? null,
      })
      .returning();
    if (!row) throw new Error('insert returned no row');
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) {
      const detail = pgErrorField(err, 'constraint_name') ?? '';
      if (detail.includes('handle') && input.handle) throw new HandleTakenError(input.handle);
      throw new HandleTakenError(input.idz);
    }
    throw err;
  }
}

export async function getIdentity(db: Db, idz: string): Promise<Identity | null> {
  const [row] = await db.select().from(identities).where(eq(identities.idz, idz)).limit(1);
  return row ?? null;
}

export async function requireIdentity(db: Db, idz: string): Promise<Identity> {
  const row = await getIdentity(db, idz);
  if (!row) throw new NotFoundError('identity', idz);
  return row;
}

export async function getIdentityByHandle(db: Db, handle: string): Promise<Identity | null> {
  const [row] = await db
    .select()
    .from(identities)
    .where(eq(identities.handle, handle.toLowerCase()))
    .limit(1);
  return row ?? null;
}

export async function setHandle(db: Db, idz: string, handle: string | null): Promise<Identity> {
  try {
    const [row] = await db
      .update(identities)
      .set({ handle: handle ? handle.toLowerCase() : null })
      .where(eq(identities.idz, idz))
      .returning();
    if (!row) throw new NotFoundError('identity', idz);
    return row;
  } catch (err) {
    if (isUniqueViolation(err) && handle) throw new HandleTakenError(handle);
    throw err;
  }
}
