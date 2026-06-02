---
phase: 43-mobile-app
plan: 08
type: execute
wave: 6
depends_on: [3, 5, 6, 7]
files_modified:
  - src/app/api/mobile/conversations/[id]/messages/route.ts
  - shared/mobile-api/schemas.ts
  - apps/mobile/src/hooks/useConversationMessages.ts
  - apps/mobile/src/lib/realtime/use-realtime-messages.ts
  - apps/mobile/src/components/chat/MessageList.tsx
  - apps/mobile/src/components/chat/MessageBubble.tsx
  - apps/mobile/src/components/chat/DayDivider.tsx
  - apps/mobile/app/chat/[id].tsx
  - apps/mobile/src/lib/i18n/es.json
autonomous: false
must_haves:
  truths:
    - "GET /api/mobile/conversations/:id/messages returns paginated messages ordered by created_at DESC with cursor pagination"
    - "Chat screen at /chat/[id] renders a FlashList of message bubbles (inverted) with day dividers in Spanish"
    - "Inbound messages show contact name + timestamp; outbound show own bubble + status icon (queued / sending / sent / failed)"
    - "Realtime subscription on messages table updates the list live + AppState foreground refetch fallback"
    - "Offline: cached_messages render immediately from sqlite"
    - "Back button returns to inbox; conversation is marked read via POST /api/mobile/conversations/:id/mark-read on open"
  artifacts:
    - src/app/api/mobile/conversations/[id]/messages/route.ts
    - apps/mobile/app/chat/[id].tsx
    - apps/mobile/src/components/chat/MessageList.tsx
  key_links:
    - "Plan 09 (send text/media) adds the composer to this screen"
    - "Plan 10 (in-chat CRM panel) adds a drawer to this screen"
---

<objective>
Ship the conversation screen's read path: fetch + render + realtime update of messages. No composer yet (Plan 09), no CRM panel yet (Plan 10). Focus is the message list with proper offline + realtime behavior.

Output: API endpoint, hooks, message list component tree, working /chat/[id] screen.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/43-mobile-app/43-CONTEXT.md
@.planning/phases/43-mobile-app/43-RESEARCH.md
@src/app/(dashboard)/whatsapp/components/
</context>

<tasks>

<task type="auto">
  <name>Task 1: Backend endpoint GET /api/mobile/conversations/:id/messages + mark-read</name>
  <files>
    src/app/api/mobile/conversations/[id]/messages/route.ts
    src/app/api/mobile/conversations/[id]/mark-read/route.ts
    shared/mobile-api/schemas.ts
  </files>
  <action>
  1. Extend schemas with `MobileMessageSchema`: id, conversation_id, workspace_id, direction ('in'|'out'), body (nullable), media_url (nullable), media_type (nullable — 'image'|'audio'|'video'|'document'), template_name (nullable), sender_name (nullable), status (nullable, outbound only), idempotency_key (nullable), created_at (ISO).
     Add `MobileMessagesListResponseSchema` = `{ messages: [], next_cursor: string | null }` and `MobileMessagesListQuerySchema` = `{ before?: string, limit?: number }`.
  2. `src/app/api/mobile/conversations/[id]/messages/route.ts` GET: auth, verify `conversationId` belongs to workspaceId, SELECT from `messages` ordered by created_at DESC with cursor (before=ISO string). Return the shaped list.
  3. `src/app/api/mobile/conversations/[id]/mark-read/route.ts` POST: auth, call the EXISTING domain function that marks a conversation as read (find via Grep for "markAsRead" or "markConversationAsRead" in `src/lib/domain/`). If no such function exists, create one in `src/lib/domain/conversations/mark-read.ts` that (a) sets `unread_count=0` via admin client filtered by workspace_id, (b) updates `last_read_at`, (c) emits the existing read-signal Realtime broadcast if any. Route handler calls this domain function per Regla 3.</action>
  <verify>`npm run build` passes. curl both endpoints.</verify>
  <done>Read + mark-read endpoints work.</done>
</task>

