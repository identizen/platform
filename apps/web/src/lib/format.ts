/** Small presentational helpers. */

export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return 'never';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'unknown';
  const diff = Math.round((now - t) / 1000);
  const abs = Math.abs(diff);
  const future = diff < 0;
  const fmt = (n: number, unit: string) =>
    `${future ? 'in ' : ''}${n} ${unit}${n === 1 ? '' : 's'}${future ? '' : ' ago'}`;
  if (abs < 45) return future ? 'in a moment' : 'just now';
  if (abs < 3600) return fmt(Math.round(abs / 60), 'minute');
  if (abs < 86400) return fmt(Math.round(abs / 3600), 'hour');
  if (abs < 86400 * 30) return fmt(Math.round(abs / 86400), 'day');
  return new Date(iso).toLocaleDateString();
}

export function shortId(id: string, keep = 8): string {
  return id.length <= keep + 4 ? id : `${id.slice(0, keep)}…`;
}

export function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
