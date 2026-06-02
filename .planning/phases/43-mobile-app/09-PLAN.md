---
phase: 43-mobile-app
plan: 09
type: execute
wave: 7
depends_on: [5, 8]
files_modified:
  - src/app/api/mobile/conversations/[id]/messages/route.ts
  - src/app/api/mobile/conversations/[id]/media/upload/route.ts
  - shared/mobile-api/schemas.ts
  - apps/mobile/package.json
  - apps/mobile/src/components/chat/MessageInput.tsx
  - apps/mobile/src/components/chat/QuickReplyAutocomplete.tsx
  - apps/mobile/src/components/chat/AudioRecorder.tsx
  - apps/mobile/src/components/chat/MediaPreviewSheet.tsx
  - apps/mobile/src/hooks/useSendMessage.ts
  - apps/mobile/src/hooks/useQuickReplies.ts
  - apps/mobile/src/lib/media/upload.ts
  - apps/mobile/src/lib/db/outbox.ts
  - apps/mobile/app/chat/[id].tsx
  - apps/mobile/src/lib/i18n/es.json
autonomous: false
must_haves:
  truths:
    - "POST /api/mobile/conversations/:id/messages accepts { body?, mediaKey?, mediaType?, templateName?, templateVariables?, idempotencyKey } and routes to the existing domain function that sends WhatsApp messages"
    - "Posting with a duplicate idempotency_key returns the previously-created message (no duplicate sends on retry)"
    - "Mobile composer supports: text, image (camera + gallery), audio voice note recording + playback before send, and a / slash-command autocomplete for saved quick replies"
    - "Send is optimistic: UI shows the message immediately with status='queued', then 'sending', then 'sent' (or 'failed')"
    - "Offline send: queued in sqlite outbox, drained on network recovery and AppState active"
    - "Media uploads go to existing Supabase Storage (or whatever the web uses) via a server-issued signed URL, not direct DB writes"
    - "Every send uses the mobile API route, which calls src/lib/domain/ — no direct Supabase writes from mobile (Regla 3)"
  artifacts:
    - apps/mobile/src/components/chat/MessageInput.tsx
    - apps/mobile/src/hooks/useSendMessage.ts
    - src/app/api/mobile/conversations/[id]/messages/route.ts (POST)
  key_links:
    - "Plan 08 chat screen gains a working composer"
    - "Plan 11 bot toggle header coexists with this composer"
---

<objective>
Wire the send path: composer UI + outbound HTTP + optimistic UI + offline outbox drain + media upload + slash-command quick replies + audio recording. This is the heaviest plan in Wave 3 — multiple hand-offs between UI, outbox, upload, and the server domain layer.

Output: composer that handles text, image, audio, and quick replies with reliable offline queue.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/43-mobile-app/43-CONTEXT.md
@.planning/phases/43-mobile-app/43-RESEARCH.md
@src/app/(dashboard)/whatsapp/components/message-input.tsx
@src/app/(dashboard)/whatsapp/components/quick-reply-autocomplete.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: POST /api/mobile/conversations/:id/messages + media upload endpoint</name>
  <files>
    src/app/api/mobile/conversations/[id]/messages/route.ts
    src/app/api/mobile/conversations/[id]/media/upload/route.ts
    shared/mobile-api/schemas.ts
  </files>
  <action>
  1. Extend schemas with `SendMessageRequestSchema` = `{ idempotencyKey: string, body: string | null, mediaKey: string | null, mediaType: 'image' | 'audio' | null, templateName?: string, templateVariables?: Record<string,string> }` and `SendMessageResponseSchema` = `{ message: MobileMessageSchema }`.
  2. Extend `route.ts` with a POST handler. Auth + workspace check. Parse body with Zod. Find the existing outbound domain function (Grep `src/lib/domain/` for `sendMessage`, `sendWhatsAppMessage`, or similar). Call it with the workspaceId + conversationId + payload + idempotencyKey. It MUST honor idempotency_key — if one exists on the messages table with that key, return the existing row instead of creating a duplicate.
     If the current web send path does not yet support idempotency_key on outbound, add a thin wrapper `src/lib/domain/messages/send-idempotent.ts` that (a) SELECTs messages WHERE idempotency_key = $1 AND workspace_id = $2, returns if found, (b) else calls the existing send function. Per Regla 3 all mutations go via domain.
  3. `media/upload/route.ts` POST: accepts `{ mimeType, byteSize }`, returns a presigned upload URL to Supabase Storage (or existing media bucket — grep for existing `/api/upload` or `storage.from(...)` patterns to reuse). Mobile uploads the file directly to the signed URL, then POSTs the mediaKey back with the send request in step 2.</action>
  <verify>`npm run build` passes. curl POST with a valid idempotencyKey twice returns the same message id.</verify>
  <done>Server-side send path + idempotency + media upload URL endpoint ship.</done>
