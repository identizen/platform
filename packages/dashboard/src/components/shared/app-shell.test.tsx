import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { Building2 } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { getSession, setSession } from '../../features/auth';
import { AppShell, type AppShellProps } from './app-shell';

type ShellProps = Omit<AppShellProps, 'children'>;

function makeRouter(props: ShellProps, initial = '/devices') {
  const rootRoute = createRootRoute({
    component: () => (
      <AppShell {...props}>
        <Outlet />
      </AppShell>
    ),
  });
  const page = (path: string) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => <p>{path} page</p> });
  const routeTree = rootRoute.addChildren([
    page('/'),
    page('/devices'),
    page('/sessions'),
    page('/enroll'),
  ]);
  return createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [initial] }) });
}

// TanStack Router restores scroll on navigation; jsdom has no window.scrollTo.
window.scrollTo = vi.fn();

const signedIn: ShellProps = { signedIn: true, handle: 'george' };

describe('AppShell', () => {
  it('renders the main navigation with the active page marked, plus injected grouped items', async () => {
    const router = makeRouter({
      ...signedIn,
      extraNav: [{ to: '/enroll', label: 'Enroll', icon: Building2, group: 'Organization' }],
      banner: <div role="note">Managed by Acme</div>,
    });
    render(<RouterProvider router={router} />);
    await screen.findByText('/devices page');

    const nav = screen.getAllByRole('navigation', { name: 'Main' })[0]!;
    const labels = within(nav)
      .getAllByRole('link')
      .map((a) => a.textContent);
    expect(labels).toEqual([
      'Devices',
      'Paired browsers',
      'Sessions',
      'Activity',
      'Settings',
      'Enroll',
    ]);
    expect(within(nav).getByRole('link', { name: 'Devices' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Sessions' })).not.toHaveAttribute('aria-current');
    expect(within(nav).getByRole('list', { name: 'Organization' })).toContainElement(
      within(nav).getByRole('link', { name: 'Enroll' }),
    );
    expect(screen.getByRole('note')).toHaveTextContent('Managed by Acme');
    expect(screen.getAllByTestId('handle-chip')[0]).toHaveTextContent('@george');
  });

  it('hides the navigation when signed out', async () => {
    const router = makeRouter({ signedIn: false, handle: null }, '/');
    render(<RouterProvider router={router} />);
    await screen.findByText('/ page');
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Menu' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Theme:/ })).toBeInTheDocument();
  });

  it('signs out: the default clears the session and returns home; a custom handler replaces it', async () => {
    setSession({
      accessToken: 't',
      expiresAt: Math.floor(Date.now() / 1000) + 600,
      claims: { sub: 's', sid: 'sid', acr: 'idz:login', amr: ['hwk'] },
    });
    const router = makeRouter(signedIn);
    render(<RouterProvider router={router} />);
    await screen.findByText('/devices page');
    await userEvent.click(screen.getAllByTestId('shell-sign-out')[0]!);
    expect(getSession()).toBeNull();
    await screen.findByText('/ page');

    const onSignOut = vi.fn();
    const custom = makeRouter({ ...signedIn, onSignOut });
    render(<RouterProvider router={custom} />);
    await screen.findByText('/devices page');
    await userEvent.click(screen.getAllByTestId('shell-sign-out').at(-1)!);
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it('opens the drawer from the Menu button, moves focus in, closes on Escape and on navigation', async () => {
    const router = makeRouter(signedIn);
    render(<RouterProvider router={router} />);
    await screen.findByText('/devices page');

    const menu = screen.getByRole('button', { name: 'Menu' });
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(menu);
    const dialog = screen.getByRole('dialog', { name: 'Menu' });
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    expect(menu).toHaveAttribute('aria-controls', dialog.id);
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(document.body.style.overflow).toBe('hidden');

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(menu).toHaveFocus();
    expect(document.body.style.overflow).toBe('');

    await userEvent.click(menu);
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('link', { name: 'Sessions' }),
    );
    await screen.findByText('/sessions page');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(menu).toHaveAttribute('aria-expanded', 'false');
  });
});
