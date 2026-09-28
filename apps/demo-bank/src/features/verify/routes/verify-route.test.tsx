import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as WidgetModule from '../api/widget';
import type { PublicVerdict, WidgetOptions } from '../api/widget';
import { DEMO_RECIPIENT } from '../data/samples';
import { explainRule } from '../components/verdict-detail';
import { VerifyRoute } from './verify-route';

const mount = vi.fn((opts: WidgetOptions) => {
  // A stand-in for the real widget: the three fields and the button it renders, with its labels.
  opts.target.innerHTML = `<div class="frv" data-theme="${opts.theme ?? 'auto'}">
    <textarea aria-label="Message text"></textarea>
    <input aria-label="Reference code" />
    <input aria-label="Your email address" />
    <button type="button">Check this message</button>
  </div>`;
  return {};
});

vi.mock('../api/widget', async (importOriginal) => {
  const real = await importOriginal<typeof WidgetModule>();
  return { ...real, loadFromenance: () => Promise.resolve({ mount, version: 'test' }) };
});

const VERDICT: PublicVerdict = {
  status: 'decided',
  poll_token: null,
  submission_id: 'sub_test',
  outcome: 'verified',
  rule: 'code+recipient',
  matched_sent_at: '2026-09-27T16:22:13Z',
  display: null,
};

/** A fetch double for the Worker endpoint that records what the page asked for. */
function fakeDemoEmailFetch() {
  const bodies: { email: string; kind: string }[] = [];
  const f = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(init?.body as string) as { email: string; kind: string };
    bodies.push(body);
    return new Response(JSON.stringify({ sent: true, kind: body.kind }), { status: 200 });
  });
  vi.stubGlobal('fetch', f);
  return bodies;
}

beforeEach(() => {
  mount.mockClear();
  localStorage.clear();
  document.documentElement.setAttribute('data-theme', 'dark');
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-theme');
});

describe('VerifyRoute', () => {
  it('mounts the widget with the site key, the bank name, and the site theme', async () => {
    render(<VerifyRoute />);
    await waitFor(() => expect(mount).toHaveBeenCalledTimes(1));
    const opts = mount.mock.calls[0]?.[0];
    expect(opts?.siteKey).toMatch(/^sk_pub_/);
    expect(opts?.institutionName).toBe('JT Merlin Bank');
    expect(opts?.theme).toBe('dark');
    expect(opts?.target).toBe(screen.getByTestId('fromenance-verify'));
  });

  it('fills the widget with a sample and the demo recipient', async () => {
    render(<VerifyRoute />);
    await waitFor(() => expect(mount).toHaveBeenCalled());
    act(() => screen.getByRole('button', { name: /use the lure/i }).click());
    const text = screen.getByLabelText<HTMLTextAreaElement>('Message text');
    const email = screen.getByLabelText<HTMLInputElement>('Your email address');
    expect(text.value).toMatch(/jtmerlin-secure\.com/);
    expect(email.value).toBe(DEMO_RECIPIENT);
    expect(screen.getByRole('status')).toHaveTextContent(/pasted/i);
  });

  it('sends the real alert by default and puts that address into the widget', async () => {
    const bodies = fakeDemoEmailFetch();
    render(<VerifyRoute />);
    await waitFor(() => expect(mount).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText(/email address for the demo message/i), {
      target: { value: 'me@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send me the real alert/i }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ email: 'me@example.com', kind: 'registered' });
    await waitFor(() =>
      expect(screen.getByLabelText<HTMLInputElement>('Your email address').value).toBe(
        'me@example.com',
      ),
    );
    expect(
      screen
        .getAllByRole('status')
        .map((n) => n.textContent)
        .join(' '),
    ).toMatch(/Real alert sent to me@example.com/);
    expect(localStorage.getItem('jtmerlin.verify.email')).toBe('me@example.com');
  });

  it('sends a lure only when asked', async () => {
    const bodies = fakeDemoEmailFetch();
    render(<VerifyRoute />);
    await waitFor(() => expect(mount).toHaveBeenCalled());
    const lure = screen.getByRole('button', { name: /send me a lure/i });
    expect(lure).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/email address for the demo message/i), {
      target: { value: 'me@example.com' },
    });
    fireEvent.click(lure);
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ email: 'me@example.com', kind: 'lure' });
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('status')
          .map((n) => n.textContent)
          .join(' '),
      ).toMatch(/Lure sent to me@example.com/),
    );
  });

  it('remembers the address across visits and fills an empty field before the widget submits', async () => {
    localStorage.setItem('jtmerlin.verify.email', 'back@example.com');
    render(<VerifyRoute />);
    await waitFor(() => expect(mount).toHaveBeenCalled());
    const email = screen.getByLabelText<HTMLInputElement>('Your email address');
    expect(email.value).toBe('back@example.com');
    email.value = '';
    fireEvent.click(screen.getByRole('button', { name: /check this message/i }));
    expect(email.value).toBe('back@example.com');
  });

  it('shows what the API said when the widget reports a verdict', async () => {
    render(<VerifyRoute />);
    await waitFor(() => expect(mount).toHaveBeenCalled());
    act(() => mount.mock.calls[0]?.[0].onVerdict?.(VERDICT));
    const detail = screen.getByTestId('verdict-detail');
    expect(detail).toHaveTextContent('verified');
    expect(detail).toHaveTextContent('code+recipient');
    expect(detail).toHaveTextContent('sub_test');
  });

  it('explains a recipient mismatch in plain words', async () => {
    render(<VerifyRoute />);
    await waitFor(() => expect(mount).toHaveBeenCalled());
    act(() =>
      mount.mock.calls[0]?.[0].onVerdict?.({
        ...VERDICT,
        outcome: 'not_verified',
        rule: 'code:recipient_mismatch',
        signals: { code_found: true, recipient_match: false, fingerprint_distance: 0 },
      }),
    );
    expect(screen.getByTestId('verdict-detail')).toHaveTextContent(
      /Enter the address that received it/,
    );
  });

  it('restamps the widget theme when the site toggle changes it', async () => {
    render(<VerifyRoute />);
    await waitFor(() => expect(mount).toHaveBeenCalled());
    document.documentElement.setAttribute('data-theme', 'light');
    await waitFor(() =>
      expect(screen.getByTestId('fromenance-verify').querySelector('.frv')).toHaveAttribute(
        'data-theme',
        'light',
      ),
    );
  });
});

describe('explainRule', () => {
  it('has a sentence for every rule the registry reports', () => {
    for (const rule of [
      'code+recipient+content',
      'code+recipient',
      'recipient+fingerprint',
      'code+recipient:content_mismatch',
      'code:recipient_mismatch',
      'code:replay',
      'no_match',
      'no_match:authoritative',
      'fraud_list:indicator',
      'fraud_list:fingerprint',
    ]) {
      expect(explainRule({ ...VERDICT, rule })).toMatch(/\.$/);
    }
    expect(explainRule({ ...VERDICT, rule: 'code:replay' })).toMatch(/address that received it/);
    expect(explainRule({ ...VERDICT, rule: 'no_match' })).toMatch(/lure/);
  });
});
