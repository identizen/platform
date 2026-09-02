/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS config loaded by the tool itself */
/**
 * NativeWind (Tailwind v3 engine) config for React Native.
 *
 * React Native cannot consume the CSS-first `@theme` token sheet in packages/ui/src/tokens.css
 * (no CSS variables, no oklch), so `src/theme/tokens.ts` holds a mirrored, sRGB-hex copy of the
 * same scale. When a token changes in packages/ui, update the mirror; `src/theme/tokens.test.ts`
 * lists every token name so drift is at least visible.
 */
const { tokens } = require('./src/theme/tokens.js');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: tokens.colors,
      borderRadius: tokens.radius,
      fontFamily: {
        sans: ['Inter_400Regular'],
        medium: ['Inter_500Medium'],
        semibold: ['Inter_600SemiBold'],
        mono: ['Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
