/**
 * Theme controller shared by every web surface.
 *
 * - Default: follow the system (`prefers-color-scheme`).
 * - Override: `data-theme="light|dark"` on <html>, persisted in localStorage.
 * - `resolveTheme()` returns the effective theme for rendering decisions.
 */

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'idz:theme';

const isPreference = (v: unknown): v is ThemePreference =>
  v === 'system' || v === 'light' || v === 'dark';

/** Read the persisted preference; defaults to `system`. Never throws. */
export function getThemePreference(
  storage: Pick<Storage, 'getItem'> | null = safeStorage(),
): ThemePreference {
  try {
    const raw = storage?.getItem(THEME_STORAGE_KEY);
    return isPreference(raw) ? raw : 'system';
  } catch {
    return 'system';
  }
}

/** Effective theme given a preference and the system setting. */
export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean = matchesDark(),
): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}

/** Apply a preference to the document and persist it. */
export function setThemePreference(
  preference: ThemePreference,
  doc: Document | null = typeof document === 'undefined' ? null : document,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | null = safeStorage(),
): void {
  try {
    if (preference === 'system') storage?.removeItem(THEME_STORAGE_KEY);
    else storage?.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* storage unavailable: still apply for this page */
  }
  applyTheme(preference, doc);
}

/** Stamp `data-theme` on <html> (removed for `system`). */
export function applyTheme(preference: ThemePreference, doc: Document | null): void {
  if (!doc) return;
  const root = doc.documentElement;
  if (preference === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', preference);
}

/** Cycle system -> light -> dark -> system. */
export function nextThemePreference(current: ThemePreference): ThemePreference {
  if (current === 'system') return 'light';
  if (current === 'light') return 'dark';
  return 'system';
}

/**
 * Inline script for <head> so the first paint uses the persisted theme
 * (avoids a flash). Safe to embed as a string.
 */
export const THEME_INIT_SCRIPT =
  "(function(){try{var t=localStorage.getItem('" +
  THEME_STORAGE_KEY +
  "');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();";

/** Initialise from storage on page load; returns the preference. */
export function initTheme(
  doc: Document | null = typeof document === 'undefined' ? null : document,
): ThemePreference {
  const pref = getThemePreference();
  applyTheme(pref, doc);
  return pref;
}

/** Subscribe to system theme changes; returns an unsubscribe fn. */
export function onSystemThemeChange(cb: (prefersDark: boolean) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => undefined;
  }
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (e: MediaQueryListEvent) => cb(e.matches);
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}

function matchesDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
