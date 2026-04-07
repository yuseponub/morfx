# Phase 42 Plan 01: Pre-Deploy Diagnostics + Schema Migration — SUMMARY

**Plan:** 42-01
**Status:** COMPLETE
**Date:** 2026-04-07
**Wave:** 1 (migration-only, no code)

## Objective Recap

Produce the Wave 1 schema migration (partial unique index + `close_stale_agent_sessions()` RPC), document production diagnostics, and gate Wave 2 behind explicit user confirmation that prod has been migrated (Regla 5 / CLAUDE.md).

## Tasks Completed

| # | Task | Commit | Notes |
|---|------|--------|-------|
| 1 | Write diagnostic runbook (42-DIAGNOSTICS.md) | `c246943` | 6 queries Q1-Q6 with run order + interpretation |
| 2 | Partial unique index migration | `6d5bbe6` | `20260410000000_session_lifecycle_partial_unique.sql` |
| 3 | `close_stale_agent_sessions()` RPC migration | `8aadbd3` | `20260410000001_close_stale_sessions_rpc.sql` |
| 4 | PAUSE — user applied migration + ran diagnostics in prod | *(user action, no commit)* | Confirmed `done` + provided Q1-Q6 results |

## Production Verification (post-migration)

Verified directly in prod after user applied both migrations:

- `pg_indexes WHERE tablename='agent_sessions'` returned 6 indexes including `agent_sessions_one_active_per_conv_agent`. Old `agent_sessions_conversation_id_agent_id_key` constraint/index is gone.
- `pg_proc WHERE proname='close_stale_agent_sessions'` returned 1 row. RPC is callable.

Both success criteria from the plan's `<success_criteria>` are satisfied.

## Diagnostic Results (Q1–Q6)

| Q | Result |
|---|--------|
| **Q1** (constraint name) | `agent_sessions_conversation_id_agent_id_key` — matched expected, no migration edit needed |
| **Q2** (status counts) | `active`=2068, `handed_off`=306, no `closed`/`paused` rows exist |
| **Q3** (impact dimensioning) | `stale_24h`=1879, `stale_7d`=1258, `stale_30d`=295, **`stale_cron_rule`=1906**, `total_active`=2069 |
| **Q4** (duplicates check) | Zero rows — no `(conversation_id, agent_id)` has more than one `active` row |
| **Q5** (activity distribution) | oldest=`2026-02-17 11:45:46`, newest=`2026-04-07 02:03:27`, total=2069 |
| **Q6** (handed_off sample, last 50) | Dominated by `godentist` (~85%) and `somnio-sales-v3` (~15%). All 306 `handed_off` rows are currently bot-mute cases per CONTEXT §1 Caso B — Phase 42 will unblock them (reapertura limpia) |

## Q3 FLAG for 05-PLAN (LOAD-BEARING)

**`stale_cron_rule = 1906`** — this is the number of sessions the `close_stale_agent_sessions()` RPC would close on its first automated run. **It exceeds the 1000 threshold** from the runbook §3 (Q3 interpretation for the 1000-10000 bucket), so **05-PLAN MUST NOT enable the cron directly**. A manual pre-cron sweep is required.

### Nuance: the "30-day sweep first" guidance does not fit this distribution

The runbook's default guidance ("sweep at 30-day cutoff first") was written assuming most staleness is very old. In this prod distribution, `stale_30d = 295` only, meaning a 30-day sweep catches just the tip of the iceberg. The bulk — 1611 sessions — are fossilized inside the last 30 days (`stale_cron_rule - stale_30d = 1906 - 295 = 1611`). Of those, 963 are in the 7-to-30 day band (`stale_7d - stale_30d = 1258 - 295`), and 648 are in the 1-to-7 day band (`stale_cron_rule - stale_7d = 1906 - 1258`).

### Recommended cohort strategy (two options, both safe)

**Option A — single manual pre-sweep at 7-day cutoff (RECOMMENDED)**
1. Manual one-off: `UPDATE agent_sessions SET status='closed', updated_at=NOW() WHERE status='active' AND last_activity_at < NOW() - INTERVAL '7 days'` → closes **1258 sessions**
2. Residual for first cron run: `1906 - 1258 = 648` sessions → well under the 1000 threshold
3. Enable the automated cron (02:00 COT) → first run closes the remaining ~648, subsequent runs handle the daily trickle

**Option B — two-pass manual**
1. First sweep at 30-day cutoff → closes 295
2. Second sweep at 7-day cutoff → closes additional 963 (total 1258 closed)
3. Enable the automated cron → same end state as Option A

Both end with the same ~648-session residual for the first cron run. **Option A is cleaner** (single SQL statement, single observation window) and is the recommendation for 05-PLAN. 05-PLAN should pick one explicitly and document the choice.

### Why both options avoid the nightmare scenario

Without a pre-sweep, the first automated cron run at 02:00 COT would close 1906 sessions in one transaction. Even though the RPC is a single `UPDATE ... WHERE`, that row count is large enough that:
- Any bug in Wave 2's reopen logic would manifest at massive scale the morning after cron enables
- Observability logs would be noisy enough to hide real signals
- Rollback would be awkward (no way to selectively un-close 1906 sessions)

A pre-sweep separates the historical backlog close from the ongoing daily steady-state close.

## Deviations from Plan

**None.**

- Q1 returned the exact constraint name expected by the migration template — no edit required.
- Q4 returned zero duplicate rows — partial unique index could be created without cleanup.
- Both migrations applied cleanly in prod on first attempt.
- No auto-fixes (Rules 1-3) were triggered during Wave 1.

## Artifacts Produced

- `.planning/phases/42-session-lifecycle/42-DIAGNOSTICS.md` — user-facing runbook
- `supabase/migrations/20260410000000_session_lifecycle_partial_unique.sql` — applied in prod
- `supabase/migrations/20260410000001_close_stale_sessions_rpc.sql` — applied in prod

## What This Unblocks (Wave 2)

With the schema in place, Wave 2 plans can now safely land code that references the new index and RPC:

- **02-PLAN** — Inngest `close-stale-sessions` cron function calling `supabase.rpc('close_stale_agent_sessions')`
- **03-PLAN** — Session reopen logic (clean new `active` row per `(conversation_id, agent_id)` after a previous one was closed/handed_off)
- **04-PLAN** — Defensive timer check (V3 timers must verify session is still `active` before firing)
- **05-PLAN** — Cron activation, BUT must first execute the Q3 FLAG pre-sweep above. 05-PLAN is the one plan that has a hard gating dependency on the Q3 result documented here.

## Next Actions

1. Proceed to `/gsd:execute-phase 42` for 02-PLAN
2. 05-PLAN author: read this SUMMARY's "Q3 FLAG" section BEFORE writing the activation steps
