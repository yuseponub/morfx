---
phase: 42-session-lifecycle
plan: 05
wave: 3
type: execute
completed: 2026-04-07
duration: ~24h (across two days, including overnight cron observation)
status: COMPLETE
subsystem: agents/session-lifecycle
tags: [agent-sessions, inngest-cron, postgres, timestamptz, partial-unique-index, uat, docs]
requires:
  - 42-01 (schema migrations applied in prod)
  - 42-02 (cron + helper)
  - 42-03 (timer-guard + 6 handlers)
  - 42-04 (createSession 23505 retry + V1 audit)
provides:
  - Phase 42 fully deployed and UAT-signed-off in production
  - TZ-safe close_stale_agent_sessions RPC
  - Updated docs/analysis/04-estado-actual-plataforma.md
  - LEARNINGS.md (project-wide, created in this plan)
affects:
  - Future cleanup phase (Somnio V1 deletion candidate)
  - Future SessionManager-into-domain refactor phase
  - Any future TZ-sensitive SQL (canonical pattern documented in LEARNINGS)
key-files:
  modified:
    - docs/analysis/04-estado-actual-plataforma.md
  created:
    - LEARNINGS.md
    - supabase/migrations/20260410000002_fix_close_stale_sessions_tz.sql
    - .planning/phases/42-session-lifecycle/42-05-SUMMARY.md
---

# Phase 42 Plan 05: Wave 3 — Deploy, UAT, Docs Summary

**One-liner:** Phase 42 deployed to production, UAT-signed-off across all 5 success criteria, with a critical TZ bug discovered and fixed mid-flight in the close_stale_agent_sessions RPC.

---

## What was done

Wave 3 closed Phase 42 by (a) verifying Wave 2 was already pushed to `origin/main`, (b) handling the Q3 conditional cleanup (Option A 7-day sweep), (c) discovering and fixing a critical timezone bug in the cleanup RPC, (d) walking the user through UAT of all 5 CONTEXT §6 success criteria, (e) updating `docs/analysis/04-estado-actual-plataforma.md` per Regla 4, and (f) creating `LEARNINGS.md` with the Phase 42 entry.

---

## Deploy

Wave 2 commits already on `origin/main` (verified at start of plan execution):

| Commit | Description |
|---|---|
| `1c4b4c5` | Wave 2 series |
| `2a35d16` | Wave 2 series |
| `97a6b5f` | Wave 2 series |
| `6353038` | Wave 2 series |
| `1f71b5b` | Wave 2 series |
| `645838a` | Wave 2 series |
| `3be7964` | Wave 2 series |
| `031f244` | Wave 2 series |
| `ec0cf2a` | Wave 2 series |
| `f292264` | **TZ-safe RPC fix** (mid-Task-1 deviation, see below) |

Wave 3 commits (this plan):

| Commit | Description |
|---|---|
| `eecee7c` | docs(42-05): actualizar estado-actual-plataforma con Phase 42 |
| `b4257b0` | docs(42-05): add Phase 42 LEARNINGS entry |
| (this commit) | docs(42-05): complete Wave 3 UAT and documentation plan |

---

## Q3 conditional outcome — Option A 7-day sweep

Q3 (`stale_cron_rule` count) was well above the 1000 threshold. Decision tree from Task 1 forced PAUSE → user-executed manual cleanup before enabling automated cron in production.

**Pre-sweep state (post TZ fix verification):**
- `stale_currentRPC = 1906`
- `stale_tz_safe = 1932`
- Delta of 26 sessions confirmed the original RPC was wrong by ~5h.

**Option A executed (user ran in Supabase SQL editor):**

```sql
UPDATE agent_sessions
SET status = 'closed'
WHERE status = 'active'
  AND last_activity_at < NOW() - INTERVAL '7 days';
```

**Result:** ~1309 sessions closed.
**Post-sweep state:** `total_active = 765`, `would_close_next_cron = 621` (well under 1000 safety threshold).

---

## Cron first-run results

Cron `closeStaleSessionsCron` ran automatically overnight at **02:00 Bogota Apr 7 (07:00 UTC)** — first scheduled run after the deploy.

