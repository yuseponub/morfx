---
phase: 43-mobile-app
plan: 08
title: Mobile chat detail — read path (messages API + FlashList + realtime)
wave: 6
status: auto-tasks-done-awaiting-checkpoint
completed: 2026-04-18
requires:
  - phase: 43-03
    provides: shared mobile-api Zod contract + requireMobileAuth helper
  - phase: 43-05
    provides: expo-sqlite cache (cached_messages, outbox, conversations-cache)
  - phase: 43-06
    provides: useWorkspace() + channel-registry for Realtime teardown
  - phase: 43-07
    provides: inbox list + /chat/[id] stub (replaced in this plan)
provides:
  - GET /api/mobile/conversations/:id/messages endpoint (cursor pagination, workspace-scoped)
  - POST /api/mobile/conversations/:id/mark-read endpoint (routed through domain layer — Regla 3)
  - markConversationRead() domain function in src/lib/domain/conversations.ts
  - MobileMessageSchema + MobileMessagesListResponseSchema + MarkReadResponseSchema
  - useConversationMessages() hook (cache-first, API refresh, loadOlder, mark-read on mount)
  - useRealtimeMessages() hook (Realtime + AppState foreground refetch)
  - MessageBubble + DayDivider + MessageList components (FlashList via scaleY flip)
  - Real /chat/[id] screen (replaces the Plan 07 stub)
affects:
  - 43-09 (composer — consumes the composer placeholder slot + useConversationMessages refresh)
  - 43-10a (in-chat CRM drawer — mounts on this screen)
  - 43-10b (pipeline chip on bubble — same direction/status contract)
  - 43-11 (three-state bot toggle — renders in this header)
subsystem: mobile/chat-detail
tags: [mobile, chat, flashlist, realtime, sqlite-cache, domain-layer, zod]
tech-stack:
  added: []
  patterns:
    - Inverted list via transform scaleY(-1) on parent + un-flip on each row
      (FlashList v2 removed the `inverted` prop)
    - Dual trigger Realtime + AppState foreground refetch (Research Pattern 1,
      same mechanism as useRealtimeInbox)
    - Cache-first render then API merge via sqlite upsert + re-read
    - mark-read via POST /api/mobile/conversations/:id/mark-read fire-and-forget
      on screen mount (mirrors web inbox-layout.tsx behavior)
    - Message direction wire format in/out <-> DB direction inbound/outbound
      (terse + cache-compatible)
    - Message content JSONB -> body text rendering via renderBody() per type
      (text / image / audio / video / document / template supported; interactive /
      reaction / sticker / location / contacts collapse to body=null for now)
key-files:
  created:
    - src/app/api/mobile/conversations/[id]/messages/route.ts
    - src/app/api/mobile/conversations/[id]/mark-read/route.ts
    - apps/mobile/src/lib/api-schemas/messages.ts
    - apps/mobile/src/hooks/useConversationMessages.ts
    - apps/mobile/src/lib/realtime/use-realtime-messages.ts
    - apps/mobile/src/components/chat/MessageBubble.tsx
    - apps/mobile/src/components/chat/DayDivider.tsx
    - apps/mobile/src/components/chat/MessageList.tsx
  modified:
    - shared/mobile-api/schemas.ts
    - src/lib/domain/conversations.ts
    - apps/mobile/src/lib/db/messages-cache.ts
    - apps/mobile/app/chat/[id].tsx
    - apps/mobile/src/lib/i18n/es.json
