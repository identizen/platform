import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { ThemeToggle, cn } from '@identizen/ui';
import { Activity, LaptopMinimal, Settings, Smartphone, Shield } from 'lucide-react';

export interface NavItem {
  to: '/' | '/devices' | '/pairings' | '/sessions' | '/activity' | '/settings';
  label: string;
  icon: typeof Smartphone;
}

export const NAV: NavItem[] = [
  { to: '/devices', label: 'Devices', icon: Smartphone },
  { to: '/pairings', label: 'Browsers', icon: LaptopMinimal },
  { to: '/sessions', label: 'Sessions', icon: Shield },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export interface AppShellProps {
  signedIn: boolean;
  handle: string | null;
  children: ReactNode;
}

/** Presentational layout: header, nav, theme toggle, content. */
export function AppShell({ signedIn, handle, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:rounded-md focus:bg-surface-0 focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="border-b bg-surface-0/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span
              aria-hidden="true"
              className="inline-block size-6 rounded-md bg-accent"
              style={{ maskImage: 'url(/icon.svg)', WebkitMaskImage: 'url(/icon.svg)' }}
            />
            Identizen
          </Link>
          {signedIn ? (
            <nav aria-label="Primary" className="hidden md:block">
              <ul className="flex items-center gap-1">
                {NAV.map((item) => (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      className={cn(
                        'inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm text-fg-muted hover:bg-surface-2 hover:text-fg',
                        '[&.active]:bg-surface-2 [&.active]:text-fg',
                      )}
                      activeProps={{ className: 'active', 'aria-current': 'page' }}
                    >
                      <item.icon aria-hidden="true" className="size-4" />
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
          <div className="flex items-center gap-2">
            {handle ? (
              <span className="hidden text-sm text-fg-muted sm:inline" data-testid="handle-chip">
                @{handle}
              </span>
            ) : null}
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
      {signedIn ? (
        <nav
          aria-label="Primary (mobile)"
          className="sticky bottom-0 border-t bg-surface-0 md:hidden"
        >
          <ul className="grid grid-cols-5">
            {NAV.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className="flex flex-col items-center gap-1 py-2 text-2xs text-fg-muted [&.active]:text-accent"
                  activeProps={{ className: 'active', 'aria-current': 'page' }}
                >
                  <item.icon aria-hidden="true" className="size-5" />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
