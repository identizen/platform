/** Presentational helpers for dates and ids. */

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function longDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function shortId(id: string, keep = 10): string {
  return id.length <= keep + 2 ? id : `${id.slice(0, keep)}…`;
}
