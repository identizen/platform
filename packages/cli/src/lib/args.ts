/** Tiny argv parser: `identizen <command> [--flag value] [--bool]`. */
export interface ParsedArgs {
  command: string | null;
  positionals: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { command: null, positionals: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? '';
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) {
        out.flags[a.slice(2, eq)] = a.slice(eq + 1);
        continue;
      }
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        out.flags[key] = next;
        i++;
      } else {
        out.flags[key] = true;
      }
    } else if (out.command === null) {
      out.command = a;
    } else {
      out.positionals.push(a);
    }
  }
  return out;
}

export function flag(
  flags: ParsedArgs['flags'],
  key: string,
  fallback?: string,
): string | undefined {
  const v = flags[key];
  if (typeof v === 'string') return v;
  return fallback;
}

export function boolFlag(flags: ParsedArgs['flags'], key: string): boolean {
  const v = flags[key];
  return v === true || v === 'true' || v === '1';
}
