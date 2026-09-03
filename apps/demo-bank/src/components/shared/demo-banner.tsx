import { KimiMark } from '@identizen/ui';
import { IDENTIZEN_SITE } from '@/lib/config';

/**
 * The strip that never goes away. JT Merlin is not a bank; every number on the site is made up.
 * The point of the site is the login and the approvals, which are real Identizen.
 */
export function DemoBanner() {
  return (
    <div
      role="note"
      className="flex items-center justify-center gap-2 border-b border-idz/30 bg-idz-soft px-4 py-2 text-center text-xs font-medium text-idz-soft-fg sm:text-sm"
    >
      <KimiMark size={16} className="hidden shrink-0 sm:block" />
      <span>
        <strong>Demo.</strong> JT Merlin is a fictional bank and every account here is fake. It
        exists to show{' '}
        <a href={IDENTIZEN_SITE} className="underline underline-offset-2">
          Identizen
        </a>
        , an open-source identity provider, doing the login and the approvals. Nothing you do here
        moves money.
      </span>
    </div>
  );
}
