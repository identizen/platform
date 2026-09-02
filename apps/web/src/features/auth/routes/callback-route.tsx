import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '@identizen/ui';
import { completeSignIn } from '../api/oidc';

/** `/callback`: finishes the OIDC code exchange and lands on the overview. */
export function CallbackRoute() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    completeSignIn(new URLSearchParams(location.search))
      .then(() => {
        if (!cancelled) void navigate({ to: '/', replace: true });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p role="status" aria-live="polite" className="text-sm text-fg-muted">
        {error ?? 'Signing you in…'}
      </p>
      {error ? (
        <Button className="mt-4" variant="outline" onClick={() => void navigate({ to: '/' })}>
          Back to sign in
        </Button>
      ) : null}
    </div>
  );
}
