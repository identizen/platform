import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router';
import { AppShell } from './components/shared/app-shell';
import { ActivityRoute } from './features/activity';
import { CallbackRoute, getSession, useSession } from './features/auth';
import { DeepLinkRoute } from './features/deep-link';
import { DevicesRoute } from './features/devices';
import { HomeRoute } from './features/overview';
import { PairingsRoute } from './features/pairings';
import { SessionsRoute } from './features/sessions';
import { SettingsRoute } from './features/settings';

function RootLayout() {
  const session = useSession();
  return (
    <AppShell signedIn={session !== null} handle={session?.claims.idz_handle ?? null}>
      <Outlet />
    </AppShell>
  );
}

const rootRoute = createRootRoute({ component: RootLayout });

/** Routes that need a session redirect to the sign-in landing. */
const requireSession = () => {
  // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirects by throwing
  if (!getSession()) throw redirect({ to: '/' });
};

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomeRoute });
const callbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/callback',
  component: CallbackRoute,
});
const deepLinkRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/l/$challengeId',
  component: DeepLinkRoute,
});
const devicesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/devices',
  beforeLoad: requireSession,
  component: DevicesRoute,
});
const pairingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pairings',
  beforeLoad: requireSession,
  component: PairingsRoute,
});
const sessionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sessions',
  beforeLoad: requireSession,
  component: SessionsRoute,
});
const activityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/activity',
  beforeLoad: requireSession,
  component: ActivityRoute,
});
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  beforeLoad: requireSession,
  component: SettingsRoute,
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  callbackRoute,
  deepLinkRoute,
  devicesRoute,
  pairingsRoute,
  sessionsRoute,
  activityRoute,
  settingsRoute,
]);

export const router = createRouter({ routeTree, defaultPreload: 'intent' });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
