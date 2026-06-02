---
phase: 43-mobile-app
plan: 07
type: execute
wave: 5
depends_on: [3, 5, 6]
files_modified:
  - src/app/api/mobile/conversations/route.ts
  - shared/mobile-api/schemas.ts
  - apps/mobile/package.json
  - apps/mobile/src/hooks/useInboxList.ts
  - apps/mobile/src/lib/realtime/use-realtime-inbox.ts
  - apps/mobile/src/components/inbox/ConversationCard.tsx
  - apps/mobile/src/components/inbox/SlaTimer.tsx
  - apps/mobile/src/components/inbox/UnreadBadge.tsx
  - apps/mobile/app/(tabs)/inbox.tsx
  - apps/mobile/src/lib/i18n/es.json
autonomous: false
must_haves:
  truths:
    - "GET /api/mobile/conversations returns paginated conversations for the authenticated workspace, ordered by last_message_at DESC"
    - "Mobile inbox renders a @shopify/flash-list of ConversationCard rows showing: avatar, name, last-message preview, timestamp, unread badge, pipeline chip, tag chip, 'time since customer last wrote' SLA timer"
    - "Realtime subscription on conversations table updates the list live"
    - "On AppState change to 'active', the inbox refetches from the API (Research Pattern 1 — Realtime is best-effort, foreground refetch is the reliability mechanism)"
    - "While offline, the inbox renders from cached_conversations in sqlite"
    - "Pull-to-refresh works and triggers a fresh API fetch"
    - "Tapping a card routes to /chat/[id] (screen exists as stub for now)"
  artifacts:
    - src/app/api/mobile/conversations/route.ts
    - apps/mobile/src/components/inbox/ConversationCard.tsx
    - apps/mobile/app/(tabs)/inbox.tsx
  key_links:
    - "Plan 08 (chat screen) consumes the tap navigation target /chat/[id]"
    - "Plan 12 (search) extends this list with a search bar that filters by contact name + message content"
---

<objective>
Ship the inbox list — the primary screen of the mobile app. Parity with the web WhatsApp inbox's card design per 43-CONTEXT.md ("single chronological list" with SLA signals). Uses `@shopify/flash-list` for scroll perf, Supabase Realtime paired with AppState foreground refetch (Research Pattern 1), and cached_conversations from the sqlite layer for offline reads.

Output: mobile API endpoint, hook, component tree, working inbox list.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/43-mobile-app/43-CONTEXT.md
@.planning/phases/43-mobile-app/43-RESEARCH.md
@src/app/(dashboard)/whatsapp/components/contact-panel.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Backend endpoint GET /api/mobile/conversations + Zod schema</name>
  <files>
    src/app/api/mobile/conversations/route.ts
    shared/mobile-api/schemas.ts
  </files>
  <action>
  1. Extend `shared/mobile-api/schemas.ts` with:
     - `MobileConversationSchema` = id, workspace_id, contact_id, contact_name (nullable), contact_phone, contact_profile_name, last_message_body, last_message_at (ISO string), last_customer_message_at (ISO, nullable), unread_count (int), tags (string[]), pipeline_stage_id (nullable), pipeline_stage_name (nullable), pipeline_stage_color (nullable), bot_mode ('on'|'off'|'muted'), bot_mute_until (ISO, nullable), avatar_url (nullable).
     - `MobileConversationsListResponseSchema` = `{ conversations: MobileConversationSchema[], next_cursor: string | null }`
     - `MobileConversationsListQuerySchema` = `{ cursor?: string, limit?: number (default 40, max 100) }`
  2. `src/app/api/mobile/conversations/route.ts`: GET handler.
     - Calls `requireMobileAuth(req)` → gets `{ workspaceId }`.
     - Parses query params via Zod.
     - Uses `createAdminClient()` to SELECT from `conversations` joined with `contacts`, `pipeline_stages`, and the `conversations.tags` column. Filter by `workspace_id` and (for now) exclude archived. Order by `last_message_at DESC`. Cursor pagination via `last_message_at` + `id` tiebreaker.
     - Shapes response with the Zod schema. Validate response before returning.
     - IMPORTANT: read-only endpoint — no mutations, so no domain layer call needed (Regla 3 is about mutations). If the join query shape isn't already available in the codebase, add it inline here.
     - Respect `bot_mode` and `bot_mute_until` from Plan 01 migration — may need a COALESCE if legacy rows exist.</action>
  <verify>`npm run build` passes. `curl -H "Authorization: Bearer $JWT" -H "x-workspace-id: $WS" http://localhost:3020/api/mobile/conversations` returns a valid JSON response matching the schema.</verify>
  <done>Endpoint ships + validates.</done>
</task>

