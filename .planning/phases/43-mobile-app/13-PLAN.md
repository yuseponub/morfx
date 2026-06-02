---
phase: 43-mobile-app
plan: 13
type: execute
wave: 4
depends_on: [3, 4]
files_modified:
  - supabase/migrations/20260411_push_tokens.sql
  - src/lib/domain/push/register-token.ts
  - src/lib/domain/push/send-push.ts
  - src/app/api/mobile/push/register/route.ts
  - shared/mobile-api/schemas.ts
  - apps/mobile/package.json
  - apps/mobile/src/lib/notifications/index.ts
  - apps/mobile/src/lib/notifications/register.ts
  - apps/mobile/src/lib/notifications/handler.ts
  - apps/mobile/app/_layout.tsx
  - src/inngest/functions/mobile-push-on-new-message.ts
  - apps/mobile/src/lib/i18n/es.json
autonomous: false
must_haves:
  truths:
    - "A push_tokens table exists with: user_id, workspace_id, platform ('android'|'ios'), token, updated_at, revoked_at"
    - "push_tokens migration is applied to production BEFORE any code referencing it ships (Regla 5)"
    - "Android: expo-notifications fetches the FCM token via getDevicePushTokenAsync and POSTs to /api/mobile/push/register"
    - "iOS: the register call SHORT-CIRCUITS when Platform.OS === 'ios' with a console log 'push stubbed' and NO server call — behind a single feature flag MOBILE_IOS_PUSH_ENABLED (default false)"
    - "A domain function sendPushForNewMessage({ conversationId, messageId }) is called by an Inngest function triggered on new inbound messages; it looks up active push_tokens for the conversation's workspace members and sends Android pushes via FCM (Expo Push Service or direct FCM HTTP v1 — pick one documented)"
    - "Tapping a notification on Android opens the app at /chat/[id] (deep link)"
    - "The new Inngest function awaits inngest.send call if any (MEMORY.md pattern)"
    - "No change to any existing agent behavior (Regla 6) — the Inngest function is a NEW file, not an edit of an existing runner"
  artifacts:
    - supabase/migrations/20260411_push_tokens.sql
    - src/lib/domain/push/register-token.ts
    - src/lib/domain/push/send-push.ts
    - apps/mobile/src/lib/notifications/register.ts
    - src/inngest/functions/mobile-push-on-new-message.ts
  key_links:
    - "The iOS stub + feature flag is the activation checkpoint — flipping the flag after Apple Developer is acquired turns iOS push on without code changes"
---

<objective>
Ship Android push notifications end-to-end. iOS push is wired as a stub behind the `MOBILE_IOS_PUSH_ENABLED` feature flag — all infrastructure ready, but the iOS token register call returns early and the server skips iOS rows until the flag is true. When the user later acquires Apple Developer ($99), a dedicated follow-up phase flips the flag + provisions APNs credentials in EAS.

Output: push_tokens migration, token register endpoint + domain fn, send-push domain fn, Inngest function on new inbound message, mobile client registration, notification handler that deep-links to /chat/[id].
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/43-mobile-app/43-CONTEXT.md
@.planning/phases/43-mobile-app/43-RESEARCH.md
@CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: push_tokens migration (Regla 5 checkpoint)</name>
  <files>supabase/migrations/20260411_push_tokens.sql</files>
  <action>
  ```sql
  CREATE TABLE IF NOT EXISTS push_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    workspace_id uuid NOT NULL,
    platform text NOT NULL CHECK (platform IN ('android','ios')),
    token text NOT NULL,
    device_name text,
    updated_at timestamptz NOT NULL DEFAULT timezone('America/Bogota', NOW()),
    revoked_at timestamptz,
    UNIQUE (user_id, workspace_id, platform, token)
  );
  CREATE INDEX IF NOT EXISTS push_tokens_workspace_active_idx
    ON push_tokens (workspace_id, platform) WHERE revoked_at IS NULL;
  ```
  Pause and ask user to apply in production before continuing.</action>
  <verify>File created.</verify>
  <done>File created + user applied.</done>
</task>

<task type="checkpoint:human-action">
  <name>Task 2: User applies push_tokens migration</name>
  <files>n/a</files>
  <action>STOP. Ask user to apply the migration in production and confirm.</action>
  <verify>User confirms.</verify>
  <done>Applied.</done>
</task>

