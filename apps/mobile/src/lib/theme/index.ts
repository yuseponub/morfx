/**
 * Theme provider with system dark/light support and a persisted override.
 *
 * - Default: follow system (Appearance.getColorScheme()).
 * - Override: user can force light or dark via setOverride('light'|'dark'),
 *   or reset with setOverride('system'). Override persists in AsyncStorage.
 *
 * Plan 43-12 will add a UI toggle for this. For now the hook is used by
 * login/inbox screens to pick token colors.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Appearance } from 'react-native';

export type ThemeMode = 'light' | 'dark';
export type ThemeOverride = ThemeMode | 'system';

export interface ThemeColors {
  bg: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryText: string;
  border: string;
  danger: string;
  success: string;
  warning: string;
}

export const lightTheme: ThemeColors = {
  bg: '#ffffff',
  surface: '#ffffff',
  surfaceAlt: '#f4f4f5',
  text: '#09090b',
  textMuted: '#71717a',
  primary: '#18181b',
  primaryText: '#ffffff',
  border: '#e4e4e7',
  danger: '#dc2626',
  success: '#16a34a',
  warning: '#d97706',
};

export const darkTheme: ThemeColors = {
  bg: '#09090b',
  surface: '#18181b',
  surfaceAlt: '#27272a',
  text: '#fafafa',
  textMuted: '#a1a1aa',
  primary: '#fafafa',
  primaryText: '#09090b',
  border: '#27272a',
  danger: '#f87171',
  success: '#4ade80',
  warning: '#fbbf24',
};

const THEME_OVERRIDE_KEY = 'mobile:themeOverride';

interface ThemeContextValue {
  theme: ThemeMode;
  colors: ThemeColors;
  override: ThemeOverride;
  setOverride: (mode: ThemeOverride) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [systemScheme, setSystemScheme] = useState<ThemeMode>(
    (Appearance.getColorScheme() as ThemeMode | null) ?? 'light'
  );
  const [override, setOverrideState] = useState<ThemeOverride>('system');

  // Load persisted override on mount.
  useEffect(() => {
    let mounted = true;
    (async () => {
      const stored = await AsyncStorage.getItem(THEME_OVERRIDE_KEY);
      if (!mounted) return;
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setOverrideState(stored);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Subscribe to system scheme changes.
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme((colorScheme as ThemeMode | null) ?? 'light');
    });
    return () => sub.remove();
  }, []);

  const theme: ThemeMode = override === 'system' ? systemScheme : override;
  const colors = theme === 'dark' ? darkTheme : lightTheme;

  const setOverride = useCallback(async (mode: ThemeOverride) => {
    setOverrideState(mode);
    await AsyncStorage.setItem(THEME_OVERRIDE_KEY, mode);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, colors, override, setOverride }),
    [theme, colors, override, setOverride]
  );

  return React.createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}

export async function setThemeOverride(mode: ThemeOverride): Promise<void> {
  await AsyncStorage.setItem(THEME_OVERRIDE_KEY, mode);
}
