-- Phase 42: drop full unique constraint, replace with partial unique index
-- See .planning/phases/42-session-lifecycle/42-CONTEXT.md §3.2 for rationale
-- See .planning/phases/42-session-lifecycle/42-RESEARCH.md ## Migration Notes for verification
-- See .planning/phases/42-session-lifecycle/42-DIAGNOSTICS.md (Q1) for constraint name verification
--
-- Rationale (CONTEXT §3.1, §3.2):
--   Opcion A — multiple historical sessions per (conversation_id, agent_id), with
--   at most one active at a time. Drops the full UNIQUE(conversation_id, agent_id)
--   constraint and replaces it with a partial unique index WHERE status = 'active'.
--   This allows N closed/handed_off rows to coexist with a single active row,
--   enabling session reopening (clean slate per customer return visit).

-- Step 1: drop the original constraint (Postgres default name)
-- IMPORTANT: Verified via diagnostic Q1 (SELECT conname FROM pg_constraint ...)
-- If Q1 returns a different name, edit this line BEFORE applying in prod.
ALTER TABLE agent_sessions
  DROP CONSTRAINT IF EXISTS agent_sessions_conversation_id_agent_id_key;

-- Step 2: create partial unique index — only actives must be unique per (conv, agent)
-- Allows N historical closed/handed_off rows per (conversation_id, agent_id)
-- while enforcing at-most-one active at a time.
--
-- NOTE: not using CREATE INDEX CONCURRENTLY — Supabase migrations run inside a
-- transaction block, and concurrent index builds cannot run in a transaction.
-- agent_sessions is a small table (see Q3/Q5 diagnostics); a brief table lock
-- during index build is acceptable. If the table ever grows to >100k rows,
-- revisit and split into a separate out-of-transaction manual run.
CREATE UNIQUE INDEX IF NOT EXISTS agent_sessions_one_active_per_conv_agent
  ON agent_sessions(conversation_id, agent_id)
  WHERE status = 'active';