<task type="auto">
  <name>Task 3: Domain functions + endpoint + Inngest function</name>
  <files>
    src/lib/domain/push/register-token.ts
    src/lib/domain/push/send-push.ts
    src/app/api/mobile/push/register/route.ts
    shared/mobile-api/schemas.ts
    src/inngest/functions/mobile-push-on-new-message.ts
  </files>
  <action>
  1. `register-token.ts`: domain fn upserting into `push_tokens` with unique (user_id, workspace_id, platform, token). Also sets revoked_at=null on re-register.
  2. `send-push.ts`: domain fn `sendPushToWorkspace({ workspaceId, title, body, data })` that:
     - Selects all non-revoked push_tokens for the workspace.
     - Filters out platform='ios' UNLESS `process.env.MOBILE_IOS_PUSH_ENABLED === 'true'`.
     - For Android tokens: sends to Expo Push Service via `POST https://exp.host/--/api/v2/push/send` with body `{ to: tokens[], title, body, data, priority: 'high', sound: 'default' }` — Expo Push Service handles FCM for us (per Research "don't hand-roll — use expo-notifications + Expo Push Service"). Uses native `fetch`, awaits the response, logs failures but never throws (push is best-effort).
     - Handles DeviceNotRegistered errors by marking the token `revoked_at=NOW()`.
  3. `src/app/api/mobile/push/register/route.ts` POST: auth, body = `{ platform, token, deviceName? }`, calls `registerToken`. Extend schemas with `RegisterPushTokenRequestSchema`.
  4. `src/inngest/functions/mobile-push-on-new-message.ts`: a NEW Inngest function triggered on the existing "message received" event (Grep inngest events for the right name; likely `message.inbound.created` or similar). On trigger, it:
     - Loads the conversation + contact.
     - Computes title = contact_name, body = first 100 chars of message body (or "[Imagen]", "[Audio]" based on type).
     - Calls `sendPushToWorkspace({ workspaceId, title, body, data: { conversationId, type: 'new_message' } })`.
     - Any downstream `inngest.send` MUST be awaited (MEMORY pattern).
     This function is ADDITIVE — a new file — and does NOT modify any existing agent runner (Regla 6).</action>
  <verify>`npm run build` passes. Register endpoint + send domain fn compile.</verify>
  <done>Server-side push pipeline ships.</done>
</task>

<task type="auto">
  <name>Task 4: Mobile side — expo-notifications setup, register, handler, deep-link</name>
  <files>
    apps/mobile/package.json
    apps/mobile/src/lib/notifications/index.ts
    apps/mobile/src/lib/notifications/register.ts
    apps/mobile/src/lib/notifications/handler.ts
    apps/mobile/app/_layout.tsx
    apps/mobile/src/lib/i18n/es.json
  </files>
  <action>
  1. `npx expo install expo-notifications expo-device`.
  2. Update `app.json` expo.notifications config: set `icon`, `color`, and add `"plugins": ["expo-notifications"]`.
  3. `src/lib/notifications/register.ts`: implements the Research "expo-notifications token registration" snippet. KEY DIFFERENCE from the snippet: if `Platform.OS === 'ios'`, log `'[push] iOS stubbed — activate via MOBILE_IOS_PUSH_ENABLED flag'` and RETURN EARLY (no API call, no token fetch). For Android, request permissions, fetch ExpoPushToken (via `getExpoPushTokenAsync({ projectId })`), and POST to `/api/mobile/push/register`.
  4. `src/lib/notifications/handler.ts`: sets `Notifications.setNotificationHandler` to show alerts in foreground. Adds listener for `Notifications.addNotificationResponseReceivedListener` that reads `response.notification.request.content.data.conversationId` and calls `router.push(`/chat/${id}`)`.
  5. `src/lib/notifications/index.ts`: barrel export. Initializes the handler once at module load.
  6. Call `registerForPushNotifications(userId, workspaceId)` from the root layout AFTER login is complete and a workspace is selected (probably in a useEffect inside the WorkspaceProvider after workspaceId changes).
  7. Add i18n keys.</action>
  <verify>`npx tsc --noEmit` passes. iOS stub is visible in logs when running on iPhone via Expo Go.</verify>
  <done>Mobile client registration + handler ship.</done>
</task>

<task type="checkpoint:human-verify">
  <name>Task 5: Verify Android push end-to-end; iOS cleanly stubbed</name>
  <files>n/a</files>
  <action>Rebuild the Android apk with `eas build --profile preview --platform android` (because expo-notifications needs to be bundled — may require dev client if push doesn't work in Expo Go for Android; verify).

  On Android device:
  1. Login → check logs: "push token registered: ExponentPushToken[...]"
  2. Confirm a new row in push_tokens for platform=android.
  3. Send a test inbound message (from the web side, simulate inbound or have the user send a WhatsApp message to the bot).
  4. Android device receives a push with contact name + body preview.
  5. Tap the notification → app opens at /chat/[id].
  6. Background the app → test again → still receives push.

  On iPhone via Expo Go:
  1. Login → check logs: "[push] iOS stubbed — activate via MOBILE_IOS_PUSH_ENABLED flag"
  2. Confirm NO push_tokens row for platform=ios.
  3. Send a test inbound → iOS does not receive a push (expected).

  Confirm existing web agent behavior is unchanged (Regla 6): open a conversation on web, confirm the bot still replies as before.</action>
  <verify>User confirms all above.</verify>
  <done>Push shipped for Android, stubbed cleanly for iOS.</done>
</task>

</tasks>

<verification>
- push_tokens migration applied before code
- iOS path short-circuits via Platform check AND via server-side feature flag filter (two guards)
- New Inngest function is additive — no existing runner modified
- Tapping an Android notification deep-links to the chat
- Expo Push Service used (not raw FCM) — matches research recommendation
</verification>

<success_criteria>
Android users get a push on every new inbound message, tapping opens the chat, iOS runs with a clean stub waiting for the $99 activation phase.
</success_criteria>

<output>
Create `.planning/phases/43-mobile-app/43-13-SUMMARY.md` with: feature flag location, iOS activation runbook (what to do when Apple Developer is acquired — provision APNs key in EAS, set MOBILE_IOS_PUSH_ENABLED=true, done), test results.
</output>