</task>

<task type="auto">
  <name>Task 2: Media upload helper + useSendMessage hook wiring outbox drain</name>
  <files>
    apps/mobile/package.json
    apps/mobile/src/lib/media/upload.ts
    apps/mobile/src/hooks/useSendMessage.ts
    apps/mobile/src/lib/db/outbox.ts
  </files>
  <action>
  1. `npx expo install expo-image-picker expo-audio expo-file-system`. All in Expo Go's set.
  2. `src/lib/media/upload.ts`: `uploadLocalFile(uri, mimeType)` — requests a presigned URL from `/api/mobile/conversations/:id/media/upload`, uploads via `fetch(url, { method: 'PUT', body: <blob> })` using `expo-file-system`'s `uploadAsync`, returns the mediaKey. Handles network failure by throwing.
  3. `src/hooks/useSendMessage.ts`: exposes
     - `sendText(conversationId, body)`: calls `enqueueOutboundMessage` (from Plan 05) which generates the idempotency key + writes to cache + outbox in one transaction, then `drainOutbox()` fire-and-forget. Returns immediately for optimistic UI.
     - `sendMedia(conversationId, localUri, mediaType)`: first calls `enqueueOutboundMessage` with a `mediaUri` local path → row in sqlite outbox with mediaUri set + mediaKey null. The drain loop is responsible for uploading to the server before POSTing the send.
  4. Extend `drainOutbox()` in `src/lib/db/outbox.ts` to handle the media case: if a row has `mediaUri` but no `mediaKey`, first call `uploadLocalFile(mediaUri, mime)` → get mediaKey → update the outbox row → then call the send endpoint. On failure at any step, increment attempts.
  5. Add `NetInfo`-based connectivity: `npx expo install @react-native-community/netinfo`. In `app/_layout.tsx` (or a dedicated `OutboxDrainer.tsx` effect), listen for `NetInfo.addEventListener` + `AppState.addEventListener` and call `drainOutbox()` on any transition to online/active.</action>
  <verify>`npx tsc --noEmit` passes. Manually enqueue a message while offline, come online, confirm drain runs.

  **ACID crash test (Research Pitfall 4 — catastrophic if broken):** On Android, invoke `enqueueOutboundMessage` from a dev button, then IMMEDIATELY force-stop the app mid-insert via `adb shell am force-stop app.morfx.mobile`. Reopen the app and query sqlite directly (dev helper or temporary screen) to confirm: either BOTH the `cached_messages` row AND the `outbox` row exist, OR NEITHER exists. There must be no orphaned `cached_messages` row without its matching `outbox` row — this proves the single-transaction wrap (`db.withTransactionAsync`) holds under crash. Repeat 3x to catch flakes.</verify>
  <done>Send path + media upload + drain loop shipped. ACID transaction proven under crash.</done>
</task>

