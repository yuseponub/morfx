---
phase: 43-mobile-app
plan: 11
type: execute
wave: 7
depends_on: [1, 3, 7, 8]
files_modified:
  - src/lib/domain/conversations/set-bot-mode.ts
  - src/app/api/mobile/conversations/[id]/bot-mode/route.ts
  - src/app/api/mobile/conversations/route.ts # edit — inject resolveBotMode on read
  - src/app/api/mobile/conversations/[id]/messages/route.ts # edit — inject resolveBotMode on read
  - shared/mobile-api/schemas.ts
  - apps/mobile/src/hooks/useBotToggle.ts
  - apps/mobile/src/components/chat/ChatHeader.tsx
  - apps/mobile/src/components/chat/BotToggle.tsx
  - apps/mobile/src/components/chat/MuteDurationSheet.tsx
  - apps/mobile/app/chat/[id].tsx
  - apps/mobile/src/lib/i18n/es.json
autonomous: false
must_haves:
  truths:
    - "Chat header shows a three-state bot toggle: On, Off, Muted (with time-until-resume)"
    - "Tapping the toggle cycles On → Off → On, except 'muted' which is entered via a long-press or secondary menu that opens a MuteDurationSheet"
    - "MuteDurationSheet offers: 30 min, 1 hora, 2 horas, Hasta el final del día (23:59 Bogota)"
    - "POST /api/mobile/conversations/:id/bot-mode routes through new domain function setBotMode() which writes to bot_mode + bot_mute_until per the migration in Plan 01"
    - "setBotMode domain function is ADDITIVE — does NOT alter the existing toggleConversationAgent used by web (Regla 6: production agent behavior not changed)"
    - "Mute auto-resume is handled by a scheduled worker (out of scope for this plan — will be added in a follow-up phase) OR by a simple check-on-read: when a conversation is loaded and bot_mute_until is in the past, the server coerces bot_mode to 'on' and clears bot_mute_until"
    - "UI is optimistic: state change reflects in the header instantly, reverts on server error"
    - "Mute-until display uses America/Bogota timezone per CLAUDE.md Regla 2"
    - "Archive/Unarchive header action is DEFERRED to v1.1 — low-frequency action per current web usage; mobile v1 chat header ships without it. Rationale: archiving is rarely used on the web and adds drawer+state complexity with little v1 payoff."
    - "Assign to user (AssignDropdown) header action is DEFERRED to v1.1 — multi-user assignment UX requires a user picker component not yet built for mobile and is not in the v1 MVP feature list. Solo operator can continue to assign from web."
    - "Conversation tag input directly on the chat header is DEFERRED to v1.1 — tag editing is already covered by the in-chat CRM drawer (Plan 10b TagEditor). A dedicated header input would duplicate that surface; users can tag via the drawer in v1."
  artifacts:
    - src/lib/domain/conversations/set-bot-mode.ts
    - src/app/api/mobile/conversations/[id]/bot-mode/route.ts
    - apps/mobile/src/components/chat/BotToggle.tsx
    - apps/mobile/src/components/chat/MuteDurationSheet.tsx
  key_links:
    - "Depends on Plan 01 migration already in production"
    - "Regla 6: new function coexists with existing web toggle — web behavior unchanged"
---

<objective>
Ship the three-state bot toggle in the chat header: On / Off / Muted-for-duration. This is the headline feature for bot control per 43-CONTEXT.md. The work touches the domain layer (new additive function), server API, and mobile UI.

Critical: Plan 01 must already be applied to production before this plan ships (Regla 5). And the new domain function must NOT replace the existing web `toggleConversationAgent` — it lives alongside it (Regla 6).