key-decisions:
  - "markConversationRead() added to domain layer (Regla 3). Web server action still bypasses domain for this mutation but that's a pre-existing web debt — mobile ships correctly."
  - "Message direction on wire is 'in'/'out' (not 'inbound'/'outbound') to match the local sqlite cache constraint (CHECK (direction IN ('in','out')))"
  - "Template / interactive / reaction / sticker / location / contacts message types collapse to body=null in this plan. Only text / image / audio / video / document / template render meaningfully. Plan 09/10 expand coverage."
  - "FlashList v2 dropped `inverted` + `estimatedItemSize` props. Used transform scaleY(-1) on the list + un-flip on each row — standard RN workaround. estimatedItemSize={60} passed but v2 auto-measures anyway."
  - "Message cache status normalization: WhatsApp delivery statuses (pending|sent|delivered|read|failed) mapped to local cache taxonomy (sent|queued|sending|failed). 'pending' -> 'sending', 'delivered'/'read'/'sent' -> 'sent', 'failed' -> 'failed'."
  - "Schema duplicated in apps/mobile/src/lib/api-schemas/messages.ts — Metro cannot resolve imports outside apps/mobile/ (learned the hard way in Plan 07). Source of truth + mobile copy MUST stay byte-compatible."
  - "loadOlder() uses the oldest cached createdAt as the `before` cursor rather than the API's opaque next_cursor — simpler, and works offline-first (if the cache has rows, we know the boundary)."
metrics:
  duration: ~70min
  completed: 2026-04-18
---

# Phase 43 Plan 08: Mobile Chat Detail — Read Path Summary

**One-liner:** GET `/api/mobile/conversations/:id/messages` with cursor pagination + POST `/mark-read` routed through a new `markConversationRead()` domain function (Regla 3), `useConversationMessages()` cache-first hook with mark-read on mount, `useRealtimeMessages()` dual-trigger (Supabase Realtime + AppState foreground refetch), and a FlashList chat screen with Bogota-time HH:mm timestamps, day dividers ("Hoy" / "Ayer" / `lunes 14 abr`), direction-aware bubbles, and status icons for outbound messages — all replacing the Plan 07 stub at `apps/mobile/app/chat/[id].tsx`.

## Endpoint Contracts

### `GET /api/mobile/conversations/:id/messages`

**Auth:** `Authorization: Bearer <jwt>` + `x-workspace-id: <uuid>` (via `requireMobileAuth`).

**Path param:** `id` = conversation UUID. The server verifies the conversation belongs to the authenticated workspace; otherwise returns 404 to prevent cross-workspace enumeration.

**Query:**

| Param    | Type    | Default | Max |
| -------- | ------- | ------- | --- |
| `before` | ISO string (createdAt of oldest row the client has) | — | — |
| `limit`  | integer | 50      | 100 |

**Response shape** (`MobileMessagesListResponseSchema`):

```json
{
  "messages": [
    {
      "id": "uuid",
      "conversation_id": "uuid",
      "workspace_id": "uuid",
      "direction": "in" | "out",
      "body": "string | null",
      "media_url": "string | null",
      "media_type": "image | audio | video | document | null",
      "template_name": "string | null",
      "sender_name": "string | null",
      "status": "pending | sent | delivered | read | failed | null",
      "idempotency_key": "string | null",
      "created_at": "iso"
    }
  ],
  "next_cursor": "iso | null"
}
```

**Ordering:** `created_at DESC`. Fetches `limit + 1` to detect whether another page exists; if so, `next_cursor` = oldest row's `created_at` in the slice.

**Direction translation:** DB `direction` (`inbound`|`outbound`) maps to wire `in`/`out` to match the local sqlite cache constraint (`CHECK (direction IN ('in','out'))`).

**Content rendering:** `messages.content` JSONB is rendered to a plain `body` text via `renderBody(type, content)`:

- `text` → `content.body || content.text`
- `image` / `video` / `audio` → `content.caption` (if any, else null)
- `document` → `content.caption || content.filename`
- `template` → `content.body || content.preview` + separate `template_name` field
- `interactive` / `reaction` / `sticker` / `location` / `contacts` → `body = null` (rows stay on the wire so counts match the web view; Plan 09/10 surface them richly)

**Sender name:** pulled from the conversation-level contact join (`contacts.name` → `conversations.profile_name` fallback). Inbound-only; outbound rows get `sender_name = null`.

