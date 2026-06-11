---
phase: standalone-whatsapp-inbox-reliability
plan: 04
subsystem: database
tags: [postgres, rpc, keyset, pagination, supabase, whatsapp, inbox, migration, rls]

# Dependency graph
requires:
  - phase: 03
    provides: Wave 1 structural wins (grapheme initials, revalidatePath removal, chat error state) shipped before the keyset surgery
provides:
  - "get_conversations_page RPC (SECURITY INVOKER, 14 typed params, NULL-correct keyset over last_customer_message_at / last_message_at)"
  - "idx_conversations_keyset_lcm + idx_conversations_keyset_lm composite NULLS-LAST indexes (CONCURRENTLY)"
  - "Server-side filter surface: status, is_read, mine, unassigned, unanswered, ILIKE search, tag (EXISTS contact_tags), agent (IS DISTINCT FROM false)"
affects: [whatsapp-inbox-reliability plan 05 (F-1 code: getConversationsPage action + use-conversations paging + virtualization)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "NULL-correct keyset pagination via Postgres RPC (not chained .or() which silently drops NULL-sorted rows)"
    - "SECURITY INVOKER read RPC preserving workspace RLS (deliberate contrast to service_role match_knowledge_base)"
    - "Composite index column order mirrors ORDER BY ... DESC NULLS LAST, id DESC so the sort is satisfied from the index"

key-files:
  created:
    - supabase/migrations/20260611160000_conversations_keyset.sql
  modified: []

key-decisions:
  - "Approach A locked: RPC returns SETOF conversations (base rows); plan 05 re-joins contact/tags in TS via a single .in(id) re-hydrate"
  - "Full-precision timestamp prefix 20260611160000 per repo migration convention (vs the plan's placeholder 20260611_)"
  - "Forbidden literal 'SECURITY DEFINER' removed from a clarifying comment so the acceptance gate grep -c 'SECURITY DEFINER' = 0 holds (meaning preserved with 'definer-rights function')"

patterns-established:
  - "Migration HOW-TO-APPLY header for Regla 5 manual application: CONCURRENTLY indexes run first as standalone statements, then the function + GRANT"

requirements-completed: [F-1, D-08, D-01, D-05, D-06]

# Metrics
duration: ~12min
completed: 2026-06-11
---

# Phase standalone-whatsapp-inbox-reliability Plan 04: Keyset Migration Summary

**NULL-correct `get_conversations_page` Postgres RPC (SECURITY INVOKER, 14 typed params) + two composite NULLS-LAST keyset indexes — the DB foundation for F-1 server-side keyset pagination, awaiting the Regla 5 prod-apply pause (T2).**

## Performance

- **Duration:** ~12 min
- **Tasks:** 1 of 2 executed automatically (T1). T2 is a `checkpoint:human-action` (Regla 5) presented by the orchestrator — NOT executed here.
- **Files created:** 1

## Accomplishments
- `get_conversations_page` RPC written with the NULL-band keyset predicate for BOTH sort modes (`last_customer_message_at` default + `last_message_at` toggle) — the chained `.or()` approach is ruled out because it silently drops NULL-sorted rows (every outbound-only conversation), which would re-create the exact invisibility bug this standalone fixes.
- Two composite indexes `(workspace_id, status, <sort> DESC NULLS LAST, id DESC)` via `CREATE INDEX CONCURRENTLY` (no transaction wrapper) so Postgres satisfies the ORDER BY from the index without a sort node and the build does not lock the hot table.
- Server-side filter surface folded into the RPC window: status, is_read, mine (`assigned_to`), unassigned, unanswered (NULL test — the prior "PostgREST can't compare" comment was wrong), ILIKE search over `contacts.name` + `phone` (LEFT JOIN, not !inner), tag (`EXISTS contact_tags`), agent (`agent_conversational IS DISTINCT FROM false`, mirroring `conversation-list.tsx:171`).
- Injection-safe by construction: all dynamic values are TYPED RPC PARAMETERS bound as values; ILIKE uses `'%'||p_search||'%'` on a bound param; zero `EXECUTE`/dynamic SQL (T-wir-06). SECURITY INVOKER preserves workspace RLS (T-wir-07).
- `GRANT EXECUTE ... TO authenticated` + a `-- ROLLBACK:` footer (DROP FUNCTION + 2 DROP INDEX).

## Task Commits

1. **Task 1: Write the keyset migration (indexes + SECURITY INVOKER RPC)** — `8779b625` (feat)

_Task 2 produces no commit: it is the Regla 5 human-action pause (user applies the migration in prod)._

## Files Created/Modified
- `supabase/migrations/20260611160000_conversations_keyset.sql` — `get_conversations_page` RPC + `idx_conversations_keyset_lcm` + `idx_conversations_keyset_lm`. Header carries the Regla 5 apply-before-push note and a step-by-step manual HOW-TO-APPLY (CONCURRENTLY indexes first, then function + GRANT).

## Acceptance Gates (all pass)
- `grep -c "SECURITY INVOKER\|CONCURRENTLY\|NULLS LAST\|get_conversations_page\|GRANT EXECUTE"` → 24 (>0).
- `grep -c "SECURITY DEFINER"` → **0** (gate satisfied; the clarifying comment was reworded to avoid the literal token).
- Real `CREATE INDEX CONCURRENTLY` statements (line-start) → **2** (lcm + lm), both `DESC NULLS LAST, id DESC`.
- No `BEGIN;`/`COMMIT;` wrapper; no `EXECUTE`/dynamic SQL.
- Null-band clauses present for BOTH sort branches (`IS NOT DISTINCT FROM` ×4).
- Tag filter `EXISTS (... contact_tags ...)`; agent filter `agent_conversational IS DISTINCT FROM false`.
- 14 params present (matches `<interfaces>`); GRANT + ROLLBACK signatures list the 14 types in declaration order.
- `RETURNS SETOF conversations` (approach A) — matches what plan 05's `getConversationsPage` expects.

## Decisions Made
- **Approach A locked** (RESEARCH Q1 recommendation): RPC returns base `conversations` rows; the join to contact/tags stays in TS (plan 05) for a single source of truth on `ConversationWithDetails`.
- **Timestamp prefix `20260611160000`** (full precision) per repo convention; the plan listed `20260611_conversations_keyset.sql` as a placeholder and explicitly allowed full precision "if the runner needs full precision". The `files_modified` frontmatter name differs only in the timestamp granularity.
- Reworded one comment to drop the literal string `SECURITY DEFINER` so the plan's `grep -c "SECURITY DEFINER" = 0` acceptance criterion holds with the file's intent intact.

## Deviations from Plan
None affecting behavior — plan executed as written. Two cosmetic adjustments noted under Decisions (full-precision filename prefix; comment reword to satisfy the `SECURITY DEFINER` = 0 grep gate). No DB changes were made (per instructions, T2 applies to prod).

## Issues Encountered
- The initial draft's clarifying comment contained the literal token `SECURITY DEFINER` ("do NOT add SECURITY DEFINER"), which made the acceptance grep return 1 instead of 0. Resolved by rewording to "intentionally NOT a definer-rights function" / "vs match_knowledge_base (service_role)" — gate now returns 0 with the security intent preserved.

## User Setup Required — PENDING (Regla 5, blocking plan 05)

**Task 2 (`checkpoint:human-action`) is NOT done.** The migration file is committed but NOT applied to the prod Supabase DB. Per CLAUDE.md Regla 5, the user MUST apply it in prod BEFORE plan 05 (which calls the RPC) is pushed — otherwise pushed code would reference a non-existent RPC/indexes (the exact failure class Regla 5 prevents).

Steps for the user (also in the migration file header):
1. Run the two `CREATE INDEX CONCURRENTLY` statements FIRST, each as a standalone statement (CONCURRENTLY cannot run inside a transaction).
2. Run `CREATE OR REPLACE FUNCTION get_conversations_page` + `GRANT EXECUTE`.
3. Sanity checks:
   - `SELECT proname, prosecdef FROM pg_proc WHERE proname='get_conversations_page';` → one row, `prosecdef = false`.
   - `SELECT indexname FROM pg_indexes WHERE tablename='conversations' AND indexname IN ('idx_conversations_keyset_lcm','idx_conversations_keyset_lm');` → both present.
   - `SELECT count(*) FROM get_conversations_page('a3843b3f-c337-4836-92b5-89c58bb98490');` → up to 50.

Resume signal: user confirms "migración aplicada" / "applied". Plan 05 does not start until then. No application code is pushed in this plan.

## Next Phase Readiness
- DB foundation file ready and committed (`8779b625`). **Blocked on the Regla 5 prod-apply confirmation (T2)** before plan 05 (F-1 code) can ship.
- The RPC signature is locked exactly to plan 04's `<interfaces>` block — plan 05's `getConversationsPage` action can call it 1:1.

---
*Phase: standalone-whatsapp-inbox-reliability*
*Completed: 2026-06-11 (T1 only; T2 Regla 5 pause pending)*

## Self-Check: PASSED
- FOUND: supabase/migrations/20260611160000_conversations_keyset.sql
- FOUND: .planning/standalone/whatsapp-inbox-reliability/04-SUMMARY.md
- FOUND: commit 8779b625 in git history
