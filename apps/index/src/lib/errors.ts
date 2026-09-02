import { DbError, InvalidTransitionError, NotFoundError, ConflictError } from '@identizen/db';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';

/** API error with a stable machine-readable code (every SDK error has a code and a cause). */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }

  toBody(): Record<string, unknown> {
    return { error: this.code, error_description: this.message, ...this.extra };
  }
}

export const badRequest = (code: string, msg: string): ApiError => new ApiError(400, code, msg);
export const unauthorized = (code: string, msg: string): ApiError => new ApiError(401, code, msg);
export const forbidden = (code: string, msg: string): ApiError => new ApiError(403, code, msg);
export const notFound = (code: string, msg: string): ApiError => new ApiError(404, code, msg);
export const conflict = (code: string, msg: string): ApiError => new ApiError(409, code, msg);
export const gone = (code: string, msg: string): ApiError => new ApiError(410, code, msg);

export function errorToResponse(err: unknown, c: Context): Response {
  if (err instanceof ApiError) return c.json(err.toBody(), err.status as 400);
  if (err instanceof HTTPException) return err.getResponse();
  if (err instanceof ZodError) {
    return c.json(
      {
        error: 'invalid_request',
        error_description: 'request body failed validation',
        issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
      400,
    );
  }
  if (err instanceof NotFoundError)
    return c.json({ error: 'not_found', error_description: err.message }, 404);
  if (err instanceof ConflictError)
    return c.json({ error: 'conflict', error_description: err.message }, 409);
  if (err instanceof InvalidTransitionError) {
    return c.json({ error: 'invalid_transition', error_description: err.message }, 409);
  }
  if (err instanceof DbError)
    return c.json({ error: err.code, error_description: err.message }, 400);
  console.error('unhandled error', err);
  return c.json({ error: 'server_error', error_description: 'internal error' }, 500);
}
