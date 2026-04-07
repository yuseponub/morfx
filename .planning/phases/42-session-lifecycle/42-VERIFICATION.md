---
phase: 42-session-lifecycle
verified: 2026-04-07T00:00:00Z
status: passed
score: 11/11 must-haves verified
gaps: []
---

# Phase 42: Session Lifecycle Verification Report

**Phase Goal:** Los agentes conversacionales (Somnio V3, GoDentist, Somnio Recompra) cierran sesiones terminadas y abren sesiones frescas cuando el cliente vuelve a escribir despues de un ciclo conversacional concluido, eliminando el reuso de state fosilizado y los errores de unique constraint que hoy dejan al bot sin responder a clientes recurrentes.

**Verified:** 2026-04-07 (post-UAT code audit)
**Status:** PASSED
**Re-verification:** No — initial verification (post-UAT)

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Cliente con conversacion cerrada vuelve a escribir y recibe respuesta normal desde cero | VERIFIED | Partial unique index (migration 20260410000000) allows new active session to be created after previous session is closed/handed_off. UAT confirmed with +573137549286. |
| 2 | DB muestra multiples filas en agent_sessions para mismo (conv, agent) para clientes con varios ciclos | VERIFIED | Partial unique index `WHERE status='active'` allows N historical closed rows. UAT confirmed via GROUP BY query showing 3 rows for test user. |
| 3 | Cron ejecuta 02:00 COT diario, logea count de cerradas; sesiones con actividad post-medianoche sobreviven | VERIFIED | `closeStaleSessionsCron` registered in route.ts, uses `TZ=America/Bogota 0 2 * * *`, calls TZ-safe RPC. UAT: cron auto-ran Apr 7 at 02:00 Bogota, closed 774 sessions, cutoff respected. |
| 4 | Clientes previamente bloqueados por handed_off + unique constraint ahora reciben respuesta; no hay errores 23505 en logs | VERIFIED | Partial unique index eliminates the constraint violation. 23505 retry-on-race guard in `SessionManager.createSession` handles concurrent webhooks. UAT: pre-existing `handed_off` session from Apr 2 did not block test user. |
| 5 | Sesiones activas en curso al momento del deploy no sufren regresion; migracion sin downtime | VERIFIED | Migration uses `DROP CONSTRAINT IF EXISTS` + `CREATE UNIQUE INDEX IF NOT EXISTS` (idempotent, non-destructive to live rows). 7-day pre-sweep in 05-PLAN drained legacy stale sessions before automated cron started. |

