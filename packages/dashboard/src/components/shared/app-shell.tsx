import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { Button, IdentizenLogo, ThemeToggle } from '@identizen/ui';
import { Menu } from 'lucide-react';
import { clearSession } from '../../features/auth';
import { NAV, type NavItem } from './app-shell-nav';
import { Drawer, SidebarPanel } from './app-shell-panel';

export { NAV, type NavItem } from './app-shell-nav';

export interface AppShellProps {
  signedIn: boolean;
  handle: string | null;
  /**
   * Navigation items a composing app adds after the built-in ones (an org app's "Enroll").
   * Give them a `group` to render them under their own heading.
   */
  extraNav?: NavItem[];
  /** Rendered full-width above the page content: "managed by", license notices. */
  banner?: ReactNode;
  /** Sign-out handler. The default clears the dashboard session and returns to `/`. */
  onSignOut?: () => void;
  children: ReactNode;
}

const DRAWER_ID = 'app-drawer';

/**
 * Presentational layout. Signed in: a fixed 240px sidebar from `lg` up (brand, handle,
 * navigation, sign-out, theme) with independently scrolling content; below `lg`, a slim top bar
 * whose "Menu" button opens the same panel as a drawer. Signed out: brand and theme toggle only.
 */
export function AppShell({
  signedIn,
  handle,
  extraNav,
  banner,
  onSignOut,
  children,
}: AppShellProps) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  // Close the drawer on navigation (including back/forward), not only on link clicks.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const signOut = () => {
    setOpen(false);
    if (onSignOut) return onSignOut();
    clearSession();
    void navigate({ to: '/', replace: true });
  };

  const items = extraNav?.length ? [...NAV, ...extraNav] : NAV;

  if (!signedIn) {
    return (
      <div className="flex min-h-screen flex-col">
        <SkipLink />
        <header className="border-b bg-surface-0/80 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
            <BrandLink />
            <ThemeToggle />
          </div>
        </header>
        {banner}
        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col lg:pl-60">
      <SkipLink />
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r bg-surface-1 lg:block"
        aria-label="Sidebar"
      >
        <SidebarPanel handle={handle} items={items} onSignOut={signOut} />
      </aside>
      <header className="sticky top-0 z-30 border-b bg-surface-0/80 backdrop-blur lg:hidden">
        <div className="flex h-14 items-center justify-between gap-4 px-4">
          <BrandLink />
          <Button
            variant="outline"
            size="sm"
            aria-expanded={open}
            aria-controls={DRAWER_ID}
            onClick={() => setOpen(true)}
          >
            <Menu aria-hidden="true" />
            Menu
          </Button>
        </div>
      </header>
      {open ? (
        <Drawer id={DRAWER_ID} onClose={close}>
          {(closeButton) => (
            <SidebarPanel
              handle={handle}
              items={items}
              onSignOut={signOut}
              onNavigate={close}
              topAction={closeButton}
            />
          )}
        </Drawer>
      ) : null}
      {banner}
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 lg:px-8">
        {children}
      </main>
    </div>
  );
}

function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface-0 focus:px-3 focus:py-2"
    >
      Skip to content
    </a>
  );
}

function BrandLink() {
  return (
    <Link
      to="/"
      className="inline-flex items-center rounded-sm text-fg"
      aria-label="Identizen home"
    >
      <IdentizenLogo height={22} title={null} />
    </Link>
  );
}
