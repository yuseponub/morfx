---
phase: 43-mobile-app
plan: 07
title: Mobile inbox list (endpoint + FlashList + Realtime Pattern 1)
wave: 5
status: auto-tasks-done-awaiting-checkpoint
completed: 2026-04-18
requires:
  - phase: 43-03
    provides: shared mobile-api Zod contract + requireMobileAuth helper
  - phase: 43-04
    provides: mobileApi singleton + auth + theme + i18n
  - phase: 43-05
    provides: expo-sqlite cache (listCachedConversations, upsertCachedConversations)
  - phase: 43-06
    provides: useWorkspace() + channel-registry for Realtime teardown
provides:
  - GET /api/mobile/conversations endpoint (cursor pagination, workspace-scoped)
  - MobileConversationSchema + MobileConversationsListResponseSchema
  - useInboxList() hook (cache-first, API refresh, upsert)
  - useRealtimeInbox() hook (Realtime + AppState foreground refetch)
  - ConversationCard + SlaTimer + UnreadBadge components
  - FlashList-backed inbox screen (app/(tabs)/inbox.tsx)
  - /chat/[id] route stub (real chat in Plan 08)
affects:
  - 43-08 (chat screen — consumes /chat/[id] navigation target)
  - 43-10b (pipeline chip — wire contract field already present)
  - 43-11 (three-state bot toggle — bot_mode/bot_mute_until already on wire)
  - 43-12 (search — extends this list with search bar + cursor paging)
subsystem: mobile/inbox
tags: [mobile, inbox, flashlist, realtime, sqlite-cache, sla, zod]
tech-stack:
  added:
    - "@shopify/flash-list ^2.0.2"
  patterns:
    - Dual trigger Realtime + AppState foreground refetch (Research Pattern 1)
    - Cache-first render then API merge via sqlite upsert + re-read
    - Cursor pagination base64(last_message_at|id) with tuple tiebreaker via PostgREST .or()
    - Tags sourced from contact (contact_tags), not conversation_tags (web canonical)
key-files:
  created:
    - src/app/api/mobile/conversations/route.ts
    - apps/mobile/src/hooks/useInboxList.ts
    - apps/mobile/src/lib/realtime/use-realtime-inbox.ts
    - apps/mobile/src/components/inbox/ConversationCard.tsx
    - apps/mobile/src/components/inbox/SlaTimer.tsx
    - apps/mobile/src/components/inbox/UnreadBadge.tsx
    - apps/mobile/app/chat/[id].tsx
  modified:
    - shared/mobile-api/schemas.ts
    - apps/mobile/app/(tabs)/inbox.tsx
    - apps/mobile/src/lib/i18n/es.json
    - apps/mobile/package.json
    - apps/mobile/package-lock.json
key-decisions:
  - "Tags derived from contact.contact_tags (web source of truth), not from a non-existent conversations.tags column — plan text was imprecise"
  - "pipeline_stage_* fields kept on wire but null — pipeline stages live on orders, not conversations"
  - "Cursor pagination with .or() tuple emulation (PostgREST has no tuple comparison)"
  - "loadMore() is a no-op stub — Plan 12 wires cursor paging; UI call site stays stable"
  - "Chat stub shipped with this plan (Rule 2) so tap target resolves instead of 404"
metrics:
  duration: ~55min
  completed: 2026-04-18
---

# Phase 43 Plan 07: Mobile Inbox List Summary

**One-liner:** GET `/api/mobile/conversations` with cursor pagination + Zod contract, `useInboxList()` cache-first hook, `useRealtimeInbox()` dual-trigger (Supabase Realtime + AppState foreground refetch per Research Pattern 1), and a FlashList-backed inbox screen with SLA timer, unread badge, tag chip, and Spanish relative timestamps via `date-fns/locale/es`.

## Endpoint Contract

**`GET /api/mobile/conversations`**

**Auth:** `Authorization: Bearer <jwt>` + `x-workspace-id: <uuid>` (via `requireMobileAuth`).

**Query:**
| Param | Type | Default | Max |
|---|---|---|---|
| `cursor` | string (opaque base64) | — | — |
| `limit`  | integer | 40 | 100 |

**Response shape** (`MobileConversationsListResponseSchema`):