<task type="auto">
  <name>Task 2: useInboxList hook + useRealtimeInbox with foreground refetch fallback</name>
  <files>
    apps/mobile/package.json
    apps/mobile/src/hooks/useInboxList.ts
    apps/mobile/src/lib/realtime/use-realtime-inbox.ts
  </files>
  <action>
  1. `npx expo install @shopify/flash-list` (in Expo Go's set).
  2. `src/hooks/useInboxList.ts`:
     - Keyed on `workspaceId` from `useWorkspace()`.
     - On mount: reads `listCachedConversations(workspaceId)` immediately (fast offline render), then calls `mobileApi.get('/api/mobile/conversations')`, parses with `MobileConversationsListResponseSchema`, calls `upsertCachedConversations(workspaceId, ...)` and re-reads from cache to get the merged state.
     - Exposes `{ conversations, loading, error, refresh, loadMore }`.
     - `refresh()` force-refetches from the API.
     - Pull-to-refresh in the UI calls `refresh()`.
  3. `src/lib/realtime/use-realtime-inbox.ts` — IMPLEMENTS RESEARCH PATTERN 1:
     - Subscribes to a Supabase Realtime channel `inbox:${workspaceId}` listening for `postgres_changes` on `conversations` with `filter: workspace_id=eq.${workspaceId}`, events `INSERT | UPDATE`.
     - On each event, calls `refresh()` from useInboxList (pass as a callback).
     - Also adds `AppState.addEventListener('change', state => { if (state === 'active') refresh() })` — the foreground refetch fallback. This is the reliability mechanism; Realtime is best-effort.
     - Registers the channel via `channel-registry.registerChannel(...)` so workspace switches tear it down.
     - Cleanup removes the channel and the AppState listener.
  </action>
  <verify>`npx tsc --noEmit` passes. Hook file imports `AppState` from `react-native`.</verify>
  <done>Hooks exist with the dual realtime + foreground refetch pattern.</done>
</task>

<task type="auto">
  <name>Task 3: Build ConversationCard, SlaTimer, UnreadBadge, and wire into (tabs)/inbox.tsx</name>
  <files>
    apps/mobile/src/components/inbox/ConversationCard.tsx
    apps/mobile/src/components/inbox/SlaTimer.tsx
    apps/mobile/src/components/inbox/UnreadBadge.tsx
    apps/mobile/app/(tabs)/inbox.tsx
    apps/mobile/src/lib/i18n/es.json
  </files>
  <action>
  1. `ConversationCard.tsx`: row with
     - Left: circular avatar placeholder (User icon if no avatar_url; `expo-image` if present)
     - Middle: contact name (top line, bold), last-message preview (second line, truncated to one line with ellipsis)
     - Right column (small): timestamp (`formatDistanceToNow(..., { locale: es, addSuffix: false })`), `<UnreadBadge count={unread_count} />` if > 0
     - Bottom row: `<SlaTimer lastCustomerMessageAt={...} />` + pipeline stage chip (color from server) + first tag chip (if any)
     - Tapping the whole row calls `router.push(`/chat/${id}`)`
     - All colors via `useTheme()`, all strings via `t()`.
  2. `SlaTimer.tsx`: shows "hace 5m" / "hace 2h" etc. based on `last_customer_message_at`. Color codes: <1h neutral, 1-4h amber, >4h red. If null, render nothing. This is the support-SLA signal from 43-CONTEXT.md Inbox list layout.
  3. `UnreadBadge.tsx`: small pill with the count (99+ cap).
  4. `app/(tabs)/inbox.tsx`: replace the placeholder with:
     - Header: workspace switcher button (from Plan 06) on the left, title `t('inbox.title')` centered, logout/settings icon on right (keep logout accessible for now)
     - Body: `<FlashList>` from `@shopify/flash-list` with `data={conversations}`, `estimatedItemSize={88}`, `onEndReached={loadMore}`, `refreshing={loading}`, `onRefresh={refresh}`, renders `<ConversationCard />`
     - Empty state: `t('inbox.empty')` with a friendly illustration (optional — skip if not obvious)
     - Calls `useInboxList()` + `useRealtimeInbox(refresh)` where refresh comes from the hook
  5. Add i18n keys for `inbox.sla.waiting`, `inbox.unread_count_plural`, tag colors.</action>
  <verify>`npx tsc --noEmit` passes. Visual test in Task 4.</verify>
  <done>Inbox list renders with cards, SLA timer, unread badge, pipeline chip.</done>
</task>

<task type="checkpoint:human-verify">
  <name>Task 4: Verify inbox on both devices</name>
  <files>n/a</files>
  <action>On both devices, user logs in and confirms:
  1. Inbox loads from the API with real conversations
  2. Pull-to-refresh works
  3. Scrolling is smooth (FlashList)
  4. SLA timer shows accurate "time since customer wrote"
  5. Unread badge matches what the web shows
  6. Kill the app, turn off WiFi, reopen — cached conversations render
  7. Turn WiFi back on, bring to foreground — list re-fetches (foreground refetch pattern)
  8. From the web, send a test message to one of the listed conversations → Realtime should push the update to the list (may have a few seconds of delay)
  9. Tap a card → stub chat screen opens (Plan 08 will build the real one)
  10. Switch to dark mode (Settings or OS) — verify no hardcoded colors in the inbox list, cards, SLA timer, unread badge, or header.

  Fix anything broken before marking done.</action>
  <verify>User confirms all 9 flows on both devices.</verify>
  <done>Inbox list is production quality, realtime-enabled, offline-capable.</done>
</task>

</tasks>

<verification>
- Mobile API endpoint returns valid Zod-shaped responses
- FlashList is used (not FlatList)
- Realtime subscription is registered in channel-registry
- AppState foreground refetch is implemented per Research Pattern 1
- Offline cache renders first, then API refresh merges
</verification>

<success_criteria>
User sees a live, scrolling, offline-capable inbox with SLA signals. Realtime + foreground refetch keeps it fresh.
</success_criteria>

<output>
After completion, create `.planning/phases/43-mobile-app/43-07-SUMMARY.md` with: endpoint contract, Realtime pattern implementation sketch, timing notes, any FlashList pitfalls.
</output>
