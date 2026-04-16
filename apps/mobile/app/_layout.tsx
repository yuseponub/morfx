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

import { Stack, useRouter, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '@/lib/i18n';
import { getCurrentSession, onAuthStateChange } from '@/lib/session';
// Import for side effect: installs expo-notifications foreground handler
// + tap listener once at boot (Phase 43 Plan 13).
import '@/lib/notifications';
import { ThemeProvider } from '@/lib/theme';
import { WorkspaceProvider } from '@/lib/workspace/context';

// Keep the splash screen visible until we know the auth state.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const router = useRouter();
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null); // null = loading
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  // Track whether initial load is done — only use router.replace AFTER
  // the navigator is mounted (i.e. after the first render with isAuthed !== null).
  const navigatorReady = useRef(false);

  const handleWorkspaceChange = useCallback((id: string) => {
    setActiveWorkspaceId(id);
  }, []);

  // Initial auth check — sets isAuthed and hides splash.
  useEffect(() => {
    let mounted = true;
    (async () => {
      const session = await getCurrentSession();
      if (!mounted) return;
      setIsAuthed(!!session);
      await SplashScreen.hideAsync();
      // After this point the navigator is mounted, safe to use router.
      navigatorReady.current = true;
    })();
    return () => { mounted = false; };
  }, []);

  // Listen for auth state changes (login/logout) AFTER initial load.
  // Only navigate when auth state actually CHANGES — Supabase fires multiple
  // events on startup (INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED) which
  // would cause a redirect loop if we navigated on every event.
  const prevAuthed = useRef<boolean | null>(null);
  useEffect(() => {
    const unsubscribe = onAuthStateChange((session) => {
      const nowAuthed = !!session;
      setIsAuthed(nowAuthed);
      // Only navigate if state actually changed AND navigator is ready.
      if (navigatorReady.current && prevAuthed.current !== null && prevAuthed.current !== nowAuthed) {
        if (nowAuthed) {
          router.replace('/(tabs)/inbox' as Href);
        } else {
          router.replace('/(auth)/login' as Href);
        }
      }
      prevAuthed.current = nowAuthed;
    });
    return () => { unsubscribe(); };
  }, [router]);

  // Still loading auth state — keep splash visible.
  if (isAuthed === null) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <I18nextProvider i18n={i18n}>
          <BottomSheetModalProvider>
            <WorkspaceProvider onWorkspaceChange={handleWorkspaceChange}>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="(auth)" />
                <Stack.Screen
                  name="(tabs)"
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
