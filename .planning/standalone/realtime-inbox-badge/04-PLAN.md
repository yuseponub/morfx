---
phase: standalone-realtime-inbox-badge
plan: 04
type: execute
wave: 3
depends_on: [01, 02, 03]
files_modified: []
autonomous: false
requirements:
  - UAT-LIVE-SOCKET
user_setup: []

must_haves:
  truths:
    - "Inbox badge updates without a manual reload after >65min idle (JWT expiry) — validates Capa 1 setAuth"
    - "Realtime re-syncs <2s after returning to a slept tab — validates Capa 2 visibilitychange"
    - "Realtime re-syncs without reload after a wifi drop/recover — validates Capa 2 online"
    - "Chat receives a message from another device live, including after 65min — validates React Query + setAuth"
  artifacts: []
  key_links: []
---

<objective>
Manually validate the layered fix live in the browser. There is NO automated harness that can reproduce a silently-dead WebSocket (it requires real ~65min JWT-expiry waits, real tab sleep, and a real network drop). This plan presents the 4 scenarios from CONTEXT.md / the debug file as a human-verify checkpoint, run with a MANAGER account (D-15) on the Vercel preview/prod deploy after Plans 01-03 are pushed.

Purpose: confirm "NUNCA falle de actualizarse en tiempo real" empirically. The temporary `[realtime:*]` logging (D-14) is the live oracle: after a failure scenario, a NEW `[realtime:*] status:` line means the socket transitioned; NO new status line while events resume confirms the silent-death hole (2d) is being healed by the browser-event re-sync, not by a status transition.

Output: a checkpoint with pass/fail for the 4 scenarios. On pass, this standalone's code fix is confirmed; logging removal becomes a follow-up (D-14 — NOT done here, gated on prod confirmation).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/realtime-inbox-badge/CONTEXT.md
@.planning/debug/realtime-inbox-badge.md
@.planning/standalone/realtime-inbox-badge/01-SUMMARY.md
@.planning/standalone/realtime-inbox-badge/02-SUMMARY.md
@.planning/standalone/realtime-inbox-badge/03-SUMMARY.md
</context>

<tasks>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
Plans 01-03 shipped to Vercel:
- Capa 1: browser-client singleton (`src/lib/supabase/client.ts`) + global `RealtimeAuthProvider` mounted once in the dashboard layout, wiring `onAuthStateChange (TOKEN_REFRESHED/SIGNED_IN) -> supabase.realtime.setAuth(session?.access_token)`.
- Capa 2 + Capa 3: shared `useRealtimeReconnect` hook (visibilitychange + online + 45s staleness watchdog) registered by `use-conversations.ts` (fetchConversations) and `use-messages.ts` (softRefetch).
- The temporary `[realtime:*]` + `New message received:` logging is intentionally KEPT (D-14) as the live oracle.
  </what-built>
  <how-to-verify>
Run all 4 scenarios with a **MANAGER account** (D-15 — a non-manager legitimately does NOT receive realtime for conversations assigned to others; that is correct RLS, not a bug). Use the latest Vercel deploy (preview or prod) of `main`. Open DevTools console to watch `[realtime:*]` lines.

**Scenario 1 — JWT expiry (validates Capa 1 setAuth, root cause 2a):**
  1. Open the WhatsApp inbox; leave the tab open and active (do NOT reload) for >65 minutes so the JWT refreshes at least once.
  2. From another phone/device, send a NEW inbound WhatsApp message into the workspace.
  3. EXPECTED: the badge / `unread_count` / preview / conversation order updates WITHOUT a manual reload.
  4. Console oracle: around the ~1h mark you should NOT need a new `[realtime:inbox] status:` transition for events to keep flowing — setAuth re-armed the socket. If events keep flowing after 65min, Capa 1 works.

**Scenario 2 — tab sleep (validates Capa 2 visibilitychange, 2b):**
  1. With the inbox open, switch to another tab / minimize for several minutes.
  2. Return to the inbox tab.
  3. EXPECTED: realtime is alive or re-synchronizes within ~2s (badge/preview reflect any messages that arrived while away). The `visibilitychange` re-sync fires `fetchConversations`.

**Scenario 3 — network drop (validates Capa 2 online, 2c):**
  1. With the inbox open, disconnect wifi for ~30s, then reconnect.
  2. EXPECTED: realtime re-synchronizes WITHOUT a manual reload after the `online` event.

**Scenario 4 — chat live + post-expiry (validates React Query + setAuth):**
  1. Open a conversation's chat. From another device, send a message into that conversation.
  2. EXPECTED: the message appears in the chat in real time (`New message received:` logs; cache updates).
  3. Repeat after 65min of the same session open: the message still appears live (no reload).

If ANY scenario still requires a manual reload, capture the console (was there a `[realtime:*] status:` transition or not?) and report it — that distinguishes a remaining silent-death hole from a different issue.
  </how-to-verify>
  <resume-signal>Type "approved" if all 4 scenarios pass with a manager account, or describe which scenario failed + the console output around the failure.</resume-signal>
</task>

</tasks>

<verification>
- All 4 live scenarios pass with a MANAGER account on the latest Vercel deploy.
- No manual reload required in any scenario.
- `[realtime:*]` logging present and used as the oracle (kept per D-14).
</verification>

<success_criteria>
- Empirical confirmation that inbox badge AND chat self-heal across JWT expiry, tab sleep, and network drop — no reload ever required.
- Standalone fix confirmed. Follow-ups (NOT in scope here): remove temporary `[realtime:*]` logging once prod-confirmed (D-14); Capa 4 double-UPDATE cleanup (D-12); optionally extend useRealtimeReconnect to kanban/metricas (D-07 optional).
</success_criteria>

<output>
After approval, create `.planning/standalone/realtime-inbox-badge/04-SUMMARY.md` recording the scenario results and the deferred follow-ups (logging removal, Capa 4, kanban/metricas extension).
</output>
