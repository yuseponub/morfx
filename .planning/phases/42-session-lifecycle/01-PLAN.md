---
phase: 42-session-lifecycle
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/20260410000000_session_lifecycle_partial_unique.sql
  - supabase/migrations/20260410000001_close_stale_sessions_rpc.sql
autonomous: false

must_haves:
  truths:
    - "Partial unique index on agent_sessions(conversation_id, agent_id) WHERE status='active' exists in prod"
    - "Old UNIQUE(conversation_id, agent_id) constraint no longer exists in prod"
    - "Postgres function close_stale_agent_sessions() exists in prod and returns count of rows closed"
    - "Diagnostic query results have been captured by user and reviewed before any code lands"
  artifacts:
    - supabase/migrations/20260410000000_session_lifecycle_partial_unique.sql
    - supabase/migrations/20260410000001_close_stale_sessions_rpc.sql
  key_links:
    - "Migration applied in prod BEFORE any Wave 2 code push (Regla 5)"
---

<objective>
Pre-deploy diagnostics + schema migration. This plan is the foundation gate for Phase 42: it produces the SQL migration files (partial unique index + close_stale_agent_sessions RPC), documents the exact diagnostic queries the user must run in production, and PAUSES with an explicit checkpoint for the user to apply the migration in production before any code referencing the new schema is written or pushed.

Purpose: Regla 5 compliance. Zero code touching the new index or RPC can land until the migration is applied in prod.
Output: Two migration files + user confirmation that prod schema has been updated.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/phases/42-session-lifecycle/42-CONTEXT.md
@.planning/phases/42-session-lifecycle/42-RESEARCH.md
@supabase/migrations/20260205000000_agent_sessions.sql
</context>

<tasks>

<task type="auto">
  <name>Task 1: Write diagnostic runbook + user-facing SQL</name>
  <files>.planning/phases/42-session-lifecycle/42-DIAGNOSTICS.md</files>
  <action>
Create a runbook file with the 6 diagnostic queries from 42-RESEARCH.md ## Diagnostic Queries (Q1 through Q6), each with:
- Query name + purpose
- Verbatim SQL
- Expected output / interpretation
- What action to take based on result

Add at the top a "Run order" section explaining:
1. Q1 (constraint name) MUST be run before writing the migration DROP line — if the returned name is NOT `agent_sessions_conversation_id_agent_id_key`, the migration file must be edited to use the actual name.
2. Q2, Q3, Q4, Q5, Q6 are informational and captured in the runbook.
3. Q3 specifically answers Open Question #1 from 42-RESEARCH.md: if `stale_cron_rule > 1000`, flag in SUMMARY that a manual one-off tighter run (WHERE last_activity_at < NOW() - INTERVAL '30 days') must happen before enabling the cron in 05-PLAN.

Do NOT execute these queries yourself — they run against production and only the user can do so. The runbook is for the user.
  </action>
  <verify>File exists at .planning/phases/42-session-lifecycle/42-DIAGNOSTICS.md with all 6 queries, clearly labelled, with run order and interpretation notes.</verify>
  <done>User can open this file, copy each query into Supabase SQL editor, and know what to do with the output.</done>
</task>

<task type="auto">
  <name>Task 2: Write partial unique index migration file</name>
  <files>supabase/migrations/20260410000000_session_lifecycle_partial_unique.sql</files>
  <action>
Create the migration file with the exact content from 42-RESEARCH.md ## Migration Notes:

```sql
-- Phase 42: drop full unique constraint, replace with partial unique index
-- See .planning/phases/42-session-lifecycle/42-CONTEXT.md §3.2 for rationale
-- See .planning/phases/42-session-lifecycle/42-RESEARCH.md ## Migration Notes for verification

-- Step 1: drop the original constraint (Postgres default name)
-- IMPORTANT: Verified via diagnostic Q1 (SELECT conname FROM pg_constraint ...)
-- If Q1 returns a different name, edit this line BEFORE applying in prod.
ALTER TABLE agent_sessions
  DROP CONSTRAINT IF EXISTS agent_sessions_conversation_id_agent_id_key;

-- Step 2: create partial unique index — only actives must be unique per (conv, agent)
-- Allows N historical closed/handed_off rows per (conversation_id, agent_id)
-- while enforcing at-most-one active at a time.
CREATE UNIQUE INDEX IF NOT EXISTS agent_sessions_one_active_per_conv_agent
  ON agent_sessions(conversation_id, agent_id)
  WHERE status = 'active';
```

