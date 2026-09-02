import * as React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '../lib/cn';
import {
  getThemePreference,
  nextThemePreference,
  setThemePreference,
  type ThemePreference,
} from '../theme';

const LABELS: Record<ThemePreference, string> = {
  system: 'Theme: system. Switch to light.',
  light: 'Theme: light. Switch to dark.',
  dark: 'Theme: dark. Switch to system.',
};

export interface ThemeToggleProps {
  className?: string;
}

/**
 * Cycles system -> light -> dark. Persists via `setThemePreference`.
 * Presentational apart from reading/writing the theme preference; no fetching, no router.
 */
export function ThemeToggle({ className }: ThemeToggleProps): React.JSX.Element {
  const [pref, setPref] = React.useState<ThemePreference>('system');

  React.useEffect(() => {
    setPref(getThemePreference());
  }, []);

  const onClick = () => {
    const next = nextThemePreference(pref);
    setThemePreference(next);
    setPref(next);
  };

  const Icon = pref === 'light' ? Sun : pref === 'dark' ? Moon : Monitor;

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={LABELS[pref]}
      title={LABELS[pref]}
      data-theme-preference={pref}
      onClick={onClick}
      className={cn(className)}
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}