Output: server domain function + API endpoint + mobile header + mute duration bottom sheet.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/43-mobile-app/43-CONTEXT.md
@.planning/phases/43-mobile-app/43-RESEARCH.md
@.planning/phases/43-mobile-app/43-01-SUMMARY.md
@CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Domain function setBotMode + server coercion on read + mobile API route</name>
  <files>
    src/lib/domain/conversations/set-bot-mode.ts
    src/app/api/mobile/conversations/[id]/bot-mode/route.ts
    shared/mobile-api/schemas.ts
  </files>
  <action>
  1. `src/lib/domain/conversations/set-bot-mode.ts`: export
     ```
     async function setBotMode({ workspaceId, conversationId, mode, muteUntil }: {
       workspaceId: string; conversationId: string;
       mode: 'on' | 'off' | 'muted';
       muteUntil: Date | null;
     }): Promise<{ bot_mode: ..., bot_mute_until: ... }>
     ```
     Uses `createAdminClient()`, filters by workspace_id. For mode='muted', require muteUntil non-null and in the future. For other modes, muteUntil must be null. Updates the row and returns the new state.
     Also export `resolveBotMode(row)` — helper called by the read path in the conversation endpoints (Plan 07, Plan 08) that checks if `bot_mute_until < now` and, if so, coerces to mode='on' + clears muteUntil. This is the simple auto-resume strategy for v1 (no worker needed).
     IMPORTANT: do NOT modify the existing `toggleConversationAgent` or any web code. This file is additive (Regla 6). Add a comment at the top: "This function is additive. Existing web toggleConversationAgent is unchanged. Unification is a future phase."
  2. Apply `resolveBotMode` in the conversations list endpoint (Plan 07's route.ts) and the single-conversation read endpoint so that expired mutes don't appear as still-muted. This is a small edit to an existing file.
  3. Extend `schemas.ts` with `SetBotModeRequestSchema` = `{ mode: 'on'|'off'|'muted', muteUntil: string | null }` (ISO) and a response schema.
  4. `src/app/api/mobile/conversations/[id]/bot-mode/route.ts` POST: auth, parse body, call `setBotMode(...)`. Return the new state.</action>
  <verify>`npm run build` passes. curl with mode='muted' + a future ISO succeeds. curl with mode='muted' + past ISO 400s. curl with mode='on' + non-null muteUntil 400s.</verify>
  <done>Domain function + read-side coercion + endpoint ship. Web code untouched.</done>
</task>

<task type="auto">
  <name>Task 2: Mobile BotToggle + MuteDurationSheet + useBotToggle hook</name>
  <files>
    apps/mobile/src/hooks/useBotToggle.ts
    apps/mobile/src/components/chat/BotToggle.tsx
    apps/mobile/src/components/chat/MuteDurationSheet.tsx
    apps/mobile/src/components/chat/ChatHeader.tsx
    apps/mobile/app/chat/[id].tsx
    apps/mobile/src/lib/i18n/es.json
  </files>
  <action>
  1. `useBotToggle.ts`: holds local optimistic state `{ mode, muteUntil }`, initialized from the conversation row. Exposes `setBotMode(next)` that (a) updates local, (b) calls the API, (c) reverts + alerts on error. Also exposes a `timeUntilResume` computed string via date-fns `formatDistanceToNow` (Bogota-aware — the muteUntil is a UTC ISO, rendering uses locale es).
  2. `BotToggle.tsx`: custom segmented control with three visual states.
     - Tap: cycles On ↔ Off (no muted via tap)
     - Long-press or secondary icon opens the MuteDurationSheet
     - When mode='muted' the component shows "Silenciado por Xm" with an X to clear
  3. `MuteDurationSheet.tsx`: BottomSheetModal with four options — 30m, 1h, 2h, "Hasta el final del día" (compute 23:59:59 today in Bogota via `toLocaleString('sv-SE', { timeZone: 'America/Bogota' })` + set H/M/S). On pick, computes the UTC Date and calls `setBotMode({ mode: 'muted', muteUntil: date })`.
  4. `ChatHeader.tsx`: new component rendering in the chat screen top bar. Left: back button + contact name. Right: BotToggle + info-drawer button (from Plan 10). Uses theme.
  5. Wire ChatHeader into `app/chat/[id].tsx` replacing the minimal header built in Plan 08.
  6. i18n keys: `chat.bot.on`, `chat.bot.off`, `chat.bot.muted`, `chat.bot.mute.30m`, `chat.bot.mute.1h`, `chat.bot.mute.2h`, `chat.bot.mute.eod`, `chat.bot.muted_until`, `chat.bot.clear_mute`.
  </action>
  <verify>`npx tsc --noEmit` passes. Long-press opens the sheet on both iOS and Android.</verify>
  <done>UI ships.</done>
</task>

<task type="checkpoint:human-verify">
  <name>Task 3: Verify bot toggle on both devices</name>
  <files>n/a</files>
  <action>On both devices:
  1. Open a conversation. Header shows the current bot state.
  2. Tap toggle → cycles On/Off → confirm on web that the conversation's bot flag changed.
  3. Long-press → MuteDurationSheet opens → pick "30 min" → header shows "Silenciado por 30m" → behind the scenes bot_mute_until is set.
  4. On web, refresh the inbox — the mute state is visible (assuming the web has any UI for it; if not, verify via SQL query).
  5. Wait a bit or set mute to 1 min via the sheet (you may need to temporarily add a "1 min" option for testing; remove after) → after the minute expires, reopen the conversation — server-side resolveBotMode should coerce to 'on' and the header should show On.
  6. Confirm the EXISTING web bot toggle still works unchanged (open a conversation on web, toggle the agent, confirm no regression).

  Fix anything before marking done.</action>
  <verify>User confirms both devices + web unchanged.</verify>
  <done>Three-state bot toggle shipped.</done>
</task>

</tasks>

<verification>
- Plan 01 migration is already applied (confirmed by grep of current prod schema or user confirmation)
- Domain function is additive — existing web toggleConversationAgent untouched
- All display timestamps use America/Bogota (Regla 2)
- All writes go via domain (Regla 3)
- UI is optimistic with revert on error
</verification>

<success_criteria>
User can toggle bot on/off and mute for durations from the chat header. State persists. Auto-resume on read works. Web is unchanged.
</success_criteria>

<output>
Create `.planning/phases/43-mobile-app/43-11-SUMMARY.md` with: domain function signature, resolveBotMode implementation, web-untouched confirmation.
</output>
