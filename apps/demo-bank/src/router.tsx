import {
  Navigate,
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  useNavigate,
} from '@tanstack/react-router';
import { AppShell } from '@/components/shared/app-shell';
import { DemoBanner } from '@/components/shared/demo-banner';
import { SiteFooter } from '@/components/shared/site-footer';
import { SiteHeader } from '@/components/shared/site-header';
import { OverviewRoute } from '@/features/accounts';
import { CallbackRoute, LoginRoute, setSession, useSession } from '@/features/auth';
import {
  DocsRoute,
  LoginDocsRoute,
  QuickstartRoute,
  RegisterRoute,
  StepUpRoute,
} from '@/features/docs';
import { HomeRoute } from '@/features/marketing';
import { ActivityRoute, TransferRoute } from '@/features/transfers';
import { shortId } from '@/lib/format';

function Root() {
  const session = useSession();
  const navigate = useNavigate();
  return (
    <>
      <DemoBanner />
      <SiteHeader
        signedIn={session !== null}
        onSignOut={() => {
          setSession(null);
          void navigate({ to: '/' });
        }}
      />
      <Outlet />
      <SiteFooter />
    </>
  );
}

/** Everything under /app needs a session; the shell shows who is signed in. */
function AppLayout() {
  const session = useSession();
  if (!session) return <Navigate to="/login" replace />;
  const who = session.claims.idz_handle
    ? `@${session.claims.idz_handle}`
    : shortId(session.claims.sub, 8);
  return (
    <AppShell who={who}>
      <Outlet />
    </AppShell>
  );
}

function Overview() {
  const session = useSession();
  if (!session) return null;
  const who = session.claims.idz_handle ? `@${session.claims.idz_handle}` : 'there';
  return <OverviewRoute who={who} amr={session.claims.amr} />;
}

function AchTransfer() {
  const session = useSession();
  return session ? <TransferRoute kind="ach" sub={session.claims.sub} /> : null;
}

function WireTransfer() {
  const session = useSession();
  return session ? <TransferRoute kind="wire" sub={session.claims.sub} /> : null;
}

const rootRoute = createRootRoute({ component: Root });

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomeRoute });
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginRoute,
});
const callbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/callback',
  component: CallbackRoute,
});
const docsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/docs',
  component: DocsRoute,
});
const docsQuickstartRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/docs/quickstart',
  component: QuickstartRoute,
});
const docsRegisterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/docs/register',
  component: RegisterRoute,
});
const docsLoginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/docs/login',
  component: LoginDocsRoute,
});
const docsStepUpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/docs/step-up',
  component: StepUpRoute,
});
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app',
  component: AppLayout,
});
const appOverviewRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  component: Overview,
});
const appTransferRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/transfer',
  component: AchTransfer,
});
const appWireRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/wire',
  component: WireTransfer,
});
const appActivityRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/activity',
  component: ActivityRoute,
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  loginRoute,
  callbackRoute,
  docsRoute,
  docsQuickstartRoute,
  docsRegisterRoute,
  docsLoginRoute,
  docsStepUpRoute,
  appRoute.addChildren([appOverviewRoute, appTransferRoute, appWireRoute, appActivityRoute]),
]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  scrollRestoration: true,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
