---
phase: 41-instagram-direct
plan: 00
subsystem: meta-direct-integration
tags: [migration, instagram, regla-5, regla-6, provider-flag]
status: AT_CHECKPOINT
requires: []
provides:
  - "supabase/migrations/20260605120000_add_instagram_provider.sql (authored, NOT yet applied)"
  - "workspaces.instagram_provider column (after operator applies — MIG-02)"
  - "workspace_meta_accounts.ig_username column (after operator applies — D-IG-04)"
affects:
  - "41-04 (domain chokepoint readInstagramProvider) — gated by this plan's apply"
  - "41-05 (inbound object==='instagram' webhook) — gated indirectly via domain"
tech-stack:
  added: []
  patterns:
    - "Provider-flag chokepoint migration (clone of P40 messenger_provider / P39 whatsapp_provider)"
    - "Regla 5 hard gate (apply-in-prod before provider-reading code)"
    - "Regla 6 zero-backfill (DEFAULT 'manychat' covers every existing row)"
key-files:
  created:
    - supabase/migrations/20260605120000_add_instagram_provider.sql
  modified: []
decisions:
  - "D-IG-02: instagram_provider SEPARATE from messenger_provider (IG/FB migrate independently)"
  - "D-IG-04: ig_username added as display-only nullable column; ig_account_id NOT re-added (exists from Phase 37)"
  - "Regla 6: zero backfill — DEFAULT 'manychat' leaves all workspaces (incl. godentist-fb-ig) unchanged"
metrics:
  tasks_total: 2
  tasks_completed: 1
  tasks_at_checkpoint: 1
  files_created: 1
  duration: "<5 min"
  completed_date: null
---

# Phase 41 Plan 00: instagram_provider Migration Summary

**One-liner:** Authored the single new Phase 41 migration adding `workspaces.instagram_provider` (`'manychat'|'meta_direct'`, DEFAULT `'manychat'`, CHECK-constrained) + the display-only `workspace_meta_accounts.ig_username` column — a verbatim clone of the shipped Phase 40 `messenger_provider` migration, kept SEPARATE so IG and FB migrate independently (D-IG-02). **Plan is AT the Regla 5 hard gate (Task 2): the operator must apply this in PROD and confirm before any provider-reading code (Plans 41-04/41-05) ships.**

## What Was Done

### Task 1 — Author the migration (COMPLETE)
- Created `supabase/migrations/20260605120000_add_instagram_provider.sql` (commit `cc66e676`).
- Cloned `20260604120000_add_messenger_provider.sql` verbatim, swapping `messenger_provider → instagram_provider`.
- `ALTER TABLE workspaces ADD COLUMN instagram_provider TEXT NOT NULL DEFAULT 'manychat' CHECK (instagram_provider IN ('manychat', 'meta_direct'))`.
- `ALTER TABLE workspace_meta_accounts ADD COLUMN ig_username TEXT` (display-only, nullable — D-IG-04).
- Did NOT re-add `ig_account_id` / `uq_meta_ig` / `idx_meta_accounts_ig` (verified they already exist from Phase 37 migration `20260401100000_create_workspace_meta_accounts.sql` — re-adding would error mid-apply, T-41-00-03).
- No index on `instagram_provider` (mirrors FB migration). No backfill (Regla 6). No `supabase db push` (operator applies — T-41-00-01).

**Acceptance gates (all PASS):**
- `ADD COLUMN instagram_provider TEXT NOT NULL DEFAULT 'manychat'` → 1
- `instagram_provider IN ('manychat', 'meta_direct')` → 1
- `ADD COLUMN ig_username TEXT` → 1
- `ADD COLUMN ig_account_id` → 0 (NOT re-added)
- `supabase db push` → 0
- `REGLA 5` header → 1

### Task 2 — Operator applies in PROD + confirms (AT BLOCKING CHECKPOINT)
**Status:** `checkpoint:human-action` gate=blocking — NOT resolved. The migration is authored but NOT applied. Per Regla 5 (CLAUDE.md), the column must exist in PROD and be operator-confirmed BEFORE any code reading it is pushed. Plans 41-04 and 41-05 `depends_on: [41-00]` and must NOT push provider-reading code until this resolves.

## Deviations from Plan

None — plan executed exactly as written. (Task 2 is a blocking human-action checkpoint by design, not a deviation.)

## Regla 5 / Regla 6 Compliance

- **Regla 5:** Migration NOT applied by the executor. No provider-reading code in this plan or pushed. Apply-in-prod is the operator's blocking step (Task 2).
- **Regla 6:** DEFAULT `'manychat'` + zero backfill statement → every existing workspace (incl. the protected `godentist-fb-ig` at `f0241182-f79b-4bc6-b0ed-b5f6eb20c514`) reads `'manychat'` after apply. No workspace is flipped to `meta_direct` here (that is the manual cutover in Plan 41-07).

## Commits

- `cc66e676` — `feat(41-00): add instagram_provider migration (MIG-02, Regla 5 gate)`

## Self-Check: PASSED
- FOUND: `supabase/migrations/20260605120000_add_instagram_provider.sql`
- FOUND: commit `cc66e676`
