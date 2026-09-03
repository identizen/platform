import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeftRight, Clock, LayoutGrid, Send } from 'lucide-react';

const NAV = [
  { to: '/app', label: 'Overview', icon: LayoutGrid, exact: true },
  { to: '/app/transfer', label: 'Move money', icon: ArrowLeftRight, exact: false },
  { to: '/app/wire', label: 'Send a wire', icon: Send, exact: false },
  { to: '/app/activity', label: 'Activity', icon: Clock, exact: false },
] as const;

export interface AppShellProps {
  /** "@handle" or a shortened sub, for the greeting. */
  who: string;
  children: ReactNode;
}

/** Signed-in layout: side navigation on wide screens, a tab row on narrow ones. */
export function AppShell({ who, children }: AppShellProps) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 gap-10 px-6 py-8 md:py-10">
      <nav
        aria-label="Banking"
        className="hidden w-52 shrink-0 flex-col gap-1 md:flex"
        data-testid="app-nav"
      >
        <p className="mb-3 truncate text-xs font-medium uppercase tracking-wider text-fg-muted">
          {who}
        </p>
        {NAV.map(({ to, label, icon: Icon, exact }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact }}
            className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-fg-muted hover:bg-surface-1 hover:text-fg"
            activeProps={{ className: 'bg-accent-soft text-accent-soft-fg font-medium' }}
          >
            <Icon aria-hidden="true" className="size-4" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <div className="flex gap-1 overflow-x-auto md:hidden" role="tablist" aria-label="Banking">
          {NAV.map(({ to, label, exact }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact }}
              className="whitespace-nowrap rounded-full border px-3 py-1.5 text-sm text-fg-muted"
              activeProps={{ className: 'border-accent bg-accent-soft text-accent-soft-fg' }}
            >
              {label}
            </Link>
          ))}
        </div>
        {children}
      </div>
    </div>
  );
}
