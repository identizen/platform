import AsyncStorage from '@react-native-async-storage/async-storage';
import { colorScheme, useColorScheme } from 'nativewind';
import { useCallback, useEffect, useState } from 'react';

/** Same key and values as the web (`packages/ui/src/theme.ts`). */
export const THEME_STORAGE_KEY = 'idz:theme';
export type ThemePreference = 'system' | 'light' | 'dark';

const isPreference = (v: unknown): v is ThemePreference =>
  v === 'system' || v === 'light' || v === 'dark';

export async function loadThemePreference(): Promise<ThemePreference> {
  try {
    const raw = await AsyncStorage.getItem(THEME_STORAGE_KEY);
    return isPreference(raw) ? raw : 'system';
  } catch {
    return 'system';
  }
}

export async function saveThemePreference(pref: ThemePreference): Promise<void> {
  try {
    if (pref === 'system') await AsyncStorage.removeItem(THEME_STORAGE_KEY);
    else await AsyncStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    /* storage unavailable */
  }
  colorScheme.set(pref);
}

/** Preference + resolved scheme; applies the persisted preference on mount. */
export function useTheme(): {
  preference: ThemePreference;
  resolved: 'light' | 'dark';
  setPreference: (p: ThemePreference) => Promise<void>;
} {
  const [preference, setPref] = useState<ThemePreference>('system');
  const scheme = useColorScheme();
  useEffect(() => {
    void loadThemePreference().then((p) => {
      setPref(p);
      colorScheme.set(p);
    });
  }, []);
  const setPreference = useCallback(async (p: ThemePreference) => {
    setPref(p);
    await saveThemePreference(p);
  }, []);
  return { preference, resolved: scheme.colorScheme === 'dark' ? 'dark' : 'light', setPreference };
}
