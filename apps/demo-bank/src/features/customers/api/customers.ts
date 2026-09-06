/**
 * The bank's customer directory, keyed by the Identizen `sub`.
 *
 * `sub` is the one value in the id_token to build on: it is unique to jtmerlin.com, the same
 * on every phone that holds the person's identity (a restore from the 24 words yields the same
 * key), and useless to any other site. Everything the bank knows about a person (name, contact
 * details, accounts, KYC) hangs off it. Identizen never sees any of it.
 *
 * A real bank keeps this table in its core system behind the server that verified the
 * id_token. This demo has no server, so it lives in localStorage on this browser.
 */

export interface Customer {
  /** The Identizen per-site identifier. Primary key. */
  sub: string;
  name: string;
  email: string;
  phone: string;
  /** ISO timestamp of the sign-up. */
  createdAt: string;
  /** How the phone authenticated the person when the record was created, for the audit trail. */
  signupAmr: string[];
}

export interface CustomerInput {
  sub: string;
  name: string;
  email: string;
  phone: string;
  signupAmr: string[];
}

const KEY = 'jtm:customers';

type Store = Record<string, Customer>;

let memory: Store = {};

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : memory;
  } catch {
    return memory;
  }
}

function write(store: Store): void {
  memory = store;
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* storage unavailable: keep the in-memory copy */
  }
}

/** Look up or miss: the branch every login takes. */
export function findCustomer(sub: string): Customer | null {
  return read()[sub] ?? null;
}

/** Sign-up. Idempotent per `sub`: a second sign-up for the same identity returns the first. */
export function createCustomer(input: CustomerInput, now: Date = new Date()): Customer {
  const store = read();
  const existing = store[input.sub];
  if (existing) return existing;
  const customer: Customer = {
    sub: input.sub,
    name: input.name.trim(),
    email: input.email.trim(),
    phone: input.phone.trim(),
    createdAt: now.toISOString(),
    signupAmr: input.signupAmr,
  };
  write({ ...store, [input.sub]: customer });
  return customer;
}

/** "Jordan" from "Jordan Okafor"; the shell greets people by first name. */
export function firstName(customer: Customer): string {
  return customer.name.split(/\s+/)[0] ?? customer.name;
}

/** Test and demo-reset hook. */
export function resetCustomers(): void {
  write({});
}