**Score:** 5/5 success criteria verified (all with UAT sign-off from user in prod, 2026-04-07)

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260410000000_session_lifecycle_partial_unique.sql` | DROP CONSTRAINT + CREATE UNIQUE INDEX WHERE status='active' | VERIFIED | Lines 16-30: `DROP CONSTRAINT IF EXISTS agent_sessions_conversation_id_agent_id_key` + `CREATE UNIQUE INDEX IF NOT EXISTS agent_sessions_one_active_per_conv_agent ... WHERE status = 'active'` |
| `supabase/migrations/20260410000001_close_stale_sessions_rpc.sql` | Initial RPC (superseded by 000002 in prod) | VERIFIED | 26 lines, defines `close_stale_agent_sessions()` with Bogota timezone math |
| `supabase/migrations/20260410000002_fix_close_stale_sessions_tz.sql` | TZ-safe RPC with `AT TIME ZONE 'America/Bogota'` outer wrap | VERIFIED | Line 29: `AT TIME ZONE 'America/Bogota'` wraps the naive midnight timestamp, converting it back to timestamptz before comparison. This is the RPC currently active in prod. |
| `src/inngest/functions/close-stale-sessions.ts` | Inngest cron function importing from admin, calling RPC, using correct cron string | VERIFIED | Line 11: `import { createAdminClient } from '@/lib/supabase/admin'`. Line 35: `{ cron: 'TZ=America/Bogota 0 2 * * *' }`. Line 39: `supabase.rpc('close_stale_agent_sessions')`. |
| `src/app/api/inngest/route.ts` | `closeStaleSessionsCron` imported AND in functions array | VERIFIED | Line 23: import. Line 58: in functions array. Both hits confirmed. |
| `src/lib/agents/timer-guard.ts` | Exports `checkSessionActive` and `guardTimerHandler` | VERIFIED | Lines 21 and 42: both functions exported. `checkSessionActive` does a single-column read by PK, returns `{ok: true}` only for `status='active'`. |
| `src/inngest/functions/agent-timers.ts` — guard calls | 1 import + 5 calls to `checkSessionActive` | VERIFIED | Line 22: import. Lines 289, 375, 453, 531, 628: 5 handler calls. 5 corresponding "Timer handler aborted: session no longer active" log messages at lines 293, 379, 457, 535, 632. |
| `src/inngest/functions/agent-timers-v3.ts` — guard calls | 1 import + 1 call to `checkSessionActive` | VERIFIED | Line 20: import. Line 261: call. Line 265: "V3 timer aborted: session no longer active" log message. |
| `src/lib/agents/session-manager.ts` — 23505 handler | Catch code 23505, call `getSessionByConversation` for recovery | VERIFIED | Lines 143-158: catches `error.code === '23505'`, calls `this.getSessionByConversation(...)`, returns existing session on success. Single recovery attempt, falls through on defensive edge case. |
| `docs/analysis/04-estado-actual-plataforma.md` | Phase 42 mention + 3 new tech debt items | VERIFIED | Line 108: bug corrected in Phase 42. Lines 172+: bugs resolved section. Lines 484-486: all 3 tech debt items present (SessionManager domain bypass, agent-production.ts:154 is_active column, Somnio V1 dead code). Line 524: update timestamp. |
| `LEARNINGS.md` (project root) | Phase 42 entry as first entry with TZ bug as headline lesson | VERIFIED | Lines 7-73: Phase 42 entry is first entry. Lines 9-28: "Headline lesson — Postgres timestamp/timestamptz cast trap (CRITICAL)" with canonical before/after SQL, empirical delta (26 sessions), and commit reference `f292264`. |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `close-stale-sessions.ts` | `close_stale_agent_sessions()` RPC | `createAdminClient().rpc(...)` | WIRED | Line 38-39: admin client created, RPC called inside `step.run`. Response consumed at line 44. |
| `route.ts` | `closeStaleSessionsCron` | functions array | WIRED | Import at line 23, array element at line 58. |
| `agent-timers.ts` (5 handlers) | `timer-guard.ts` | `checkSessionActive(sessionId)` | WIRED | All 5 handlers import and call `checkSessionActive`, abort on `!guardResult.ok` |
| `agent-timers-v3.ts` (1 handler) | `timer-guard.ts` | `checkSessionActive(sessionId)` | WIRED | Import + call confirmed at lines 20 and 261 |
| `session-manager.ts` | `getSessionByConversation` (self-recovery) | `error.code === '23505'` branch | WIRED | Lines 143-158: catch, recover, return existing session |
| Migration 000002 | Prod RPC (overrides 000001) | `CREATE OR REPLACE FUNCTION` | WIRED | Idempotent replace confirmed applied in prod (commit f292264). TZ-safe WHERE clause verified at line 27-30. |

---

## Requirements Coverage

All 5 success criteria from 42-CONTEXT.md §6 map directly to the verified truths above. UAT was executed in production by the user on 2026-04-07 with real data (godentist: 65 active/1398 closed/165 handed_off; somnio-sales-v3: 9 active/158 closed/16 handed_off post-cron). All 5 criteria received explicit PASS from user.

---

## Anti-Patterns Found

None that block goal achievement. Notable items (pre-existing, tracked as tech debt):

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `src/lib/agents/session-manager.ts` | Bypasses `src/lib/domain/` (Regla 3 exception) | Info — ratified debt | Regla 3 exception ratified in LEARNINGS; refactor deferred to dedicated phase |
| `src/lib/agents/production/agent-production.ts:154` | Queries non-existent `is_active` column | Warning — pre-existing | Out of scope Phase 42, tracked in tech debt list item 10 |
| Somnio V1 agent files | Dead code confirmed (0 active sessions, no live handlers) | Info | Tracked as tech debt item 11; candidate for deletion in cleanup phase |

No blockers. No placeholder implementations. No TODO/FIXME in Phase 42 deliverables.

---

## Human Verification Required

None. All 5 success criteria were verified by the user in production on 2026-04-07. Automated code audit above confirms all supporting artifacts match what the SUMMARYs claim.

---

## TZ Bug Deviation Audit

The major deviation flagged (TZ bug discovered during 05-PLAN) is fully accounted for:

- Migration 20260410000001 (original RPC): exists on disk, represents the first iteration
- Migration 20260410000002 (TZ fix): exists on disk with the correct `AT TIME ZONE 'America/Bogota'` outer wrap
- Both migrations are idempotent (`CREATE OR REPLACE`) — 000002 replaces 000001 in prod
- The TZ bug is documented as the headline lesson in LEARNINGS.md with the empirical delta (26 sessions), canonical SQL pattern, and commit reference
- The cron's first automated run (774 sessions, 2026-04-07 02:00 Bogota) was executed AFTER the fix was applied — all evidence consistent

No discrepancy between SUMMARY claims and actual code state found.

---

## Gaps Summary

No gaps. All 11 must-have artifacts exist, are substantive, and are wired. The TZ bug deviation is fully resolved and documented. UAT passed all 5 success criteria in production with real user data.

---

_Verified: 2026-04-07_
_Verifier: Claude (gsd-verifier)_
