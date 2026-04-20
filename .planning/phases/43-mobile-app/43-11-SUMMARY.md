---
phase: 43-mobile-app
plan: 11
title: Three-state bot toggle (on / off / muted-for-duration) per conversation
wave: 7
status: auto-tasks-done-awaiting-checkpoint
completed: 2026-04-18
requires:
  - phase: 43-01
    provides: conversations.bot_mode + bot_mute_until columns, CHECK constraint, partial index
  - phase: 43-03
    provides: requireMobileAuth helper + shared Zod contract + cached_conversations sqlite schema with bot_mode/bot_mute_until/updateCachedConversationBotMode
  - phase: 43-06
    provides: useWorkspace() + workspace-scoped mobile API client
  - phase: 43-07
    provides: inbox list endpoint + sqlite conversations cache
  - phase: 43-08
    provides: chat detail screen (chat/[id].tsx) + useConversationMessages cache-first pattern
provides:
  - src/lib/domain/conversations/set-bot-mode.ts (setBotMode + resolveBotMode)
  - POST /api/mobile/conversations/:id/bot-mode endpoint (Regla 3 via setBotMode)
  - resolveBotMode applied on GET /api/mobile/conversations (read-side auto-resume)
  - apps/mobile/src/hooks/useBotToggle.ts (optimistic writer + client-side expiry coercion)
  - apps/mobile/src/components/chat/BotToggle.tsx (segmented three-state control)
  - apps/mobile/src/components/chat/MuteDurationSheet.tsx (bottom sheet with Bogota EoD)
  - apps/mobile/src/components/chat/ChatHeader.tsx (extracted header)
  - MobileBotModeRequestSchema + MobileBotModeResponseSchema in shared + mobile copy
affects:
  - 43-07 inbox ordering (bonus: also fixed sort to last_customer_message_at DESC to match web)
  - future auto-resume worker plan (resolveBotMode already covers the read path)
  - future bot-mode consolidation plan (Regla 6: additive vs existing agent_conversational)
subsystem: mobile/bot-control
tags: [mobile, bot-toggle, domain-layer, zod, optimistic-ui, bogota-timezone, regla-6]
tech-stack:
  added: []
  patterns:
    - "Additive domain function (Regla 6): setBotMode() lives alongside legacy toggleConversationAgent without touching its read/write path"
    - "Read-side auto-resume via resolveBotMode(row) — no scheduled worker needed for v1"
    - "Optimistic UI with sqlite cache mirror + POST round-trip + revert on error (same shape as useContactPanel / useConversationMessages)"
    - "Cursor pagination with NULLS LAST across TWO timestamp columns (emulated via nested PostgREST .or())"
    - "Bogota end-of-day via Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }) + stable -05:00 offset (Colombia has no DST per tz database)"
key-files:
  created:
    - src/lib/domain/conversations/set-bot-mode.ts
    - src/app/api/mobile/conversations/[id]/bot-mode/route.ts
    - apps/mobile/src/hooks/useBotToggle.ts
    - apps/mobile/src/components/chat/BotToggle.tsx
    - apps/mobile/src/components/chat/MuteDurationSheet.tsx
    - apps/mobile/src/components/chat/ChatHeader.tsx
    - apps/mobile/src/lib/api-schemas/bot-mode.ts
  modified:
    - shared/mobile-api/schemas.ts
    - src/app/api/mobile/conversations/route.ts
    - apps/mobile/src/lib/db/conversations-cache.ts
    - apps/mobile/app/chat/[id].tsx
    - apps/mobile/src/lib/i18n/es.json
