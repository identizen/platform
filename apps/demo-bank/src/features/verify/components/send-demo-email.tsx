import { useState, type FormEvent } from 'react';
import { Button } from '@identizen/ui';
import { Send } from 'lucide-react';
import { requestDemoEmail } from '../api/demo-email';

type State = { status: 'idle' | 'sending' } | { status: 'sent' | 'error'; message: string };

/**
 * "Send me a demo email": the visitor gives an address and the Worker sends one JT Merlin alert,
 * real or lure. The page never learns which; the verify form above answers that.
 */
export function SendDemoEmail() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>({ status: 'idle' });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState({ status: 'sending' });
    const result = await requestDemoEmail(email.trim());
    setState(
      result.ok
        ? {
            status: 'sent',
            message: `Sent to ${email.trim()}. Check your inbox (and spam). It is either the real alert or a lure that copies it. Open it, copy the whole message, and paste it above with that address.`,
          }
        : { status: 'error', message: result.message },
    );
  };

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="rounded-xl border border-bank/30 bg-bank-soft p-5"
      aria-labelledby="send-demo-heading"
    >
      <h2 id="send-demo-heading" className="font-semibold text-bank-soft-fg">
        Get one in your own inbox
      </h2>
      <p className="mt-1 text-sm text-fg-muted">
        We send you one JT Merlin alert. Half the time it is real and registered at send time, half
        the time it is a lure. Only the verify form can tell you which.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
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
          disabled={state.status === 'sending'}
          className="h-9 min-w-0 flex-1 rounded-md border bg-surface-0 px-3 text-sm text-fg placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
        <Button type="submit" disabled={state.status === 'sending'}>
          <Send aria-hidden="true" className="mr-1.5 size-4" />
          {state.status === 'sending' ? 'Sending' : 'Send me a demo email'}
        </Button>
      </div>
      {state.status === 'sent' && (
        <p className="mt-3 text-sm text-fg-muted" role="status">
          {state.message}
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
