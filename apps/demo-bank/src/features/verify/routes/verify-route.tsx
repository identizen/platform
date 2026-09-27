import { useCallback, useRef, useState } from 'react';
import { Button, Card, CardContent } from '@identizen/ui';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardPaste,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { CodeBlock } from '@/components/shared/code-block';
import {
  BANK_NAME,
  DEMO_SOURCE,
  FROMENANCE_DOCS,
  FROMENANCE_SITE,
  VERIFY_ADDRESS,
} from '@/lib/config';
import type { PublicVerdict } from '../api/widget';
import { SendDemoEmail } from '../components/send-demo-email';
import { VerifyWidget, type VerifyWidgetHandle } from '../components/verify-widget';
import { DEMO_RECIPIENT, DEMO_VERIFY_CODE, LURE, REGISTERED_ALERT } from '../data/samples';

const OUTCOMES = [
  {
    icon: ShieldCheck,
    tone: 'text-success-soft-fg bg-success-soft',
    title: 'Verified',
    body: 'The code and the address match a message we registered at the moment we sent it. You can act on it.',
  },
  {
    icon: AlertTriangle,
    tone: 'text-warning-soft-fg bg-warning-soft',
    title: 'Not verified',
    body: 'Nothing we sent matches. That alone does not prove fraud, but treat it with caution and reach us through the app instead of the message.',
  },
  {
    icon: ShieldAlert,
    tone: 'text-danger-soft-fg bg-danger-soft',
    title: 'Known fraud',
    body: 'It matches an impersonation our fraud team has already confirmed. Do not open its links or call its numbers.',
  },
] as const;

const STEPS = [
  [
    'We register every message as we send it',
    'A reference code, a one-way hash of your address, and a fingerprint of the text go into a registry. Never the address, never the body.',
  ],
  [
    'You ask',
    `Paste the message here, or type the code from its footer. Real deployments also accept a forward to ${VERIFY_ADDRESS}; this demo shows the page.`,
  ],
  [
    'The registry answers',
    'The code, the address, and the fingerprint either match a registration or they do not. No model guesses, and the answer never repeats the suspicious message or its links.',
  ],
] as const;

/** A public page: no session, no account. The customer pastes a message and gets one of three answers. */
export function VerifyRoute() {
  const widget = useRef<VerifyWidgetHandle>(null);
  const [verdict, setVerdict] = useState<PublicVerdict | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const onVerdict = useCallback((v: PublicVerdict) => setVerdict(v), []);

  const use = (text: string) => {
    const ok = widget.current?.fill({ text, email: DEMO_RECIPIENT }) ?? false;
    setHint(
      ok
        ? `Pasted, addressed to ${DEMO_RECIPIENT}. Press "Check this message".`
        : 'The form is still loading. Try again in a moment.',
    );
    setVerdict(null);
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-14 px-6 py-10 md:py-14">
      <header className="max-w-2xl">
        <p className="text-sm font-medium text-bank-soft-fg">Security</p>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight md:text-5xl">
          Did this message really come from {BANK_NAME}?
        </h1>
        <p className="mt-4 text-lg text-fg-muted">
          Paste the email you are not sure about, or type the reference code from its footer. We
          check it against the messages we actually sent and answer in seconds. No sign-in needed.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardContent className="p-5 md:p-6">
            <VerifyWidget ref={widget} onVerdict={onVerdict} />
          </CardContent>
        </Card>

        <aside className="flex flex-col gap-4">
          <SendDemoEmail />
          <div className="rounded-xl border bg-surface-1 p-5">
            <h2 className="font-semibold">Try it with a sample</h2>
            <p className="mt-1 text-sm text-fg-muted">
              The first message was really sent and registered, addressed to{' '}
              <code>{DEMO_RECIPIENT}</code>. The second copies it: a code that was never issued and
              a link on a look-alike domain. Then change the address, or paste only the code, and
              watch the answer change.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => use(REGISTERED_ALERT)}>
                <ClipboardPaste aria-hidden="true" className="mr-1.5 size-4" />
                Use the real alert
              </Button>
              <Button variant="outline" size="sm" onClick={() => use(LURE)}>
                <ClipboardPaste aria-hidden="true" className="mr-1.5 size-4" />
                Use the lure
              </Button>
            </div>
            {hint && (
              <p className="mt-3 text-sm text-fg-muted" role="status">
                {hint}
              </p>
            )}
          </div>

          {verdict && <VerdictDetail verdict={verdict} />}

          <details className="rounded-xl border p-5 text-sm">
            <summary className="cursor-pointer font-semibold">Read the two samples</summary>
            <div className="mt-4 flex flex-col gap-4">
              <CodeBlock code={REGISTERED_ALERT} title={`registered · code ${DEMO_VERIFY_CODE}`} />
              <CodeBlock code={LURE} title="lure · never registered" />
            </div>
          </details>
        </aside>
      </div>

      <section>
        <h2 className="font-display text-3xl font-semibold tracking-tight">
          Three answers, nothing in between
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {OUTCOMES.map(({ icon: Icon, tone, title, body }) => (
            <Card key={title}>
              <CardContent className="flex flex-col gap-3 p-5">
                <span
                  className={`inline-flex size-9 items-center justify-center rounded-md ${tone}`}
                >
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <h3 className="font-semibold">{title}</h3>
                <p className="text-sm text-fg-muted">{body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid gap-8 md:grid-cols-[1fr_1.2fr]">
        <div>
          <h2 className="font-display text-3xl font-semibold tracking-tight">How it works</h2>
          <p className="mt-2 text-fg-muted">
            Message verification on this site is{' '}
            <a href={FROMENANCE_SITE} className="underline underline-offset-2">
              Fromenance
            </a>
            , a communication provenance platform. It is separate from Identizen, which does the
            login and the approvals.
          </p>
        </div>
        <ol className="flex flex-col gap-4">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="flex gap-4">
              <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-fg">
                {i + 1}
              </span>
              <div>
                <p className="font-semibold">{title}</p>
                <p className="mt-1 text-sm text-fg-muted">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-surface-1 px-6 py-5">
        <p className="max-w-2xl text-sm text-fg-muted">
          <strong className="text-fg">
            This page is live against the production Fromenance API
          </strong>{' '}
          on the JT Merlin demo tenant. What you paste is stored there with production retention, so
          do not paste a real customer&apos;s message. Building this yourself takes one HTTPS call
          at send time, a TXT record, and this widget.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <a href={`${FROMENANCE_DOCS}/getting-started/integration-guide`}>Integration guide</a>
          </Button>
          <Button variant="ghost" asChild>
            <a href={`${DEMO_SOURCE}/src/features/verify`}>This page&apos;s source</a>
          </Button>
        </div>
      </section>
    </div>
  );
}

const TONE: Record<NonNullable<PublicVerdict['outcome']>, string> = {
  verified: 'text-success-soft-fg',
  not_verified: 'text-warning-soft-fg',
  known_fraud: 'text-danger-soft-fg',
};

/** What the API returned, for people who came to see the mechanism rather than the card. */
function VerdictDetail({ verdict }: { verdict: PublicVerdict }) {
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
      <p className="mt-3 text-xs text-fg-muted">
        The rule names what matched: the code, the recipient, the content fingerprint, or nothing. A
        real footer pasted into a different message comes back as a replay.
      </p>
    </div>
  );
}
