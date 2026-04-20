-- ============================================================================
-- Phase 43 Plan 12: Mobile message search — Postgres FTS foundation
-- ============================================================================
-- Adds a GENERATED STORED tsvector column (`fts`) on `messages` built from the
-- text body stored inside the JSONB `content` column (accessed as
-- `content ->> 'body'`), plus a GIN index for fast lookups, plus a secondary
-- composite index to keep the contact-name join fast-path efficient.
--
-- Why `content ->> 'body'` and NOT a plain `body` column:
--   The `messages` schema (migration 20260130000002_whatsapp_conversations.sql)
--   stores all message payloads in a JSONB `content` column, with text content
--   living at `content ->> 'body'`. There is no top-level `body` column on
--   `messages`. The plan's reference SQL (`to_tsvector('spanish', coalesce(body, ''))`)
--   was based on an incorrect assumption; this migration applies the correct
--   projection. Non-text messages (image/audio/document/etc.) expose NULL or
--   absent `body` keys, which `coalesce(..., '')` safely collapses to empty.
--
-- Why STORED (not VIRTUAL):
--   Postgres 12+ only supports STORED for GENERATED columns. STORED also
--   allows indexing with GIN. VIRTUAL is not supported on Postgres.
--
-- Backfill semantics:
--   `ALTER TABLE ... ADD COLUMN ... GENERATED ALWAYS AS (...) STORED` performs
--   a full table rewrite and populates the new column for every existing row
--   as part of the ALTER. No manual UPDATE backfill is required.
--   On a large `messages` table this ALTER takes an ACCESS EXCLUSIVE lock for
--   the duration of the rewrite. Warn the operator (see Regla 5 checkpoint
--   instructions in 43-12-PLAN.md Task 2).
--
-- Idempotency:
--   All DDL uses IF NOT EXISTS so a partial/retry run is safe.
--
-- Regla 5 (CLAUDE.md):
--   This migration MUST be applied to production BEFORE any application code
--   referencing `messages.fts` is pushed to Vercel. The search endpoint and
--   mobile UI for Plan 43-12 ship in a separate commit that lands AFTER this
--   migration is confirmed applied in prod.
-- ============================================================================

-- Step 1: tsvector column, Spanish dictionary, built from content->>'body'.
-- coalesce() protects against messages whose `content` JSON has no 'body' key
-- (images, audio, templates, etc.) — they become empty tsvectors, harmless.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS fts tsvector
    GENERATED ALWAYS AS (to_tsvector('spanish', coalesce(content ->> 'body', ''))) STORED;

-- Step 2: GIN index on the tsvector for @@ websearch_to_tsquery lookups.
-- Cannot use CONCURRENTLY inside a migration (Supabase wraps migrations in a
-- transaction and CREATE INDEX CONCURRENTLY cannot run in a transaction).
-- The brief table lock is acceptable; if messages grows past a threshold where
-- this becomes unacceptable, future migrations can split index creation into
-- an out-of-transaction manual step.
CREATE INDEX IF NOT EXISTS messages_fts_idx
  ON messages USING GIN (fts);

-- Step 3: Composite index supporting the contact-name fast path in the search
-- endpoint (ORDER BY created_at DESC within a workspace). Complements the
-- existing idx_messages_workspace / idx_messages_conversation indexes by
-- giving the planner a direct workspace+time-ordered path without a sort.
CREATE INDEX IF NOT EXISTS messages_workspace_created_idx
  ON messages (workspace_id, created_at DESC);

-- ============================================================================
-- Verification queries (run after apply):
--
-- 1. Column + type:
--    SELECT column_name, data_type, is_generated, generation_expression
--    FROM information_schema.columns
--    WHERE table_name = 'messages' AND column_name = 'fts';
--    Expected: tsvector, ALWAYS, expression referencing content ->> 'body'.
--
-- 2. Indexes present:
--    SELECT indexname FROM pg_indexes
--    WHERE tablename = 'messages'
--      AND indexname IN ('messages_fts_idx', 'messages_workspace_created_idx');
--    Expected: both rows returned.
--
-- 3. Sanity query (should return hits on any existing text message):
--    SELECT id, content ->> 'body' AS body, fts
--    FROM messages
--    WHERE fts @@ websearch_to_tsquery('spanish', 'hola')
--    LIMIT 5;
--    Expected: rows with non-null fts values. Backfill confirmed.
-- ============================================================================
