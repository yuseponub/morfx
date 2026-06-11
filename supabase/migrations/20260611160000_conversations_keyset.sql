-- Migration: get_conversations_page keyset RPC + composite NULLS-LAST indexes
-- Purpose: whatsapp-inbox-reliability, D-08 (Wave 2 / F-1).
--          NULL-correct keyset pagination over conversations. The chained `.or()`
--          keyset approach silently drops rows whose sort column is NULL (RESEARCH Q1,
--          P1) — and `last_customer_message_at` (the DEFAULT sort) is NULL for every
--          outbound-only conversation, which would re-create the exact invisibility bug
--          this standalone fixes (1.559/2.559 Somnio conversations invisible). A SQL
--          function expresses the NULL-band predicate correctly + keeps filters/search/
--          tie-breaker in one indexed, analyzable plan.
-- Phase: standalone whatsapp-inbox-reliability — F-1
--
-- Fix: ship a SECURITY INVOKER RPC (RLS is_workspace_member() still applies) returning a
--      NULL-correct keyset page (approach A: base rows; plan 05 re-joins contact/tags in
--      TS) + two composite indexes matching `ORDER BY <sort> DESC NULLS LAST, id DESC`.
--
-- Security: all dynamic values arrive as TYPED RPC PARAMETERS bound as VALUES (no string
--           concatenation building SQL, no EXECUTE/dynamic SQL). ILIKE uses
--           '%'||p_search||'%' on a bound parameter — injection-safe. SECURITY INVOKER
--           (NOT DEFINER) so workspace RLS double-gates the read (T-wir-06/07).
--
-- REGLA 5: APPLY IN PROD BEFORE PUSHING W2 CODE (plan 05 calls this RPC). Pushing code
--          that references a non-existent RPC/index is the exact failure class Regla 5
--          was written to prevent.
--
-- HOW TO APPLY (manual, per Regla 5 — the user applies this in the Supabase SQL editor):
--   1. Run the two CREATE INDEX CONCURRENTLY statements FIRST, each as a STANDALONE
--      statement. CREATE INDEX CONCURRENTLY CANNOT run inside a transaction block — do
--      NOT wrap them in BEGIN/COMMIT and do not run them together inside an implicit
--      transaction. CONCURRENTLY keeps the hot conversations table unlocked under
--      realtime writes (2.559 rows is small, but the table is hot).
--   2. Then run the CREATE OR REPLACE FUNCTION + GRANT EXECUTE block.

-- ============================================================================
-- (1) Indexes — run OUTSIDE any transaction block (CONCURRENTLY).
--     DO NOT wrap in BEGIN/COMMIT — CREATE INDEX CONCURRENTLY cannot run in a transaction.
--     NULLS LAST is REQUIRED: the default for DESC is NULLS FIRST, and the query orders
--     DESC NULLS LAST — matching the index lets Postgres satisfy the ORDER BY from the
--     index without a sort node (RESEARCH Q2, P2).
-- ============================================================================

-- Default sort (last_customer_message_at): the hot path.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_keyset_lcm
  ON conversations (workspace_id, status, last_customer_message_at DESC NULLS LAST, id DESC);

-- Alternate sort (last_message_at) toggle.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_keyset_lm
  ON conversations (workspace_id, status, last_message_at DESC NULLS LAST, id DESC);

-- NOTE: do NOT drop idx_conversations_updated — other callers
-- (e.g. findConversationByPhone) order by it (RESEARCH Q2).

