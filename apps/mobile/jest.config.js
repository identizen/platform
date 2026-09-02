/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS config loaded by the tool itself */
const preset = require('jest-expo/jest-preset');

// Workspace ESM packages that Jest must transform on top of jest-expo's defaults.
const extraTransformed = [
  '@identizen',
  '@noble',
  '@scure',
  'nativewind',
  'react-native-css-interop',
];

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['./jest.setup.ts'],
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)'],
  transformIgnorePatterns: preset.transformIgnorePatterns.map((p) =>
    p.includes('(?!(') ? p.replace('(?!(', `(?!(${extraTransformed.join('|')}|`) : p,
  ),
  // Expo pins react in apps/mobile/node_modules; RNTL at the workspace root must see the same copy.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^react$': '<rootDir>/node_modules/react',
    '^react/(.*)$': '<rootDir>/node_modules/react/$1',
  },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
};