key-decisions:
  - "setBotMode lives at src/lib/domain/conversations/set-bot-mode.ts (subdirectory) per plan text. Coexists with the existing flat src/lib/domain/conversations.ts because TypeScript bundler resolution prefers the explicit file match over a directory fallback — no existing imports break."
  - "resolveBotMode is PURE (no DB writes). Read paths coerce on the way out; the DB row stays stale until a future worker or the next setBotMode call. This keeps the read endpoints cheap and idempotent."
  - "Long-press + short-press gesture split: tap cycles on ↔ off (most common), long-press (500ms) opens MuteDurationSheet. Avoids crowding the header with a three-way picker on small phones."
  - "MuteDurationSheet uses a plain Modal, not @gorhom/bottom-sheet. Rationale: a four-option picker does not need the library's gesture engine, and a plain Modal has zero gesture surface that could collide with the chat MessageList scroll."
  - "Bogota end-of-day hardcodes the -05:00 offset (Colombia has no DST per tz database America/Bogota). toLocaleString roundtrips are fragile across JS engines; Intl.DateTimeFormat('en-CA', ...) yields a stable YYYY-MM-DD that we anchor to 23:59:59-05:00."
  - "Cursor format bumped to include last_customer_message_at: base64(`${last_customer_message_at|null}|${last_message_at|null}|${id}`). Old cursors become invalid at the next mobile release boundary, but there is no durable cursor state — mobile clients request a new page 1 on cold start."
metrics:
  duration: ~75min
  completed: 2026-04-18
---

# Phase 43 Plan 11: Three-State Bot Toggle Summary

**One-liner:** Additive setBotMode() domain function + POST /api/mobile/conversations/:id/bot-mode + BotToggle + MuteDurationSheet shipping three-state on/off/muted-for-duration bot control per conversation, with resolveBotMode() read-side auto-resume so expired mutes coerce to 'on' on the next read; the existing web `toggleConversationAgent` and legacy `agent_conversational` column are untouched (Regla 6 satisfied).

## Server Domain Function

**File:** `src/lib/domain/conversations/set-bot-mode.ts`

```typescript
export async function setBotMode(
  ctx: DomainContext,
  params: SetBotModeParams
): Promise<DomainResult<SetBotModeResult>>

// params.mode: 'on' | 'off' | 'muted'
// params.muteUntil: Date | null  (required when mode === 'muted', must be in the future)

// Returns { conversationId, bot_mode, bot_mute_until: ISO | null }
```

**Invariants enforced (client-side + DB CHECK constraint):**
- `mode === 'muted'` ⇒ `muteUntil` is a Date strictly in the future
- `mode === 'on' | 'off'` ⇒ `muteUntil === null`

**Regla 6 (protect production agent)** — the existing `src/app/actions/agent-config.ts::toggleConversationAgent` server action and the production agent runtime reader (`src/lib/agents/production/agent-config.ts`) are untouched. They continue to read/write the legacy `agent_conversational` tri-state boolean. New mobile code writes exclusively to `bot_mode` + `bot_mute_until` via this new additive function. A future consolidation plan will unify the two columns; until then both coexist per the Plan 43-01 migration.

## resolveBotMode() Implementation

**File:** same as above (`set-bot-mode.ts`, exported helper).

```typescript
export function resolveBotMode(row: { bot_mode: BotMode | null; bot_mute_until: string | null })
  : { bot_mode: BotMode; bot_mute_until: string | null }
```

**Logic:**
1. If `bot_mode !== 'muted'` ⇒ pass through (clear any stray mute_until for defensive cleanliness).
2. If `bot_mode === 'muted'` but `mute_until` is null or un-parseable ⇒ coerce to `'on'`.
3. If `bot_mode === 'muted'` and `mute_until <= now()` ⇒ coerce to `'on'`, clear the timestamp.
4. Otherwise pass through.

**Purity:** the function does NOT write to the DB. It returns a coerced snapshot for serialization only. A future worker can bulk-update expired rows; until then the read path is idempotent and cheap.

**Where it's applied in this plan:** `GET /api/mobile/conversations` maps every row through `resolveBotMode` before returning. The messages endpoint does not surface `bot_mode` so no change there. The contact endpoint also does not surface `bot_mode`.

## Endpoint Contract

**`POST /api/mobile/conversations/:id/bot-mode`**

**Auth:** `Authorization: Bearer <jwt>` + `x-workspace-id: <uuid>` (via `requireMobileAuth`).

**Request (`MobileBotModeRequestSchema`):**
```json
{ "mode": "on" | "off" | "muted", "muteUntil": "2026-04-18T23:59:59-05:00" | null }
```

**Response (`MobileBotModeResponseSchema`):**
```json
{ "conversation_id": "uuid", "bot_mode": "on" | "off" | "muted", "bot_mute_until": "ISO | null" }
```

