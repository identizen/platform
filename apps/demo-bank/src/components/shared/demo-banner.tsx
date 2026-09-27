/**
 * The strip that never goes away. JT Merlin is not a bank; every number on the site is made up.
 * The login, the approvals, and the message verification are real; the money is not.
 */
export function DemoBanner() {
  return (
    <div
      role="note"
      className="flex items-center justify-center gap-2 border-b border-idz/30 bg-idz-soft px-4 py-2 text-center text-xs font-medium text-idz-soft-fg sm:text-sm"
    >
      <span>
        <strong>Demo.</strong> JT Merlin is a fictional bank and every account here is fake. Nothing
        you do here moves money.
      </span>
    </div>
  );
}
