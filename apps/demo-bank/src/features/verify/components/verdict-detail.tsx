import { CheckCircle2 } from 'lucide-react';
import type { PublicVerdict } from '../api/widget';

const TONE: Record<NonNullable<PublicVerdict['outcome']>, string> = {
  verified: 'text-success-soft-fg',
  not_verified: 'text-warning-soft-fg',
  known_fraud: 'text-danger-soft-fg',
};

/** One sentence on why the registry answered the way it did, keyed by the rule it reports. */
export function explainRule(verdict: PublicVerdict): string {
  const signals = verdict.signals ?? null;
  switch (verdict.rule) {
    case 'code+recipient+content':
      return 'The code, the address, and the text all match the registration made when the message was sent.';
    case 'code+recipient':
      return 'The code and the address match a registration. No text was compared, so paste the whole message for the strongest answer.';
    case 'recipient+fingerprint':
      return 'No code was found, but the text matches a message registered for this address.';
    case 'code+recipient:content_mismatch':
      return 'The code and the address match a registration, but the text differs from what we sent. A real footer was put on a different message.';
    case 'code:recipient_mismatch':
      return signals?.recipient_match === false && signals.fingerprint_distance !== null
        ? 'This is a real message, but not for this address. Enter the address that received it and check again.'
        : 'The code is real, but the address did not match. Enter the address that received the message and check again.';
    case 'code:replay':
      return 'The code belongs to a registered message, but the address that received it was not given or does not match, and there was no matching text. Paste the whole message with the address that received it.';
    case 'no_match':
    case 'no_match:authoritative':
      return 'No registration has this code or this text. That is what a lure looks like.';
    case 'fraud_list:indicator':
    case 'fraud_list:fingerprint':
      return 'A link, number, or the text itself matches an impersonation our fraud team confirmed.';
    default:
      return 'The rule names what matched: the code, the recipient, the content fingerprint, or nothing.';
  }
}

/** What the API returned, for people who came to see the mechanism rather than the card. */
export function VerdictDetail({ verdict }: { verdict: PublicVerdict }) {
  const outcome = verdict.outcome ?? 'not_verified';
  return (
    <div className="rounded-xl border p-5 text-sm" data-testid="verdict-detail">
      <p className="flex items-center gap-2 font-semibold">
        <CheckCircle2 aria-hidden="true" className={`size-4 ${TONE[outcome]}`} />
        What the API said
      </p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-fg-muted">
        <dt>outcome</dt>
        <dd className="font-mono text-fg">{outcome}</dd>
        <dt>rule</dt>
        <dd className="font-mono text-fg">{verdict.rule ?? 'pending'}</dd>
        {verdict.matched_sent_at && (
          <>
            <dt>matched</dt>
            <dd className="font-mono text-fg">{verdict.matched_sent_at}</dd>
          </>
        )}
        <dt>submission</dt>
        <dd className="truncate font-mono text-fg">{verdict.submission_id}</dd>
      </dl>
      <p className="mt-3 text-xs text-fg-muted">{explainRule(verdict)}</p>
    </div>
  );
}
