---
phase: 38-embedded-signup-wa-inbound
plan: 02
subsystem: database
tags: [migration, supabase, postgres, whatsapp, meta, feature-flag, regla-5, regla-6]

# Dependency graph
requires:
  - phase: 37-meta-app-setup
    provides: workspaces table (target of the additive ALTER)
provides:
  - workspaces.whatsapp_provider TEXT NOT NULL DEFAULT '360dialog' CHECK ('360dialog','meta_direct') — DB-enforced per-workspace routing flag
  - Production column applied (Regla 5) with zero backfill — every existing workspace defaulted to '360dialog'
affects: [38-03-inbound-webhook-route, 38-04-embedded-signup-module, 38-05-connect-whatsapp-ui, 39-whatsapp-outbound-templates]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive default-safe column migration: ADD COLUMN ... NOT NULL DEFAULT + CHECK enum lands the value on every existing row with zero backfill UPDATE (Regla 6 zero-touch)"
    - "Regla 5 apply-before-deploy: migration file created here, applied to PROD by the user BEFORE any code referencing the column is pushed (Plans 03/04/05 + Phase 39)"

key-files:
  created:
    - supabase/migrations/20260602120000_add_whatsapp_provider.sql
  modified: []

key-decisions:
  - "Column landed in Phase 38 (not 39) per RESEARCH Open Q2 / D-04/D-05 so Phase 39 outbound + per-workspace migration have it immediately; Phase 38 inbound is NOT gated on it (routing disambiguated by endpoint + resolveByPhoneNumberId)"
  - "DB-enforced DEFAULT '360dialog' + CHECK enum — flipping a workspace to meta_direct requires an explicit SQL UPDATE; connecting a Meta number does NOT auto-flip traffic (T-38-04 mitigation, D-06)"
  - "No backfill UPDATE and no index — the DEFAULT covers every row and the column is read per-workspace by primary key, never scanned"

patterns-established:
  - "Pattern: zero-backfill additive flag column — DEFAULT carries the legacy value to all existing rows, CHECK constraint rejects invalid values at the DB layer (T-38-05 mitigation)"

requirements-completed: [MIG-01]

# Metrics
duration: ~2min (autonomous) + human-action checkpoint (prod apply)
completed: 2026-06-03
---

# Phase 38 Plan 02: whatsapp_provider Migration Summary

**Additive, DB-enforced `workspaces.whatsapp_provider` routing flag (default `'360dialog'`, CHECK enum) created and applied to production with zero backfill — every existing workspace stays `'360dialog'`, giving Phase 39 outbound + per-workspace Meta migration the flag they need without touching any current traffic (Regla 6).**

## Performance

- **Duration:** ~2 min autonomous (Task 1) + human-action checkpoint (Task 2 prod apply by user)
- **Tasks:** 2 (1 auto + 1 human-action checkpoint)
- **Files modified:** 1 created

## Accomplishments
- Created `supabase/migrations/20260602120000_add_whatsapp_provider.sql` with the additive, default-safe DDL (ADD COLUMN NOT NULL DEFAULT '360dialog' CHECK enum, no backfill, no index).
- User applied the migration to PRODUCTION (Regla 5) BEFORE any code referencing the column is pushed.
- Verified in prod: every existing workspace defaulted to `'360dialog'` with zero backfill (Regla 6 zero-touch).

## Task Commits

1. **Task 1: Create whatsapp_provider migration file** — `4f0d9d27` (feat)
2. **Task 2: Apply migration to production (Regla 5)** — human-action checkpoint (no commit — production DB SQL run by user)

**Plan metadata:** this SUMMARY + STATE + ROADMAP + REQUIREMENTS (docs commit)

## Files Created/Modified
- `supabase/migrations/20260602120000_add_whatsapp_provider.sql` — Adds `workspaces.whatsapp_provider TEXT NOT NULL DEFAULT '360dialog' CHECK (whatsapp_provider IN ('360dialog','meta_direct'))`. Read by Phase 39 outbound sender selection; NOT read at Phase 38 inbound.

## Production Verification Evidence (Task 2 — Regla 5)

The user ran the ALTER in the production Supabase SQL Editor and confirmed via the plan's verification queries:

```sql
SELECT count(*) AS total,
       count(*) FILTER (WHERE whatsapp_provider = '360dialog') AS dialog360
FROM workspaces;
-- Result: total = 4, dialog360 = 4  → total == dialog360 (zero backfill, every workspace defaulted to '360dialog')
```

```sql
SELECT id, whatsapp_provider FROM workspaces
WHERE id = 'a3843b3f-c337-4836-92b5-89c58bb98490';
-- Result: whatsapp_provider = '360dialog'  (Somnio confirmed unchanged)
```

**Regla 6 satisfied:** `total == dialog360` (4 == 4) — Somnio + all clients remain `'360dialog'`, zero rows changed from default, zero behavioral impact on any agent.

## Decisions Made
None beyond the plan — executed exactly as written. The column-in-Phase-38 placement, DB-enforced default, and no-backfill/no-index choices were all pre-decided in the plan (RESEARCH Open Q2 / D-04/D-05/D-06).

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None. The human-action checkpoint (Regla 5 production apply) was the expected blocking gate; the user applied the migration and reported the verification output (total=4, dialog360=4, Somnio='360dialog').

## User Setup Required
None remaining — the production migration apply (the only manual step) is complete.

## Next Phase Readiness
- `whatsapp_provider` column exists in prod with `'360dialog'` on every workspace — Plans 03/04/05 (which reference the column / `workspace_meta_accounts`) and Phase 39 (outbound sender selection reads the flag) are unblocked to push.
- Per-workspace migration to `meta_direct` (D-05) is now possible via explicit SQL UPDATE once a number is connected + validated.

---
*Phase: 38-embedded-signup-wa-inbound*
*Completed: 2026-06-03*

## Self-Check: PASSED
- FOUND: supabase/migrations/20260602120000_add_whatsapp_provider.sql
- FOUND: commit 4f0d9d27 (Task 1)
