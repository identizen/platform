import { Link } from '@tanstack/react-router';
import { Button, ThemeToggle } from '@identizen/ui';
import { BankLogo } from './bank-logo';

export interface SiteHeaderProps {
  signedIn: boolean;
  onSignOut?: () => void;
}

const NAV = [
  { to: '/', label: 'Personal' },
  { to: '/docs', label: 'Developers' },
];

/** Public header: bank brand on the left, docs and sign-in on the right. */
export function SiteHeader({ signedIn, onSignOut }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b bg-surface-0/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-6 px-6">
        <Link to="/" aria-label="JT Merlin Bank home" className="flex items-center gap-2">
          <BankLogo />
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-6 text-sm font-medium md:flex">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="text-fg-muted hover:text-fg"
              activeProps={{ className: 'text-fg' }}
              activeOptions={{ exact: n.to === '/' }}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {signedIn ? (
            <>
              <Button variant="ghost" asChild>
                <Link to="/app">My accounts</Link>
              </Button>
              <Button variant="outline" onClick={onSignOut}>
                Sign out
              </Button>
            </>
          ) : (
            <Button asChild>
              <Link to="/login">Sign in</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