**Closed count derived from DB:**
```sql
SELECT COUNT(*)
FROM agent_sessions
WHERE status = 'closed'
  AND updated_at BETWEEN '2026-04-07 06:55:00+00' AND '2026-04-07 07:30:00+00';
-- Result: 774
```

**Boundary integrity verified:**
- Oldest closed in this run: `last_activity_at = 2026-03-30 21:55 Bogota`
- Newest closed in this run: `last_activity_at = 2026-04-06 23:38 Bogota` (22 minutes before midnight Apr 7)
- Earliest surviving active session: born at `2026-04-07 00:03:02 Bogota` (3 minutes past midnight)
- ZERO sessions with post-midnight activity were touched.

The cron preserved the boundary perfectly, validating both the partial-unique-index design AND the TZ-safe RPC fix.

---

## UAT results — 5 success criteria from CONTEXT §6

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Cliente con sesion cerrada vuelve y recibe respuesta limpia | **PASS** | Test phone +573137549286 sent message (session `7db30fe8-...` created 19:19:17 UTC), user manually closed it via UPDATE at 19:21:28, second message at 19:21:51 created NEW session `5aee6d47-...` with `current_mode='conversacion'`. Bot responded cleanly to both. |
| 2 | DB muestra multiples filas en agent_sessions por (conv, agent) | **PASS** | Test conversation `e5cf0938-...` has 3 rows for `somnio-sales-v3`: `handed_off` (Apr 2) + `closed` (19:19) + `active` (19:21). Partial unique index correctly only enforces uniqueness on `status='active'`. |
| 3 | Cron ejecuta 02:00 COT, logea closedCount, post-midnight survives | **PASS** | Auto-ran 02:00 Bogota Apr 7. 774 sessions closed (DB derivation, not Inngest dashboard). Boundary validated: oldest closed 2026-03-30 21:55, newest closed 2026-04-06 23:38, earliest survivor 2026-04-07 00:03:02. |
| 4 | Clientes handed_off previamente bloqueados reciben respuesta; no 23505 | **PASS** | Validated **spontaneously** by Criterion 1: test contact had a pre-existing `handed_off` session from 2026-04-02 (`bf6bd712-...`). Under the old schema this would have hit 23505 on the FIRST test message. Under Phase 42 it succeeded. Real-world Caso B unblock using a real historical case. handed_off total: 306 → 313 overnight (organic growth, not blockage). |
| 5 | Active sessions in progress no sufren regresion | **PASS** | Sanity check: ZERO active sessions with `last_activity_at < midnight Bogota today`. All surviving active sessions were born post-midnight Apr 7. No false positives. |

**Overall:** 5/5 PASS. Phase 42 success criteria empirically verified in production.

---

## Post-UAT per-bot breakdown

| agent_id | active | closed | handed_off |
|---|---:|---:|---:|
| godentist | 65 | 1398 | 165 |
| somnio-sales-v3 | 9 | 158 | 16 |
| somnio-sales-v1 | 0 | 516 | 130 |
| somnio-recompra-v1 | 0 | 14 | 2 |

V1 legacy agents have **zero active** sessions, confirming the V1 dead-code audit from Plan 04. Marks them as deletion candidates for a future cleanup phase.

---

## Deviations

### Major deviation — TZ bug discovered mid-Task-1 (Rule 1: Bug)

**When:** During Task 1 (Q3 conditional cleanup), in response to user's question: *"como nos aseguramos cuales son los timezones y que coordinen"*.

**What was found:** The original `close_stale_agent_sessions` RPC (deployed in 42-01) used:

```sql
WHERE last_activity_at < date_trunc('day', timezone('America/Bogota', NOW()))
```

The expression `date_trunc('day', timezone('America/Bogota', NOW()))` returns a **naive `timestamp WITHOUT time zone`**. When Postgres compares it against `last_activity_at` (which is `timestamptz`), it implicitly casts the naive value using the **session timezone** (UTC in Supabase, NOT Bogota). Result: the cutoff was **5 hours earlier** than intended midnight Bogota.

