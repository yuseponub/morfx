---
phase: standalone-whatsapp-inbox-reliability
plan: 04
type: execute
wave: 2
depends_on: [03]
subsystem: whatsapp-inbox
tags: [whatsapp, inbox, migration, keyset, rpc, postgres]
requirements: [F-1, D-08, D-01, D-05, D-06]
files_modified:
  - supabase/migrations/20260611_conversations_keyset.sql
autonomous: false

must_haves:
  truths:
    - "A get_conversations_page RPC exists in prod that returns a NULL-correct keyset page over conversations"
    - "Two composite keyset indexes exist matching ORDER BY ... DESC NULLS LAST, id DESC"
    - "The RPC is SECURITY INVOKER — workspace RLS (is_workspace_member) still applies"
  artifacts:
    - path: "supabase/migrations/20260611_conversations_keyset.sql"
      provides: "get_conversations_page RPC + idx_conversations_keyset_lcm + idx_conversations_keyset_lm"
      contains: "get_conversations_page"
  key_links:
    - from: "get_conversations_page"
      to: "conversations table"
      via: "SECURITY INVOKER keyset query honoring RLS + workspace_id"
      pattern: "SECURITY INVOKER"
---

<objective>
Create the DB foundation for F-1 keyset pagination: a `get_conversations_page` Postgres RPC (NULL-correct keyset over `last_customer_message_at`/`last_message_at`, server-side filters + ILIKE search) and two composite indexes matching the ORDER BY. The `.or()` keyset approach is RULED OUT because it silently drops NULL-sorted rows (RESEARCH Q1, P1) — and `last_customer_message_at` (the default sort) is NULL for every outbound-only conversation, which would re-create the exact invisibility bug we are fixing.

Purpose: Ship the migration that plan 05 (F-1 code) depends on. **Regla 5 is STRICT here:** the migration MUST be applied in PROD by the user BEFORE any code that calls the RPC is pushed. This plan creates the file and PAUSES for the user to apply it — it does NOT push application code.
Output: One migration file applied to prod; explicit user confirmation captured.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/whatsapp-inbox-reliability/CONTEXT.md
@.planning/standalone/whatsapp-inbox-reliability/RESEARCH.md
@.planning/standalone/whatsapp-inbox-reliability/PATTERNS.md
@CLAUDE.md

<interfaces>
<!-- The RPC signature plan 05 will call. Lock this exactly. -->
get_conversations_page(
  p_workspace_id uuid,
  p_sort text DEFAULT 'last_customer_message_at',  -- or 'last_message_at'
  p_status text DEFAULT 'active',
  p_is_read boolean DEFAULT NULL,
  p_assigned_to uuid DEFAULT NULL,        -- 'mine'
  p_unassigned boolean DEFAULT false,
  p_unanswered boolean DEFAULT false,     -- last_customer_message_at IS NULL
  p_search text DEFAULT NULL,             -- ILIKE name/phone
  p_tag_id uuid DEFAULT NULL,             -- tag filter (D-06/Q4 P4)
  p_agent_attended boolean DEFAULT NULL,  -- agent filter (D-06/Q4 P4)
  p_cursor_sort timestamptz DEFAULT NULL,
  p_cursor_is_null boolean DEFAULT false,
  p_cursor_id uuid DEFAULT NULL,
  p_limit int DEFAULT 50
) RETURNS SETOF conversations   -- approach A: base rows; TS re-joins contact/tags
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Write the keyset migration (indexes + SECURITY INVOKER RPC)</name>
  <files>supabase/migrations/20260611_conversations_keyset.sql</files>
  <read_first>
    - RESEARCH.md Q1 (lines 61-162 — the verbatim RPC body, NULL-band predicate, approach A) and Q2 (lines 166-197 — index DDL, CONCURRENTLY, NULLS LAST) and Q4 (lines 215-237 — filter→WHERE mapping incl. tag + agent)
    - PATTERNS.md section "supabase/migrations/...keyset.sql" (lines 223-269 — header convention, CONCURRENTLY no-transaction, GRANT, ROLLBACK footer)
    - supabase/migrations/20260501100400_somnio_v4_match_knowledge_base_rpc.sql (RPC convention analog)
    - supabase/migrations/20260605200000_relax_uq_meta_page_facebook_only.sql (header comment block analog)
    - CLAUDE.md Regla 5 (migration before deploy)
  </read_first>
  <action>
Create `supabase/migrations/20260611_conversations_keyset.sql` (use a real timestamp prefix `YYYYMMDDHHMMSS_conversations_keyset.sql` per repo convention if the runner needs full precision). Structure:

(1) Header comment block (PATTERNS lines 228-237 style): title, standalone name `whatsapp-inbox-reliability`, decision `D-08`, one-sentence rationale, and the line `-- REGLA 5: APPLY IN PROD BEFORE PUSHING W2 CODE.`

(2) The two indexes — NO BEGIN/COMMIT wrapper (CONCURRENTLY cannot run in a transaction; RESEARCH Q2/P3):
```sql
-- DO NOT wrap in BEGIN/COMMIT — CREATE INDEX CONCURRENTLY cannot run in a transaction.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_keyset_lcm
  ON conversations (workspace_id, status, last_customer_message_at DESC NULLS LAST, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_keyset_lm
  ON conversations (workspace_id, status, last_message_at DESC NULLS LAST, id DESC);
```
`NULLS LAST` is REQUIRED (default for DESC is NULLS FIRST) so Postgres satisfies the ORDER BY from the index (P2).

(3) The RPC `get_conversations_page` with the signature in `<interfaces>` above, `LANGUAGE sql STABLE`, **SECURITY INVOKER (default — do NOT use SECURITY DEFINER; RLS is_workspace_member must apply, P13)**. Body from RESEARCH Q1 (lines 121-152), EXTENDED with the tag + agent filters from Q4 (P4):
- `LEFT JOIN contacts ct ON ct.id = c.contact_id` (LEFT, not !inner — contactless conversations must still match by phone, Q3).
- Filters: status, is_read, assigned_to, unassigned (assigned_to IS NULL), unanswered (last_customer_message_at IS NULL), search (`ct.name ILIKE '%'||p_search||'%' OR c.phone ILIKE '%'||p_search||'%'`).
- Tag (Q4): `(p_tag_id IS NULL OR EXISTS (SELECT 1 FROM contact_tags ct2 WHERE ct2.contact_id = c.contact_id AND ct2.tag_id = p_tag_id))`.
- Agent (Q4): `(p_agent_attended IS NULL OR (p_agent_attended AND c.agent_conversational IS DISTINCT FROM false) OR (NOT p_agent_attended AND c.agent_conversational IS NOT DISTINCT FROM false))` — confirm the exact tri-state semantics against `conversation-list.tsx:171` while reading.
- NULL-aware keyset CASE on `p_sort` (RESEARCH lines 132-146 verbatim, both `last_message_at` and `last_customer_message_at` branches, including the null-band clauses).
- `ORDER BY CASE WHEN p_sort='last_message_at' THEN c.last_message_at END DESC NULLS LAST, CASE WHEN p_sort='last_customer_message_at' THEN c.last_customer_message_at END DESC NULLS LAST, c.id DESC LIMIT p_limit`.
- `RETURNS SETOF conversations` (approach A — base rows; plan 05 re-joins contact/tags in TS).

CRITICAL (security): all dynamic values arrive as TYPED RPC PARAMETERS (`p_search text`, `p_workspace_id uuid`, etc.). There must be NO string concatenation building SQL — the ILIKE uses `'%'||p_search||'%'` on a bound parameter (a value, not interpolated SQL), which is injection-safe. Do not use EXECUTE/dynamic SQL.

(4) `GRANT EXECUTE ON FUNCTION public.get_conversations_page(...) TO authenticated;`

(5) `-- ROLLBACK:` footer with `DROP FUNCTION IF EXISTS public.get_conversations_page(...)` + `DROP INDEX IF EXISTS idx_conversations_keyset_lcm` + `DROP INDEX IF EXISTS idx_conversations_keyset_lm`.

