import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Button, IdentizenLogo, ThemeToggle } from '@identizen/ui';
import { LogOut, X } from 'lucide-react';
import { SidebarNav, type NavItem } from './app-shell-nav';

export interface SidebarPanelProps {
  handle: string | null;
  items: NavItem[];
  onSignOut: () => void;
  /** Called after a link is activated (the drawer closes on navigation). */
  onNavigate?: (() => void) | undefined;
  /** Rendered in the top row, after the brand (the drawer's close button). */
  topAction?: ReactNode;
}

/**
 * Presentational: the sidebar's content, shared by the fixed desktop sidebar and the mobile
 * drawer. Brand and handle at the top, navigation in the middle, sign-out and theme at the bottom.
 */
export function SidebarPanel({
  handle,
  items,
  onSignOut,
  onNavigate,
  topAction,
}: SidebarPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Link
            to="/"
            onClick={onNavigate}
            className="inline-flex w-fit items-center rounded-sm text-fg"
            aria-label="Identizen home"
          >
            <IdentizenLogo height={22} title={null} />
          </Link>
          <span
            className="truncate text-sm text-fg-muted"
            data-testid="handle-chip"
            title={handle ? `@${handle}` : undefined}
          >
            {handle ? `@${handle}` : 'Your identity'}
          </span>
        </div>
        {topAction}
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <SidebarNav items={items} onNavigate={onNavigate} />
      </div>
      <div className="flex items-center gap-2 border-t px-3 py-3">
        <Button
          variant="ghost"
          className="flex-1 justify-start text-fg-muted hover:text-fg"
          onClick={onSignOut}
          data-testid="shell-sign-out"
        >
          <LogOut aria-hidden="true" />
          Sign out
        </Button>
        <ThemeToggle />
      </div>
    </div>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface DrawerProps {
  id: string;
  onClose: () => void;
  children: (closeButton: ReactNode) => ReactNode;
}

/**
 * Modal drawer for the navigation below `lg`. Mount it only while open: focus moves to the close
 * button, Tab cycles inside, Escape closes, and focus returns to the opener on unmount.
 */
export function Drawer({ id, onClose, children }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const closeButton = (
    <Button
      ref={closeRef}
      variant="ghost"
      size="icon"
      aria-label="Close menu"
      onClick={onClose}
      className="-mt-1 -mr-1"
    >
      <X aria-hidden="true" />
    </Button>
  );

  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <div
        className="absolute inset-0 bg-surface-0/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r bg-surface-1 shadow-md"
      >
        {children(closeButton)}
      </div>
    </div>
  );
}
