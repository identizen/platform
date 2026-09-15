import { useQuery } from '@tanstack/react-query';
import { getChallenge, getChallengeState } from '../api/challenge';

/** `indexUrl`: the issuer the link names (`?index=`), or undefined for the dashboard's own index. */
export function useChallenge(id: string, indexUrl?: string) {
  return useQuery({
    queryKey: ['challenge', indexUrl ?? null, id],
    queryFn: () => getChallenge(id, indexUrl),
    retry: false,
  });
}

/** Polls until the challenge leaves `pending`. */
export function useChallengeState(id: string, enabled: boolean, indexUrl?: string) {
  return useQuery({
    queryKey: ['challenge', indexUrl ?? null, id, 'state'],
    queryFn: () => getChallengeState(id, indexUrl),
    enabled,
    refetchInterval: (q) => (q.state.data?.status === 'pending' || !q.state.data ? 1500 : false),
    retry: false,
  });
}
