import { cn } from '@identizen/ui';

export interface FromenanceLogoProps {
  /** Rendered height in px; the wordmark keeps its 176:32 ratio. */
  height?: number;
  className?: string;
}

/**
 * The Fromenance wordmark, inline so it follows the site theme. The colors are the two brand
 * variants exactly (on-light and on-dark, see fromenance.com/brand), switched through the
 * `--frm-*` variables in app.css rather than recolored.
 */
export function FromenanceLogo({ height = 18, className }: FromenanceLogoProps) {
  const width = Math.round((height * 176) / 32);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 176 32"
      fill="none"
      role="img"
      aria-label="Fromenance"
      className={cn('fromenance-logo shrink-0', className)}
    >
      <rect x="5" y="5" width="22" height="22" rx="5.5" stroke="var(--frm-fg)" strokeWidth="2" />
      <rect x="16.5" y="16.5" width="7" height="7" rx="1.6" fill="var(--frm-accent)" />
      <text
        x="38"
        y="23"
        fontFamily="Inter, InterVariable, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
        fontSize="21"
        fontWeight="600"
        letterSpacing="-0.4"
        fill="var(--frm-fg)"
      >
        Fromenance
      </text>
    </svg>
  );
}
