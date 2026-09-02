import { useNavigate } from '@tanstack/react-router';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ThemeToggle,
} from '@identizen/ui';
import { PageHeader } from '@/components/shared/page-header';
import { clearSession, useSession } from '@/features/auth';
import { HandleForm } from '../components/handle-form';
import { useMe, useSetHandle } from '../hooks/use-handle';

/** Container: `/settings`. */
export function SettingsRoute() {
  const me = useMe();
  const save = useSetHandle();
  const session = useSession();
  const navigate = useNavigate();

  const signOut = () => {
    clearSession();
    void navigate({ to: '/', replace: true });
  };

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Handle</CardTitle>
            <CardDescription>
              A human name for your identity. Your identity id never changes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {me.isPending ? (
              <p className="text-sm text-fg-muted">Loading…</p>
            ) : me.isError ? (
              <p className="text-sm text-danger-soft-fg">{me.error.message}</p>
            ) : (
              <HandleForm
                key={me.data.handle ?? ''}
                current={me.data.handle}
                busy={save.isPending}
                error={save.isError ? save.error.message : null}
                onSave={(h) => save.mutate(h)}
                onClear={() => save.mutate(null)}
              />
            )}
            <p role="status" aria-live="polite" className="mt-2 text-xs text-fg-muted">
              {save.isSuccess
                ? save.data.handle
                  ? `Saved as @${save.data.handle}.`
                  : 'Handle removed.'
                : ''}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Identity</CardTitle>
            <CardDescription>
              Stable, cross-site identifier held by the index. Never sent to sites.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p>
              <span className="text-fg-muted">idz </span>
              <code data-testid="idz">{me.data?.idz ?? '…'}</code>
            </p>
            <p>
              <span className="text-fg-muted">this session </span>
              <code>{session?.claims.sid ?? '…'}</code> · {session?.claims.acr ?? ''} ·{' '}
              {session?.claims.amr.join(', ') ?? ''}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>
              System by default; your choice is remembered on this device.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-3 text-sm">
            <ThemeToggle /> Toggle light, dark, or system.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sign out</CardTitle>
            <CardDescription>Ends this dashboard session on this browser only.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={signOut} data-testid="sign-out">
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
