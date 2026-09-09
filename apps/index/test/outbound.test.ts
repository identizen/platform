/**
 * Egress policy (review S07): what the index will and will not send a request to, and that
 * every outbound request has a deadline and does not follow redirects.
 */
import { describe, expect, it } from 'vitest';
import {
  DestinationBlockedError,
  canonicalHostname,
  destinationProblem,
  fetchOutbound,
  outboundPolicy,
  readBounded,
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

/** A body that trickles one byte every 20 ms until the reader cancels it. */
function trickle(): ReadableStream<Uint8Array> {
  let open = true;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      return new Promise((resolve) =>
        setTimeout(() => {
          if (open) controller.enqueue(new Uint8Array([66]));
          resolve();
        }, 20),
      );
    },
    cancel() {
      open = false;
    },
  });
}

describe('F06: canonical hostnames and bounded bodies', () => {
  it('strips trailing root dots and lower-cases before judging a name', () => {
    expect(canonicalHostname('LocalHost.')).toBe('localhost');
    expect(canonicalHostname('printer.local..')).toBe('printer.local');
    for (const bad of [
      'https://localhost./hook',
      'https://LOCALHOST./hook',
      'https://api.internal./x',
    ]) {
      expect(destinationProblem(bad, strict), bad).toMatch(/local/);
    }
    expect(destinationProblem('https://hooks.example.com./idz', strict)).toBeNull();
  });

  it('readBounded cuts a body at the cap and stops when the signal fires', async () => {
    const big = new Response(new Uint8Array(10_000).fill(65));
    const cut = await readBounded(big, 100, new AbortController().signal);
    expect(cut).toHaveLength(100);

    const endless = trickle();
    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error('outbound deadline exceeded')), 60);
    await expect(readBounded(new Response(endless), 1_000, controller.signal)).rejects.toThrow(
      /deadline/,
    );
  });

  it('the deadline covers the body, and what comes back is finished and capped', async () => {
    const slowBody: typeof fetch = () => Promise.resolve(new Response(trickle(), { status: 200 }));
    await expect(
      fetchOutbound(slowBody, 'https://hooks.example.com/x', {}, strict, 80),
    ).rejects.toThrow(/deadline/);

    const large: typeof fetch = () =>
      Promise.resolve(new Response(new Uint8Array(200_000).fill(68), { status: 200 }));
    const res = await fetchOutbound(large, 'https://hooks.example.com/x', {}, strict, 1_000, 512);
    expect(res.status).toBe(200);
    expect((await res.text()).length).toBe(512);
  });
});
