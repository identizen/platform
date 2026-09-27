import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as WidgetModule from '../api/widget';
import type { PublicVerdict, WidgetOptions } from '../api/widget';
import { DEMO_RECIPIENT } from '../data/samples';
import { VerifyRoute } from './verify-route';

const mount = vi.fn((opts: WidgetOptions) => {
  // A stand-in for the real widget: the three fields it renders, with the labels it uses.
  opts.target.innerHTML = `<div class="frv" data-theme="${opts.theme ?? 'auto'}">
    <textarea aria-label="Message text"></textarea>
    <input aria-label="Reference code" />
    <input aria-label="Your email address" />
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

beforeEach(() => {
  mount.mockClear();
  document.documentElement.setAttribute('data-theme', 'dark');
});

afterEach(() => {
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

  it('shows what the API said when the widget reports a verdict', async () => {
    render(<VerifyRoute />);
    await waitFor(() => expect(mount).toHaveBeenCalled());
    act(() => mount.mock.calls[0]?.[0].onVerdict?.(VERDICT));
    const detail = screen.getByTestId('verdict-detail');
    expect(detail).toHaveTextContent('verified');
    expect(detail).toHaveTextContent('code+recipient');
    expect(detail).toHaveTextContent('sub_test');
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
