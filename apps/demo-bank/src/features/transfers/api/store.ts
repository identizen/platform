/**
 * Transfers live in this tab's sessionStorage. A real bank posts them to its ledger; the demo
 * keeps the shape a ledger would want, including which Identizen challenge approved each one.
 */
import type { Transfer } from '../types';

const KEY = 'jtm:transfers';
const listeners = new Set<() => void>();

function read(): Transfer[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Transfer[]) : [];
  } catch {
    return [];
  }
}

function write(list: Transfer[]): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
  for (const l of listeners) l();
}

export function listTransfers(): Transfer[] {
  return read();
}

export function addTransfer(t: Transfer): void {
  write([t, ...read()]);
}

export function updateTransfer(id: string, patch: Partial<Transfer>): Transfer | null {
  const list = read();
  const i = list.findIndex((t) => t.id === id);
  const current = list[i];
  if (!current) return null;
  const next = { ...current, ...patch };
  list[i] = next;
  write(list);
  return next;
}

export function subscribeTransfers(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function transfersSnapshot(): string {
  try {
    return sessionStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function newTransferId(): string {
  return `tr_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
}
