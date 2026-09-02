import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type Framework = 'next' | 'express' | 'unknown';

export interface ProjectInfo {
  framework: Framework;
  /** Next.js app router root: `app` or `src/app`. */
  appDir: string | null;
  usesSrc: boolean;
  typescript: boolean;
  packageJson: Record<string, unknown> | null;
}

export function detectProject(dir: string): ProjectInfo {
  const pkgPath = join(dir, 'package.json');
  const packageJson = existsSync(pkgPath)
    ? (JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>)
    : null;
  const deps = {
    ...((packageJson?.dependencies as Record<string, string> | undefined) ?? {}),
    ...((packageJson?.devDependencies as Record<string, string> | undefined) ?? {}),
  };
  const usesSrc =
    existsSync(join(dir, 'src', 'app')) ||
    (!existsSync(join(dir, 'app')) && existsSync(join(dir, 'src')));
  const appDir = existsSync(join(dir, 'src', 'app'))
    ? join('src', 'app')
    : existsSync(join(dir, 'app'))
      ? 'app'
      : null;
  const typescript = existsSync(join(dir, 'tsconfig.json')) || 'typescript' in deps;
  const framework: Framework = 'next' in deps ? 'next' : 'express' in deps ? 'express' : 'unknown';
  return {
    framework,
    appDir: framework === 'next' ? (appDir ?? (usesSrc ? join('src', 'app') : 'app')) : null,
    usesSrc,
    typescript,
    packageJson,
  };
}
