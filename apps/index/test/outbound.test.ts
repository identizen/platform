/**
 * Egress policy (review S07): what the index will and will not send a request to, and that
 * every outbound request has a deadline and does not follow redirects.
 */
import { describe, expect, it } from 'vitest';
import {
  DestinationBlockedError,
  destinationProblem,
  fetchOutbound,
  outboundPolicy,
} from '../src/lib/outbound';

const strict = { allowLocal: false };
const local = { allowLocal: true };

describe('destinationProblem', () => {
  it('accepts public https destinations and rejects everything local, private or plain http', () => {
    expect(destinationProblem('https://hooks.example.com/idz', strict)).toBeNull();
    expect(destinationProblem('https://203.0.113.9:8443/hook', strict)).toBeNull();
    for (const bad of [
      'http://hooks.example.com/idz',
      'https://localhost/hook',
      'https://api.localhost/hook',
      'https://printer.local/hook',
      'https://vault.internal/hook',
      'https://127.0.0.1/hook',
      'https://10.1.2.3/hook',
      'https://172.16.0.1/hook',
      'https://172.31.255.254/hook',
      'https://192.168.1.1/hook',
      'https://169.254.169.254/latest/meta-data',
      'https://100.64.0.1/hook',
      'https://0.0.0.0/hook',
      'https://[::1]/hook',
      'https://[fd12::1]/hook',
      'https://[fe80::1]/hook',
      'https://[::ffff:10.0.0.1]/hook',
      'https://user:pw@hooks.example.com/idz',
      'ftp://hooks.example.com/idz',
      'javascript:alert(1)',
      'not a url',
    ]) {
      expect(destinationProblem(bad, strict), bad).not.toBeNull();
    }
    // Public ranges next to the private ones are fine.
    expect(destinationProblem('https://172.32.0.1/hook', strict)).toBeNull();
    expect(destinationProblem('https://11.0.0.1/hook', strict)).toBeNull();
  });

  it('the local policy allows http and local hosts but still no other schemes or credentials', () => {
    expect(destinationProblem('http://localhost:4400/push', local)).toBeNull();
    expect(destinationProblem('http://127.0.0.1:3000/hook', local)).toBeNull();
    expect(destinationProblem('ftp://localhost/x', local)).not.toBeNull();
    expect(destinationProblem('http://a:b@localhost/x', local)).not.toBeNull();
  });

  it('is read from OUTBOUND_ALLOW_LOCAL and strict by default', () => {
    expect(outboundPolicy({})).toEqual({ allowLocal: false });
    expect(outboundPolicy({ OUTBOUND_ALLOW_LOCAL: 'false' })).toEqual({ allowLocal: false });
    expect(outboundPolicy({ OUTBOUND_ALLOW_LOCAL: 'true' })).toEqual({ allowLocal: true });
  });
});

describe('fetchOutbound', () => {
  it('refuses a blocked destination before any request is made', async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response('ok');
    }) as unknown as typeof fetch;
    await expect(
      fetchOutbound(fetchImpl, 'http://10.0.0.1/hook', { method: 'POST' }, strict),
    ).rejects.toBeInstanceOf(DestinationBlockedError);
    expect(called).toBe(false);
  });

  it('does not follow redirects and aborts at the deadline', async () => {
    let seenInit: RequestInit | undefined;
    const fetchImpl: typeof fetch = async (_url, init) => {
      seenInit = init;
      return new Response(null, {
        status: 302,
        headers: { location: 'https://elsewhere.example' },
      });
    };
    const res = await fetchOutbound(fetchImpl, 'https://hooks.example.com/x', {}, strict);
    expect(res.status).toBe(302);
    expect(seenInit?.redirect).toBe('manual');
    expect(seenInit?.signal).toBeInstanceOf(AbortSignal);

    const never: typeof fetch = (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const reason: unknown = init.signal?.reason;
          reject(reason instanceof Error ? reason : new Error(String(reason)));
        });
      });
    await expect(
      fetchOutbound(never, 'https://hooks.example.com/slow', {}, strict, 20),
    ).rejects.toThrow(/deadline/);
  });
});
