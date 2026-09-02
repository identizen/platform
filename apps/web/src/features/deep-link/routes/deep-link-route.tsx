import { useParams } from '@tanstack/react-router';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@identizen/ui';
import { Smartphone } from 'lucide-react';
import { useChallenge, useChallengeState } from '../hooks/use-challenge';

const STATUS_TEXT: Record<string, string> = {
  pending: 'Waiting for approval on your phone…',
  approved: 'Approved. You can go back to the site.',
  denied: 'Declined on the phone.',
  expired: 'This request expired. Start again on the site.',
};

/**
 * `/l/:challengeId`: universal-link landing. On a phone with the app installed the OS opens the
 * app before this page renders; otherwise show the site, the match code, and a way in.
 */
export function DeepLinkRoute() {
  const { challengeId = '' } = useParams({ strict: false });
  const challenge = useChallenge(challengeId);
  const state = useChallengeState(challengeId, challenge.isSuccess);
  const appUrl = `identizen://l/${challengeId}`;
  const status = state.data?.status ?? challenge.data?.status ?? 'pending';

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone aria-hidden="true" className="size-5 text-accent" />
            {challenge.data?.payload.acr === 'idz:mfa'
              ? 'Approve on your phone'
              : 'Sign in with your phone'}
          </CardTitle>
          <CardDescription>
            {challenge.isPending
              ? 'Loading…'
              : challenge.isError
                ? 'This link is not valid any more.'
                : `${challenge.data.payload.rp_name} is asking you to approve.`}
          </CardDescription>
        </CardHeader>
        {challenge.isSuccess ? (
          <CardContent className="flex flex-col gap-4">
            {challenge.data.payload.reason ? (
              <p className="rounded-md border bg-surface-1 p-3 text-sm" data-testid="reason">
                {challenge.data.payload.reason}
              </p>
            ) : null}
            <p className="text-center">
              <span className="block text-xs text-fg-muted">Match code</span>
              <strong className="font-mono text-5xl tracking-[0.2em]" data-testid="code">
                {challenge.data.payload.code}
              </strong>
            </p>
            <p
              role="status"
              aria-live="polite"
              className="text-center text-sm text-fg-muted"
              data-testid="status"
            >
              {STATUS_TEXT[status] ?? status}
            </p>
            {status === 'pending' ? (
              <>
                <Button size="lg" asChild>
                  <a href={appUrl} data-testid="open-app">
                    Open in the Identizen app
                  </a>
                </Button>
                <p className="text-center text-xs text-fg-muted">
                  Do not have the app?{' '}
                  <a href="https://identizen.com/app" className="text-accent underline">
                    Install Identizen
                  </a>{' '}
                  (App Store and Google Play links coming with the first release).
                </p>
              </>
            ) : null}
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
}
