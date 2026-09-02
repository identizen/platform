import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Identizen, LoginSession, LoginState } from '@identizen/sdk';
import { IdentizenProvider, IdentizenButton, IdentizenStepUp, useIdentizen } from './index';

/** A scriptable LoginSession: tests drive state transitions. */
function scriptedSession(initial: Partial<LoginState> = {}) {
  let state: LoginState = {
    status: 'starting',
    challengeId: 'ch_x',
    code: '47',
    deepLink: 'https://app.test/l/ch_x',
    qrSvg: '<svg role="img" aria-label="QR"></svg>',
    expiresAt: 0,
    method: null,
    useDeepLink: false,
    redirect: null,
    error: null,
    ...initial,
  };
  const listeners = new Set<(s: LoginState) => void>();
  let resolveDone: (s: LoginState) => void = () => undefined;
  const done = new Promise<LoginState>((r) => (resolveDone = r));
  const session: LoginSession & { set: (patch: Partial<LoginState>) => void } = {
    get state() {
      return state;
    },
    subscribe(cb) {
      listeners.add(cb);
      cb(state);
      return () => listeners.delete(cb);
    },
    done,
    cancel: vi.fn(() => session.set({ status: 'cancelled' })),
    set(patch) {
      state = { ...state, ...patch };
      for (const l of listeners) l(state);
      if (['approved', 'denied', 'expired', 'error', 'cancelled'].includes(state.status))
        resolveDone(state);
    },
  };
  return session;
}

function fakeClient(session: ReturnType<typeof scriptedSession>) {
  return {
    indexUrl: 'http://index.test',
    clientId: 'idz_test_x',
    pairingEnabled: true,
    startLogin: vi.fn(() => session),
    enroll: vi.fn(() => session),
    stepUp: vi.fn(() => session),
    unpair: vi.fn(),
  } as unknown as Identizen;
}

describe('<IdentizenButton>', () => {
  it('renders the idle button, then the waiting panel with code and QR, then success', async () => {
    const session = scriptedSession();
    const client = fakeClient(session);
    const onSuccess = vi.fn();
    const { container } = render(
      <IdentizenProvider indexUrl="http://index.test" clientId="idz_test_x" client={client}>
        <IdentizenButton onSuccess={onSuccess} followRedirect={false} />
      </IdentizenProvider>,
    );
    const button = screen.getByRole('button', { name: 'Continue with Identizen' });
    expect(container).toMatchSnapshot('idle');
    await userEvent.click(button);
    expect(client.startLogin).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent('Contacting Identizen');

    act(() => session.set({ status: 'waiting', method: 'qr' }));
    expect(screen.getByRole('status')).toHaveTextContent('Scan the code');
    expect(screen.getByLabelText('Match code')).toHaveTextContent('47');
    expect(screen.getByRole('img', { name: 'QR' })).toBeInTheDocument();
    expect(container).toMatchSnapshot('waiting-qr');

    act(() => session.set({ status: 'approved', redirect: 'https://site.test/cb?code=1' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(screen.getByRole('status')).toHaveTextContent('Approved');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container).toMatchSnapshot('approved');
  });

  it('shows the deep link on mobile and "waiting" when pushed; cancel and retry work', async () => {
    const session = scriptedSession({ status: 'waiting', method: 'deeplink', useDeepLink: true });
    const client = fakeClient(session);
    render(
      <IdentizenProvider indexUrl="http://index.test" clientId="idz_test_x" client={client}>
        <IdentizenButton label="Sign in with your phone" />
      </IdentizenProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with your phone' }));
    expect(screen.getByRole('link', { name: 'Open in Identizen' })).toHaveAttribute(
      'href',
      'https://app.test/l/ch_x',
    );
    act(() => session.set({ method: 'push' }));
    expect(screen.getByRole('status')).toHaveTextContent('Waiting on your phone');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(session.cancel).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Sign in with your phone' })).toBeInTheDocument();
  });

  it('reports denial and errors and offers retry', async () => {
    const session = scriptedSession({ status: 'waiting', method: 'qr' });
    const client = fakeClient(session);
    const onError = vi.fn();
    render(
      <IdentizenProvider indexUrl="http://index.test" clientId="idz_test_x" client={client}>
        <IdentizenButton onError={onError} />
      </IdentizenProvider>,
    );
    await userEvent.click(screen.getByRole('button'));
    act(() =>
      session.set({ status: 'error', error: { code: 'unknown_client', message: 'no such site' } }),
    );
    await waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(screen.getByRole('status')).toHaveTextContent('no such site (unknown_client)');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByRole('button', { name: 'Continue with Identizen' })).toBeInTheDocument();
  });

  it('useIdentizen throws outside the provider', () => {
    function Bare() {
      useIdentizen();
      return null;
    }
    expect(() => render(<Bare />)).toThrow(/IdentizenProvider/);
  });
});

describe('<IdentizenStepUp>', () => {
  it('starts automatically, shows the reason and code, and reports approval', async () => {
    const session = scriptedSession({ status: 'waiting', method: 'push' });
    const client = fakeClient(session);
    const onApproved = vi.fn();
    const { container } = render(
      <IdentizenProvider indexUrl="http://index.test" clientId="idz_test_x" client={client}>
        <IdentizenStepUp
          sub={'S'.repeat(32)}
          reason="Approve wire of $12,000?"
          onApproved={onApproved}
        />
      </IdentizenProvider>,
    );
    await waitFor(() =>
      expect(client.stepUp).toHaveBeenCalledWith('S'.repeat(32), {
        reason: 'Approve wire of $12,000?',
      }),
    );
    expect(screen.getByText('Approve wire of $12,000?')).toBeInTheDocument();
    expect(screen.getByLabelText('Match code')).toHaveTextContent('47');
    expect(container).toMatchSnapshot('step-up-waiting');
    act(() => session.set({ status: 'approved' }));
    await waitFor(() => expect(onApproved).toHaveBeenCalledOnce());
    expect(screen.getByRole('status')).toHaveTextContent('Approved');
  });

  it('auto=false waits for the button', async () => {
    const session = scriptedSession({ status: 'waiting', method: 'push' });
    const client = fakeClient(session);
    render(
      <IdentizenProvider indexUrl="http://index.test" clientId="idz_test_x" client={client}>
        <IdentizenStepUp sub="x" auto={false} label="Confirm on phone" />
      </IdentizenProvider>,
    );
    expect(client.stepUp).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm on phone' }));
    expect(client.stepUp).toHaveBeenCalledOnce();
  });
});
