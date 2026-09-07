import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '@identizen/ui';
import { completeSignInOnce } from '../api/oidc';

/**
 * `/callback`: finishes the OIDC code exchange and lands on the overview. The exchange runs once
 * per callback URL however many times this effect fires (`navigate` can change identity while
 * the exchange is in flight); every run joins the same promise and the last one navigates.
 */
export function CallbackRoute() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    completeSignInOnce(new URLSearchParams(location.search))
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