**Error mapping:**
| Condition | Status | `error` code |
|---|---|---|
| Missing / non-JSON body | 400 | `bad_request` |
| Zod shape mismatch | 400 | `bad_request` |
| `mode='muted'` + `muteUntil` in the past | 400 | `bad_request` |
| `mode='on'/'off'` + `muteUntil !== null` | 400 | `bad_request` |
| Conversation not in workspace | 404 | `not_found` |
| Auth failure | 401 | `unauthorized` |
| Anything else | 500 | `internal` |

## Mobile UI

### useBotToggle (hook)

**File:** `apps/mobile/src/hooks/useBotToggle.ts`

Cache-first + optimistic write pattern (same shape as `useContactPanel` / `useConversationMessages`):

1. **Mount:** reads `bot_mode` + `bot_mute_until` from `getCachedConversation(conversationId, workspaceId)`. If the row is absent (deep-link without inbox bootstrap), defaults to `'on'` / `null`.
2. **Client-side expiry coercion:** `coerceExpired(mode, muteUntilMs)` mirrors `resolveBotMode`. Runs on load AND on a 30s interval while `mode === 'muted'` so the header flips to `'on'` the moment the horizon passes, without waiting for a refetch.
3. **setBotMode(next):**
   - Invariant check (muteUntil future for muted, null otherwise).
   - Optimistic local state + sqlite cache update via `updateCachedConversationBotMode()`.
   - POST `/api/mobile/conversations/:id/bot-mode` with Zod-validated body.
   - On success: reconcile state + cache from server response.
   - On error: revert local state + cache to the pre-write snapshot.

### BotToggle (component)

**File:** `apps/mobile/src/components/chat/BotToggle.tsx`

Three-state segmented control rendering in the chat header:

| State | Icon | Label | Palette |
|---|---|---|---|
| `on` | `Bot` (lucide) | "Bot activo" | success foreground |
| `off` | `BotOff` | "Bot apagado" | muted foreground |
| `muted` | `Clock` | "Silenciado · Xm/Xh" (via date-fns formatDistanceToNow es) | warning foreground + border |

**Gestures:**
- **Short tap** (mode ≠ muted): cycles on ↔ off.
- **Short tap** (mode = muted): re-opens `MuteDurationSheet` to CHANGE the duration.
- **Long-press** (500ms, any mode): opens `MuteDurationSheet` to mute or change duration.
- **X button** (mode = muted only): clears the mute back to `'on'`.

**Pending indicator:** while the server write is in flight, the icon is replaced by an ActivityIndicator and further gestures are allowed but will queue through React state updates.

### MuteDurationSheet (component)

**File:** `apps/mobile/src/components/chat/MuteDurationSheet.tsx`

Bottom-anchored Modal with four options:
- `30 minutos` → `Date.now() + 30 * 60_000`
- `1 hora` → `Date.now() + 3_600_000`
- `2 horas` → `Date.now() + 7_200_000`
- `Hasta el final del día` → `endOfDayBogotaMs()` — builds `YYYY-MM-DDT23:59:59-05:00` from `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' })` and lets `Date.parse` produce the correct UTC epoch ms (Colombia has no DST per tz database).

No gesture handling beyond tap — cancel via X, backdrop, or the explicit Cancelar button. No `@gorhom/bottom-sheet` — a plain Modal is sufficient for this four-option picker and avoids any gesture surface that could collide with MessageList scroll.

### ChatHeader (component)

**File:** `apps/mobile/src/components/chat/ChatHeader.tsx`

Extracted from the inline header in `app/chat/[id].tsx`. Preserves Plans 08/10b UX invariants (back button + contact title + info drawer button) and adds the `BotToggle` before the info button. Pure presentational — all state lives in the screen.

### i18n Keys Added

- `chat.bot.on` / `chat.bot.off` / `chat.bot.muted`
- `chat.bot.muted_until` (interpolates `{{time}}`)
- `chat.bot.clear_mute`
- `chat.bot.mute.title` / `chat.bot.mute.30m` / `chat.bot.mute.1h` / `chat.bot.mute.2h` / `chat.bot.mute.eod`
- `chat.bot.a11y.toggleHint` / `chat.bot.a11y.mutedHint`

