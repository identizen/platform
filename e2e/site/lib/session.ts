/** In-memory sessions and users for the sample site. Single process, e2e only. */
import { cookies } from 'next/headers';

export interface SiteSession {
  id: string;
  /** Set by the site's own password login (Path B). */
  username?: string;
  /** Identizen per-site sub from a Path A login or a step-up. */
  sub?: string;
  /** Identizen session id from the id_token; back-channel logout revokes by it. */
  sid?: string;
  acr?: string;
  amr?: string[];
  createdAt: number;
}

export interface SiteUser {
  username: string;
  password: string;
  /** Identizen sub bound at enrollment (Path B). */
  enrolledSub: string | null;
}

interface Store {
  sessions: Map<string, SiteSession>;
  users: Map<string, SiteUser>;
  webhooks: Map<string, { status: string; receivedAt: number }>;
}

const g = globalThis as unknown as { __idzStore?: Store };
function store(): Store {
  g.__idzStore ??= {
    sessions: new Map(),
    users: new Map([['alice', { username: 'alice', password: 'password', enrolledSub: null }]]),
    webhooks: new Map(),
  };
  return g.__idzStore;
}

export const SESSION_COOKIE = 'demo_session';

export async function getSession(): Promise<SiteSession | null> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (!id) return null;
  return store().sessions.get(id) ?? null;
}

export async function createSession(
  partial: Omit<SiteSession, 'id' | 'createdAt'>,
): Promise<SiteSession> {
  const id = crypto.randomUUID();
  const session: SiteSession = { id, createdAt: Date.now(), ...partial };
  store().sessions.set(id, session);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, id, { httpOnly: true, sameSite: 'lax', path: '/' });
  return session;
}

export function updateSession(id: string, patch: Partial<SiteSession>): SiteSession | null {
  const s = store().sessions.get(id);
  if (!s) return null;
  Object.assign(s, patch);
  return s;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (id) store().sessions.delete(id);
  jar.delete(SESSION_COOKIE);
}

/** Back-channel logout: drop every session that carries this Identizen sid. */
export function revokeSessionsBySid(sid: string): number {
  let n = 0;
  for (const [id, s] of store().sessions) {
    if (s.sid === sid) {
      store().sessions.delete(id);
      n++;
    }
  }
  return n;
}

export function findUser(username: string): SiteUser | null {
  return store().users.get(username) ?? null;
}

export function setEnrolledSub(username: string, sub: string): void {
  const u = store().users.get(username);
  if (u) u.enrolledSub = sub;
}

export function recordWebhook(verificationId: string, status: string): void {
  store().webhooks.set(verificationId, { status, receivedAt: Date.now() });
}

export function getWebhook(verificationId: string): { status: string; receivedAt: number } | null {
  return store().webhooks.get(verificationId) ?? null;
}
