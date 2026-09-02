export type TokenName =
  | 'surface-0'
  | 'surface-1'
  | 'surface-2'
  | 'surface-3'
  | 'surface-4'
  | 'fg'
  | 'fg-muted'
  | 'fg-subtle'
  | 'fg-inverse'
  | 'border'
  | 'border-strong'
  | 'ring'
  | 'accent'
  | 'accent-hover'
  | 'accent-fg'
  | 'accent-soft'
  | 'accent-soft-fg'
  | 'success'
  | 'success-fg'
  | 'success-soft'
  | 'success-soft-fg'
  | 'warning'
  | 'warning-fg'
  | 'warning-soft'
  | 'warning-soft-fg'
  | 'danger'
  | 'danger-fg'
  | 'danger-soft'
  | 'danger-soft-fg';

export type Palette = Record<TokenName, string>;

export const light: Palette;
export const dark: Palette;
export const tokens: {
  light: Palette;
  dark: Palette;
  colors: Record<string, string>;
  radius: { sm: number; md: number; lg: number; xl: number };
};
