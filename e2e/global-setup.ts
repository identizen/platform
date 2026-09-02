/** Reset and migrate the local database before the suite (child process keeps driver resolution clean). */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export default function globalSetup(): void {
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
