import { describe, expect, it } from 'vitest';
import { getSession, setSession } from '@/features/auth';
import { MOCK_SESSION } from '@/mocks/fixtures';
import { ApiError, UnauthorizedError, api } from './http';
import { relativeTime, shortId } from './format';

describe('api', () => {
  it('sends the bearer token and parses JSON', async () => {
    setSession(MOCK_SESSION);
    const me = await api<{ idz: string }>('/me');
    expect(me.idz).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it('throws UnauthorizedError without a session, and clears a stale session on 401', async () => {
    await expect(api('/me')).rejects.toBeInstanceOf(UnauthorizedError);
    setSession({ ...MOCK_SESSION, accessToken: 'stale' });
    await expect(api('/me')).rejects.toBeInstanceOf(UnauthorizedError);
    expect(getSession()).toBeNull();
  });

  it('surfaces index error codes', async () => {
    setSession(MOCK_SESSION);
    const err = await api('/me/handle', { method: 'POST', body: { handle: 'taken' } }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('handle_taken');
    expect((err as ApiError).status).toBe(409);
  });

  it('anonymous endpoints work without a session', async () => {
    const state = await api<{ status: string }>('/challenge/ch_01K3ZB2N9G0000000000000020/state', {
      anonymous: true,
    });
    expect(state.status).toBe('pending');
  });
});

describe('format', () => {
  it('relative time and short ids', () => {
    const now = Date.parse('2026-09-02T12:00:00Z');
    expect(relativeTime(null)).toBe('never');
    expect(relativeTime('2026-09-02T11:59:50Z', now)).toBe('just now');
    expect(relativeTime('2026-09-02T11:30:00Z', now)).toBe('30 minutes ago');
    expect(relativeTime('2026-09-02T09:00:00Z', now)).toBe('3 hours ago');
    expect(relativeTime('2026-08-30T12:00:00Z', now)).toBe('3 days ago');
    expect(relativeTime('2026-09-03T12:00:00Z', now)).toBe('in 1 day');
    expect(shortId('dev_01K3ZB2N9G0000000000000001', 12)).toBe('dev_01K3ZB2N…');
    expect(shortId('short')).toBe('short');
  });
});
