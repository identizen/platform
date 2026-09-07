// @ts-check
import { identizenConfig } from '@identizen/eslint-config';

/**
 * The shared Identizen rules (packages/eslint-config) plus what only this repo needs: the
 * Expo router's file-based routes and the Next.js sample site, which require default exports.
 */
export default identizenConfig({
  tsconfigRootDir: import.meta.dirname,
  ignores: [
    'private/**',
    'apps/mobile/ios/**',
    'apps/mobile/android/**',
    'apps/mobile/.expo/**',
    'db/migrations/**',
  ],
  defaultExportAllowed: [
    'apps/mobile/app/**/*.tsx',
    'e2e/site/app/**/*.tsx',
    'e2e/site/app/**/*.ts',
    'e2e/site/next.config.*',
    'e2e/site/middleware.ts',
  ],
});
