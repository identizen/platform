import { describe, expect, it, beforeEach } from 'vitest';
import {
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  applyTheme,
  getThemePreference,
  initTheme,
  nextThemePreference,
  onSystemThemeChange,
  resolveTheme,
  setThemePreference,
} from './theme';

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to system', () => {
    expect(getThemePreference()).toBe('system');
  });

  it('resolves system via prefers-color-scheme', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('persists and applies an explicit preference', () => {
    setThemePreference('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    setThemePreference('system');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('ignores garbage in storage', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'purple');
    expect(getThemePreference()).toBe('system');
  });

  it('initTheme applies the stored preference', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(initTheme()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('cycles system -> light -> dark -> system', () => {
    expect(nextThemePreference('system')).toBe('light');
    expect(nextThemePreference('light')).toBe('dark');
    expect(nextThemePreference('dark')).toBe('system');
  });

  it('applyTheme tolerates a null document', () => {
    expect(() => applyTheme('dark', null)).not.toThrow();
  });

  it('tolerates a throwing storage', () => {
    const bad = {
      getItem: () => {
        throw new Error('nope');
      },
      setItem: () => {
        throw new Error('nope');
      },
      removeItem: () => {
        throw new Error('nope');
      },
    };
    expect(getThemePreference(bad)).toBe('system');
    expect(() => setThemePreference('dark', document, bad)).not.toThrow();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('exposes an inline init script that references the storage key', () => {
    expect(THEME_INIT_SCRIPT).toContain(THEME_STORAGE_KEY);
    expect(THEME_INIT_SCRIPT).toContain('data-theme');
  });

  it('onSystemThemeChange returns an unsubscribe function', () => {
    const off = onSystemThemeChange(() => undefined);
    expect(typeof off).toBe('function');
    expect(() => off()).not.toThrow();
  });
});
