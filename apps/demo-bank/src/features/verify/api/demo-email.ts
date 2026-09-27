/** Client for the Worker's POST /api/demo-email. Same origin; the Worker checks that too. */

export type DemoEmailResult = { ok: true } | { ok: false; message: string };

export async function requestDemoEmail(
  email: string,
  f: typeof fetch = fetch,
): Promise<DemoEmailResult> {
  let res: Response;
  try {
    res = await f('/api/demo-email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
  } catch {
    return { ok: false, message: 'We could not reach the bank. Check your connection.' };
  }
  if (res.ok) return { ok: true };
  let message = `The bank answered ${res.status}.`;
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === 'string') message = body.error;
  } catch {
    /* not JSON: keep the status text */
  }
  return { ok: false, message };
}
