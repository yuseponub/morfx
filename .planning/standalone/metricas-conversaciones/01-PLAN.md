---
phase: standalone/metricas-conversaciones
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/20260406000000_conversation_metrics_module.sql
autonomous: false
must_haves:
  truths:
    - "RPC get_conversation_metrics exists in production and returns table(day, nuevas, reabiertas, agendadas)"
    - "Calling the RPC with a known workspace returns correct day-bucketed counts in America/Bogota timezone"
    - "Removing tag VAL from a contact decrements the day's agendadas count on next call"
    - "First-ever inbound message in workspace is counted as nueva (not reabierta)"
  artifacts:
    - path: "supabase/migrations/20260406000000_conversation_metrics_module.sql"
      provides: "RPC get_conversation_metrics + idx_conversations_workspace_created"
      contains: "CREATE OR REPLACE FUNCTION get_conversation_metrics"
  key_links:
    - from: "get_conversation_metrics"
      to: "conversations / messages / contact_tags / tags"
      via: "CTE with LAG() window function and AT TIME ZONE 'America/Bogota'"
      pattern: "AT TIME ZONE 'America/Bogota'"
---

<objective>
Create the Postgres migration that defines the `get_conversation_metrics` RPC and a supporting index. This RPC is the single backend entry point for the entire Métricas de Conversaciones module.

Purpose: Centralize the 3 metric calculations (nuevas, reabiertas, agendadas) in one Postgres function so the JS layer is just a thin wrapper. SECURITY INVOKER respects existing RLS.

Output: One migration file applied in production. After this plan, the RPC is callable from any Supabase client and downstream plans can build the UI on top of it.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/metricas-conversaciones/CONTEXT.md
@.planning/standalone/metricas-conversaciones/RESEARCH.md
@supabase/migrations/20260130000002_whatsapp_conversations.sql
@supabase/migrations/20260129000001_contacts_and_tags.sql
@supabase/migrations/20260306000000_workspace_settings_column.sql
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create migration file with RPC + index</name>
  <files>supabase/migrations/20260406000000_conversation_metrics_module.sql</files>
  <action>
Create the migration file with EXACTLY this content (verbatim from RESEARCH.md, lines 384-463, with corrections for the strict "nueva" definition).

Migration MUST include:

1. `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_workspace_created ON conversations(workspace_id, created_at DESC);`
   - Note: Supabase migrations run in a transaction by default. CONCURRENTLY cannot run inside a transaction. Wrap with `COMMIT;` before and `BEGIN;` after, OR use plain `CREATE INDEX IF NOT EXISTS` (drop CONCURRENTLY). Use plain `CREATE INDEX IF NOT EXISTS` here — table is small enough and Supabase migration runner does not support transaction-less migrations cleanly.

2. `CREATE OR REPLACE FUNCTION get_conversation_metrics(p_workspace_id UUID, p_start TIMESTAMPTZ, p_end TIMESTAMPTZ, p_reopen_days INT DEFAULT 7, p_tag_name TEXT DEFAULT 'VAL') RETURNS TABLE (day DATE, nuevas INT, reabiertas INT, agendadas INT) LANGUAGE sql SECURITY INVOKER AS $$ ... $$;`

3. CTE structure (5 CTEs):
   - `days`: `generate_series` over the date range bucketed in America/Bogota
   - `nuevas_q`: STRICT VERSION — count of conversations in the workspace whose first inbound message timestamp falls in the range. Use:
     ```sql
     SELECT date_trunc('day', first_in AT TIME ZONE 'America/Bogota')::date AS day,
            COUNT(*)::int AS n
     FROM (
       SELECT m.conversation_id, MIN(m.timestamp) AS first_in
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE c.workspace_id = p_workspace_id
         AND m.direction = 'inbound'
       GROUP BY m.conversation_id
     ) t
     WHERE first_in >= p_start AND first_in < p_end
     GROUP BY 1
     ```
     CRITICAL: Do NOT use `conversations.created_at` for nuevas — orchestrator guidance overrides RESEARCH.md here. CONTEXT.md says "debe existir al menos un mensaje INBOUND del cliente para contar". Outbound-first conversations must NOT count.

   - `msg_win`: window function `LAG(m.timestamp) OVER (PARTITION BY m.conversation_id ORDER BY m.timestamp)` over inbound messages, joined to conversations for workspace filter, with cushion `p_start - (p_reopen_days || ' days')::interval`.

   - `reabiertas_q`: filter `prev_in IS NOT NULL AND timestamp - prev_in >= (p_reopen_days || ' days')::interval AND timestamp >= p_start AND timestamp < p_end`. Group by day in Bogota TZ.

   - `agendadas_q`: count `contact_tags` where `tag_id = (SELECT id FROM tags WHERE workspace_id = p_workspace_id AND name = p_tag_name LIMIT 1)` and `created_at` in [p_start, p_end). Group by day in Bogota TZ.