-- ============================================================================
-- (2) RPC get_conversations_page — SECURITY INVOKER (default), LANGUAGE sql STABLE.
--     14 params (locked by plan 04 <interfaces>). RETURNS SETOF conversations (approach
--     A: base rows; plan 05 re-hydrates contact/tags in TS via a single .in(id) re-join).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_conversations_page(
  p_workspace_id    uuid,
  p_sort            text DEFAULT 'last_customer_message_at',  -- or 'last_message_at'
  p_status          text DEFAULT 'active',
  p_is_read         boolean DEFAULT NULL,        -- unread filter
  p_assigned_to     uuid DEFAULT NULL,           -- 'mine'
  p_unassigned      boolean DEFAULT false,       -- assigned_to IS NULL
  p_unanswered      boolean DEFAULT false,       -- last_customer_message_at IS NULL
  p_search          text DEFAULT NULL,           -- ILIKE name/phone
  p_tag_id          uuid DEFAULT NULL,           -- tag filter (D-06 / Q4 P4)
  p_agent_attended  boolean DEFAULT NULL,        -- agent filter (D-06 / Q4 P4)
  p_cursor_sort     timestamptz DEFAULT NULL,    -- decoded cursor sort value (may be NULL)
  p_cursor_is_null  boolean DEFAULT false,       -- whether the cursor row's sort was NULL
  p_cursor_id       uuid DEFAULT NULL,
  p_limit           int DEFAULT 50
)
RETURNS SETOF conversations
-- read-only; allows query planner optimizations.
LANGUAGE sql STABLE
-- SECURITY INVOKER (the default — intentionally NOT a definer-rights function): RLS
-- is_workspace_member() must apply so the read stays workspace-isolated (RESEARCH Q1,
-- P13). This is the DELIBERATE difference vs match_knowledge_base (service_role).
AS $$
  SELECT c.*
  FROM conversations c
  -- LEFT (not !inner): contactless conversations must still match by phone and must
  -- still appear when no search is applied (RESEARCH Q3).
  LEFT JOIN contacts ct ON ct.id = c.contact_id
  WHERE c.workspace_id = p_workspace_id
    AND (p_status IS NULL OR c.status = p_status)
    AND (p_is_read IS NULL OR c.is_read = p_is_read)
    AND (p_assigned_to IS NULL OR c.assigned_to = p_assigned_to)
    AND (NOT p_unassigned OR c.assigned_to IS NULL)
    AND (NOT p_unanswered OR c.last_customer_message_at IS NULL)
    AND (p_search IS NULL
         OR ct.name ILIKE '%' || p_search || '%'
         OR c.phone ILIKE '%' || p_search || '%')
    -- Tag filter (Q4 P4): tags live on the linked contact (source of truth).
    AND (p_tag_id IS NULL
         OR EXISTS (
           SELECT 1 FROM contact_tags ct2
           WHERE ct2.contact_id = c.contact_id
             AND ct2.tag_id = p_tag_id
         ))
    -- Agent filter (Q4 P4): tri-state column (NULL / true / false). Mirrors
    -- conversation-list.tsx:171 `agent_conversational !== false`:
    --   p_agent_attended = true  → NULL or true (IS DISTINCT FROM false)
    --   p_agent_attended = false → exactly false (IS NOT DISTINCT FROM false)
    AND (p_agent_attended IS NULL
         OR (p_agent_attended AND c.agent_conversational IS DISTINCT FROM false)
         OR (NOT p_agent_attended AND c.agent_conversational IS NOT DISTINCT FROM false))
    -- Keyset on (sort DESC NULLS LAST, id DESC). NULL-band: a NULL-sorted row comes
    -- AFTER any non-null cursor; among NULL-sorted rows the id tie-breaker applies.
    AND (
      p_cursor_id IS NULL  -- first page
      OR CASE p_sort
           WHEN 'last_message_at' THEN
             (c.last_message_at < p_cursor_sort)
             OR (c.last_message_at IS NOT DISTINCT FROM p_cursor_sort AND c.id < p_cursor_id)
             OR (p_cursor_is_null AND c.last_message_at IS NULL AND c.id < p_cursor_id)
             OR (NOT p_cursor_is_null AND c.last_message_at IS NULL)
           ELSE
             (c.last_customer_message_at < p_cursor_sort)
             OR (c.last_customer_message_at IS NOT DISTINCT FROM p_cursor_sort AND c.id < p_cursor_id)
             OR (p_cursor_is_null AND c.last_customer_message_at IS NULL AND c.id < p_cursor_id)
             OR (NOT p_cursor_is_null AND c.last_customer_message_at IS NULL)
         END
    )
  ORDER BY
    CASE WHEN p_sort = 'last_message_at'          THEN c.last_message_at          END DESC NULLS LAST,
    CASE WHEN p_sort = 'last_customer_message_at' THEN c.last_customer_message_at END DESC NULLS LAST,
    c.id DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_conversations_page(
  uuid, text, text, boolean, uuid, boolean, boolean, text, uuid, boolean,
  timestamptz, boolean, uuid, int
) TO authenticated;

-- ============================================================================
-- ROLLBACK:
-- DROP FUNCTION IF EXISTS public.get_conversations_page(
--   uuid, text, text, boolean, uuid, boolean, boolean, text, uuid, boolean,
--   timestamptz, boolean, uuid, int
-- );
-- DROP INDEX IF EXISTS idx_conversations_keyset_lcm;
-- DROP INDEX IF EXISTS idx_conversations_keyset_lm;
-- ============================================================================
