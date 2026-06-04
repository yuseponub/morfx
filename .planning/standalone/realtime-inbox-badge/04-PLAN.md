---
phase: standalone-realtime-inbox-badge
plan: 04
type: execute
wave: 3
depends_on: [05, 06, 07]
files_modified: []
autonomous: false
requirements:
  - RQ-1
  - RQ-2
  - RQ-3
user_setup: []

must_haves:
  truths:
    - "FRESH LOAD: on a brand-new /whatsapp load with a manager account, the inbox badge/preview/order update in real time with NO reload — validates the Plan 05 token-before-subscribe PRIMARY fix (RQ-1)"
    - "Inbox badge updates without a manual reload after >65min idle (JWT expiry) — validates the KEPT RealtimeAuthProvider (secondary, RQ-2)"
    - "Realtime re-syncs <2s after returning to a slept tab — validates the KEPT useRealtimeReconnect visibilitychange (secondary, RQ-2)"
    - "Realtime re-syncs without reload after a wifi drop/recover — validates the KEPT useRealtimeReconnect online (secondary, RQ-2)"
    - "Chat receives a message from another device live, including on a fresh load and after 65min — validates token-before-subscribe + React Query + setAuth"
    - "/whatsapp hydrates with no React #418 in the console — validates Plan 07 (RQ-3)"
  artifacts: []
  key_links: []
---

