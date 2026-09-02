/**
 * Runs in Node before the Workers pool starts: reset and migrate the test database.
 * Executed in a child process so the Workers export conditions of the vitest config do not
 * leak into the Node-side `postgres` driver resolution.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export default function setup(): void {
  const script = fileURLToPath(new URL('./reset-db.ts', import.meta.url));
  execFileSync(process.execPath, ['--import', 'tsx', script], {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgres://identizen:identizen@localhost:5433/identizen',
    },
  });
}
