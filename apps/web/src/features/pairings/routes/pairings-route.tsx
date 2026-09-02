import { PageHeader } from '@/components/shared/page-header';
import { PairingList } from '../components/pairing-list';
import { usePairings, useRevokePairing } from '../hooks/use-pairings';

/** Container: `/pairings`. */
export function PairingsRoute() {
  const pairings = usePairings();
  const revoke = useRevokePairing();
  return (
    <>
      <PageHeader
        title="Paired browsers"
        description="Browsers that push sign-ins straight to your phone. Unpairing brings back the QR code there."
      />
      <p role="status" aria-live="polite" className="mb-3 text-sm text-fg-muted">
        {revoke.isSuccess ? 'Browser unpaired.' : revoke.isError ? revoke.error.message : ''}
      </p>
      {pairings.isPending ? (
        <p className="text-sm text-fg-muted">Loading paired browsers…</p>
      ) : pairings.isError ? (
        <p className="text-sm text-danger-soft-fg">{pairings.error.message}</p>
      ) : (
        <PairingList
          pairings={pairings.data.pairings}
          busyId={revoke.isPending ? revoke.variables : null}
          onRevoke={(id) => revoke.mutate(id)}
        />
      )}
    </>
  );
}
