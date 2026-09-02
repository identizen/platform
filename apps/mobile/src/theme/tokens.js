/**
 * Mirrored copy of packages/ui/src/tokens.css for React Native (NativeWind needs sRGB hex).
 * Keep the names identical to the CSS custom properties minus the `--color-` prefix.
 * Dark values are exposed as `<name>-dark` so classes can use `bg-surface-0 dark:bg-surface-0-dark`.
 */
const light = {
  'surface-0': '#fcfcfd',
  'surface-1': '#f6f7f9',
  'surface-2': '#eff0f3',
  'surface-3': '#e3e5ea',
  'surface-4': '#d3d6dd',
  fg: '#1a1c25',
  'fg-muted': '#656b7a',
  'fg-subtle': '#8a8f9c',
  'fg-inverse': '#fbfbfc',
  border: '#e0e2e8',
  'border-strong': '#bfc3cd',
  ring: '#3b5bdb',
  accent: '#3b5bdb',
  'accent-hover': '#2f4fc9',
  'accent-fg': '#fbfbfc',
  'accent-soft': '#e3e9fb',
  'accent-soft-fg': '#2a44a8',
  success: '#2f9e5c',
  'success-fg': '#fbfbfc',
  'success-soft': '#dff3e6',
  'success-soft-fg': '#1c6b3c',
  warning: '#e2a02b',
  'warning-fg': '#3a2a08',
  'warning-soft': '#fbefd0',
  'warning-soft-fg': '#7a5410',
  danger: '#d63c3c',
  'danger-fg': '#fbfbfc',
  'danger-soft': '#fbe2e2',
  'danger-soft-fg': '#9b2626',
};

const dark = {
  'surface-0': '#14161c',
  'surface-1': '#1b1e25',
  'surface-2': '#232630',
  'surface-3': '#2f333e',
  'surface-4': '#3d424e',
  fg: '#f1f2f5',
  'fg-muted': '#a4a9b6',
  'fg-subtle': '#7c8291',
  'fg-inverse': '#14161c',
  border: '#2b2f3a',
  'border-strong': '#444956',
  ring: '#7b93ff',
  accent: '#7b93ff',
  'accent-hover': '#93a8ff',
  'accent-fg': '#0f1533',
  'accent-soft': '#26335f',
  'accent-soft-fg': '#c1ccff',
  success: '#4dbf7b',
  'success-fg': '#0d2a19',
  'success-soft': '#1c3d2a',
  'success-soft-fg': '#b4e6c8',
  warning: '#e9b043',
  'warning-fg': '#2e2205',
  'warning-soft': '#4a3a12',
  'warning-soft-fg': '#f5dfa0',
  danger: '#ef6a6a',
  'danger-fg': '#300f0f',
  'danger-soft': '#4a2020',
  'danger-soft-fg': '#f5b8b8',
};

const colors = { ...light };
for (const [k, v] of Object.entries(dark)) colors[`${k}-dark`] = v;

const radius = { sm: 6, md: 8, lg: 12, xl: 16 };

const tokens = { light, dark, colors, radius };

module.exports = { tokens, light, dark };
