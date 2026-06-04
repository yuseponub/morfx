---
phase: 40-facebook-messenger-direct
plan: 00
subsystem: database
tags: [migration, messenger, provider-flag, regla-5, regla-6, meta-direct]

# Dependency graph
requires:
  - phase: 39-whatsapp-outbound-templates
    provides: "whatsapp_provider migration template (the verbatim P39 analog cloned here)"
provides:
  - "workspaces.messenger_provider column (default 'manychat', CHECK manychat|meta_direct)"
  - "Regla 5 gate cleared: column applied + confirmed in PROD before any provider-reading code (Plans 04/06/07) deploys"
affects: [40-04, 40-06, 40-07, 40-08, messenger-provider, readMessengerProvider]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-workspace provider routing flag with DB-enforced default + CHECK constraint (mirrors Phase 39 whatsapp_provider)"
    - "Regla 5 apply-in-prod-before-deploy checkpoint (autonomous:false blocking gate)"

key-files:
  created:
    - supabase/migrations/20260604120000_add_messenger_provider.sql
  modified: []

key-decisions:
  - "Default 'manychat' = zero backfill; every existing workspace (incl. protected godentist-fb-ig) stays on the ManyChat path untouched (Regla 6 / D-10)"
  - "CHECK (messenger_provider IN ('manychat', 'meta_direct')) — DB-enforced enum, no app-layer validation needed"
  - "NO backfill, NO index — the migration is a single ALTER TABLE ADD COLUMN"
  - "NO workspace flipped to meta_direct here — the manual per-workspace cutover is Plan 08"

patterns-established:
  - "Provider flag migration cloned verbatim from the Phase 39 sibling (swap column name + default + CHECK set)"
  - "Regla 5 header warning block embedded in the migration file (purpose / phase / APPLY IN PROD BEFORE deploy)"

requirements-completed: [MIG-02]

# Metrics
duration: ~2min (Task 1) + user apply (Task 2 checkpoint)
completed: 2026-06-04
---

# Phase 40 Plan 00: messenger_provider Migration Summary

**The `messenger_provider` routing flag now exists on `workspaces` in PRODUCTION (default `'manychat'`), clearing the Regla 5 gate so Plans 04/06/07 (the provider-reading code) can deploy — every existing workspace reads `manychat`, zero backfill (Regla 6).**

## Performance

- **Duration:** ~2 min to author the migration file; Task 2 was a blocking user checkpoint (Regla 5 apply-in-prod).
- **Completed:** 2026-06-04
- **Tasks:** 2 (Task 1 auto, Task 2 human-action checkpoint)
- **Files modified:** 1 created

## Accomplishments

- Created `supabase/migrations/20260604120000_add_messenger_provider.sql` — clones the Phase 39 `add_whatsapp_provider.sql` template verbatim, swapping the column name to `messenger_provider`, the default to `'manychat'`, and the CHECK set to `('manychat', 'meta_direct')`.
- The migration carries a Regla 5 header warning block: purpose (per-workspace Messenger provider flag, MIG-02 / D-10), phase, and the explicit "APPLY IN PROD BEFORE pushing any code that references workspaces.messenger_provider".
- **Regla 5 gate RESOLVED:** the user applied the migration in the PRODUCTION Supabase SQL editor on 2026-06-04 and confirmed the verification query:
  ```sql
  SELECT messenger_provider, count(*) FROM workspaces GROUP BY messenger_provider;
  ```
  Result: `manychat → 5`, `meta_direct → 0`. Every workspace (including the protected `godentist-fb-ig` workspace `f0241182-...`) defaults to `'manychat'`.
- **No workspace flipped to `meta_direct`** — that is the manual cutover in Plan 08. Connecting a Page (Plan 03) inserts the `workspace_meta_accounts` row but does NOT flip the provider; Messenger traffic stays on ManyChat until the explicit per-workspace SQL flip.

## Task Commits

1. **Task 1: Create the messenger_provider migration file** — `73f3ac07` (feat) — `feat(40-00): migración messenger_provider (default manychat, CHECK meta_direct) — Regla 5 gate`
2. **Task 2: Apply the migration in PRODUCTION (Regla 5 gate)** — human-action checkpoint, NO commit. User applied + confirmed in PROD on 2026-06-04 ("applied").

## Files Created/Modified

- `supabase/migrations/20260604120000_add_messenger_provider.sql` — `ALTER TABLE workspaces ADD COLUMN messenger_provider TEXT NOT NULL DEFAULT 'manychat' CHECK (messenger_provider IN ('manychat', 'meta_direct'))`, with a Regla 5 header warning block. No backfill, no index.

## Verification

- `test -f supabase/migrations/20260604120000_add_messenger_provider.sql` → exists.
- `grep "messenger_provider TEXT NOT NULL DEFAULT 'manychat'"` → match.
- `grep "CHECK (messenger_provider IN ('manychat', 'meta_direct'))"` → match.
- `grep -i "regla 5\|APPLY IN PROD\|before pushing"` → header warning present.
- `grep -c "supabase db push"` → 0 (no auto-apply in the file).
- **PROD confirmed by user (Regla 5):** column exists; `SELECT messenger_provider, count(*) FROM workspaces GROUP BY messenger_provider` → `manychat:5, meta_direct:0`.

## Deviations from Plan

None — plan executed exactly as written. Task 1 authored the migration; Task 2 was the blocking Regla 5 human-action checkpoint, satisfied by the user applying it in PROD and confirming all 5 workspaces read `manychat`.

## Requirement Satisfied

- **MIG-02** — `messenger_provider` column shipped + applied in prod, default `'manychat'`, DB-enforced CHECK.

## Self-Check: PASSED

- `supabase/migrations/20260604120000_add_messenger_provider.sql` — FOUND.
- Commit `73f3ac07` — FOUND in git log.