## Web-Untouched Confirmation

Grep of files NOT modified by this plan:

- `src/app/actions/agent-config.ts` — `toggleConversationAgent` server action: untouched.
- `src/lib/agents/production/agent-config.ts` — runtime reader of `agent_conversational`: untouched.
- `src/app/(dashboard)/whatsapp/components/chat-header.tsx` — web chat header that renders the agent toggle: untouched.
- `src/app/(dashboard)/whatsapp/components/agent-config-slider.tsx` — web agent toggle UI: untouched.
- `src/app/(dashboard)/agentes/components/config-panel.tsx` — web config panel: untouched.
- `src/inngest/functions/agent-timers.ts` + `agent-timers-v3.ts` — agent runtime timers: untouched.

The new `bot_mode` column is only written by this plan's mobile path. The existing web surfaces continue to read/write `agent_conversational`. Regla 6 is satisfied: **no change in production agent behavior**.

## Bonus: Inbox Sort Parity with Web (fix 43-07)

Per the user's request bundled with Plan 11, the mobile inbox now orders conversations by `last_customer_message_at DESC NULLS LAST` (primary key — matches the web's ordering so outbound bot replies do NOT bump the thread to the top), with `last_message_at DESC NULLS LAST` as the tiebreaker and `id DESC` as the final tiebreaker for identical timestamps.

**Changes:**
- `src/app/api/mobile/conversations/route.ts`:
  - Triple `.order(...)` clause on the PostgREST query.
  - Cursor format extended to include `last_customer_message_at` (base64 of three tokens pipe-separated, with `'null'` as the sentinel when the primary key is NULL).
  - Cursor predicate emulates strict lexicographic inequality with nested `.or()` — PostgREST has no tuple comparator. NULLS LAST semantics respected.
- `apps/mobile/src/lib/db/conversations-cache.ts`:
  - `listCachedConversations` ORDER BY parallels the server: `col IS NULL` tiebreakers force NULLS LAST in sqlite.
  - No schema migration required — `last_customer_message_at` was already added to the sqlite cache in Plan 43-05 (migration 1 / schema.ts).

**Committed as a separate atomic commit** `9dfdc4a` labeled `fix(43-07): ordenar inbox por last_customer_message_at (match web)`.

## Tasks Completed (Autonomous)

| # | Task | Commit | Files |
|---|---|---|---|
| 1 | Domain function + POST route + resolveBotMode on GET list | `6ab1f5b` | src/lib/domain/conversations/set-bot-mode.ts, src/app/api/mobile/conversations/[id]/bot-mode/route.ts, src/app/api/mobile/conversations/route.ts, shared/mobile-api/schemas.ts |
| — | Bonus inbox sort fix (43-07) | `9dfdc4a` | src/app/api/mobile/conversations/route.ts, apps/mobile/src/lib/db/conversations-cache.ts |
| 2 | Mobile hook + BotToggle + MuteDurationSheet + ChatHeader + wiring + i18n | `57d0d26` | apps/mobile/src/hooks/useBotToggle.ts, apps/mobile/src/components/chat/{BotToggle,MuteDurationSheet,ChatHeader}.tsx, apps/mobile/app/chat/[id].tsx, apps/mobile/src/lib/api-schemas/bot-mode.ts, apps/mobile/src/lib/i18n/es.json |
| 3 | Device verification | **PENDING** | checkpoint:human-verify |

All auto tasks passed `npx tsc --noEmit` on both the web and mobile scopes. The Metro bundle smoke test (`cd apps/mobile && npx expo export --platform android --output-dir /tmp/morfx-bundle-11-test`) produced a 9.21 MB Android bundle with zero resolution errors. Output cleaned up after verification. Pushed to `origin/main` per Regla 1.

## Native-Dependency Audit

**New native deps added by this plan:** NONE.

