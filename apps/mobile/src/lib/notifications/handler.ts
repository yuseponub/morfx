/**
 * Notification handler — foreground behavior + tap routing.
 *
 * Phase 43 Plan 13: Push Notifications.
 *
 * Two responsibilities:
 *   1. `setNotificationHandler` — controls how notifications appear while
 *      the app is in the foreground. Without this, foreground pushes are
 *      silently dropped on iOS/Android. We show the banner + sound.
 *   2. `addNotificationResponseReceivedListener` — fires when the user taps
 *      a notification (from cold start, background, or foreground). We read
 *      `data.conversationId` and deep-link into the chat screen via
 *      expo-router's `router.push`.
 *
 * The handler is installed once at module load (idempotent: expo-notifications
 * replaces any previous handler). The tap listener is installed once and
 * kept alive for the lifetime of the JS runtime — we do NOT remove it on
 * unmount because we want taps to work even before any React tree mounts
 * (e.g. cold start from a notification).
 */

import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';

let installed = false;

export function installNotificationHandler(): void {
  if (installed) return;
  installed = true;

  // Foreground presentation. expo-notifications SDK 54 uses the `shouldShow*`
  // flags; the older `shouldShowAlert` is still accepted but deprecated — we
  // pass both `shouldShowBanner` and `shouldShowList` for forward-compat and
  // keep `shouldShowAlert` for older runtimes.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  // Tap handler — deep-link to /chat/[id] using the conversationId we
  // embedded on the server side (see sendPushToWorkspace in
  // src/lib/domain/push/send-push.ts).
  Notifications.addNotificationResponseReceivedListener((response) => {
    try {
      const data = response?.notification?.request?.content?.data as
        | { conversationId?: unknown }
        | undefined;
      const conversationId =
        typeof data?.conversationId === 'string' ? data.conversationId : null;

      if (conversationId) {
        // Cast because /chat/[id] is a forward-looking route that may not
        // be declared in typed-routes yet; this is safe at runtime — unknown
        // routes land on +not-found, not a crash.
        router.push(`/chat/${conversationId}` as never);
      }
    } catch (err) {
      console.warn('[push/handler] failed to handle notification tap', err);
    }
  });
}
