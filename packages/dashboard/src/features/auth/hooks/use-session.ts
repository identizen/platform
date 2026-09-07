import { useSyncExternalStore } from 'react';
import {
  getSession,
  sessionSnapshot,
  subscribeSession,
  type DashboardSession,
} from '../api/session';

/** Current dashboard session (null when signed out); re-renders on change. */
export function useSession(): DashboardSession | null {
  const raw = useSyncExternalStore(subscribeSession, sessionSnapshot, () => '');
  return raw ? getSession() : null;
}