> SUPERSEDES the original Plan 04. This plan was REVISED IN PLACE (2026-06-03). The original 04 was written for the layered-only fix (Plans 01-03) before the confirmed token-before-subscribe root cause. It now validates the COMPLETE fix: Plan 05 (primary, fresh-load) + the KEPT secondary layers (Plans 01-03) + Plan 07 (#418), live on Vercel AFTER the Plan 06 local harness PASSES.

<objective>
Live UAT on Vercel of the COMPLETE realtime fix, with a MANAGER account (D-15).

Sequencing (Regla 1 — push before asking the user to test; no blind deploy): this plan runs ONLY AFTER Plan 06's local harness PASSES (`gtCount>0 && browserRtCount>0`). Then push `main` to Vercel (Plans 05+07 code), wait for the deploy, and run the scenarios on the live deploy.

Two classes of scenario:
- NEW (validates the Plan 05 PRIMARY fix, RQ-1): the FRESH-LOAD scenario — the bug was "every load, anon token at first join → mute". A fresh load now delivering realtime is the core proof.
- KEPT (validates the secondary layers, RQ-2): the original 4 scenarios (JWT expiry, tab sleep, network drop, chat live + post-expiry) confirm RealtimeAuthProvider + useRealtimeReconnect still do their (now-secondary) jobs.
- Plus a quick #418 check (RQ-3): the live `/whatsapp` console is clean of React #418.

The temporary `[realtime:*]` + `New message received:` logging (D-14) is the live oracle — KEEP it (removal is a deferred follow-up, NOT this work).

Purpose: empirically confirm "que NUNCA falle de actualizarse en tiempo real" in production.
Output: a checkpoint with pass/fail per scenario. On pass, the standalone fix is confirmed; logging removal + Capa 4 + kanban/metricas extension remain deferred follow-ups.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/realtime-inbox-badge/RESEARCH.md
@.planning/standalone/realtime-inbox-badge/CONTEXT.md
@.planning/debug/realtime-inbox-badge.md
@.planning/standalone/realtime-inbox-badge/05-SUMMARY.md
@.planning/standalone/realtime-inbox-badge/06-SUMMARY.md
@.planning/standalone/realtime-inbox-badge/07-SUMMARY.md
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Push the complete fix to Vercel (Regla 1) — gated on Plan 06 PASS</name>
  <read_first>
- 06-SUMMARY.md — confirm the local harness PASSED (gtCount>0 && browserRtCount>0). If it did NOT pass, STOP and report back; do not deploy a fix the harness did not validate (no blind deploy).
- CLAUDE.md Regla 1 (push to Vercel after code changes before asking the user to test) + pnpm-only constraint.
  </read_first>
  <action>
1. Verify Plan 06's harness PASSED (read 06-SUMMARY.md). If it FAILED or was could-not-run-and-the-user-checkpoint-did-not-approve, STOP — return to Plan 05. Do NOT push an unvalidated fix.
2. Confirm the working tree has the Plan 05 + Plan 07 commits on `main` and that the build is green: `pnpm build` (pnpm ONLY — never npm; npm broke pnpm-lock → 4 broken deploys).
3. Push `main` to origin so Vercel deploys: `git push origin main`. (Plans 05/06/07 commits are already on main from their execution; this push triggers the deploy.)
4. Wait for the Vercel deploy of `main` to finish; capture the deploy URL (preview or prod) for the user checkpoint.
  </action>
  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && git log --oneline origin/main -5 2>&1 | head -5</automated>
  </verify>
  <acceptance_criteria>
- 06-SUMMARY.md records a harness PASS (or an approved user checkpoint) BEFORE this push — verified by reading it.
- `pnpm build` completes green (no npm anywhere).
- `git push origin main` succeeded; `git log origin/main` includes the Plan 05 + Plan 07 commits.
- A Vercel deploy URL is captured for the checkpoint.
  </acceptance_criteria>
  <done>The complete fix (Plan 05 token-before-subscribe + Plan 07 #418) is deployed to Vercel from main, only after the Plan 06 local harness PASSED. Deploy URL ready for live UAT.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
The COMPLETE realtime fix is live on Vercel:
- Plan 05 (PRIMARY, RQ-1): token-before-subscribe — both `use-conversations.ts` (inbox) and `use-messages.ts` (chat) await `getSession()` + `realtime.setAuth(token)` before `.subscribe()`, so the first `phx_join` carries the USER JWT (not anon). This repairs the every-load mute that the layered fix could not.
- Plans 01-03 (KEPT, secondary, RQ-2): browser singleton + `RealtimeAuthProvider` (setAuth on TOKEN_REFRESHED) + `useRealtimeReconnect` (visibilitychange + online + 45s watchdog). Still wired — not deleted.
- Plan 07 (RQ-3): React #418 hydration fix on `/whatsapp`.
- The `[realtime:*]` + `New message received:` logging is KEPT (D-14) as the live oracle.
  </what-built>
  <how-to-verify>
Use a **MANAGER account** (D-15 — a non-manager legitimately does NOT receive realtime for conversations assigned to others; correct RLS, not a bug). Use the latest Vercel deploy of `main`. Open DevTools console to watch `[realtime:*]` lines.

**Scenario 0 — FRESH LOAD (validates Plan 05 PRIMARY fix, RQ-1) — THE CORE PROOF:**
  1. Open a NEW tab, navigate fresh to the WhatsApp inbox (do NOT rely on an already-open tab). Watch the console.
  2. From another device, send a NEW inbound message into the workspace (or wait for organic traffic on a high-traffic workspace like Somnio).
  3. EXPECTED: within ~2s the badge / `unread_count` / preview / conversation order update with NO reload, and `[realtime:inbox] conversation <eventType>` lines appear right after `status: SUBSCRIBED`. Before this fix, a fresh load showed `SUBSCRIBED` but ZERO conversation events (silent mute, anon token at join).

**Scenario 0b — #418 check (validates Plan 07, RQ-3):**
  1. On that fresh `/whatsapp` load, scan the console.
  2. EXPECTED: NO React error #418 ("Text content does not match server-rendered HTML" / "Minified React error #418").

**Scenario 1 — JWT expiry (validates KEPT RealtimeAuthProvider, secondary):**
  1. Leave the inbox tab open and active (do NOT reload) for >65 minutes so the JWT refreshes at least once.
  2. Send a NEW inbound message. EXPECTED: badge updates WITHOUT a reload — setAuth re-armed the socket on TOKEN_REFRESHED.

**Scenario 2 — tab sleep (validates KEPT useRealtimeReconnect visibilitychange, secondary):**
  1. With the inbox open, switch to another tab / minimize for several minutes, then return.
  2. EXPECTED: realtime is alive or re-synchronizes within ~2s (visibilitychange fires fetchConversations).

**Scenario 3 — network drop (validates KEPT useRealtimeReconnect online, secondary):**
  1. With the inbox open, disconnect wifi ~30s, then reconnect.
  2. EXPECTED: realtime re-synchronizes WITHOUT a reload after the `online` event.

**Scenario 4 — chat live + fresh + post-expiry (validates token-before-subscribe + React Query + setAuth):**
  1. Open a conversation's chat FRESH. From another device, send a message into it. EXPECTED: appears live (`New message received:` logs; cache updates) — including on the fresh open (Plan 05).
  2. Repeat after 65min of the same session open: still appears live (no reload).

If ANY scenario still requires a manual reload, capture the console (was there a `[realtime:*] status:` transition or not?) and report it.
  </how-to-verify>
  <resume-signal>Type "approved" if Scenario 0 (fresh load) AND the 4 secondary scenarios pass with a manager account, AND no #418 in the console. Otherwise describe which scenario failed + the console output around the failure.</resume-signal>
</task>

</tasks>

<verification>
- Plan 06 local harness PASSED before the Vercel push (no blind deploy).
- Scenario 0 (fresh load) passes — the PRIMARY token-before-subscribe fix delivers realtime on a brand-new load (RQ-1).
- The 4 secondary scenarios pass — KEPT RealtimeAuthProvider + useRealtimeReconnect still work (RQ-2).
- No React #418 on a live `/whatsapp` load (RQ-3).
- No manual reload required in any scenario.
- `[realtime:*]` logging present and used as the oracle (kept per D-14).
</verification>

<success_criteria>
- Empirical confirmation in production that inbox badge AND chat deliver realtime on a FRESH load and self-heal across JWT expiry, tab sleep, and network drop — no reload ever required.
- /whatsapp hydrates with no #418.
- Standalone fix confirmed. Deferred follow-ups (NOT in scope here): remove temporary `[realtime:*]` logging once prod-confirmed (D-14); Capa 4 double-UPDATE cleanup (D-12); optionally extend useRealtimeReconnect to kanban/metricas (D-07 optional).
</success_criteria>

<output>
After approval, create `.planning/standalone/realtime-inbox-badge/04-SUMMARY.md` recording the per-scenario results (Scenario 0 fresh-load result first), the deploy URL, and the deferred follow-ups (logging removal, Capa 4, kanban/metricas extension).
</output>
