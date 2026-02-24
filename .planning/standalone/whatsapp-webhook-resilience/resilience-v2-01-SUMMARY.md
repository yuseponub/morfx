---
phase: standalone/whatsapp-webhook-resilience
plan: 01
subsystem: whatsapp-resilience
tags: [migration, retry, webhook, dead-letter]
dependency-graph:
  requires: []
  provides: [retry_count column, reprocessed_at column, expanded status CHECK, replayable index, Regla 5]
  affects: [resilience-v2-02, resilience-v2-03]
tech-stack:
  added: []
  patterns: [idempotent migrations, partial index for retry queries]
key-files:
  created:
    - supabase/migrations/20260225_webhook_events_retry_columns.sql
  modified:
    - CLAUDE.md
decisions:
  - id: rv2-01-01
    decision: "Use IF NOT EXISTS / IF EXISTS for idempotent migration"
    rationale: "Safe to re-run without error if partially applied"
  - id: rv2-01-02
    decision: "Partial index WHERE status='failed' AND retry_count < 3"
    rationale: "Only index the rows that matter for replay queries, keeping index small"
metrics:
  duration: 54s
  completed: 2026-02-24
---

# Standalone resilience-v2 Plan 01: Retry Columns Migration + Regla 5 Summary

Migration adds retry_count and reprocessed_at columns to whatsapp_webhook_events with expanded 5-status CHECK constraint and partial index for efficient failed event replay queries.

## What Was Done

### Task 1: Create Migration File
- Created `supabase/migrations/20260225_webhook_events_retry_columns.sql`
- Adds `retry_count INTEGER NOT NULL DEFAULT 0` column
- Adds `reprocessed_at TIMESTAMPTZ` nullable column
- Drops existing 3-status CHECK constraint (`whatsapp_webhook_events_status_check`)
- Creates new CHECK with 5 statuses: pending, processed, failed, reprocessed, dead_letter
- Adds partial index `idx_wa_webhook_events_replayable` on (status, retry_count, created_at ASC) WHERE status = 'failed' AND retry_count < 3
- All statements use IF EXISTS/IF NOT EXISTS for idempotency safety
- Commit: b368ea8

### Task 2: Add Regla 5 to CLAUDE.md
- Added "Regla 5: Migracion Antes de Deploy" section after Regla 4
- Documents the mandatory workflow: create migration -> pause -> user applies in production -> then push code
- References the 20h outage incident as rationale
- Commit: 76e1688

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| rv2-01-01 | Idempotent DDL with IF EXISTS/IF NOT EXISTS | Safe re-run if migration partially applied |
| rv2-01-02 | Partial index for replay queries | Only indexes failed rows with retries < 3, keeps index small and fast |

## Verification Results

All checks passed:
- Migration file exists with correct path
- Contains retry_count, reprocessed_at, dead_letter, DROP CONSTRAINT
- CLAUDE.md contains Regla 5 at line 79
- No other files modified

## Next Steps

**CRITICAL:** The migration must be applied in production BEFORE proceeding to Plan 02. This follows the newly documented Regla 5. The user must:
1. Apply `supabase/migrations/20260225_webhook_events_retry_columns.sql` in production
2. Confirm the migration succeeded
3. Only then proceed to Plan 02 (retry logic in code)
