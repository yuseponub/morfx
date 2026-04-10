/**
 * Root layout.
 *
 * Boot sequence (Plan 43-04, updated Plan 43-06):
 *   1. Keep splash visible (preventAutoHideAsync).
 *   2. Read current Supabase session via getCurrentSession().
 *   3. router.replace to /(tabs)/inbox if signed in, else /(auth)/login.
 *   4. Hide splash.
 *
 * Plan 43-06 additions:
 *   - WorkspaceProvider wraps auth'd content (below auth check).
 *   - workspaceId is used as React `key` on the tabs Stack.Screen so
 *     switching workspace remounts the entire tab tree with clean state.
 *   - BottomSheetModalProvider wraps the tree for @gorhom/bottom-sheet
 *     (added in Task 2).
 *
 * Also subscribes to onAuthStateChange so a signOut() anywhere in the app
 * auto-routes back to /(auth)/login.
 */

import { Redirect, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '@/lib/i18n';
import { getCurrentSession, onAuthStateChange } from '@/lib/session';
import { ThemeProvider } from '@/lib/theme';
import { WorkspaceProvider } from '@/lib/workspace/context';

// Keep the splash screen visible until we know the auth state.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null); // null = loading
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);

  const handleWorkspaceChange = useCallback((id: string) => {
    setActiveWorkspaceId(id);
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const session = await getCurrentSession();
      if (!mounted) return;
      setIsAuthed(!!session);
      await SplashScreen.hideAsync();
    })();

    const unsubscribe = onAuthStateChange((session) => {
      setIsAuthed(!!session);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  // Still loading auth state — keep splash visible.
  if (isAuthed === null) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <I18nextProvider i18n={i18n}>
          <BottomSheetModalProvider>
            <WorkspaceProvider onWorkspaceChange={handleWorkspaceChange}>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(auth)" redirect={isAuthed} />
                <Stack.Screen
                  name="(tabs)"
                  redirect={!isAuthed}
                  key={activeWorkspaceId ?? 'default'}
                />
                <Stack.Screen name="+not-found" />
              </Stack>
            </WorkspaceProvider>
            <StatusBar style="auto" />
          </BottomSheetModalProvider>
        </I18nextProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
