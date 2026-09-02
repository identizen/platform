import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@identizen/ui';
import { Activity, LaptopMinimal, Shield, Smartphone } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { SignInCard, startSignIn, useSession } from '@/features/auth';
import { useDevices } from '@/features/devices';
import { usePairings } from '@/features/pairings';
import { useSessions } from '@/features/sessions';

/** Container: `/` — sign-in when signed out, overview when signed in. */
export function HomeRoute() {
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!session) {
    return (
      <div className="py-10">
        <SignInCard
          busy={busy}
          error={error}
          onSignIn={() => {
            setBusy(true);
            setError(null);
            startSignIn().catch((err: unknown) => {
              setBusy(false);
              setError(err instanceof Error ? err.message : String(err));
            });
          }}
        />
      </div>
    );
  }
  return <Overview handle={session.claims.idz_handle ?? null} />;
}

function Overview({ handle }: { handle: string | null }) {
  const devices = useDevices();
  const pairings = usePairings();
  const sessions = useSessions();
  const count = (n: number | undefined, pending: boolean) => (pending ? '…' : String(n ?? 0));
  const tiles = [
    {
      to: '/devices' as const,
      icon: Smartphone,
      title: 'Devices',
      value: count(
        devices.data?.devices.filter((d) => d.status === 'active').length,
        devices.isPending,
      ),
      hint: 'active phones',
    },
    {
      to: '/pairings' as const,
      icon: LaptopMinimal,
      title: 'Paired browsers',
      value: count(
        pairings.data?.pairings.filter((p) => p.status === 'active').length,
        pairings.isPending,
      ),
      hint: 'push without a QR',
    },
    {
      to: '/sessions' as const,
      icon: Shield,
      title: 'Sessions',
      value: count(sessions.data?.sessions.length, sessions.isPending),
      hint: 'sites signed in',
    },
  ];
  return (
    <>
      <PageHeader
        title={handle ? `Hi, @${handle}` : 'Your identity'}
        description="Everything that can sign in as you, in one place."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        {tiles.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className="rounded-lg focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Card className="h-full transition-colors hover:bg-surface-1">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm text-fg-muted">
                  <t.icon aria-hidden="true" className="size-4" />
                  {t.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p
                  className="text-3xl font-semibold tabular-nums"
                  data-testid={`tile-${t.title.toLowerCase().replace(/\s/g, '-')}`}
                >
                  {t.value}
                </p>
                <CardDescription>{t.hint}</CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      <p className="mt-8 text-sm text-fg-muted">
        <Activity aria-hidden="true" className="mr-1 inline size-4" />
        See what happened recently in{' '}
        <Link to="/activity" className="text-accent underline">
          Activity
        </Link>
        .
      </p>
    </>
  );
}
