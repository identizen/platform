import { Link } from '@tanstack/react-router';
import { cn } from '@identizen/ui';
import {
  Activity,
  LaptopMinimal,
  Settings,
  Shield,
  Smartphone,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  /** Route path. Loosely typed so a composing app can add its own routes (`/enroll`). */
  to: string;
  label: string;
  icon: LucideIcon;
  /**
   * Optional section heading. Items that share a group render together under it, after the
   * ungrouped items; an org app uses this to keep "Enroll" apart from the personal pages.
   */
  group?: string;
  /** Mark active only on an exact path match (default: prefix match). */
  exact?: boolean;
}

/** The built-in personal navigation, in display order. */
export const NAV: NavItem[] = [
  { to: '/devices', label: 'Devices', icon: Smartphone },
  { to: '/pairings', label: 'Paired browsers', icon: LaptopMinimal },
  { to: '/sessions', label: 'Sessions', icon: Shield },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export interface SidebarNavProps {
  items: NavItem[];
  /** Called after a link is activated (the drawer closes on navigation). */
  onNavigate?: (() => void) | undefined;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/** Presentational: `<nav aria-label="Main">` with ungrouped items first, then each group. */
export function SidebarNav({ items, onNavigate }: SidebarNavProps) {
  const ungrouped = items.filter((i) => !i.group);
  const groups = new Map<string, NavItem[]>();
  for (const item of items) {
    if (!item.group) continue;
    const list = groups.get(item.group) ?? [];
    list.push(item);
    groups.set(item.group, list);
  }
  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {ungrouped.length ? (
        <ul className="flex flex-col gap-0.5">
          {ungrouped.map((item) => (
            <NavLink key={item.to} item={item} onNavigate={onNavigate} />
          ))}
        </ul>
      ) : null}
      {[...groups].map(([group, list]) => {
        const id = `nav-group-${slug(group)}`;
        return (
          <div key={group}>
            <p
              id={id}
              className="mb-1 px-3 text-2xs font-medium tracking-wide text-fg-subtle uppercase"
            >
              {group}
            </p>
            <ul aria-labelledby={id} className="flex flex-col gap-0.5">
              {list.map((item) => (
                <NavLink key={item.to} item={item} onNavigate={onNavigate} />
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: (() => void) | undefined }) {
  return (
    <li>
      <Link
        to={item.to}
        activeOptions={{ exact: item.exact === true }}
        activeProps={{ className: 'active', 'aria-current': 'page' }}
        onClick={onNavigate}
        className={cn(
          'flex h-9 items-center gap-3 rounded-md px-3 text-sm text-fg-muted transition-colors duration-150 ease-out-soft',
          'hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
          '[&.active]:bg-surface-2 [&.active]:font-medium [&.active]:text-fg',
        )}
      >
        <item.icon aria-hidden="true" className="size-4 shrink-0" />
        <span className="truncate">{item.label}</span>
      </Link>
    </li>
  );
}
