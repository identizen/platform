/** Client for the Worker's POST /api/demo-email. Same origin; the Worker checks that too. */

/** What the Worker sends: the real alert, registered at send time, or a lure that was never registered. */
export type DemoKind = 'registered' | 'lure';

export type DemoEmailResult = { ok: true; kind: DemoKind } | { ok: false; message: string };

export async function requestDemoEmail(
  email: string,
  kind: DemoKind,
  f: typeof fetch = fetch,
): Promise<DemoEmailResult> {
  let res: Response;
  try {
    res = await f('/api/demo-email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, kind }),
    });
  } catch {
    return { ok: false, message: 'We could not reach the bank. Check your connection.' };
  }
  if (res.ok) {
    try {
      const body = (await res.json()) as { kind?: unknown };
      if (body.kind === 'registered' || body.kind === 'lure') return { ok: true, kind: body.kind };
    } catch {
      /* fall through: the request succeeded, assume what we asked for */
    }
    return { ok: true, kind };
  }
  let message = `The bank answered ${res.status}.`;
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === 'string') message = body.error;
  } catch {
    /* not JSON: keep the status text */
  }
  return { ok: false, message };
}
