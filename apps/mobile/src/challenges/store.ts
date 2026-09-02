/**
 * In-memory pending challenges + a persisted local activity log. Exposed through
 * `useSyncExternalStore` hooks; no global mutable stores are imported by components directly.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Challenge } from '@identizen/protocol';
import { useSyncExternalStore } from 'react';
import { KEYS } from '../identity/store';

export interface PendingChallenge {
  challenge: Challenge;
  receivedAt: number;
  via: 'push' | 'scan' | 'link' | 'poll';
}

export interface ActivityEntry {
  at: number;
  kind: 'approved' | 'denied' | 'expired' | 'failed' | 'received';
  rpName: string;
  acr: string;
  reason: string | null;
  challengeId: string;
}

const MAX_ACTIVITY = 100;

let pending: PendingChallenge[] = [];
let activity: ActivityEntry[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export const challengeStore = {
  subscribe,
  getPending: (): PendingChallenge[] => pending,
  getActivity: (): ActivityEntry[] => activity,
  find: (id: string): PendingChallenge | undefined => pending.find((p) => p.challenge.id === id),

  add(p: PendingChallenge): void {
    if (pending.some((x) => x.challenge.id === p.challenge.id)) return;
    pending = [...pending, p];
    emit();
  },
  remove(id: string): void {
    pending = pending.filter((p) => p.challenge.id !== id);
    emit();
  },
  /** Drop challenges past `exp` (called by the home screen on focus and by the poller). */
  pruneExpired(now = Math.floor(Date.now() / 1000)): void {
    const before = pending.length;
    pending = pending.filter((p) => p.challenge.exp + 5 >= now);
    if (pending.length !== before) emit();
  },
  async record(entry: ActivityEntry): Promise<void> {
    activity = [entry, ...activity].slice(0, MAX_ACTIVITY);
    emit();
    try {
      await AsyncStorage.setItem(KEYS.activity, JSON.stringify(activity));
    } catch {
      /* best effort */
    }
  },
  async load(): Promise<void> {
    if (loaded) return;
    loaded = true;
    try {
      const raw = await AsyncStorage.getItem(KEYS.activity);
      if (raw) activity = JSON.parse(raw) as ActivityEntry[];
    } catch {
      activity = [];
    }
    emit();
  },
  /** Tests only. */
  reset(): void {
    pending = [];
    activity = [];
    loaded = false;
    emit();
  },
};

export function usePendingChallenges(): PendingChallenge[] {
  return useSyncExternalStore(subscribe, challengeStore.getPending, challengeStore.getPending);
}

export function useActivity(): ActivityEntry[] {
  return useSyncExternalStore(subscribe, challengeStore.getActivity, challengeStore.getActivity);
}
