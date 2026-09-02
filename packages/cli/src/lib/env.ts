import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/** Upsert KEY=value lines in a dotenv file, preserving everything else. */
export function upsertEnv(
  path: string,
  values: Record<string, string>,
): { created: boolean; changed: string[] } {
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const lines = existing.length ? existing.split(/\r?\n/) : [];
  const seen = new Set<string>();
  const changed: string[] = [];
  const out = lines.map((line) => {
    const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=/.exec(line);
    if (!m?.[1] || !(m[1] in values)) return line;
    seen.add(m[1]);
    const next = `${m[1]}=${quote(values[m[1]] ?? '')}`;
    if (next !== line) changed.push(m[1]);
    return next;
  });
  while (out.length && out[out.length - 1] === '') out.pop();
  for (const [k, v] of Object.entries(values)) {
    if (seen.has(k)) continue;
    out.push(`${k}=${quote(v)}`);
    changed.push(k);
  }
  const text = out.join('\n').replace(/\n*$/, '\n');
  writeFileSync(path, text);
  return { created: existing.length === 0, changed };
}

function quote(v: string): string {
  return /[\s#"']/.test(v) ? JSON.stringify(v) : v;
}
