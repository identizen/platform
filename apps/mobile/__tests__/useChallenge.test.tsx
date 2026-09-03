import { act, renderHook } from '@testing-library/react-native';
import type { Challenge } from '@identizen/protocol';
import { challengeStore } from '../src/challenges/store';
import { useChallenge } from '../src/challenges/useChallenge';

const challenge = (id: string): Challenge => ({
  type: 'challenge',
  id,
  rp_id: 'jtmerlin.com',
  rp_name: 'JT Merlin Bank',
  nonce: 'A'.repeat(43),
  code: '47',
  iat: 1,
  exp: Math.floor(Date.now() / 1000) + 60,
  index: 'http://index.test',
  acr: 'idz:login',
  reason: null,
});

describe('useChallenge', () => {
  it('keeps the challenge on screen after approval removes it from the store', async () => {
    const id = 'ch_01K3ZB2N9G0000000000000001';
    const { result } = await renderHook(() => useChallenge(id));
    expect(result.current).toBeNull();

    await act(() => {
      challengeStore.add({ challenge: challenge(id), receivedAt: Date.now(), via: 'push' });
    });
    expect(result.current?.id).toBe(id);

    // Approve: the store drops it, the screen must not fall back to "fetching".
    await act(() => {
      challengeStore.remove(id);
    });
    expect(result.current?.id).toBe(id);
  });

  it('does not show a previous challenge for a different id', async () => {
    const a = 'ch_01K3ZB2N9G0000000000000002';
    const b = 'ch_01K3ZB2N9G0000000000000003';
    const { result, rerender } = await renderHook(({ id }: { id: string }) => useChallenge(id), {
      initialProps: { id: a },
    });
    await act(() => {
      challengeStore.add({ challenge: challenge(a), receivedAt: Date.now(), via: 'push' });
    });
    expect(result.current?.id).toBe(a);
    await rerender({ id: b });
    expect(result.current).toBeNull();
  });
});
