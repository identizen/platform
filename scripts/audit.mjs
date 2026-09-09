// The gate's dependency audit: production dependencies only, red on any critical advisory.
// `npm audit --audit-level` decides the exit code differently across npm majors (npm 10 on the
// CI runner exits 1 on moderates that npm 12 lets through), so the policy lives here, on the
// JSON report, and the counts are printed either way. Usage: node scripts/audit.mjs
import { spawnSync } from 'node:child_process';

const LEVELS = ['info', 'low', 'moderate', 'high', 'critical'];
const FAIL_AT = 'critical';

const run = spawnSync('npm', ['audit', '--omit=dev', '--json'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
  maxBuffer: 64 * 1024 * 1024,
});

let report;
try {
  report = JSON.parse(run.stdout);
} catch {
  console.error(run.stdout);
  console.error(run.stderr);
  console.error('audit: npm audit produced no JSON report');
  process.exit(2);
}
if (report.error) {
  console.error(`audit: ${report.error.code ?? ''} ${report.error.summary ?? ''}`.trim());
  process.exit(2);
}

const counts = report.metadata?.vulnerabilities ?? {};
console.info(
  `audit (production dependencies): ${LEVELS.map((l) => `${counts[l] ?? 0} ${l}`).join(', ')}`,
);
const failing = LEVELS.slice(LEVELS.indexOf(FAIL_AT)).reduce((n, l) => n + (counts[l] ?? 0), 0);
if (failing > 0) {
  for (const [name, v] of Object.entries(report.vulnerabilities ?? {})) {
    if (LEVELS.indexOf(v.severity) >= LEVELS.indexOf(FAIL_AT)) {
      const via = (v.via ?? []).map((x) => (typeof x === 'string' ? x : x.title)).join('; ');
      console.error(`  ${v.severity}  ${name} ${v.range}  ${via}`);
    }
  }
  console.error(`audit: ${failing} ${FAIL_AT} advisories in production dependencies`);
  process.exit(1);
}
