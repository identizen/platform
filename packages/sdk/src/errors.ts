/** Every SDK error has a code, a one-line cause, and a link to the fix. */
export class IdentizenError extends Error {
  readonly code: string;
  readonly docsUrl: string;
  readonly status: number | undefined;

  constructor(code: string, message: string, opts: { status?: number; cause?: unknown } = {}) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'IdentizenError';
    this.code = code;
    this.status = opts.status;
    this.docsUrl = `https://docs.identizen.com/errors#${code}`;
  }
}

/** Turn a non-2xx index response into an IdentizenError with the index's error code. */
export async function errorFromResponse(res: Response, fallback: string): Promise<IdentizenError> {
  let code = fallback;
  let message = `${res.status} ${res.statusText}`;
  try {
    const body = (await res.json()) as { error?: string; error_description?: string };
    if (body.error) code = body.error;
    if (body.error_description) message = body.error_description;
  } catch {
    /* non-JSON error body */
  }
  return new IdentizenError(code, message, { status: res.status });
}
