/** Money is integer cents; formatting happens at the edge. */

export type Cents = number;

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function formatUsd(cents: Cents): string {
  return usd.format(cents / 100);
}

/** "$1,234.56" -> 123456; rejects anything that is not a plain positive amount. */
export function parseUsd(input: string): Cents | null {
  const cleaned = input.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole = '0', frac = ''] = cleaned.split('.');
  const cents = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  return cents > 0 ? cents : null;
}

/** Last four digits of an account number, for display. */
export function last4(accountNumber: string): string {
  return `···${accountNumber.slice(-4)}`;
}
