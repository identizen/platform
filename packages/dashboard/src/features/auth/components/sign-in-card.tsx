import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@identizen/ui';
import { Smartphone } from 'lucide-react';

export interface SignInCardProps {
  busy: boolean;
  error: string | null;
  onSignIn: () => void;
}

/** Presentational: the signed-out landing. */
export function SignInCard({ busy, error, onSignIn }: SignInCardProps) {
  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Smartphone aria-hidden="true" className="size-5 text-accent" />
          Your identity, on your phone
        </CardTitle>
        <CardDescription>
          Manage the devices, paired browsers, and sessions that hold your Identizen identity. Sign
          in with your phone to continue.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button size="lg" onClick={onSignIn} disabled={busy} data-testid="sign-in">
          {busy ? 'Contacting Identizen…' : 'Continue with Identizen'}
        </Button>
        <p role="status" aria-live="polite" className="text-sm text-danger-soft-fg">
          {error}
        </p>
        <p className="text-xs text-fg-muted">
          No password, no email. Your phone approves the sign-in with Face ID or a fingerprint.
        </p>
      </CardContent>
    </Card>
  );
}
