import { useQuery } from '@tanstack/react-query';
import { getChallenge, getChallengeState } from '../api/challenge';

export function useChallenge(id: string) {
  return useQuery({ queryKey: ['challenge', id], queryFn: () => getChallenge(id), retry: false });
}

/** Polls until the challenge leaves `pending`. */
export function useChallengeState(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ['challenge', id, 'state'],
    queryFn: () => getChallengeState(id),
    enabled,
    refetchInterval: (q) => (q.state.data?.status === 'pending' || !q.state.data ? 1500 : false),
    retry: false,
  });
}
