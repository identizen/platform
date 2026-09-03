/**
 * Mirrored copy of packages/ui/src/tokens.css for React Native (NativeWind needs sRGB hex).
 * Generated from the oklch values there; do not hand-edit. Regenerate with
 * `node scripts/gen-tokens.mjs` from apps/mobile after a token changes in packages/ui.
 * Keep the names identical to the CSS custom properties minus the `--color-` prefix.
 * Dark values are exposed as `<name>-dark` so classes can use `bg-surface-0 dark:bg-surface-0-dark`.
 */
const light = {
  'surface-0': '#fcfdff',
  'surface-1': '#f5f7f9',
  'surface-2': '#eceff1',
  'surface-3': '#dee2e5',
  'surface-4': '#cdd1d6',
  fg: '#11161f',
  'fg-muted': '#575e69',
  'fg-subtle': '#81868f',
  'fg-inverse': '#fbfcfd',
  border: '#d8dbdf',
  'border-strong': '#b3b8be',
  ring: '#d24e3e',
  accent: '#c83122',
  'accent-hover': '#b71c0e',
  'accent-fg': '#fbfcfd',
  'accent-soft': '#ffe6e1',
  'accent-soft-fg': '#940500',
  success: '#009b53',
  'success-fg': '#fbfcfd',
  'success-soft': '#d2f6dd',
  'success-soft-fg': '#004e1e',
  warning: '#eba002',
  'warning-fg': '#281600',
  'warning-soft': '#ffecc1',
  'warning-soft-fg': '#753d00',
  danger: '#cf1748',
  'danger-fg': '#fbfcfd',
  'danger-soft': '#ffe1e3',
  'danger-soft-fg': '#96002b',
};

const dark = {
  'surface-0': '#0c1015',
  'surface-1': '#13161c',
  'surface-2': '#1b1f26',
  'surface-3': '#272c33',
  'surface-4': '#363b43',
  fg: '#eff2f5',
  'fg-muted': '#9fa5ae',
  'fg-subtle': '#757b83',
  'fg-inverse': '#0c1015',
  border: '#252930',
  'border-strong': '#3d434b',
  ring: '#f47c6b',
  accent: '#f66e5c',
  'accent-hover': '#ff826f',
  'accent-fg': '#180806',
  'accent-soft': '#451913',
  'accent-soft-fg': '#ffbeb2',
  success: '#3bb974',
  'success-fg': '#001004',
  'success-soft': '#062f19',
  'success-soft-fg': '#98e2b1',
  warning: '#f0b135',
  'warning-fg': '#221300',
  'warning-soft': '#402900',
  'warning-soft-fg': '#f9d280',
  danger: '#f9667a',
  'danger-fg': '#160305',
  'danger-soft': '#48141c',
  'danger-soft-fg': '#ffb9be',
};

const colors = { ...light };
for (const [k, v] of Object.entries(dark)) colors[`${k}-dark`] = v;

const radius = { sm: 6, md: 8, lg: 12, xl: 16 };

const tokens = { light, dark, colors, radius };

module.exports = { tokens, light, dark };
