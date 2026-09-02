import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getMe, setHandle } from '../api/handle';

export const meKey = ['me'] as const;

export function useMe() {
  return useQuery({ queryKey: meKey, queryFn: getMe });
}

export function useSetHandle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (handle: string | null) => setHandle(handle),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: meKey });
      void qc.invalidateQueries({ queryKey: ['me', 'audit'] });
    },
  });
}