<task type="auto">
  <name>Task 3: MessageInput composer + QuickReplyAutocomplete + AudioRecorder UI</name>
  <files>
    apps/mobile/src/components/chat/MessageInput.tsx
    apps/mobile/src/components/chat/QuickReplyAutocomplete.tsx
    apps/mobile/src/components/chat/AudioRecorder.tsx
    apps/mobile/src/hooks/useQuickReplies.ts
    apps/mobile/app/chat/[id].tsx
    apps/mobile/src/lib/i18n/es.json
  </files>
  <action>
  1. `useQuickReplies.ts`: fetches `GET /api/mobile/quick-replies` (create this endpoint inline — simple SELECT from the existing `quick_replies` table filtered by workspace_id). Returns `[ { id, trigger, body } ]`.
  2. `QuickReplyAutocomplete.tsx`: absolute-positioned suggestion list that renders above the TextInput when props `visible && items.length > 0`. Simple Pressable rows. Mirror the logic in `src/app/(dashboard)/whatsapp/components/quick-reply-autocomplete.tsx` but rendered with RN primitives. When user taps a suggestion, the callback replaces the current slash-token in the text with the saved body.
  3. `AudioRecorder.tsx`: a mic button that on long-press-down starts recording via `expo-audio`'s recording API, on release stops. Shows a small preview sheet with playback + "send" / "cancel". Uses `@gorhom/bottom-sheet` for the preview.
  4. `MessageInput.tsx`: bottom composer row with:
     - Attach button (opens an ActionSheet: camera / gallery / audio). NOTE: the "template" attach option is NOT wired here — TemplatePicker UI is built in Plan 14 and Plan 14 Task 4 verifies template sending. Plan 09 only wires the existing send endpoint's templateName/templateVariables fields on the server side; the mobile composer does not expose a template picker until Plan 14.
     - TextInput (multi-line, max 5 lines)
     - Send button (primary color, enabled when text is non-empty or media is staged)
     - Detects `/` prefix in text and shows `<QuickReplyAutocomplete>` above the input, filtering by trigger substring
     - Calls `sendText` / `sendMedia` from `useSendMessage`
     - After successful enqueue: clears the input
     - Implements `KeyboardAvoidingView` so the input stays above the keyboard on iOS
  5. Wire `<MessageInput>` into `app/chat/[id].tsx` at the bottom, wrapped in a KeyboardAvoidingView.
  6. i18n keys: `chat.composer.placeholder`, `chat.attach.camera`, `chat.attach.gallery`, `chat.attach.audio`, `chat.send`, `chat.slash_hint`.
  </action>
  <verify>`npx tsc --noEmit` passes.</verify>
  <done>Composer ships.</done>
</task>

<task type="checkpoint:human-verify">
  <name>Task 4: Verify send path end-to-end on both devices</name>
  <files>n/a</files>
  <action>On both devices:
  1. Send a text message → appears optimistically → status progresses queued → sent → matches on the web inbox
  2. Send an image from gallery → uploads → appears in chat → visible on web
  3. Record + send an audio voice note → same flow
  4. Type `/` → autocomplete list appears with quick replies → tapping inserts → send works
  5. Airplane mode → send 2 text messages → see queued status → disable airplane mode → both send, status turns to sent (one drain run)
  6. Kill the app mid-send (force close on Android). Reopen. Confirm the queued message is still there and drains on app resume.
  7. Retry idempotency: no duplicates on the web side.

  NOTE: Do NOT test WhatsApp template sending here — the TemplatePicker UI is built in Plan 14 and template send flow is verified in Plan 14 Task 4. The server-side template fields exist from Task 1 of this plan, but the mobile composer does not expose them until Plan 14.

  Fix any failures before marking done.</action>
  <verify>User confirms all flows on both devices.</verify>
  <done>Send path is bulletproof offline.</done>
</task>

</tasks>

<verification>
- idempotency_key uniqueness is enforced end-to-end
- UI write + outbox insert share one transaction (Plan 05)
- Drain loop is triggered on NetInfo online + AppState active + after enqueue
- No direct Supabase writes from mobile — all via domain layer (Regla 3)
- Media uploads via presigned URL, not via DB row
</verification>

<success_criteria>
Sending text, image, audio, and quick replies works online and offline, survives crash + reboot, no duplicate sends.
</success_criteria>

<output>
Create `.planning/phases/43-mobile-app/43-09-SUMMARY.md` with: idempotency pattern used, outbox drain trigger points, media upload flow, quick reply slash command implementation notes.
</output>
