import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  children?: ReactNode;
}

/** Presentational empty list message. */
export function EmptyState({ title, children }: EmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center" data-testid="empty-state">
      <p className="font-medium">{title}</p>
      {children ? <p className="mt-1 text-sm text-fg-muted">{children}</p> : null}
    </div>
  );
}