Use `IF EXISTS` and `IF NOT EXISTS` for idempotency (42-RESEARCH.md ## Migration Notes — Why IF NOT EXISTS). Do NOT use `CREATE INDEX CONCURRENTLY` — Supabase migrations run in a transaction and concurrent index builds cannot.

Add a header comment pointing to the CONTEXT and RESEARCH files.
  </action>
  <verify>File exists, SQL parses (can be dry-run locally with `supabase db reset` in a scratch branch if needed, but not required). Contains both ALTER TABLE and CREATE UNIQUE INDEX statements with IF EXISTS / IF NOT EXISTS guards.</verify>
  <done>Migration file ready for user to paste into Supabase SQL editor.</done>
</task>

<task type="auto">
  <name>Task 3: Write close_stale_agent_sessions() RPC migration</name>
  <files>supabase/migrations/20260410000001_close_stale_sessions_rpc.sql</files>
  <action>
Create the RPC migration file with the content from 42-RESEARCH.md ## Code Examples (Example 1, the RPC variant — explicitly recommended over the JS-side date math approach):

```sql
-- Phase 42: RPC for nightly cron (close-stale-sessions Inngest function)
-- Keeps timezone math in SQL using native date_trunc + timezone
-- See .planning/phases/42-session-lifecycle/42-CONTEXT.md §3.3 for rule rationale

CREATE OR REPLACE FUNCTION close_stale_agent_sessions()
RETURNS TABLE(closed_count INTEGER) AS $$
  WITH closed AS (
    UPDATE agent_sessions
    SET status = 'closed',
        updated_at = timezone('America/Bogota', NOW())
    WHERE status = 'active'
      AND last_activity_at < date_trunc('day', timezone('America/Bogota', NOW()))
    RETURNING id
  )
  SELECT COUNT(*)::INTEGER FROM closed;
$$ LANGUAGE SQL;
```

Key properties:
- Only touches `status = 'active'` rows (never `handed_off`, per CONTEXT §3.3)
- Uses `date_trunc('day', timezone('America/Bogota', NOW()))` so sessions chatted past midnight Bogota survive
- Returns row count so the Inngest cron can log observability metrics
- `CREATE OR REPLACE` makes it idempotent
  </action>
  <verify>File exists, SQL parses, function signature matches what 02-PLAN will call (`supabase.rpc('close_stale_agent_sessions')` returning `[{closed_count: N}]`).</verify>
  <done>RPC migration ready for user to apply.</done>
</task>

<task type="checkpoint:human-action">
  <name>Task 4: PAUSE — user applies migration + runs diagnostics in production</name>
  <files>—</files>
  <action>
STOP execution. Present the following to the user:

---

**PAUSE — Regla 5 (CLAUDE.md): migration must be applied in prod BEFORE any code lands.**

Please do the following in Supabase SQL editor on production:

1. **Run Q1 first** (from `42-DIAGNOSTICS.md`) to confirm the constraint name:
   ```sql
   SELECT conname FROM pg_constraint
   WHERE conrelid = 'agent_sessions'::regclass AND contype = 'u';
   ```
   - Expected: `agent_sessions_conversation_id_agent_id_key`
   - If different: tell me the actual name so I can edit the migration before you apply it.

2. **Run Q2, Q3, Q4, Q5, Q6** from `42-DIAGNOSTICS.md` and paste the results back to me. Q3 is especially important — it tells us how many sessions the first cron run will close (dimensions risk for 05-PLAN).

3. **Apply migration 20260410000000_session_lifecycle_partial_unique.sql** (partial unique index).

4. **Apply migration 20260410000001_close_stale_sessions_rpc.sql** (RPC function).

5. **Verify** with:
   ```sql
   SELECT indexname FROM pg_indexes WHERE tablename = 'agent_sessions';
   -- Expect: agent_sessions_one_active_per_conv_agent present

   SELECT proname FROM pg_proc WHERE proname = 'close_stale_agent_sessions';
   -- Expect: 1 row
   ```

6. **Reply `done` + paste Q3 output** so I can continue with Wave 2.

Do NOT proceed past this task without explicit user confirmation. Wave 2 plans reference the partial index and the RPC — pushing that code before the migration is applied will cause production failures (see CLAUDE.md Regla 5 incident reference).
---
  </action>
  <verify>User has replied with `done` AND has provided Q3 output (stale_cron_rule count). If stale_cron_rule > 1000, mark a flag in the SUMMARY for 05-PLAN to handle a manual one-off run.</verify>
  <done>User confirmed migration applied in prod; Q3 results captured; safe to proceed to Wave 2.</done>
</task>

</tasks>

<verification>
- Both migration files exist on disk
- 42-DIAGNOSTICS.md runbook exists with all 6 queries
- User has explicitly confirmed migration applied in prod
- Q3 stale_cron_rule count captured (for 05-PLAN conditional)
- If Q1 returned a different constraint name, migration file was edited before user applied it
</verification>

<success_criteria>
- `pg_indexes` in prod shows `agent_sessions_one_active_per_conv_agent`
- Old `agent_sessions_conversation_id_agent_id_key` constraint gone
- `close_stale_agent_sessions()` function callable in prod
- Wave 2 plans unblocked
</success_criteria>

<output>
After completion, create `.planning/phases/42-session-lifecycle/42-01-SUMMARY.md` capturing:
- Confirmation of migration application
- Q3 output (stale_cron_rule number) — THIS IS LOAD-BEARING for 05-PLAN
- Any deviations (constraint name mismatch, unexpected duplicate rows from Q4)
</output>
