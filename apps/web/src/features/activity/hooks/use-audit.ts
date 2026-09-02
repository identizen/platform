import { useQuery } from '@tanstack/react-query';
import { listAudit } from '../api/audit';

export const auditKey = ['me', 'audit'] as const;

export function useAudit() {
  return useQuery({ queryKey: auditKey, queryFn: listAudit });
}
