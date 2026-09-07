import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listPairings, revokePairing } from '../api/pairings';

export const pairingsKey = ['me', 'pairings'] as const;

export function usePairings() {
  return useQuery({ queryKey: pairingsKey, queryFn: listPairings });
}

export function useRevokePairing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revokePairing(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: pairingsKey });
      void qc.invalidateQueries({ queryKey: ['me', 'audit'] });
    },
  });
}
