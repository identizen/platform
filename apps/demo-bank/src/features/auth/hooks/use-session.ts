import { useSyncExternalStore } from 'react';
import { getSession, sessionSnapshot, subscribeSession, type BankSession } from '../api/session';

/** The current bank session, re-rendering when it changes (sign-in, sign-out, another tab). */
export function useSession(): BankSession | null {
  useSyncExternalStore(subscribeSession, sessionSnapshot, () => '');
  return getSession();
}
