import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listSessions, revokeSession } from '../api/sessions';

export const sessionsKey = ['me', 'sessions'] as const;

export function useSessions() {
  return useQuery({ queryKey: sessionsKey, queryFn: listSessions });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sid: string) => revokeSession(sid),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: sessionsKey });
      void qc.invalidateQueries({ queryKey: ['me', 'audit'] });
    },
  });
}
