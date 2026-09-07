import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const headersFile = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

interface Rule {
  path: string;
  set: Record<string, string>;
  detach: string[];
}

/** Parse the Workers static-assets `_headers` format: a path line, then indented headers. */
function parseHeaders(text: string): Rule[] {
  const rules: Rule[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '' || raw.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      rules.push({ path: raw.trim(), set: {}, detach: [] });
      continue;
    }
    const rule = rules.at(-1);
    if (!rule) throw new Error(`header line before any path: ${raw}`);
    const line = raw.trim();
    if (line.startsWith('! ')) {
      rule.detach.push(line.slice(2).trim());
      continue;
    }
    const colon = line.indexOf(':');
    if (colon < 0) throw new Error(`not a header line: ${raw}`);
    rule.set[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  return rules;
}

function directive(csp: string, name: string): string[] {
  const d = csp
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${name} `) || s === name);
  return d ? d.split(/\s+/).slice(1) : [];
}

describe('public/_headers', () => {
  const rules = parseHeaders(headersFile);
  const site = rules.find((r) => r.path === '/*');

  it('sets a strict CSP, HSTS and the other hardening headers on every response', () => {
    expect(site).toBeDefined();
    const csp = site?.set['Content-Security-Policy'] ?? '';
    expect(directive(csp, 'default-src')).toEqual(["'self'"]);
    expect(directive(csp, 'script-src')).toEqual(["'self'"]);
    expect(directive(csp, 'frame-ancestors')).toEqual(["'none'"]);
    expect(directive(csp, 'object-src')).toEqual(["'none'"]);
    expect(directive(csp, 'base-uri')).toEqual(["'self'"]);
    expect(directive(csp, 'connect-src')).toContain('https://*.identizen.com');
    expect(csp).not.toMatch(/unsafe-eval/);
    const hsts = site?.set['Strict-Transport-Security'] ?? '';
    const maxAge = Number(/max-age=(\d+)/.exec(hsts)?.[1] ?? 0);
    expect(maxAge).toBeGreaterThanOrEqual(31_536_000);
    expect(hsts).toContain('includeSubDomains');
    expect(site?.set['X-Content-Type-Options']).toBe('nosniff');
    expect(site?.set['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(site?.set['Permissions-Policy']).toMatch(/camera=\(\)/);
  });

  it('only relaxes the CSP for the self-contained install page', () => {
    const detaching = rules.filter((r) => r.detach.includes('Content-Security-Policy'));
    expect(detaching.map((r) => r.path)).toEqual(['/install.html']);
  });

  it('keeps every rule well-formed and under the platform line limit', () => {
    for (const line of headersFile.split(/\r?\n/)) expect(line.length).toBeLessThan(2000);
    expect(rules.length).toBeLessThanOrEqual(100);
  });
});

describe('index.html', () => {
  it('has no inline script, so script-src stays self', () => {
    const inline = [...indexHtml.matchAll(/<script\b([^>]*)>/g)].filter(
      (m) => !/\bsrc=/.test(m[1] ?? ''),
    );
    expect(inline).toEqual([]);
  });
});
