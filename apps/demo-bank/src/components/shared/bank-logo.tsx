import { cn } from '@identizen/ui';

/** JT Merlin wordmark: a green seal with a merlin-wing "M" and the name beside it. */
export function BankLogo({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <svg
        viewBox="0 0 64 64"
        width={28}
        height={28}
        aria-hidden="true"
        className="shrink-0 rounded-md"
      >
        <rect width="64" height="64" rx="14" className="fill-bank" />
        <path
          d="M18 44V22l14 12 14-12v22"
          fill="none"
          stroke="currentColor"
          className="text-bank-fg"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {compact ? null : (
        <span className="leading-none">
          <span className="block font-display text-lg font-semibold tracking-tight">JT Merlin</span>
          <span className="block text-[10px] font-medium uppercase tracking-[0.18em] text-fg-muted">
            Bank · Demo
          </span>
        </span>
      )}
    </span>
  );
}
