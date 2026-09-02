import { and, eq } from 'drizzle-orm';
import { bytesEqual } from '@identizen/protocol';
import type { Db } from '../client';
import { BindingConflictError } from '../errors';
import { siteBindings, type SiteBinding } from '../../schema';

export interface BindInput {
  rpId: string;
  sub: string;
  idz: string;
  sitePubkey: Uint8Array;
}

export interface BindResult {
  binding: SiteBinding;
  /** True when this call created the binding (first login for this site). */
  created: boolean;
}

export async function getBinding(db: Db, rpId: string, sub: string): Promise<SiteBinding | null> {
  const [row] = await db
    .select()
    .from(siteBindings)
    .where(and(eq(siteBindings.rpId, rpId), eq(siteBindings.sub, sub)))
    .limit(1);
  return row ?? null;
}

/**
 * Trust-on-first-use per site (PROTOCOL.md section 4.1 step 7).
 * Creates the binding when absent; when present, the public key and identity must match.
 */
export async function bindOrVerify(db: Db, input: BindInput): Promise<BindResult> {
  const inserted = await db
    .insert(siteBindings)
    .values({ rpId: input.rpId, sub: input.sub, idz: input.idz, sitePubkey: input.sitePubkey })
    .onConflictDoNothing({ target: [siteBindings.rpId, siteBindings.sub] })
    .returning();
  const created = inserted[0];
  if (created) return { binding: created, created: true };
  const existing = await getBinding(db, input.rpId, input.sub);
  if (!existing) throw new BindingConflictError(input.rpId, input.sub);
  if (existing.idz !== input.idz || !bytesEqual(existing.sitePubkey, input.sitePubkey)) {
    throw new BindingConflictError(input.rpId, input.sub);
  }
  return { binding: existing, created: false };
}

export async function listBindingsForIdentity(db: Db, idz: string): Promise<SiteBinding[]> {
  return db
    .select()
    .from(siteBindings)
    .where(eq(siteBindings.idz, idz))
    .orderBy(siteBindings.firstSeenAt);
}

export async function deleteBinding(db: Db, rpId: string, sub: string): Promise<boolean> {
  const rows = await db
    .delete(siteBindings)
    .where(and(eq(siteBindings.rpId, rpId), eq(siteBindings.sub, sub)))
    .returning({ sub: siteBindings.sub });
  return rows.length > 0;
}
