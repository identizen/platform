import { PageHeader } from '@/components/shared/page-header';
import { DeviceList } from '../components/device-list';
import { useDevices, useRevokeDevice } from '../hooks/use-devices';

/** Container: `/devices`. */
export function DevicesRoute() {
  const devices = useDevices();
  const revoke = useRevokeDevice();
  return (
    <>
      <PageHeader
        title="Devices"
        description="Phones that hold your identity. Revoking a device ends all of its sessions and paired browsers."
      />
      <p role="status" aria-live="polite" className="mb-3 text-sm text-fg-muted">
        {revoke.isSuccess
          ? `Device revoked. ${revoke.data.sessions_revoked} session(s) ended.`
          : revoke.isError
            ? revoke.error.message
            : ''}
      </p>
      {devices.isPending ? (
        <p className="text-sm text-fg-muted">Loading devices…</p>
      ) : devices.isError ? (
        <p className="text-sm text-danger-soft-fg">{devices.error.message}</p>
      ) : (
        <DeviceList
          devices={devices.data.devices}
          busyId={revoke.isPending ? revoke.variables : null}
          onRevoke={(id) => revoke.mutate(id)}
        />
      )}
    </>
  );
}