**Empirical proof:** Ran two parallel queries:
- `stale_currentRPC = 1906` (the broken cutoff)
- `stale_tz_safe = 1932` (the correct cutoff with explicit `AT TIME ZONE`)

Delta: 26 sessions wrongly evaluated per run. Not catastrophic, but enough that letting it run as-is would silently mis-bucket sessions for weeks.

**Fix applied:**

New migration `supabase/migrations/20260410000002_fix_close_stale_sessions_tz.sql`, committed as `f292264`. Uses `CREATE OR REPLACE FUNCTION` (idempotent, no ABI break, no signature change) to replace the body with:

```sql
WHERE last_activity_at < (
  date_trunc('day', timezone('America/Bogota', NOW()))
  AT TIME ZONE 'America/Bogota'
)
```

The outer `AT TIME ZONE 'America/Bogota'` converts the naive midnight back into a `timestamptz` correctly anchored to Bogota's UTC offset, regardless of session TZ.

**Verification in prod:** Ran `pg_get_functiondef('close_stale_agent_sessions'::regproc)` after migration apply — confirmed the new body is live.

**Why this is Rule 1 (auto-fix bug):** It's a correctness bug in code we just shipped, with empirical evidence of incorrect output (26-session delta). Not architectural — same RPC signature, same call sites. Fixed inline, documented as a deviation, and elevated to the headline lesson in LEARNINGS.md.

**Why it slipped past:** The Q3 diagnostic in 01-PLAN was written using the same broken expression, so it was self-consistent with the broken RPC. The bug was only catchable by an external "let's verify the math" lens — which is exactly what the user provided.

### Minor process deviation — push already complete

Task 2 (push to Vercel) was already done before this Wave 3 plan continuation started. Verified `git log origin/main` and Vercel deploy status. Skipped redundant push.

---

## Post-deploy issues

**NONE in production.** The TZ bug was caught during Task 1 (BEFORE the cron's first scheduled run), patched via the new migration, and the fixed RPC was the one that actually executed in the 02:00 Bogota Apr 7 run. By the time UAT started, the system was in its corrected state.

No 23505 errors observed in logs. No false-positive closures. No regressions on active in-progress sessions.

---

## Authentication gates

None. All operations were database/git/file-system based, no third-party auth required during this plan.

---

## Decisions made

1. **Apply Option A (7-day pre-sweep) instead of Option B (30-day):** Q3 result of 1906 was nearly double the 1000 threshold; 7-day cut more aggressively to land safely under threshold for the first cron run. Rationale: the bug is years-accumulated, so even 7 days of "stale" is genuinely stale.

2. **Patch RPC instead of rolling back migration 01:** Used `CREATE OR REPLACE FUNCTION` for an in-place idempotent fix. No ABI break, no schema change, no need to coordinate a rollback. Simpler and safer.

3. **Elevate the TZ bug to LEARNINGS headline:** Decision to make the TZ trap the first lesson in `LEARNINGS.md` (the file's first-ever entry). This bug class is too easy to repeat; future phases need to see it immediately.

4. **Confirm Criterion 4 via spontaneous real-world case:** Rather than hunting for a synthetic handed_off + new-message scenario, accept the test contact's pre-existing handed_off as the real-world validation. Strictly more rigorous than a synthetic case.

5. **Document Somnio V1 as deletion candidate (not delete now):** V1 has zero active sessions but type-only imports linger. Phase 42 is not the cleanup phase; tracked as P2 tech debt.

---

## Phase 42 status: COMPLETE

All 5 success criteria PASS. All Wave 1/2/3 work shipped, verified, and documented. The session lifecycle bug that has plagued recurring clients for weeks is **resolved in production**.

---

## Files touched in this plan

- **Modified:** `docs/analysis/04-estado-actual-plataforma.md` (Phase 42 status, 5 resolved bugs section, 3 new P2 tech debt items, footer update)
- **Created:** `LEARNINGS.md` (project-wide file, Phase 42 is the inaugural entry)
- **Created (during deviation):** `supabase/migrations/20260410000002_fix_close_stale_sessions_tz.sql`
- **Created:** `.planning/phases/42-session-lifecycle/42-05-SUMMARY.md` (this file)