Do NOT drop `idx_conversations_updated` (RESEARCH Q2 — leave it; other callers order by it).
  </action>
  <verify>
    <automated>grep -c "SECURITY INVOKER\|CONCURRENTLY\|NULLS LAST\|get_conversations_page\|GRANT EXECUTE" supabase/migrations/20260611_conversations_keyset.sql</automated>
  </verify>
  <acceptance_criteria>
    - File contains `CREATE OR REPLACE FUNCTION public.get_conversations_page` with all 14 params from `<interfaces>`.
    - Function is SECURITY INVOKER (no `SECURITY DEFINER` token present): `grep -c "SECURITY DEFINER" <file>` returns 0.
    - Two `CREATE INDEX CONCURRENTLY ... DESC NULLS LAST, id DESC` present (lcm + lm).
    - NO `BEGIN;`/`COMMIT;` wrapping the CONCURRENTLY statements.
    - Keyset predicate includes the null-band clauses for BOTH sort branches (grep for `IS NOT DISTINCT FROM` and `IS NULL` in the keyset CASE).
    - Tag filter uses `EXISTS (... contact_tags ...)`; agent filter uses `agent_conversational IS DISTINCT FROM false`.
    - `GRANT EXECUTE ON FUNCTION public.get_conversations_page ... TO authenticated;` present.
    - `-- ROLLBACK:` footer with DROP FUNCTION + 2 DROP INDEX present.
    - No EXECUTE/dynamic-SQL string building: `grep -c "EXECUTE " <file>` returns 0.
  </acceptance_criteria>
  <done>The migration file exists with NULL-correct keyset RPC (SECURITY INVOKER), both CONCURRENTLY NULLS-LAST indexes, server-side filters incl. tag+agent, GRANT, and ROLLBACK footer.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: [BLOCKING] Apply migration in PROD, then confirm (Regla 5)</name>
  <what-built>The keyset migration file. It is NOT yet applied to the prod DB. Per CLAUDE.md Regla 5, the migration MUST be applied in prod by the user BEFORE plan 05 (which calls the RPC) is pushed — otherwise pushed code would reference an RPC/indexes that do not exist (the exact failure class Regla 5 was written to prevent).</what-built>
  <how-to-verify>
PAUSE. Ask the user to apply `supabase/migrations/20260611_conversations_keyset.sql` to the PROD Supabase database, then wait for explicit confirmation.

Instructions to give the user:
1. Apply the two `CREATE INDEX CONCURRENTLY` statements first (they cannot run inside a transaction; run them as standalone statements, e.g. via the Supabase SQL editor one at a time, or `psql` without a transaction block). On 2559 rows this is fast, but CONCURRENTLY keeps the hot conversations table unlocked.
2. Apply the `CREATE OR REPLACE FUNCTION get_conversations_page` + `GRANT EXECUTE`.
3. Sanity-check after applying:
   - `SELECT proname, prosecdef FROM pg_proc WHERE proname='get_conversations_page';` → one row, `prosecdef = false` (SECURITY INVOKER).
   - `SELECT indexname FROM pg_indexes WHERE tablename='conversations' AND indexname IN ('idx_conversations_keyset_lcm','idx_conversations_keyset_lm');` → both rows present.
   - Smoke the RPC (page 1, default sort): `SELECT count(*) FROM get_conversations_page('a3843b3f-c337-4836-92b5-89c58bb98490');` → returns up to 50.

Do NOT push any application code in this plan. Plan 05 carries the F-1 code and is gated on this confirmation.
  </how-to-verify>
  <resume-signal>Type "migración aplicada" (or "applied") once the migration is live in prod and the pg_proc/pg_indexes sanity checks pass. Plan 05 will not start until then.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| client search/filter params → SQL function | search string, tag id, cursor cross from the browser into the RPC |
| authenticated role → conversations rows | RPC executes under the caller's role; must stay workspace-isolated |

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-wir-06 | Tampering (SQLi) | p_search / p_tag_id / cursor params | mitigate | All inputs are typed RPC parameters bound as values; ILIKE uses `'%'||p_search||'%'` on a bound param (no SQL string interpolation); no EXECUTE/dynamic SQL |
| T-wir-07 | Information disclosure (cross-workspace) | get_conversations_page | mitigate | SECURITY INVOKER (NOT DEFINER) preserves RLS `is_workspace_member`; `p_workspace_id` is filtered AND RLS double-gates; plan 05 passes workspaceId from `getRequestAuth`, never from client body |
| T-wir-08 | DoS (table lock on hot table) | CREATE INDEX | mitigate | CONCURRENTLY + applied in prod by user out-of-band (Regla 5) — no exclusive lock on the live realtime-written table |
</threat_model>

<verification>
- grep gates in Task 1 acceptance criteria all pass.
- pg_proc shows `prosecdef = false` (SECURITY INVOKER) in prod.
- Both keyset indexes present in pg_indexes (prod).
- RPC smoke returns up to 50 rows for the Somnio workspace.
</verification>

<success_criteria>
- NULL-correct keyset RPC + composite NULLS-LAST indexes live in prod.
- RLS preserved (SECURITY INVOKER), injection-safe (typed params, no dynamic SQL).
- User confirmed application BEFORE any dependent code ships (Regla 5).
</success_criteria>

<output>
After completion, create `.planning/standalone/whatsapp-inbox-reliability/04-SUMMARY.md`
</output>
