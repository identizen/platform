import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listDevices, revokeDevice } from '../api/devices';

export const devicesKey = ['me', 'devices'] as const;

export function useDevices() {
  return useQuery({ queryKey: devicesKey, queryFn: listDevices });
}

export function useRevokeDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revokeDevice(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: devicesKey });
      void qc.invalidateQueries({ queryKey: ['me', 'pairings'] });
      void qc.invalidateQueries({ queryKey: ['me', 'sessions'] });
      void qc.invalidateQueries({ queryKey: ['me', 'audit'] });
    },
  });
}