**No domain layer call:** read-only endpoint; Regla 3 applies to mutations only.

### `POST /api/mobile/conversations/:id/mark-read`

**Auth:** same as above.

**Body:** none.

**Response:** `{ ok: true }` (`MarkReadResponseSchema`).

**Flow:** Route handler calls `markConversationRead({ workspaceId, source: 'mobile-api' }, { conversationId })` per Regla 3. Domain function:

1. Verifies conversation exists AND belongs to `workspaceId` (prevents cross-workspace writes).
2. UPDATEs `is_read = true`, `unread_count = 0`, `updated_at = now()` filtered by both `id` and `workspace_id`.
3. Returns `{ success: true, data: { conversationId } }`.

Route maps "Conversacion no encontrada" to 404; other domain failures bubble up as 500 via `toMobileErrorResponse`.

## `markConversationRead()` — domain function location

**File:** `src/lib/domain/conversations.ts`

**Signature:**

```typescript
export async function markConversationRead(
  ctx: DomainContext,
  params: MarkConversationReadParams
): Promise<DomainResult<MarkConversationReadResult>>
```

**Types:** `MarkConversationReadParams = { conversationId: string }`, `MarkConversationReadResult = { conversationId: string }`.

**Auto-deviation note (web debt):** `src/app/actions/conversations.ts` has a `markAsRead()` server action that still writes directly to Supabase — a pre-existing Regla 3 violation on the web. The mobile API does NOT reuse it; instead it uses the new domain function. A future quick-fix plan should migrate the web server action to call `markConversationRead()`, but that's out of scope here (Rule 4: architectural change requires a separate decision).

## FlashList Inverted Config (v2 Workaround)

FlashList v2.0.2 removed the `inverted` prop (was the standard way on FlatList + FlashList v1). The established RN workaround — and what `MessageList.tsx` uses — is:

```typescript
// Parent flipped vertically:
<View style={{ transform: [{ scaleY: -1 }] }}>
  <FlashList data={rows} ... />
</View>

// Each row un-flipped so text reads the right way up:
renderItem = ({ item }) => (
  <View style={{ transform: [{ scaleY: -1 }] }}>
    <MessageBubble ... />
  </View>
);
```

Touch events still route correctly through the scale transform. The RefreshControl and ListFooterComponent also receive the un-flip so the pull spinner and the "loading older" indicator appear at the visually correct edges.

**Data order:** `rows` are sorted newest-first (DESC by `createdAt`). With the scale flip, newest ends up visually at the bottom — matching chat convention. `onEndReached` fires when the user scrolls to the end of `data` = visually the top, which is where older messages paginate in via `loadOlder`.

**Day dividers:** `buildRows()` walks messages newest-first and emits a divider row AFTER a message whenever the NEXT (older) message is in a different Bogota calendar day. With the flip, "after in data" = "above in view" — so "Hoy" sits above today's messages, matching WhatsApp.

**Sender grouping:** consecutive inbound messages from the same conversation hide the sender label on all but the first (OLDEST visually at the top of the run) bubble. This is computed by checking whether the next item in the DESC list is also inbound.

**Why not just use DESC data + normal list?** That'd put newest at the top of the scroll — wrong affordance. Inversion is the canonical chat UX.

## Realtime Pattern (Research Pattern 1 — chat variant)

File: `apps/mobile/src/lib/realtime/use-realtime-messages.ts`.

Same dual-trigger shape as `useRealtimeInbox` (Plan 07). Two independent triggers converge on `refresh()` from `useConversationMessages`:

```
   Supabase Realtime channel (best effort)                  AppState change -> 'active'
   messages:${conversationId}                               (reliability mechanism)
   postgres_changes INSERT + UPDATE on messages                    |
   filter: conversation_id=eq.${conversationId}                    |
                 \                                                /
                  \                                              /
                   -------------> refresh() <--------------------
                                     |
                                     v
                          useConversationMessages.fetchLatest()
                                     |
                                     v
                    mobileApi.get('/api/mobile/conversations/:id/messages')
                                     |
                                     v
                    upsertCachedMessages(rows)
                                     |
                                     v
                    listCachedMessages(conversationId) -> setState
```

