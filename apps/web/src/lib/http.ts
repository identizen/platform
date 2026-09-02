import { INDEX_URL } from './config';
import { clearSession, getSession } from '@/features/auth';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'signed out') {
    super(401, 'unauthorized', message);
    this.name = 'UnauthorizedError';
  }
}

export interface ApiOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  /** Skip the bearer token (public endpoints). */
  anonymous?: boolean;
  fetchImpl?: typeof fetch;
}

/**
 * Call the index. Adds the dashboard bearer token; a 401 ends the session so the UI returns
 * to sign-in. Errors carry the index error code.
 */
export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const fetchImpl =
    opts.fetchImpl ?? ((i: RequestInfo | URL, init?: RequestInit) => fetch(i, init));
  const headers: Record<string, string> = { accept: 'application/json' };
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (!opts.anonymous) {
    const session = getSession();
    if (!session) throw new UnauthorizedError('no session');
    headers.authorization = `Bearer ${session.accessToken}`;
  }
  const res = await fetchImpl(`${INDEX_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    ...(opts.body !== undefined && { body: JSON.stringify(opts.body) }),
  });
  if (res.status === 401 && !opts.anonymous) {
    clearSession();
    throw new UnauthorizedError('session expired');
  }
  if (!res.ok) {
    let code = `http_${res.status}`;
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: string; error_description?: string };
      if (body.error) code = body.error;
      if (body.error_description) message = body.error_description;
    } catch {
      /* non-JSON */
    }
    throw new ApiError(res.status, code, message);
  }
  return (await res.json()) as T;
}