<task type="auto">
  <name>Task 2: useConversationMessages hook + realtime messages subscription</name>
  <files>
    apps/mobile/src/hooks/useConversationMessages.ts
    apps/mobile/src/lib/realtime/use-realtime-messages.ts
    apps/mobile/src/lib/db/messages-cache.ts
  </files>
  <action>
  1. Extend `messages-cache.ts` with: `listCachedMessages(conversationId, limit=50)`, `upsertCachedMessages(messages[])`, `getLatestCachedTimestamp(conversationId)`.
  2. `useConversationMessages.ts`:
     - Keys on `conversationId` + `workspaceId`.
     - On mount: render from cache immediately, then call `mobileApi.get('/api/mobile/conversations/:id/messages')`, upsert cache, re-read.
     - Provides `{ messages, loading, loadOlder, refresh }`.
     - Also calls `mobileApi.post('/api/mobile/conversations/:id/mark-read')` on mount (fire-and-forget).
  3. `use-realtime-messages.ts`:
     - Subscribes to Realtime channel `messages:${conversationId}` on `postgres_changes` filtered by `conversation_id=eq.${conversationId}`.
     - On INSERT: upsert into cache, trigger a re-render.
     - AppState 'active' → refetch (Research Pattern 1).
     - Register via channel-registry.
  </action>
  <verify>`npx tsc --noEmit` passes.</verify>
  <done>Hooks exist.</done>
</task>

<task type="auto">
  <name>Task 3: MessageList + MessageBubble + DayDivider + /chat/[id] screen</name>
  <files>
    apps/mobile/src/components/chat/MessageList.tsx
    apps/mobile/src/components/chat/MessageBubble.tsx
    apps/mobile/src/components/chat/DayDivider.tsx
    apps/mobile/app/chat/[id].tsx
    apps/mobile/src/lib/i18n/es.json
  </files>
  <action>
  1. `MessageBubble.tsx`: renders a bubble styled by direction ('in' → left, neutral bg; 'out' → right, primary bg). Shows body text (supports multi-line), or a media placeholder box (image thumbnail, audio player placeholder — stubs for now, Plan 09 wires real playback/rendering). Shows timestamp in `HH:mm` Bogota time via `toLocaleString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })`. For outbound, show a status icon: clock for queued, spinner for sending, single check for sent, red X for failed.
  2. `DayDivider.tsx`: centered pill showing "Hoy" / "Ayer" / `formatDate(date, 'EEEE d MMM', { locale: es })`.
  3. `MessageList.tsx`: `FlashList` with `inverted` prop (most recent at bottom), `data` = messages array, `estimatedItemSize={60}`, `onEndReached={loadOlder}`, renderItem renders MessageBubble with a DayDivider inserted when the day changes.
  4. `app/chat/[id].tsx`: reads `id` from `useLocalSearchParams`. Renders a header with back button + contact name (fetched from cache or via a quick GET). Renders `<MessageList>`. Calls both hooks (`useConversationMessages` + `useRealtimeMessages`). Placeholder for composer at the bottom ("Composer coming in Plan 09") — or leave an empty KeyboardAvoidingView there for now.
  5. i18n keys: `chat.today`, `chat.yesterday`, `chat.status.queued`, etc.</action>
  <verify>`npx tsc --noEmit` passes. Visual test in Task 4.</verify>
  <done>Read path for conversations works.</done>
</task>

<task type="checkpoint:human-verify">
  <name>Task 4: Verify chat read path on both devices</name>
  <files>n/a</files>
  <action>User taps a conversation from the inbox → chat screen opens → messages load → timestamps show in Bogota time → day dividers render → inbound/outbound bubbles look correct → back button returns to inbox → the unread badge on that conversation's card is now 0 (mark-read worked).

  Offline: turn off WiFi, tap a recently opened conversation → cached messages render.

  Realtime: from the web, send a message to the open conversation → it appears in the mobile list within a few seconds.

  Dark mode: Switch to dark mode (Settings or OS) — verify no hardcoded colors in message bubbles, day dividers, header, or background. Inbound/outbound bubbles must stay readable in dark theme.</action>
  <verify>User confirms all flows.</verify>
  <done>Read path shipped.</done>
</task>

</tasks>

<verification>
- Inverted FlashList for messages
- AppState foreground refetch implemented
- Mark-read routes through domain layer (Regla 3)
- Channel registered in channel-registry
</verification>

<success_criteria>
User can open any conversation, read history, see live new inbound messages, and the unread badge updates correctly.
</success_criteria>

<output>
Create `.planning/phases/43-mobile-app/43-08-SUMMARY.md` with: endpoint contracts, FlashList inverted config, mark-read domain function location.
</output>
