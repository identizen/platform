import type { Challenge } from '@identizen/protocol';
import { useEffect, useState } from 'react';
import { usePendingChallenges } from './store';

/**
 * The challenge for the approve screen. While the request is pending it comes from the store;
 * once approved or denied the store drops it, but the screen must keep showing the result, so
 * the last seen challenge is retained for the life of the screen.
 */
export function useChallenge(id: string | undefined): Challenge | null {
  const pending = usePendingChallenges();
  const live = id ? (pending.find((p) => p.challenge.id === id)?.challenge ?? null) : null;
  const [kept, setKept] = useState<Challenge | null>(live);
  useEffect(() => {
    if (live) setKept(live);
  }, [live]);
  if (kept && kept.id !== id) return live;
  return live ?? kept;
}
