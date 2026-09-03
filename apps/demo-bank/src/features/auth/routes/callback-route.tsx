import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Button } from '@identizen/ui';
import { completeSignInOnce } from '../api/oidc';

/** /callback: exchanges the authorization code for tokens, then lands in the bank. */
export function CallbackRoute() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    completeSignInOnce(new URLSearchParams(location.search))
      .then(() => {
        if (!cancelled) void navigate({ to: '/app', replace: true });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      <p role="status" aria-live="polite" className="text-sm text-fg-muted">
        {error ?? 'Signing you in…'}
      </p>
      {error ? (
        <Button className="mt-6" variant="outline" asChild>
          <Link to="/login">Back to sign in</Link>
        </Button>
      ) : null}
    </div>
  );
}
