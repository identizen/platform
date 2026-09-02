/** Typed errors thrown by the query module. HTTP mapping happens in apps/index. */
export class DbError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DbError {
  constructor(what: string, id: string) {
    super(`${what} not found: ${id}`, 'not_found');
  }
}

export class ConflictError extends DbError {
  constructor(message: string) {
    super(message, 'conflict');
  }
}

export class HandleTakenError extends ConflictError {
  constructor(handle: string) {
    super(`handle already taken: ${handle}`);
  }
}

export class BindingConflictError extends ConflictError {
  constructor(rpId: string, sub: string) {
    super(`site binding conflict for ${rpId}/${sub}`);
  }
}

export class InvalidTransitionError extends DbError {
  constructor(what: string, from: string, to: string) {
    super(`invalid ${what} transition ${from} -> ${to}`, 'invalid_transition');
  }
}

/** Read a field from a Postgres error, looking through the Drizzle wrapper via `cause`. */
export function pgErrorField(err: unknown, field: string): string | undefined {
  for (
    let e: unknown = err;
    typeof e === 'object' && e !== null;
    e = (e as { cause?: unknown }).cause
  ) {
    const v = (e as Record<string, unknown>)[field];
    if (typeof v === 'string') return v;
  }
  return undefined;
}

/** Postgres unique_violation. */
export function isUniqueViolation(err: unknown): boolean {
  return pgErrorField(err, 'code') === '23505';
}
