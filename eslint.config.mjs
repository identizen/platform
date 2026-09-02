// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importX from 'eslint-plugin-import-x';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Identizen ESLint flat config.
 *
 * Enforces the frontend rules from planning/identizen-implementation-plan.md section 10:
 * - no default exports (except framework config / route files that require them)
 * - no `any`
 * - <= 250 lines per component file
 * - no importing another feature's internals (public index.ts only)
 */

const componentFiles = ['**/src/**/*.tsx'];

/** Files where frameworks force a default export. */
const defaultExportAllowed = [
  '**/*.config.{js,ts,mjs,cjs,mts}',
  '**/vite.config.*',
  '**/vitest.config.*',
  '**/vitest.workspace.*',
  '**/playwright.config.*',
  '**/astro.config.*',
  '**/tailwind.config.*',
  '**/drizzle.config.*',
  '**/eslint.config.*',
  '**/postcss.config.*',
  '**/metro.config.*',
  '**/babel.config.*',
  '**/app.config.*',
  'apps/mobile/app/**/*.tsx',
  'apps/*/src/worker.ts',
  'apps/*/src/index.ts',
  'e2e/site/app/**/*.tsx',
  'e2e/site/app/**/*.ts',
  'e2e/site/next.config.*',
  'e2e/site/middleware.ts',
  '**/*.astro',
  '**/*.stories.tsx',
  '**/global-setup.ts',
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.turbo/**',
      '**/.astro/**',
      '**/coverage/**',
      '**/.wrangler/**',
      '**/.next/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/worker-configuration.d.ts',
      '**/*.d.ts',
      'apps/mobile/ios/**',
      'apps/mobile/android/**',
      'apps/mobile/.expo/**',
      'db/migrations/**',
      '**/*.astro',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.js', '*.mjs', '*.config.ts', '*.config.mts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser, ...globals.node, ...globals.serviceworker },
    },
    plugins: { 'import-x': importX },
    rules: {
      'import-x/no-default-export': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/no-deprecated': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/prefer-optional-chain': 'off',
      // Cross-feature imports must go through the feature's public index.ts.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/features/*/*', '!**/features/*/index', '!**/features/*/index.ts'],
              message: 'Import another feature only through its public index.ts.',
            },
          ],
        },
      ],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
    },
  },
  {
    files: componentFiles,
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: '19' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      ...reactHooks.configs['recommended-latest'].rules,
      'max-lines': ['error', { max: 250, skipBlankLines: true, skipComments: true }],
      'react/prop-types': 'off',
    },
  },
  {
    files: defaultExportAllowed,
    rules: { 'import-x/no-default-export': 'off' },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/test/**', '**/tests/**'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/require-await': 'off',
      'max-lines': 'off',
      'no-console': 'off',
    },
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  prettier,
);
