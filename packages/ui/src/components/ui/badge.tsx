import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

export const badgeVariants = cva(
  'inline-flex items-center rounded-sm border px-2 py-0.5 text-2xs font-medium uppercase tracking-wide',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-accent-soft text-accent-soft-fg',
        neutral: 'border-transparent bg-surface-2 text-fg-muted',
        outline: 'border-border-strong text-fg',
        success: 'border-transparent bg-success-soft text-success-soft-fg',
        warning: 'border-transparent bg-warning-soft text-warning-soft-fg',
        danger: 'border-transparent bg-danger-soft text-danger-soft-fg',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps): React.JSX.Element {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