The UPDATE subscription also captures status transitions (`pending` → `sent` → `delivered` → `read`) on outbound messages so the bubble status icon animates live without the user foregrounding the app.

Cleanup: registers with `registerChannel(channel)` so the workspace-switch teardown (Plan 06's `teardownAllChannels()`) removes it wholesale. The hook's own `useEffect` cleanup also calls `unregister() + supabase.removeChannel(channel) + sub.remove()` (idempotent).

## Cache-First Read Path

`useConversationMessages(conversationId)`:

1. **Mount:** synchronously read `listCachedMessages(conversationId, 50)` → paint from sqlite. If the conversation was ever opened before (Plan 07 populates the conversation list), messages may already be cached.
2. **In parallel:** call `mobileApi.get('/api/mobile/conversations/:id/messages')`. On success, `upsertCachedMessages()` (batch transactional via `withTransactionAsync`), then re-read `listCachedMessages(conversationId, 200)` and update state — rendered list becomes the UNION of fresh page + older cached rows.
3. **Fire-and-forget:** `mobileApi.post('/api/mobile/conversations/:id/mark-read')` — not awaited, failure logged but non-fatal. The `markedReadFor` ref prevents duplicate POSTs across strict-mode double-mounts.
4. **refresh():** re-runs step 2. Bound to pull-to-refresh AND called from `useRealtimeMessages`.
5. **loadOlder():** finds the oldest cached `createdAt`, encodes it as an ISO string, fetches `?before=ISO&limit=50`. If the server returns 0 messages, sets `reachedEnd = true`. The inflight guard (`olderInFlight` ref) prevents double-firing during aggressive scroll.

**Offline path:** if the API fetch throws, `error` is set and the cached rows remain visible. No blank screen. Re-opening the app while offline paints the last cached snapshot immediately.

**Status normalization:** wire `status` values map to cache taxonomy — `pending` → `sending`, `delivered`/`read`/`sent` → `sent`, `failed` → `failed`. Inbound messages get `sent` in the cache (they have no delivery status, and the CHECK constraint requires a non-null value).

## Mobile-side schema duplication

**File:** `apps/mobile/src/lib/api-schemas/messages.ts`

Contains byte-identical copies of `MobileMessageSchema`, `MobileMessagesListResponseSchema`, and `MarkReadResponseSchema` from `shared/mobile-api/schemas.ts`. The same rule as `conversations.ts` (Plan 07) applies: Metro (the Expo bundler) cannot resolve imports outside `apps/mobile/`, so cross-boundary imports fail at `eas update` / `expo export` time even when `npx tsc --noEmit` passes.

**If you change either file, change both.** A header comment in `messages.ts` calls this out.

## Tasks Completed (Autonomous)

| # | Task | Commit | Files |
|---|---|---|---|
| 1 | Backend endpoints + Zod schemas + domain function | `e86636c` | `shared/mobile-api/schemas.ts`, `src/lib/domain/conversations.ts`, `src/app/api/mobile/conversations/[id]/messages/route.ts`, `src/app/api/mobile/conversations/[id]/mark-read/route.ts` |
| 2 | Hooks + cache helpers + mobile schema duplicate | `5e64a02` | `apps/mobile/src/lib/api-schemas/messages.ts`, `apps/mobile/src/lib/db/messages-cache.ts`, `apps/mobile/src/hooks/useConversationMessages.ts`, `apps/mobile/src/lib/realtime/use-realtime-messages.ts` |
| 3 | Chat UI + i18n + /chat/[id] screen | `70658ff` | `apps/mobile/src/components/chat/{MessageBubble,DayDivider,MessageList}.tsx`, `apps/mobile/app/chat/[id].tsx`, `apps/mobile/src/lib/i18n/es.json` |
| 4 | Device verification | **PENDING** | checkpoint:human-verify |

All three auto tasks passed `npx tsc --noEmit` on the mobile scope. The Metro bundle smoke test (`npx expo export --platform android`) completed cleanly with an 8.98 MB bundle and no resolution errors — catching any Metro-vs-tsc drift that the plan 07 learnings warned about. Pushed to `origin/main` after every commit (Regla 1).

## Deviations from Plan

### Auto-fixed

**1. [Rule 2 — Missing Critical] Plan suggested no `last_read_at` column existed on `conversations`.**
- **Found during:** Task 1 (mark-read domain implementation).
- **Issue:** Plan action text mentioned "updates last_read_at" — no such column exists in `supabase/migrations/20260130000002_whatsapp_conversations.sql` (verified via grep). The existing schema only tracks `is_read` + `unread_count`.
- **Fix:** Implemented `markConversationRead()` to update `is_read = true` + `unread_count = 0` + `updated_at = now()` (matching the pre-existing web `markAsRead` action's DB writes). No migration added.
- **Files:** `src/lib/domain/conversations.ts`.
- **Commit:** `e86636c`.

**2. [Rule 2 — Missing Critical] Plan suggested emitting a read-signal Realtime broadcast if any.**
- **Found during:** Task 1.
- **Issue:** Plan left this conditional — no existing read-signal broadcast exists in the web module. `grep -rn conversation-read|read-signal|channel.*broadcast` in `src/app/(dashboard)/whatsapp/` only surfaced the web `markAsRead` server action writing directly to Supabase (no broadcast).
- **Fix:** Skipped the broadcast. The mobile inbox picks up the `unread_count=0` change via its existing Realtime subscription on `conversations` UPDATEs (Plan 07's `useRealtimeInbox`). No new broadcast channel needed.
- **Files:** none (intentional no-op).

**3. [Rule 3 — Blocking] FlashList v2 dropped the `inverted` prop AND `estimatedItemSize`.**
- **Found during:** Task 3 typecheck (tsc error on `inverted` prop: "Property 'inverted' does not exist on type FlashListProps").
- **Issue:** Plan said "`FlashList` with `inverted` prop". FlashList v2.0.2 removed `inverted` entirely (Shopify rewrote the measurement engine). Plan 07's SUMMARY had already documented that `estimatedItemSize` was dropped too.
- **Fix:** Used the standard RN workaround — `transform: [{ scaleY: -1 }]` on the parent wrapper + the same transform on each rendered row. RefreshControl + ListFooterComponent also get the un-flip so spinners appear at the correct visual edge. `estimatedItemSize={60}` omitted (v2 auto-measures).
- **Files:** `apps/mobile/src/components/chat/MessageList.tsx`.
- **Commit:** `70658ff`.

**4. [Rule 2 — Missing Critical] Direction wire format mismatch.**
- **Found during:** Task 1 schema design.
- **Issue:** The DB column `messages.direction` uses `'inbound'|'outbound'` per the migration. The existing sqlite cache at `apps/mobile/src/lib/db/messages-cache.ts` uses `'in'|'out'` (CHECK constraint). Passing the DB values through to the mobile would break cache inserts.
- **Fix:** Added explicit translation in the route handler (`mapDirection(d)`) + locked the wire schema to `z.enum(['in', 'out'])`. Documented in the schemas comment block.
- **Files:** `src/app/api/mobile/conversations/[id]/messages/route.ts`, `shared/mobile-api/schemas.ts`.
- **Commit:** `e86636c`.

**5. [Rule 3 — Blocking] Schema duplication required for Metro.**
- **Known pattern from Plan 07.** Not a new deviation — executing the established fix proactively this time. Created `apps/mobile/src/lib/api-schemas/messages.ts` as a byte-compatible local copy of the new schemas in `shared/mobile-api/schemas.ts`. Metro bundle smoke test (`npx expo export --platform android`) confirmed no resolution errors.
- **Files:** `apps/mobile/src/lib/api-schemas/messages.ts`.
- **Commit:** `5e64a02`.

**Total:** 5 auto-fixed deviations. No Rule 4 architectural asks. No auth gates encountered.

### Regla 3 Note (important)

The plan asked us to consider whether to route mark-read through the domain layer. We did — the POST handler calls `markConversationRead()` in `src/lib/domain/conversations.ts` — because Regla 3 explicitly requires all mutations to go through the domain layer, and `unread_count=0 + is_read=true` IS a mutation. The web's existing `src/app/actions/conversations.ts::markAsRead()` currently bypasses the domain (pre-existing debt); that remains as it was. A future migration plan should route the web action through the new domain function too.

## What Works Now (verifiable without a device)

- `npx tsc --noEmit` passes in both `src/` (web) and `apps/mobile/` scopes — zero errors introduced.
- Metro bundle smoke test (`cd apps/mobile && npx expo export --platform android --output-dir /tmp/morfx-bundle-test`) completes cleanly — 8.98 MB android bundle with no cross-boundary import errors.
- All three commits applied cleanly and pushed to `origin/main`.
- Messages endpoint wires `requireMobileAuth` → `createAdminClient` → workspace-scoped select → Zod validate → JSON response with `Cache-Control: no-store`.
- Mark-read endpoint calls `markConversationRead()` domain function with `source: 'mobile-api'`; 404 on missing conversation.
- Hook keys on `conversationId + workspaceId`; workspace switch destroys the (tabs) tree and remounts (Plan 06 key-based remount).
- Cache upsert + re-read is transactional via `db.withTransactionAsync`.
- `loadOlder()` paginates strictly-older messages using the oldest cached `createdAt` as the ISO cursor.
- Realtime channel tears down correctly on workspace switch via `registerChannel()`.

## What the User Must Verify in Task 4 (checkpoint)

From the plan's checkpoint description, verifying on both physical devices (iPhone via Expo Go or `eas update`, Android via sideloaded APK or `eas update`):

1. **Tap a conversation from the inbox → chat screen opens** with the contact name in the header.
2. **Messages load** and render newest-at-the-bottom (inverted via scaleY flip).
3. **Timestamps show in Bogota time (HH:mm, 24-hour format).**
4. **Day dividers render** as "Hoy" / "Ayer" / `lunes 14 abr` above the messages of each day.
5. **Inbound bubbles** appear on the LEFT with neutral surface background. Contact name shows above the first bubble of a consecutive inbound run.
6. **Outbound bubbles** appear on the RIGHT with primary-colored background. Status icon renders in the meta row: clock for queued, spinner for sending, check for sent, alert for failed.
7. **Back button** returns to the inbox via `router.back()`.
8. **Unread badge on that conversation's inbox card is now 0** (mark-read POST worked).
9. **Offline:** turn off WiFi, kill the app, reopen it, tap a recently opened conversation. Cached messages render immediately from sqlite (no blank screen, no error blocker).
10. **Realtime INSERT:** from the web, send a message to the currently-open conversation on mobile. The new bubble appears within a few seconds without any user action.
11. **Realtime UPDATE:** change an outbound message's status on the server (or wait for WhatsApp's delivery receipt). The bubble's status icon transitions live.
12. **AppState foreground refetch:** background the app, send a message from the web, foreground the mobile app. Within a second or two the list refetches even if Realtime missed the event.
13. **Dark mode:** switch system theme. Verify no hardcoded colors — bubbles, dividers, header, composer placeholder, media placeholders must all remain readable and properly contrasted. All colors route through `useTheme()`.
14. **Long thread pagination:** in a conversation with more than 50 messages, scroll to the top of the history — older messages should paginate in via `loadOlder` until `reachedEnd = true`.
15. **Composer placeholder:** the bottom of the screen shows "El compositor llega en el siguiente plan" in italic muted text. This is expected — Plan 09 replaces it.

Per Plan 08's instructions for `type="checkpoint:human-verify"`, **the executor does not run Task 4 — the user verifies on real devices.** `eas update --platform android` (the established Plan 06 pattern) is the typical delivery mechanism, but this executor does not issue it; the main conversation batches OTA with any subsequent quick fixes.

## Pushed

- `e86636c` (Task 1) → `origin/main`
- `5e64a02` (Task 2) → `origin/main`
- `70658ff` (Task 3 — tip) → `origin/main`

Regla 1 satisfied (code pushed before asking for device verification).

## Open / Follow-ups

- **Composer slot is a placeholder.** Plan 09 replaces it; the KeyboardAvoidingView wrapper around the MessageList + composer is already in place.
- **Rich media types collapse to body=null.** `interactive`, `reaction`, `sticker`, `location`, `contacts` render empty bubbles with just the timestamp. Plan 10a/10b or later surface them.
- **Web `markAsRead` bypasses domain.** Pre-existing debt in `src/app/actions/conversations.ts`. A future quick-fix plan should migrate it to call `markConversationRead()`.
- **mark-read request has no retry.** If the POST fails (offline at open), the server `unread_count` stays stale until the user opens the conversation online again. Acceptable for v1; a future plan could add a small outbox entry if this surfaces as a pain point.
- **Bubble tap interactions.** No long-press menu, no copy-to-clipboard, no "reply to this" yet. Future plans.
- **Image / audio / video stubs.** `MediaPlaceholder` currently shows an icon + Spanish label. Plan 09 wires `expo-image` for images and `expo-av` for audio playback.
- **Contact-name drift after reply.** `senderName` is read from the conversation cache once on mount; a live `contacts.name` change would not reflect until remount. Acceptable trade-off since contact names change rarely.
- **Regla 4 — docs updates.** `docs/analysis/04-estado-actual-plataforma.md` and the web `markAsRead` entry in deuda técnica could note this new domain function. Deferred to the end of the phase once all plans land (pattern observed in 43-07 SUMMARY too).

## Self-Check: PASSED

Created files (all present on disk):

- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/api/mobile/conversations/[id]/messages/route.ts`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/api/mobile/conversations/[id]/mark-read/route.ts`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/lib/api-schemas/messages.ts`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/hooks/useConversationMessages.ts`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/lib/realtime/use-realtime-messages.ts`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/components/chat/MessageBubble.tsx`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/components/chat/DayDivider.tsx`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/components/chat/MessageList.tsx`

Modified files (all present on disk with expected content):

- `shared/mobile-api/schemas.ts` — new MobileMessageSchema + MobileMessagesListResponseSchema + MobileMessagesListQuerySchema + MarkReadResponseSchema
- `src/lib/domain/conversations.ts` — new `markConversationRead()` function + types
- `apps/mobile/src/lib/db/messages-cache.ts` — new `listCachedMessages`, `upsertCachedMessages`, `getLatestCachedTimestamp` helpers
- `apps/mobile/app/chat/[id].tsx` — stub replaced with real chat screen
- `apps/mobile/src/lib/i18n/es.json` — new chat.* keys

Commits (verified via `git log --oneline`):

- `e86636c` Task 1 — backend endpoints + schemas + domain function
- `5e64a02` Task 2 — hooks + cache helpers + mobile schema duplicate
- `70658ff` Task 3 — chat UI + /chat/[id] screen + i18n

Pushed: `origin/main` is at `70658ff`.

Build verifications:

- `cd apps/mobile && npx tsc --noEmit` — clean exit, 0 errors
- `cd apps/mobile && npx expo export --platform android --output-dir /tmp/morfx-bundle-test` — 8.98 MB bundle, 0 resolution errors, 0 warnings about missing modules. `/tmp/morfx-bundle-test` cleaned up after verification.

---
*Phase: 43-mobile-app*
*Plan: 08*
*Completed: 2026-04-18*
