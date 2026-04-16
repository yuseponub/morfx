/**
 * Notifications barrel.
 *
 * Phase 43 Plan 13: Push Notifications.
 *
 * Importing this module has a side effect: it installs the expo-notifications
 * foreground handler + tap listener exactly once. Any file in the app that
 * imports `@/lib/notifications` will pick up the handler; callers that want
 * to be explicit can import from '@/lib/notifications' at the top of
 * `app/_layout.tsx` so the handler is installed during the first JS tick.
 */

import { installNotificationHandler } from './handler';

// Install once at module load. The function itself is idempotent.
installNotificationHandler();

export { registerForPushNotifications } from './register';
export { installNotificationHandler } from './handler';