Everything ships with RN built-ins already in the existing APK (built from commit `20081c7` per prompt context):
- `Modal`, `Pressable`, `ActivityIndicator`, `View`, `Text` — RN core
- `SafeAreaView` — already from `react-native-safe-area-context`
- `lucide-react-native` icons (`Bot`, `BotOff`, `Clock`, `X`, `ChevronLeft`, `Info`) — already installed, JS-only, no native module
- `date-fns` + `es` locale — already installed, JS-only
- `@react-native-async-storage/async-storage` (transitively via cache) — already installed and native-linked
- `expo-sqlite` (via `@/lib/db/conversations-cache`) — already installed and native-linked

**`@gorhom/bottom-sheet` is installed** from prior work but NOT used by this plan. MuteDurationSheet uses a plain RN Modal.

**Verdict: No new APK build required.** The currently-installed APK (commit `20081c7`) can run all Plan 11 code via `eas update --platform android` OR local `expo start` dev reload — the user's discretion, but no `eas build` is needed.

## Deviations from Plan

### Rule 2 — Missing critical: mobile-side schema duplication required by Metro

Known pattern from Plans 07/08. Created `apps/mobile/src/lib/api-schemas/bot-mode.ts` as a byte-compatible local copy of the two new schemas in `shared/mobile-api/schemas.ts`. Metro (Expo bundler) cannot resolve imports outside `apps/mobile/` even when `npx tsc --noEmit` passes (monorepo tsconfig path resolution differs from Metro). Metro bundle smoke test confirmed the mobile copy resolves cleanly.

**Impact:** purely additive. Source of truth remains `shared/mobile-api/schemas.ts`; a header comment in `bot-mode.ts` reminds that both files must change in lockstep.

### Rule 2 — Missing critical: client-side auto-expiry coercion

Plan text described read-side `resolveBotMode` server coercion but didn't specify client-side parity. The server only coerces on fetch; if the mobile app is backgrounded past a mute horizon and then foregrounded, the user sees a stale "Silenciado" label until the next API refetch.

**Fix:** `coerceExpired` in `useBotToggle.ts` (and a 30s ticker while `mode === 'muted'`) mirrors the server logic, so the header flips to `'on'` at the exact moment the horizon passes. Zero extra network calls.

### Rule 1 — Bug: `date-fns/locale/es` vs `date-fns/locale` import discrepancy

First drafted `BotToggle.tsx` with `import { es } from 'date-fns/locale/es'` but the rest of the mobile codebase uses `import { es } from 'date-fns/locale'`. Aligned to the project convention before committing.

### Deferred feature set (intentional, NOT a deviation)

