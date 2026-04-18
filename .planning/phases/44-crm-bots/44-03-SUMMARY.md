---
phase: 44-crm-bots
plan: 03
subsystem: crm-bots
status: paused-human-action
tags: [domain-layer, migration, soft-delete, archive, crm-bots]
dependency_graph:
  requires:
    - "Phase 18 domain layer (src/lib/domain/*)"
    - "contacts, orders, contact_notes, order_notes tables (Phase 1-3 migrations)"
  provides:
    - "archived_at column on contacts/orders/contact_notes/order_notes (migration only — NOT YET APPLIED IN PROD)"
  provides_pending:
    - "archiveContact, archiveOrder, archiveNote, archiveOrderNote domain funcs (Tasks 2-4)"
    - "searchContacts, getContactById, listOrders, getOrderById read helpers (Tasks 2-3)"
    - "listPipelines, listStages, getPipelineById, getStageById (Task 5, new file)"
    - "listTags, getTagById read helpers (Task 5)"
  affects:
    - "Plans 04/05/06/08 blocked on Task 1 completing in prod"
tech_stack:
  added: []
  patterns: ["soft-delete via archived_at", "partial index (WHERE archived_at IS NULL)"]
key_files:
  created:
    - supabase/migrations/20260418201445_crm_archive_columns.sql
  modified: []
  pending:
    - src/lib/domain/contacts.ts (Task 2 — post-apply)
    - src/lib/domain/orders.ts (Task 3 — post-apply)
    - src/lib/domain/notes.ts (Task 4 — post-apply)
    - src/lib/domain/tags.ts (Task 5 — post-apply)
    - src/lib/domain/pipelines.ts (Task 5 — new file, post-apply)
decisions:
  - "Additive-only migration — cero ALTER/DROP de columnas existentes, archived_at es nullable"
  - "4 partial indexes (WHERE archived_at IS NULL) para optimizar queries del patron mas frecuente (listado de filas activas)"
  - "Autonomous=false porque Task 1 requiere user-gated apply (Regla 5 de CLAUDE.md)"
metrics:
  duration_minutes: 3
  completed_date: 2026-04-18
  tasks_completed: 0
  tasks_total: 5
  tasks_paused_at: 1
---

# Phase 44 Plan 03: CRM Bots Archive Columns + Domain Helpers Summary

**Status:** PAUSED — awaiting user action on Task 1 (human-action checkpoint — Regla 5).

## One-liner

Additive migration adding `archived_at` TIMESTAMPTZ to contacts/orders/contact_notes/order_notes (plus partial indexes) was created and committed; Tasks 2-5 (domain helpers) are deferred until the migration is applied in production.

## What Was Completed

### Task 1 (partial — Step A only): Migration file created

File: `supabase/migrations/20260418201445_crm_archive_columns.sql`

Contents:
- 4 × `ALTER TABLE … ADD COLUMN archived_at TIMESTAMPTZ NULL` (contacts, orders, contact_notes, order_notes)
- 4 × `CREATE INDEX idx_<table>_active … WHERE archived_at IS NULL` (partial index for "only active rows" queries)
- 4 × `COMMENT ON COLUMN` documenting purpose
- Zero ALTER/DROP of existing columns — fully additive

Verification at commit time:
- `grep -c "ALTER TABLE .* ADD COLUMN archived_at"` → 4
- `grep -c "CREATE INDEX idx_.*_active"` → 4
- Real `DROP/MODIFY` statements → 0 (only a comment contains the word DROP)

Commit: `63308f1` — `feat(44-03): add crm archive columns migration`

## What Was NOT Completed (Blocked by Task 1 Step B — user apply)

| Task | Scope | Blocker |
|------|-------|---------|
| Task 1 Step B | User applies migration in Supabase production via SQL editor + runs 3 sanity SELECTs | Awaiting user action |
| Task 2 | `archiveContact` + `searchContacts` + `getContactById` in `src/lib/domain/contacts.ts` | Needs `archived_at` column live in prod |
| Task 3 | `archiveOrder` + `listOrders` + `getOrderById` in `src/lib/domain/orders.ts` | Needs `archived_at` column live in prod |
| Task 4 | `archiveNote` + `archiveOrderNote` in `src/lib/domain/notes.ts` | Needs `archived_at` column live in prod |
| Task 5 | `listTags` + `getTagById` in `tags.ts` + new file `pipelines.ts` with 4 exports | Safe to code but deferred for plan coherence — one resume after user confirmation |

**Rationale for deferral:** Per CLAUDE.md Regla 5 and Plan 03 `autonomous: false` front-matter, no code that references a column may be pushed until the column exists in production. Coding Tasks 2-4 locally and committing them without the migration applied risks accidental deploy via the parallel-worktree merge pipeline. Holding all implementation until the user signals lands the whole plan in one coherent pass.

## Deviations from Plan

None — the plan explicitly instructed pausing at the Task 1 human-action checkpoint (`autonomous: false` + `type="checkpoint:human-action"` + `why-blocking: Regla 5`). This summary captures the intentional pause, not a deviation.

## User Action Required (Resume Signal)

1. Open Supabase Dashboard → SQL Editor (production project).
2. Paste the contents of `supabase/migrations/20260418201445_crm_archive_columns.sql` and execute.
3. Run sanity checks in the same SQL editor:

```sql
-- 1) Column presence (expect 4 rows):
SELECT table_name FROM information_schema.columns
WHERE table_schema='public' AND column_name='archived_at'
  AND table_name IN ('contacts','orders','contact_notes','order_notes')
ORDER BY table_name;

-- 2) Index presence (expect 4 rows):
SELECT indexname FROM pg_indexes
WHERE indexname LIKE 'idx_%_active' AND schemaname='public'
ORDER BY indexname;

-- 3) No existing rows were flipped to archived (expect 0 for each):
SELECT COUNT(*) FROM contacts WHERE archived_at IS NOT NULL;
SELECT COUNT(*) FROM orders WHERE archived_at IS NOT NULL;
SELECT COUNT(*) FROM contact_notes WHERE archived_at IS NOT NULL;
SELECT COUNT(*) FROM order_notes WHERE archived_at IS NOT NULL;
```

4. Confirm with the exact resume signal:

> `crm_archive_columns applied — 4 columns, 4 indexes, 0 archived rows`

(Variants noting deviations are also accepted — just describe what differed.)

Upon confirmation, Plan 03 resumes at Task 2 (contacts.ts domain helpers) in a fresh executor, then Tasks 3, 4, 5 back-to-back. Plans 04-05-06-08 remain blocked until Plan 03 finishes.

## Git Commits (This Partial Run)

| Task | Scope | Commit | Files |
|------|-------|--------|-------|
| Task 1 Step A | Migration file | `63308f1` | `supabase/migrations/20260418201445_crm_archive_columns.sql` |

## Self-Check

- [x] Migration file exists at `supabase/migrations/20260418201445_crm_archive_columns.sql`
- [x] Migration commit `63308f1` exists in git log
- [x] No files under `src/lib/domain/*` were modified (as required when pausing before Task 2)
- [x] STATE.md / ROADMAP.md NOT modified (orchestrator owns them)

## Self-Check: PASSED

Verified via:
- `[ -f supabase/migrations/20260418201445_crm_archive_columns.sql ]` → FOUND
- `git log --oneline | grep 63308f1` → FOUND
- `git status --short src/lib/domain/` → empty (no domain layer changes)
- `git status --short .planning/STATE.md .planning/ROADMAP.md` → empty