4. Final SELECT joins `days` LEFT JOIN each CTE, COALESCE to 0, ORDER BY day.

5. `GRANT EXECUTE ON FUNCTION get_conversation_metrics(UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, TEXT) TO authenticated;`

6. Header comment block explaining purpose and that timezone is America/Bogota throughout.

WHY strict nueva matters: an outbound template that the customer never replies to should NOT inflate the "new conversations" metric. Pitfall 4 in RESEARCH.md.

WHY no CONCURRENTLY: Supabase CLI runs migrations in transactions; CONCURRENTLY is incompatible.
  </action>
  <verify>
Run `cat supabase/migrations/20260406000000_conversation_metrics_module.sql | grep -E "(CREATE OR REPLACE FUNCTION|AT TIME ZONE 'America/Bogota'|LAG\(|SECURITY INVOKER|GRANT EXECUTE|direction = 'inbound'|prev_in IS NOT NULL)"` returns at least 7 matching lines.

File must be valid SQL: `cat supabase/migrations/20260406000000_conversation_metrics_module.sql | head -5` shows the header comment.
  </verify>
  <done>Migration file exists, contains the RPC with strict-inbound nueva definition, LAG-based reabiertas with prev_in NOT NULL guard, and Bogota timezone bucketing in every date_trunc.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: PAUSE — User applies migration in production</name>
  <what-built>Migration file `supabase/migrations/20260406000000_conversation_metrics_module.sql` is ready to apply.</what-built>
  <how-to-verify>
Per CLAUDE.md Rule 5, this migration MUST be applied to production BEFORE any code that calls the RPC is pushed.

Steps for the user:
1. Open Supabase Dashboard → SQL Editor for the production project
2. Paste the entire content of `supabase/migrations/20260406000000_conversation_metrics_module.sql`
3. Run it. Confirm "Success. No rows returned"
4. Verify the function exists:
   ```sql
   SELECT proname FROM pg_proc WHERE proname = 'get_conversation_metrics';
   ```
   Should return one row.
5. Smoke test against the GoDentist Valoraciones workspace (ask user for workspace_id):
   ```sql
   SELECT * FROM get_conversation_metrics(
     '<godentist-workspace-id>'::uuid,
     (NOW() - INTERVAL '7 days')::timestamptz,
     (NOW() + INTERVAL '1 day')::timestamptz,
     7,
     'VAL'
   );
   ```
   Should return one row per day in the range with nuevas/reabiertas/agendadas (may be 0s if low activity, but no error).
6. Verify the index exists:
   ```sql
   SELECT indexname FROM pg_indexes WHERE indexname = 'idx_conversations_workspace_created';
   ```
  </how-to-verify>
  <resume-signal>Type "migración aplicada" once the function and index exist in production and the smoke test returned rows without errors.</resume-signal>
</task>

<task type="auto">
  <name>Task 3: Commit migration</name>
  <files>supabase/migrations/20260406000000_conversation_metrics_module.sql</files>
  <action>
After user confirms migration is applied in production, commit ONLY the migration file:

```bash
git add supabase/migrations/20260406000000_conversation_metrics_module.sql
git commit -m "feat(metricas): RPC get_conversation_metrics + index

- Centraliza calculo de nuevas/reabiertas/agendadas en Postgres
- SECURITY INVOKER respeta RLS por workspace
- Strict nueva: requiere al menos un inbound (MIN(timestamp) WHERE direction='inbound')
- LAG() window function para reabiertas con prev_in NOT NULL guard
- Bucketing en America/Bogota en todas las queries
- Aplicada en produccion antes del push (CLAUDE.md Rule 5)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

DO NOT push yet — Plan 02 will push together with the JS wrapper.
  </action>
  <verify>`git log -1 --name-only` shows the migration file as the last commit.</verify>
  <done>Migration committed locally with reference to CLAUDE.md Rule 5.</done>
</task>

</tasks>

<verification>
- Migration file syntactically valid SQL
- RPC defined with SECURITY INVOKER
- Strict inbound filter on nueva
- LAG-based reabiertas with NOT NULL guard
- All date_trunc use America/Bogota
- GRANT EXECUTE to authenticated
- User confirmed applied in production
- Committed locally
</verification>

<success_criteria>
- `pg_proc` in production contains `get_conversation_metrics`
- Index `idx_conversations_workspace_created` exists in production
- Smoke test SQL returns rows without errors against GoDentist workspace
- Local commit references the migration
</success_criteria>

<output>
After completion, create `.planning/standalone/metricas-conversaciones/01-SUMMARY.md` with:
- Migration file path
- Production application timestamp (from user)
- Smoke test result snapshot
- Any deviations from RESEARCH.md SQL (especially the strict-inbound nueva change)
</output>
