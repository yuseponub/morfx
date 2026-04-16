/**
 * Push token registration.
 *
 * Phase 43 Plan 13: Push Notifications.
 *
 * On Android:
 *   1. Request POST_NOTIFICATIONS permission (required on API 33+).
 *   2. Fetch an ExpoPushToken via Expo push infra — Expo handles FCM for us.
 *   3. POST the token to /api/mobile/push/register via the mobile api client
 *      (which auto-attaches Bearer JWT + x-workspace-id).
 *
 * On iOS:
 *   SHORT-CIRCUIT. We log a clear marker and return early — no permission
 *   ask, no token fetch, no API call. This is the FIRST of the two-guard
 *   iOS stub: the server also filters iOS rows unless MOBILE_IOS_PUSH_ENABLED
 *   is true. When Apple Developer is acquired later, APNs credentials are
 *   provisioned in EAS and the env flag is flipped — this client-side
 *   stub can be removed in a trivial follow-up PR (or left in — once the
 *   env flag is on, removing the `if (ios) return` becomes the activation
 *   step).
 *
 * All failures are caught and logged — push registration MUST NOT break
 * login or the first render. Safe to call repeatedly (the server upsert
 * is idempotent).
 */

import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { mobileApi } from '@/lib/api-client';

// Expo projectId — sourced from app.json "extra.eas.projectId".
// Hard-coded here to avoid having to wire expo-constants plumbing just for
// a single string; kept in sync with app.json.
const EXPO_PROJECT_ID = 'bbbaad3e-180c-4743-b6d6-207c3b92bf17';

interface RegisterArgs {
  userId: string;
  workspaceId: string;
}

/**
 * Register the current device for push notifications for the given
 * (userId, workspaceId) pair. Safe to call on every workspace switch:
 * the server upserts on (user,workspace,platform,token) so duplicates
 * are collapsed.
 */
export async function registerForPushNotifications(
  args: RegisterArgs
): Promise<void> {
  try {
    // ---- iOS stub (guard #1) ------------------------------------------
    if (Platform.OS === 'ios') {
      // eslint-disable-next-line no-console
      console.log(
        '[push] iOS stubbed — activate via MOBILE_IOS_PUSH_ENABLED flag'
      );
      return;
    }

    // ---- Android only from here ---------------------------------------
    if (!Device.isDevice) {
      // eslint-disable-next-line no-console
      console.log('[push] skipping — running on an emulator/simulator');
      return;
    }

    // Request permission. On Android 13+ this prompts the user; on <13 it
    // is auto-granted. Either way, `granted` reflects the final state.
    const current = await Notifications.getPermissionsAsync();
    let granted = current.status === 'granted';
    if (!granted) {
      const req = await Notifications.requestPermissionsAsync();
      granted = req.status === 'granted';
    }

    if (!granted) {
      // eslint-disable-next-line no-console
      console.log('[push] permission denied by user — skipping registration');
      return;
    }

    // Fetch the Expo push token. Expo Push Service takes these and handles
    // FCM delivery for Android, so we never need to wire FCM directly.
    const tokenResult = await Notifications.getExpoPushTokenAsync({
      projectId: EXPO_PROJECT_ID,
    });

    const token = tokenResult?.data;
    if (!token) {
      console.warn('[push] getExpoPushTokenAsync returned no token');
      return;
    }

    // eslint-disable-next-line no-console
    console.log('[push] token registered:', token);

    await mobileApi.post('/api/mobile/push/register', {
      platform: 'android',
      token,
      deviceName: Device.deviceName ?? undefined,
    });
  } catch (err) {
    // Best-effort: never let push registration break the app.
    console.warn('[push] registration failed', err);
  }
}
