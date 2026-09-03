/**
 * Every number here is invented. A real bank serves this from its core; the demo ships it in
 * the bundle so the site works with no backend at all.
 */
import type { Cents } from '@/lib/money';

export type AccountKind = 'checking' | 'savings' | 'business';

export interface Account {
  id: string;
  kind: AccountKind;
  name: string;
  number: string;
  balance: Cents;
  available: Cents;
  apy?: number;
}

export interface Transaction {
  id: string;
  accountId: string;
  /** ISO date. */
  at: string;
  description: string;
  category: string;
  /** Positive is a credit, negative a debit. */
  amount: Cents;
}

export interface Payee {
  id: string;
  name: string;
  bank: string;
  accountNumber: string;
  routing: string;
  kind: 'ach' | 'wire';
}

export const ACCOUNTS: Account[] = [
  {
    id: 'acc_chk',
    kind: 'checking',
    name: 'Everyday Checking',
    number: '000198234471',
    balance: 1248022,
    available: 1223022,
  },
  {
    id: 'acc_sav',
    kind: 'savings',
    name: 'High-Yield Savings',
    number: '000198234488',
    balance: 4891007,
    available: 4891007,
    apy: 4.15,
  },
  {
    id: 'acc_biz',
    kind: 'business',
    name: 'Merlin Studio LLC · Operating',
    number: '000330912006',
    balance: 21740355,
    available: 21240355,
  },
];

const day = (n: number, h = 9) =>
  new Date(Date.now() - n * 86_400_000 - (24 - h) * 3_600_000).toISOString();

export const TRANSACTIONS: Transaction[] = [
  {
    id: 't1',
    accountId: 'acc_chk',
    at: day(0, 8),
    description: 'Blue Bottle Coffee',
    category: 'Dining',
    amount: -675,
  },
  {
    id: 't2',
    accountId: 'acc_chk',
    at: day(1, 12),
    description: 'Payroll · Merlin Studio LLC',
    category: 'Income',
    amount: 612500,
  },
  {
    id: 't3',
    accountId: 'acc_chk',
    at: day(1, 18),
    description: 'Whole Foods Market',
    category: 'Groceries',
    amount: -14322,
  },
  {
    id: 't4',
    accountId: 'acc_chk',
    at: day(2, 7),
    description: 'Caltrain',
    category: 'Transit',
    amount: -1050,
  },
  {
    id: 't5',
    accountId: 'acc_chk',
    at: day(3, 20),
    description: 'Netflix',
    category: 'Subscriptions',
    amount: -1549,
  },
  {
    id: 't6',
    accountId: 'acc_chk',
    at: day(4, 10),
    description: 'Transfer to High-Yield Savings',
    category: 'Transfer',
    amount: -100000,
  },
  {
    id: 't7',
    accountId: 'acc_sav',
    at: day(4, 10),
    description: 'Transfer from Everyday Checking',
    category: 'Transfer',
    amount: 100000,
  },
  {
    id: 't8',
    accountId: 'acc_sav',
    at: day(6, 0),
    description: 'Interest paid',
    category: 'Interest',
    amount: 16588,
  },
  {
    id: 't9',
    accountId: 'acc_biz',
    at: day(1, 15),
    description: 'Stripe payout',
    category: 'Income',
    amount: 4218840,
  },
  {
    id: 't10',
    accountId: 'acc_biz',
    at: day(2, 11),
    description: 'Cloudflare, Inc.',
    category: 'Infrastructure',
    amount: -21000,
  },
  {
    id: 't11',
    accountId: 'acc_biz',
    at: day(5, 9),
    description: 'Wire · Acme Supply Co.',
    category: 'Vendors',
    amount: -1200000,
  },
  {
    id: 't12',
    accountId: 'acc_biz',
    at: day(8, 16),
    description: 'ACH · Northwind Design Studio',
    category: 'Contractors',
    amount: -485000,
  },
];

export const PAYEES: Payee[] = [
  {
    id: 'p1',
    name: 'Acme Supply Co.',
    bank: 'First Harbor Bank',
    accountNumber: '4471',
    routing: '021000021',
    kind: 'wire',
  },
  {
    id: 'p2',
    name: 'Northwind Design Studio',
    bank: 'Pacific Credit Union',
    accountNumber: '8830',
    routing: '322271627',
    kind: 'ach',
  },
  {
    id: 'p3',
    name: 'Maria Okafor (rent)',
    bank: 'Chase',
    accountNumber: '1207',
    routing: '021000021',
    kind: 'ach',
  },
  {
    id: 'p4',
    name: 'Helios Energy Partners',
    bank: 'Wells Fargo',
    accountNumber: '9942',
    routing: '121000248',
    kind: 'wire',
  },
];

export function accountById(id: string): Account | undefined {
  return ACCOUNTS.find((a) => a.id === id);
}

export function transactionsFor(accountId: string): Transaction[] {
  return TRANSACTIONS.filter((t) => t.accountId === accountId).sort((a, b) =>
    b.at.localeCompare(a.at),
  );
}

export function totalBalance(): Cents {
  return ACCOUNTS.reduce((sum, a) => sum + a.balance, 0);
}