Plan frontmatter explicitly defers the following to v1.1 — NOT included in this plan by design:
- Archive/Unarchive header action
- Assign-to-user (AssignDropdown) header action
- Header-level conversation tag input (covered by CRM drawer's TagEditor)

These are noted here so the verifier doesn't flag them as missing.

### Bonus (not a deviation): inbox sort fix

Per the user's request bundled with this plan, the mobile inbox sort changed from `last_message_at DESC` to `last_customer_message_at DESC NULLS LAST` (match web). Committed as a separate atomic commit `9dfdc4a` (label `fix(43-07)`) so it can be reverted independently if needed.

**Total:** 3 auto-fixed deviations + 1 additive bonus. No Rule 4 architectural asks. No auth gates.

## Sanity Checks Performed

| Check | Result |
|---|---|
| `npx tsc --noEmit` (web scope) | Clean — no new errors. Pre-existing `vitest` missing errors in `src/__tests__/**` are out of scope. |
| `cd apps/mobile && npx tsc --noEmit` | Clean — 0 errors. |
| `cd apps/mobile && npx expo export --platform android` | Clean — 9.21 MB Android bundle, 0 resolution errors, no cross-boundary import issues. Bundle dir cleaned up. |
| Web `toggleConversationAgent` grep | Untouched — all web references intact. |
| `agent_conversational` column references | All 7 pre-existing web paths untouched (web actions, agent-timers, config panel, chat-header, agent-config readers). |
| Regla 3 (domain layer for mutations) | Route handler calls `setBotMode()`; no `createAdminClient` in the route. |
| Regla 2 (Bogota timezone) | `endOfDayBogotaMs()` uses `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' })` + stable `-05:00` offset anchor. |
| Regla 5 (migration before code) | Plan 43-01's migration is already in production per its SUMMARY (applied 2026-04-09). No new migration in this plan. |
| Regla 6 (protect production agent) | `agent_conversational` untouched; new code writes exclusively to `bot_mode` / `bot_mute_until`. |
| Post-commit deletion check | No unintentional deletions across the three commits. |
| Push | `origin/main` at `57d0d26`. |

## What the User Must Verify in Task 3 (checkpoint:human-verify)

From the plan's checklist. User verifies on both physical devices:

### Setup

1. Ensure the currently-installed APK on the Android device is from commit `20081c7` OR later. (Plan 11 ships JS-only, no native module changes; `eas update --platform android` or local `expo start` dev reload is enough.)
2. Open a conversation on the mobile app.

### Functional checks

3. **Three-state display:** the chat header shows a bot toggle chip. Initial state reflects the server: "Bot activo" for new/default conversations, "Bot apagado" for any previously set to `mode='off'`, "Silenciado · …" for `mode='muted'` with a future horizon.
4. **Tap cycles on ↔ off:** tap the chip on an "on" conversation → becomes "Bot apagado" with muted foreground. Tap again → becomes "Bot activo" with success foreground. Behind the scenes, POST `/api/mobile/conversations/:id/bot-mode` fires each time.
5. **Long-press opens the sheet:** press and hold the chip for ~500ms (both iOS and Android). The `MuteDurationSheet` slides up from the bottom showing four options: **30 minutos**, **1 hora**, **2 horas**, **Hasta el final del día**, plus a **Cancelar** button.
6. **Pick "30 minutos":** sheet closes. Header chip becomes "Silenciado · 30 minutos" (or "en 30 minutos" depending on date-fns locale formatting). Chip palette shifts to warning color and an X icon appears next to the label.
7. **Tap the X:** the mute clears — chip returns to "Bot activo".
8. **Pick "Hasta el final del día":** label should show the distance from now to the next 23:59:59 America/Bogota. E.g. if it's 14:00 Bogota time, label reads something like "Silenciado · alrededor de 10 horas".
9. **Server authority + optimistic UX:** toggle rapidly twice (on → off → on). The chip should update immediately on each tap (optimistic) even while the network round-trip is in flight. If the network fails, the state should revert and an error logged in the console.
10. **Auto-resume on read (server resolveBotMode):** on the admin database console (Supabase), manually `UPDATE conversations SET bot_mode='muted', bot_mute_until = now() - interval '1 minute' WHERE id = '<some-conversation-id>';` and then pull-to-refresh the inbox OR re-open the conversation on mobile. The chip should show "Bot activo" (the server coerced the expired mute on the way out).
11. **Auto-resume on read (client coerceExpired):** set a 30-second mute, leave the screen open, watch the 30s ticker — the chip should flip to "Bot activo" when the horizon passes without any user action.

### Regression checks (UX invariants from prior plans)

12. **SafeAreaView:** header does not clip into the device notch/status bar.
13. **KeyboardAvoidingView:** open the composer, type, send. The list scrolls correctly on both iOS (`padding`) and Android (`height`).
14. **MessageInput.onSent:** after a send, the bubble paints immediately (refreshFromCache invariant preserved).
15. **MessageList maintainVisibleContentPosition:** scrolling near the top of a conversation doesn't jump when new messages arrive at the bottom.
16. **Inbox useFocusEffect:** pulling back to the inbox from the chat refreshes the unread badge / last message (Plan 43-07 fix preserved).
17. **Dark mode:** toggle system theme. All new surfaces (BotToggle, MuteDurationSheet, ChatHeader) must remain readable and properly contrasted. All colors route through `useTheme()`.

### Web unchanged

18. On web, open a conversation and use the existing agent toggle (chat-header / agent-config-slider). Confirm the web toggle still works exactly as before. Regla 6: production agent behavior unchanged.

### Bonus: inbox sort parity

19. In the web inbox, note the order of conversations.
20. Open the mobile inbox. Order should match the web — specifically, conversations with recent **customer** inbound messages should be at the top, even if the BOT has replied since then (outbound replies do NOT bump the conversation).

**The executor does NOT run these checks on a device.** Per the plan's `type="checkpoint:human-verify"` protocol, the user verifies on real devices and reports back. If anything fails, this SUMMARY + the three commit hashes give the next session everything needed to patch forward.

## Pushed

- `6ab1f5b` (Task 1 server) → `origin/main`
- `9dfdc4a` (bonus 43-07 sort fix) → `origin/main`
- `57d0d26` (Task 2 mobile UI — tip) → `origin/main`

Regla 1 satisfied. No `eas update` / `eas build` issued per user's explicit instruction — user runs `eas update --platform android` at their discretion once they confirm behavior via `expo start` on the development build.

## Open / Follow-ups

- **Plan 11 checkpoint verification pending.** User runs the 20-point verification above.
- **Auto-resume worker** — `resolveBotMode` already covers the read path, but a Postgres cron or Inngest worker that flips expired `bot_mode='muted'` rows to `'on'` in the DB would keep the DB and the UI in exact agreement without the read-side detour. Out of scope for Plan 11; reserved for a later cleanup plan.
- **Agent column consolidation** — Plan 43-01's migration left `agent_conversational` (legacy tri-state boolean) and `bot_mode` (new three-state enum) coexisting. Web still reads/writes the legacy column; mobile reads/writes the new column. A future consolidation plan must:
  1. Audit all 7 web paths that touch `agent_conversational`.
  2. Introduce a shared reader (domain-layer) that returns the three-state mode regardless of source column.
  3. Migrate web writes to the new column with a feature flag (Regla 6).
  4. Drop `agent_conversational` once the migration is fully in production for ≥1 cycle.
- **Inbox cursor format bump.** The `last_customer_message_at` field in the cursor broke backward compatibility with any cursor minted by an older mobile build. No durable state stores cursors, so the impact is zero in practice (each cold start re-requests page 1 with no cursor). Documented here for awareness during any future cursor-format changes.
- **Docs updates (Regla 4).** `docs/analysis/04-estado-actual-plataforma.md` and `docs/roadmap/features-por-fase.md` should note the new mobile bot toggle. Deferred to the end-of-phase docs pass (pattern from Plans 07/08).

## Self-Check: PASSED

Created files (all present on disk):
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/domain/conversations/set-bot-mode.ts`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/api/mobile/conversations/[id]/bot-mode/route.ts`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/hooks/useBotToggle.ts`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/components/chat/BotToggle.tsx`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/components/chat/MuteDurationSheet.tsx`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/components/chat/ChatHeader.tsx`
- `/mnt/c/Users/Usuario/Proyectos/morfx-new/apps/mobile/src/lib/api-schemas/bot-mode.ts`

Modified files (all present with expected content):
- `shared/mobile-api/schemas.ts` — MobileBotModeRequestSchema + MobileBotModeResponseSchema
- `src/app/api/mobile/conversations/route.ts` — resolveBotMode applied + sort-by-last_customer_message_at + 3-tuple cursor
- `apps/mobile/src/lib/db/conversations-cache.ts` — ORDER BY last_customer_message_at NULLS LAST
- `apps/mobile/app/chat/[id].tsx` — ChatHeader + useBotToggle + MuteDurationSheet wired
- `apps/mobile/src/lib/i18n/es.json` — chat.bot.* keys

Commits (verified via `git log --oneline`):
- `6ab1f5b` feat(43-11): setBotMode domain + POST bot-mode endpoint + resolveBotMode
- `9dfdc4a` fix(43-07): ordenar inbox por last_customer_message_at (match web)
- `57d0d26` feat(43-11): mobile three-state bot toggle UI

Pushed: `origin/main` at `57d0d26`.

Build verifications:
- `npx tsc --noEmit` (web scope) — clean, 0 new errors
- `cd apps/mobile && npx tsc --noEmit` — clean, 0 errors
- `cd apps/mobile && npx expo export --platform android --output-dir /tmp/morfx-bundle-11-test` — 9.21 MB bundle, 0 resolution errors. `/tmp/morfx-bundle-11-test` cleaned up.

---
*Phase: 43-mobile-app*
*Plan: 11*
*Completed (auto tasks): 2026-04-18*
*Checkpoint Task 3 pending human verification on device.*
