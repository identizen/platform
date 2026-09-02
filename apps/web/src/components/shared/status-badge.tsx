import { Badge } from '@identizen/ui';

const VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  active: 'success',
  pending: 'warning',
  disabled: 'warning',
  revoked: 'danger',
  approved: 'success',
  denied: 'danger',
  timeout: 'neutral',
};

/** Presentational status pill mapped to semantic tokens. */
export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={VARIANT[status] ?? 'neutral'}>{status}</Badge>;
}
