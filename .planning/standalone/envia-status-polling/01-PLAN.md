---
phase: envia-status-polling
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/20260410_order_carrier_events.sql
  - supabase/migrations/20260410_carrier_configs_polling.sql
autonomous: false

must_haves:
  truths:
    - "order_carrier_events table exists with correct schema"
    - "carrier_configs has status_polling_pipeline_id and status_polling_stage_ids columns"
    - "Indexes exist for efficient querying by order_id, workspace_id, guia"
  artifacts:
    - path: "supabase/migrations/20260410_order_carrier_events.sql"
      provides: "State change history table"
      contains: "CREATE TABLE order_carrier_events"
    - path: "supabase/migrations/20260410_carrier_configs_polling.sql"
      provides: "Polling config columns on carrier_configs"
      contains: "status_polling_pipeline_id"
  key_links: []
---

<objective>
Create database migrations for the Envia status polling feature: a new `order_carrier_events` table to store state change history per order/guide, and new columns on `carrier_configs` for polling stage configuration.

Purpose: The polling cron needs a table to store state changes, and carrier_configs needs to know which pipeline stages contain orders to poll.
Output: Two migration SQL files ready for the user to apply in production.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/envia-status-polling/CONTEXT.md
@.planning/standalone/envia-status-polling/RESEARCH.md
@supabase/migrations/20260225000000_order_notes.sql
@src/lib/domain/carrier-configs.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create migration files</name>
  <files>
    supabase/migrations/20260410_order_carrier_events.sql
    supabase/migrations/20260410_carrier_configs_polling.sql
  </files>
  <action>
Create two migration files:

**Migration 1: `20260410_order_carrier_events.sql`**
```sql
CREATE TABLE order_carrier_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  guia text NOT NULL,
  carrier text NOT NULL DEFAULT 'envia',
  estado text NOT NULL,
  cod_estado integer NOT NULL,
  novedades jsonb DEFAULT '[]',
  raw_response jsonb,
  created_at timestamptz DEFAULT timezone('America/Bogota', NOW())
);

CREATE INDEX idx_order_carrier_events_order ON order_carrier_events(order_id);
CREATE INDEX idx_order_carrier_events_workspace ON order_carrier_events(workspace_id);
CREATE INDEX idx_order_carrier_events_guia ON order_carrier_events(guia);
CREATE INDEX idx_order_carrier_events_created ON order_carrier_events(created_at DESC);
```

**Migration 2: `20260410_carrier_configs_polling.sql`**
```sql
ALTER TABLE carrier_configs
  ADD COLUMN status_polling_pipeline_id uuid REFERENCES pipelines(id),
  ADD COLUMN status_polling_stage_ids uuid[] DEFAULT '{}';
```

Follow existing migration naming convention. Use `timezone('America/Bogota', NOW())` for created_at (project standard).
  </action>
  <verify>Both files exist in supabase/migrations/ directory. SQL syntax is valid (no typos in table/column names).</verify>
  <done>Migration files created and ready for user to apply in production.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: Apply migrations in production</name>
  <action>
Per Regla 5: migrations MUST be applied in production BEFORE pushing code that uses them.

User must apply both migrations in Supabase production:
1. `supabase/migrations/20260410_order_carrier_events.sql`
2. `supabase/migrations/20260410_carrier_configs_polling.sql`

Run them in the Supabase SQL Editor in production.
  </action>
  <resume-signal>Type "migrations applied" when both migrations are running in production.</resume-signal>
</task>

</tasks>

<verification>
- [ ] `order_carrier_events` table exists with all columns (id, workspace_id, order_id, guia, carrier, estado, cod_estado, novedades, raw_response, created_at)
- [ ] `carrier_configs` has `status_polling_pipeline_id` and `status_polling_stage_ids` columns
- [ ] All indexes created
</verification>

<success_criteria>
Both migrations applied in production. Tables and columns exist and are ready for code to use.
</success_criteria>

<output>
After completion, create `.planning/standalone/envia-status-polling/01-SUMMARY.md`
</output>
