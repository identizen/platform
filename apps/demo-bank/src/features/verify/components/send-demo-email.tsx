import { useState, type FormEvent } from 'react';
import { Button } from '@identizen/ui';
import { Fish, Send } from 'lucide-react';
import { requestDemoEmail, type DemoKind } from '../api/demo-email';

type State =
  | { status: 'idle' }
  | { status: 'sending'; kind: DemoKind }
  | { status: 'sent'; kind: DemoKind; email: string }
  | { status: 'error'; message: string };

export interface SendDemoEmailProps {
  /** Called after the Worker accepted the send, with the address it went to and what went out. */
  onSent?: (email: string, kind: DemoKind) => void;
}

/**
 * "Send me a demo email": the visitor gives an address and picks what to receive. The real alert is
 * registered with Fromenance at send time, so it comes back Verified. The lure copies it, was never
 * registered, and comes back Not verified. The visitor always knows which one they asked for.
 */
export function SendDemoEmail({ onSent }: SendDemoEmailProps) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>({ status: 'idle' });
  const sending = state.status === 'sending';

  const send = async (kind: DemoKind) => {
    const to = email.trim();
    setState({ status: 'sending', kind });
    const result = await requestDemoEmail(to, kind);
    if (result.ok) {
      setState({ status: 'sent', kind: result.kind, email: to });
      onSent?.(to, result.kind);
    } else {
      setState({ status: 'error', message: result.message });
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void send('registered');
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-bank/30 bg-bank-soft p-5"
      aria-labelledby="send-demo-heading"
    >
      <h2 id="send-demo-heading" className="font-semibold text-bank-soft-fg">
        Get one in your own inbox
      </h2>
      <p className="mt-1 text-sm text-fg-muted">
        The real alert is registered the moment we send it, so pasting it above comes back Verified.
        The lure copies that alert but was never registered, so it comes back Not verified. You
        choose which one to receive.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <label htmlFor="demo-email" className="sr-only">
          Email address for the demo message
        </label>
        <input
          id="demo-email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={sending}
          className="h-9 min-w-0 flex-1 rounded-md border bg-surface-0 px-3 text-sm text-fg placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={sending}>
            <Send aria-hidden="true" className="mr-1.5 size-4" />
            {sending && state.kind === 'registered' ? 'Sending' : 'Send me the real alert'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={sending || email.trim().length === 0}
            onClick={() => void send('lure')}
          >
            <Fish aria-hidden="true" className="mr-1.5 size-4" />
            {sending && state.kind === 'lure' ? 'Sending' : 'Send me a lure'}
          </Button>
        </div>
      </div>
      {state.status === 'sent' && (
        <p className="mt-3 text-sm text-fg-muted" role="status">
          {state.kind === 'registered'
            ? `Real alert sent to ${state.email}. Open it, copy the whole message, and paste it above. We filled in ${state.email} as the address that received it, so it will come back Verified.`
            : `Lure sent to ${state.email}. It looks like our alert, but nothing was registered. Paste it above and it will come back Not verified.`}
        </p>
      )}
      {state.status === 'error' && (
        <p className="mt-3 text-sm text-danger-soft-fg" role="alert">
          {state.message}
        </p>
      )}
      <p className="mt-3 text-xs text-fg-muted">
        One per address per minute. The email says it is a demo, names no real account, and its
        links go nowhere. We keep nothing but the registration.
      </p>
    </form>
  );
}