```json
{
  "conversations": [
    {
      "id": "uuid",
      "workspace_id": "uuid",
      "contact_id": "uuid | null",
      "contact_name": "string | null",
      "contact_phone": "string",
      "contact_profile_name": "string | null",
      "last_message_body": "string | null",
      "last_message_at": "iso | null",
      "last_customer_message_at": "iso | null",
      "unread_count": 0,
      "tags": [{ "id": "uuid", "name": "string", "color": "#hex" }],
      "pipeline_stage_id": null,
      "pipeline_stage_name": null,
      "pipeline_stage_color": null,
      "bot_mode": "on | off | muted",
      "bot_mute_until": "iso | null",
      "avatar_url": null
    }
  ],
  "next_cursor": "base64 | null"
}
```

**Cursor encoding:** `base64(${last_message_at_iso}|${id})`. Decoded + validated via `Date.parse` before use. Comparison is strict: `(last_message_at < X)` OR `(last_message_at = X AND id < Y)`, emulated via PostgREST `.or()` because PostgREST has no tuple comparison operator.

**Ordering:** `last_message_at DESC NULLS LAST, id DESC`. Excludes `status='archived'`.

**Joins:**
- `contacts!left(id, name, phone)` — left join so unknown contacts still appear (fall back to `profile_name`/`phone`).
- `contacts.contact_tags.tags(id, name, color)` — tags come from the contact, mirroring the web canonical pattern in `src/app/actions/conversations.ts` (the web's comment explicitly marks `conversation_tags` deprecated).

**COALESCE:** `bot_mode` defaults to `'on'` at the serialization layer for defensive handling of legacy rows (the migration in Plan 43-01 also sets `NOT NULL DEFAULT 'on'`, so this is belt-and-suspenders).

**No domain layer call:** read-only endpoint; Regla 3 applies to mutations only.

## Realtime Pattern (Research Pattern 1 Implementation)

File: `apps/mobile/src/lib/realtime/use-realtime-inbox.ts`.

Two independent triggers converge on a single `refresh()` callback that comes from `useInboxList`:

```
   Supabase Realtime channel (best effort)                  AppState change -> 'active'
   inbox:${workspaceId}                                     (reliability mechanism)
   postgres_changes INSERT/UPDATE on conversations              |
   filter: workspace_id=eq.${workspaceId}                       |
                 \                                             /
                  \                                           /
                   -------------> refresh() <----------------
                                     |
                                     v
                          useInboxList.fetchFromApi()
                                     |
                                     v
                    mobileApi.get('/api/mobile/conversations')
                                     |
                                     v
                    upsertCachedConversations(workspace, rows)
                                     |
                                     v
                    listCachedConversations(workspace) -> setState
```

**Why this is reliable despite known Supabase Realtime RN bugs** ([supabase/realtime-js #463](https://github.com/supabase/realtime-js/issues/463), [supabase/supabase #29916](https://github.com/supabase/supabase/issues/29916), [supabase/realtime #1088](https://github.com/supabase/realtime/issues/1088)): if the WebSocket is stuck CLOSED or missed updates during a background/foreground cycle, the `AppState.addEventListener('change')` handler catches the next foreground transition and force-refetches. The user may see a 1-2s delay, but they never see a stale list after reopening the app.

**Cleanup:** channel is registered with `channel-registry.registerChannel()` so the workspace-switch teardown (Plan 43-06) removes it wholesale. The hook's own `useEffect` cleanup also calls `registry.unregister()` + `supabase.removeChannel()` + `sub.remove()` — `removeChannel` no-ops on already-torn-down channels, so this is idempotent.

## Timing & Offline Notes

**Cold start timing** (expected; actual measurement happens in Task 4 device verification):

| Event | Roughly |
|---|---|
| Mount -> cache render | ~<50ms (sqlite read is sync-ish in RN JS bridge) |
| Mount -> API first byte | network-bound; budgeted 500ms-2s on Vercel cold start |
| API response -> cache upsert -> merged state | ~<100ms for 40 rows |
| AppState `active` -> refresh kick-off | immediate |

**Offline path:** if the API fetch throws (no connectivity), `error` is set and the UI keeps the cached rows. Cache survives OS kill + reboot because `expo-sqlite` writes to the durable sandbox DB file (Plan 43-05 uses ACID `withTransactionAsync`). Re-opening the app while offline should render the last cached snapshot immediately.

**Merging policy** (important for Realtime payloads): `upsertCachedConversations` uses `INSERT ... ON CONFLICT(id) DO UPDATE`. The hook then re-reads the whole cache, so the rendered list is the UNION of (rows the API just returned) + (older rows still in cache). We deliberately do NOT delete cache rows the API didn't return — a user who scrolls past 40 conversations should keep seeing older ones from prior sessions. Plan 12 (search + pagination) will revisit eviction.

## FlashList Pitfalls Encountered

1. **No `estimatedItemSize` prop in v2.** `@shopify/flash-list` v2.0.2 (installed via `npx expo install`) dropped `estimatedItemSize` — the runtime re-measures automatically. The plan text suggested setting `estimatedItemSize={88}` but v2 ignores it. Leaving the prop off is correct.
2. **Refresh prop semantics.** FlashList forwards `refreshing` + `onRefresh` directly to the underlying scroll component, matching `FlatList`. Pull-to-refresh works without extra wrapper state.
3. **`onEndReached` fires aggressively.** Set `onEndReachedThreshold={0.5}` to debounce; without it the callback can fire multiple times during a single scroll-to-bottom burst. Our `loadMore()` is a no-op today so it's harmless, but Plan 12 needs guard logic.
4. **Key extractor must be stable.** `keyExtractor={item => item.id}` — `id` is the conversation UUID, never reused, so FlashList's recycler works optimally.
5. **Horizontal chip row must NOT `flexWrap`.** The bottom SLA + tag chip row uses `flexWrap: 'nowrap'` because FlashList measures once; wrapping triggers re-measures and scroll jank. If the row overflows we truncate the tag instead (`maxWidth: 120`, `numberOfLines={1}`).

## Tasks Completed (Autonomous)

| # | Task | Commit | Files |
|---|---|---|---|
| 1 | Backend endpoint + Zod schema | `98c05d3` | `shared/mobile-api/schemas.ts`, `src/app/api/mobile/conversations/route.ts` |
| 2 | `useInboxList` + `useRealtimeInbox` | `f0894c7` | `apps/mobile/src/hooks/useInboxList.ts`, `apps/mobile/src/lib/realtime/use-realtime-inbox.ts`, `apps/mobile/package.json` |
| 3 | Cards + FlashList wiring | `9dd8162` | `apps/mobile/src/components/inbox/*`, `apps/mobile/app/(tabs)/inbox.tsx`, `apps/mobile/app/chat/[id].tsx`, `apps/mobile/src/lib/i18n/es.json` |
| 4 | Device verification | **PENDING** | checkpoint:human-verify |

All three auto tasks passed `npx tsc --noEmit` (no new errors). Pushed to `origin/main` (`9dd8162`) per Regla 1.

## Deviations from Plan

### Auto-fixed

**1. [Rule 1 — Bug] Plan referenced non-existent `conversations.tags` column.**
- **Found during:** Task 1 (schema audit).
- **Issue:** Plan said "uses `conversations.tags` column" — no such column exists in the schema (verified via grep of `supabase/migrations/`). The web source of truth at `src/app/actions/conversations.ts` derives tags via `contacts!left(... tags:contact_tags(tag:tags(...)))`.
- **Fix:** Mirrored the web query shape. Tags on the wire are `{ id, name, color }[]` sourced from the contact's tags. If the conversation has no linked contact, `tags` is `[]`.
- **Files modified:** `src/app/api/mobile/conversations/route.ts`, `shared/mobile-api/schemas.ts`.
- **Commit:** `98c05d3`.

**2. [Rule 2 — Missing Critical] `/chat/[id]` route did not exist.**
- **Found during:** Task 3 (tap handler wiring).
- **Issue:** Plan Task 3.1.d says "Tapping the whole row calls `router.push('/chat/${id}')`" and Task 4 #9 expects "stub chat screen opens." No such route file existed in `apps/mobile/app/chat/`.
- **Fix:** Shipped a minimal `apps/mobile/app/chat/[id].tsx` stub (back button, title, id display). Plan 08 replaces it with the real chat UI; no other plan expects this file's shape.
- **Files added:** `apps/mobile/app/chat/[id].tsx`.
- **Commit:** `9dd8162`.

**3. [Rule 3 — Blocking] expo-router `router.push` rejected `/chat/${id}` string.**
- **Found during:** Task 3 type-check.
- **Issue:** Expo Router v6 generates a typed Href union from the discovered routes. The `/chat/[id]` route's generated type arrives on the next `expo start` + types regenerate, but until then `router.push('/chat/${id}')` fails `tsc`.
- **Fix:** Imported `Href` and cast: `router.push(\`/chat/${id}\` as Href)`. Same pattern used by `apps/mobile/app/_layout.tsx`.
- **Files modified:** `apps/mobile/src/components/inbox/ConversationCard.tsx`.
- **Commit:** `9dd8162`.

**4. [Rule 1 — Pitfall] FlashList v2 dropped `estimatedItemSize`.**
- **Found during:** Task 3 wiring.
- **Issue:** Plan suggested `estimatedItemSize={88}`. FlashList v2.0.2 (installed via `npx expo install`) no longer accepts or uses that prop (Shopify redesigned the measurement engine in v2).
- **Fix:** Omitted the prop. No behavior change; auto-measurement kicks in.
- **Files modified:** `apps/mobile/app/(tabs)/inbox.tsx`.
- **Commit:** `9dd8162`.

**Total:** 4 auto-fixed deviations. No architectural changes (no Rule 4), no auth gates.

## What Works Now (verifiable without a device)

- `npx tsc --noEmit` passes in both `src/` (web) and `apps/mobile/` scopes.
- All three commits applied cleanly and pushed to `origin/main`.
- The endpoint wires through `requireMobileAuth` -> `createAdminClient` -> Zod validate -> JSON response with `Cache-Control: no-store`.
- The hook keys on `useWorkspace().workspaceId`, so workspace switches (Plan 06's key-based remount) trigger a full re-bootstrap with clean state.
- Cache upsert + re-read is transactional via `db.withTransactionAsync` from Plan 43-05.
- Cursor round-trip through `encodeCursor` / `decodeCursor` is symmetric and rejects malformed input with a 400 `invalid_cursor`.

## What the User Must Verify in Task 4 (checkpoint)

From the plan's 10-point checklist. The user runs the app on both physical devices (iPhone via Expo Go, Android via sideloaded `.apk` or EAS update) and confirms:

1. **Inbox loads from the API** with real conversations from the active workspace.
2. **Pull-to-refresh** visibly spins and refetches.
3. **Scrolling is smooth** (FlashList recycler working; no blank cells mid-scroll).
4. **SLA timer** shows accurate "time since customer wrote" with correct color thresholds (<1h muted, 1-4h amber, ≥4h red). Render nothing if `last_customer_message_at` is null.
5. **Unread badge** count matches the web's badge for the same conversation.
6. **Offline mode:** kill app -> turn off WiFi -> reopen. Cached conversations still render from sqlite.
7. **Foreground refetch:** WiFi back on -> bring app to foreground. List re-fetches (Research Pattern 1 AppState handler).
8. **Realtime push:** from the web, send a test message to a listed conversation. The list updates within a few seconds (may have delay — Realtime is best-effort).
9. **Tap a card -> stub chat screen opens** (the `/chat/[id]` stub from this plan; Plan 08 replaces it).
10. **Dark mode:** toggle system or app theme. Confirm no hardcoded colors in header, cards, SLA timer, unread badge, tag chip, logout icon, retry button.

Per the plan's instructions for checkpoint:human-verify tasks, **the executor does not run Task 4 — the user must verify on real devices.** If anything fails, this SUMMARY plus the commit history give the next session everything it needs to patch forward without re-running Tasks 1-3.

## Pushed

- Commit `9dd8162` (tip) -> `origin/main` via `git push origin main` (Regla 1 satisfied).
- Commits on branch: `98c05d3`, `f0894c7`, `9dd8162` (in order).

## Open / Follow-ups

- **`pipeline_stage_*` always null.** Plan 10b should decide whether to surface "latest order stage" as a per-conversation signal on the inbox card. The contract field is reserved so no schema churn is needed.
- **`avatar_url` always null.** Future plan (post-v1) may wire WhatsApp profile pictures or contact photo uploads.
- **`loadMore()` is a no-op.** Plan 12 (search) should wire cursor paging using `next_cursor` from the response.
- **Cache eviction policy.** Currently we never evict — `listCachedConversations` renders whatever's in the cache + whatever the API returned. Plan 12 should add `delete from cached_conversations where workspace_id=? and updated_at < ?` on full refreshes or age-based pruning.
- **Accessibility review for chip row.** The tag chip renders colored text on a 13%-alpha tint of the same color. Contrast may fail WCAG AA for some tag palettes. Plan 12/13 should audit + possibly generate a WCAG-safe foreground color per tag.

## Self-Check: PASSED

Created files (all present on disk):
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/api/mobile/conversations/route.ts`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/hooks/useInboxList.ts`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/lib/realtime/use-realtime-inbox.ts`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/components/inbox/ConversationCard.tsx`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/components/inbox/SlaTimer.tsx`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/components/inbox/UnreadBadge.tsx`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/app/chat/[id].tsx`

Commits (verified via `git log --oneline`):
- `98c05d3` Task 1 — backend endpoint + schema
- `f0894c7` Task 2 — hooks
- `9dd8162` Task 3 — components + FlashList wiring

Pushed: `origin/main` is at `9dd8162`.
