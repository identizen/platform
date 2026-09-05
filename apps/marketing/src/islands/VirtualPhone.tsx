import { useVirtualPhone } from './useVirtualPhone';
import { KimiMark } from '@identizen/ui';

export interface VirtualPhoneProps {
  indexUrl: string;
}

function FaceIdGlyph({ size = 28 }: { size?: number }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 16V10a4 4 0 0 1 4-4h6" />
      <path d="M32 6h6a4 4 0 0 1 4 4v6" />
      <path d="M42 32v6a4 4 0 0 1-4 4h-6" />
      <path d="M16 42h-6a4 4 0 0 1-4-4v-6" />
      <path d="M17 19v3" />
      <path d="M31 19v3" />
      <path d="M24 19v8h-2" />
      <path d="M17 31c2 2.4 4.4 3.5 7 3.5s5-1.1 7-3.5" />
    </svg>
  );
}

function Mark(): React.JSX.Element {
  return <KimiMark size={16} title={null} />;
}

/**
 * The screen of the playground's virtual phone. Runs the real protocol in this tab: it registers
 * a device with the index, "scans" the QR the login shows, and signs the assertion on Approve.
 */
export function VirtualPhone({ indexUrl }: VirtualPhoneProps): React.JSX.Element {
  const phone = useVirtualPhone(indexUrl);
  const { screen } = phone;
  const host = (() => {
    try {
      return new URL(indexUrl).host;
    } catch {
      return indexUrl;
    }
  })();

  return (
    <div
      className="flex h-full flex-col px-4 pt-3 pb-4 text-fg"
      data-testid="virtual-phone"
      data-screen={screen.kind}
      data-registered={phone.registered}
    >
      <div className="flex items-center justify-between px-1 text-[0.6rem] font-semibold">
        <span>{phone.polling ? 'Syncing' : 'Ready'}</span>
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${phone.polling ? 'animate-shimmer bg-accent' : 'bg-success'}`}
          aria-hidden="true"
        />
      </div>
      <div className="mt-8 flex items-center justify-center gap-1.5">
        <Mark />
        <span className="text-xs font-semibold tracking-tight">Identizen</span>
        <span className="ml-1 rounded-full bg-surface-2 px-1.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-wider text-fg-muted">
          virtual
        </span>
      </div>

      {screen.kind === 'idle' ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent-soft-fg">
            <FaceIdGlyph />
          </div>
          <p className="mt-4 text-sm font-medium">
            {phone.mode === 'virtual' ? 'Waiting for a sign-in' : 'Switched to your real phone'}
          </p>
          <p className="mt-1 px-3 text-2xs leading-relaxed text-fg-muted">
            {phone.mode === 'virtual'
              ? phone.registered
                ? 'This browser is enrolled as a device. Requests arrive here.'
                : 'Click the button on the left. This tab enrolls itself as a device on first use.'
              : 'Pick “Virtual phone” above to approve logins here instead.'}
          </p>
        </div>
      ) : null}

      {screen.kind === 'request' ? (
        <div className="flex flex-1 flex-col">
          <p className="mt-6 text-center font-mono text-[0.6rem] uppercase tracking-[0.14em] text-fg-muted">
            {screen.pending.via === 'push' ? 'Pushed to this device' : 'Scanned'}
          </p>
          <p className="mt-2 text-center text-base font-semibold tracking-tight">
            {screen.pending.challenge.rp_name}
          </p>
          <p className="mt-0.5 text-center font-mono text-2xs text-fg-muted">
            {screen.pending.challenge.rp_id}
          </p>
          <div className="mt-4 rounded-2xl border border-border bg-surface-1 px-4 py-3 text-center">
            <p className="text-2xs text-fg-muted">Match code</p>
            <p
              className="tabular mt-0.5 font-mono text-4xl font-semibold tracking-tight"
              data-testid="virtual-phone-code"
            >
              {screen.pending.challenge.code}
            </p>
            <p className="mt-0.5 text-2xs text-fg-muted">Same as on your screen?</p>
          </div>
          {screen.pending.challenge.reason ? (
            <p className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-center text-2xs text-warning-soft-fg">
              {screen.pending.challenge.reason}
            </p>
          ) : null}
          <div className="mt-auto">
            <button
              type="button"
              onClick={phone.approve}
              disabled={screen.busy}
              className="btn btn-primary h-10 w-full rounded-xl text-sm disabled:opacity-60"
              data-testid="virtual-phone-approve"
            >
              <FaceIdGlyph size={16} />
              {screen.busy ? 'Signing…' : 'Approve with Face ID'}
            </button>
            <button
              type="button"
              onClick={phone.deny}
              disabled={screen.busy}
              className="btn btn-ghost mt-1 h-9 w-full text-sm"
              data-testid="virtual-phone-deny"
            >
              Deny
            </button>
          </div>
        </div>
      ) : null}

      {screen.kind === 'result' ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center" role="status">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-full ${screen.ok ? 'bg-success-soft text-success-soft-fg' : 'bg-danger-soft text-danger-soft-fg'}`}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {screen.ok ? <path d="M20 6 9 17l-5-5" /> : <path d="M18 6 6 18M6 6l12 12" />}
            </svg>
          </div>
          <p className="mt-4 text-sm font-medium">{screen.title}</p>
          <p className="mt-1 px-3 text-2xs leading-relaxed text-fg-muted">{screen.detail}</p>
        </div>
      ) : null}

      <div className="mt-3 border-t border-border pt-2 text-center">
        <p className="truncate font-mono text-[0.55rem] text-fg-muted" title={phone.deviceId ?? ''}>
          {phone.deviceId ? `${phone.deviceId.slice(0, 14)}… · ${host}` : host}
        </p>
        <button
          type="button"
          onClick={phone.reset}
          className="link mt-1 text-2xs"
          data-testid="virtual-phone-reset"
        >
          Reset virtual phone
        </button>
        <div className="mx-auto mt-2 h-1 w-24 rounded-full bg-fg/80" aria-hidden="true" />
      </div>
    </div>
  );
}
