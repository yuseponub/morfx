---
phase: coordinadora-api-integration
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - supabase/migrations/20260526000000_coordinadora_carrier_events_extension.sql
autonomous: false
requirements: []
must_haves:
  truths:
    - "Migration file exists with additive ALTER + generated column codigo_estado_idem + partial UNIQUE INDEX over plain column list"
    - "Migration applied in production Supabase BEFORE any code referencing new columns ships"
    - "Existing Envia rows have source='cron:envia' backfilled"
    - "Existing insertCarrierEvent code still works (NULLable order_id is additive)"
    - "Generated column codigo_estado_idem is STORED + auto-derived from COALESCE(codigo_estado, '') — inserts do not set it explicitly"
  artifacts:
    - path: "supabase/migrations/20260526000000_coordinadora_carrier_events_extension.sql"
      provides: "Additive schema migration relaxing order_id NOT NULL + 11 new columns + 1 generated column + composite UNIQUE INDEX (plain column list)"
      contains: "ALTER COLUMN order_id DROP NOT NULL"
      contains2: "CREATE UNIQUE INDEX IF NOT EXISTS idx_carrier_events_coordinadora_idempotency"
      contains3: "GENERATED ALWAYS AS (COALESCE(codigo_estado, '')) STORED"
      contains4: "codigo_estado_idem"
  key_links:
    - from: "migration file"
      to: "production database"
      via: "user manually applies via Supabase Studio (Regla 5 PAUSE)"
      pattern: "user confirms 'applied' before push to Vercel"
    - from: "UNIQUE INDEX column list (codigo_estado_idem)"
      to: "Plan 06 onConflict string (codigo_estado_idem)"
      via: "PostgREST/Supabase upsert matches plain-column-list index — generated column makes index 'plain' from inference POV"
      pattern: "onConflict in Plan 06 references generated column name verbatim"
---

<objective>
Create the additive migration file that:

1. Relaxes `order_carrier_events.order_id` from NOT NULL → NULLABLE (D-22)
2. Adds 11 new NULLable columns (tracking_number, fecha, hora, codigo, codigo_estado, codigo_novedad, nit_cliente, div_cliente, vinculo_guia, source, env)
3. Adds a **generated STORED column `codigo_estado_idem` = COALESCE(codigo_estado, '')** to make NULL-safe idempotency work via PostgREST `onConflict` (Pitfall 4 — postgres expression indexes are NOT matchable by plain column-list `ON CONFLICT`, so we materialize the expression into a real column)
4. Backfills `source='cron:envia'` for existing Envia rows
5. Creates a partial composite UNIQUE INDEX `idx_carrier_events_coordinadora_idempotency` over **plain column list** (`workspace_id, tracking_number, fecha, hora, codigo, codigo_estado_idem`), filtered by `WHERE carrier = 'coordinadora'`

Then PAUSE for user to apply in production (Regla 5 BLOCKING).

Purpose: Unblock all downstream work AND lock idempotency mechanism at the schema level (no debug pivot at smoke-1 time — the generated column makes PostgREST `onConflict` match the index unambiguously).

Output: Migration file committed to git + user confirmation that migration has been applied in production Supabase Studio.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/coordinadora-api-integration/CONTEXT.md
@.planning/standalone/coordinadora-api-integration/RESEARCH.md
@.planning/standalone/coordinadora-api-integration/PATTERNS.md
@CLAUDE.md
@supabase/migrations/20260410000003_order_carrier_events.sql
@supabase/migrations/20260420000443_platform_config.sql
@supabase/migrations/20260421155713_seed_recompra_crm_reader_flag.sql
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create additive migration file</name>
  <files>supabase/migrations/20260526000000_coordinadora_carrier_events_extension.sql</files>
  <read_first>
    - supabase/migrations/20260410000003_order_carrier_events.sql (full — current schema being extended)
    - supabase/migrations/20260420000443_platform_config.sql:23-36 (GRANT/COMMENT trailer pattern)
    - .planning/standalone/coordinadora-api-integration/RESEARCH.md §Schema Migration Proposal (lines 1036-1106 — base SQL; revision adds generated column)
    - .planning/standalone/coordinadora-api-integration/RESEARCH.md §Pitfall 4 lines 863-887 (COALESCE NULL semantics — root reason for the generated column)
    - .planning/standalone/coordinadora-api-integration/PATTERNS.md lines 552-625 (migration patterns + deviations)
    - CLAUDE.md §Regla 5 (Migration Before Deploy — for context on Task 2 PAUSE)
  </read_first>
  <action>
    Create file at `supabase/migrations/20260526000000_coordinadora_carrier_events_extension.sql` with the following content VERBATIM. This is the locked SQL — Pitfall 4 workaround materialized via a generated column so PostgREST `onConflict` can reference a plain column list (see Plan 06 lines that set `onConflict: 'workspace_id,tracking_number,fecha,hora,codigo,codigo_estado_idem'`):

    ```sql
    -- ============================================================================
    -- Coordinadora API Integration — additive extension of order_carrier_events
    -- Standalone: coordinadora-api-integration (2026-05-26)
    --
    -- WHY: D-21 reuse table, D-22 allow null order_id (webhook race), D-07
    -- composite idempotency key, D-09 multi-tenant nit_cliente persistence.
    --
    -- NON-BREAKING for envia-status-polling.ts: existing columns untouched,
    -- new columns are NULLable, new index is partial (carrier='coordinadora').
    --
    -- IDEMPOTENCY MECHANISM (Pitfall 4 — locked by revision iteration 1):
    --   - codigo_estado is NULLable (some events have no novedad)
    --   - PostgREST .upsert({ onConflict: 'col_list' }) cannot match an EXPRESSION
    --     index like COALESCE(codigo_estado, '') — postgres requires exact column-list
    --     match for ON CONFLICT inference.
    --   - Solution: materialize COALESCE into a GENERATED STORED column
    --     `codigo_estado_idem`, then build the UNIQUE INDEX over plain columns.
    --     Now `onConflict: '...,codigo_estado_idem'` works at runtime.
    -- ============================================================================

    -- 1. Relax order_id (D-22 — webhook may arrive before order, or with unmatched tracking)
    ALTER TABLE order_carrier_events
      ALTER COLUMN order_id DROP NOT NULL;

    -- 2. Add Coordinadora-specific columns (NULLable — Envia rows leave them blank)
    ALTER TABLE order_carrier_events
      ADD COLUMN IF NOT EXISTS tracking_number TEXT,
      ADD COLUMN IF NOT EXISTS fecha           DATE,
      ADD COLUMN IF NOT EXISTS hora            TEXT,
      ADD COLUMN IF NOT EXISTS codigo          TEXT,
      ADD COLUMN IF NOT EXISTS codigo_estado   TEXT,
      ADD COLUMN IF NOT EXISTS codigo_novedad  TEXT,
      ADD COLUMN IF NOT EXISTS nit_cliente     TEXT,
      ADD COLUMN IF NOT EXISTS div_cliente     TEXT,
      ADD COLUMN IF NOT EXISTS vinculo_guia    TEXT,
      ADD COLUMN IF NOT EXISTS source          TEXT,
      ADD COLUMN IF NOT EXISTS env             TEXT;

    -- 3. Generated STORED column for NULL-safe idempotency (Pitfall 4 locked workaround).
    --    Postgres auto-derives this on every INSERT/UPDATE — callers NEVER set it explicitly.
    --    Making the UNIQUE INDEX reference this real column (instead of a COALESCE expression)
    --    is what allows PostgREST `onConflict: '...,codigo_estado_idem'` to match the index.
    ALTER TABLE order_carrier_events
      ADD COLUMN IF NOT EXISTS codigo_estado_idem TEXT
      GENERATED ALWAYS AS (COALESCE(codigo_estado, '')) STORED;

    -- 4. Backfill `source` for existing Envia rows (defensive — known by carrier)
    UPDATE order_carrier_events
    SET source = 'cron:envia'
    WHERE source IS NULL AND carrier ILIKE '%envia%';

    -- 5. Composite UNIQUE INDEX for idempotency (D-07). Partial — only coordinadora.
    --    Plain column list (no COALESCE expression here) — the COALESCE lives inside
    --    the generated column `codigo_estado_idem` from step 3. This makes the index
    --    matchable by PostgREST `ON CONFLICT (col_list)` inference at runtime.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_carrier_events_coordinadora_idempotency
      ON order_carrier_events (
        workspace_id,
        tracking_number,
        fecha,
        hora,
        codigo,
        codigo_estado_idem
      )
      WHERE carrier = 'coordinadora';

    -- 6. Indexes for query performance
    CREATE INDEX IF NOT EXISTS idx_carrier_events_tracking_number
      ON order_carrier_events(tracking_number)
      WHERE tracking_number IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_carrier_events_nit_cliente
      ON order_carrier_events(nit_cliente)
      WHERE nit_cliente IS NOT NULL;

    -- 7. RLS policies — already permissive (`is_workspace_member`), no change needed.

    -- 8. Comments for future archeology
    COMMENT ON COLUMN order_carrier_events.fecha IS 'Coordinadora event date (D-07 idempotency key part)';
    COMMENT ON COLUMN order_carrier_events.hora IS 'Coordinadora event time with microsecond precision';
    COMMENT ON COLUMN order_carrier_events.codigo IS 'Coordinadora status code OR novedad code when desc_estado fires';
    COMMENT ON COLUMN order_carrier_events.codigo_estado IS 'Current state when codigo is a novedad (D-19 semantica)';
    COMMENT ON COLUMN order_carrier_events.codigo_novedad IS 'Same value as codigo when event has novedad (D-19)';
    COMMENT ON COLUMN order_carrier_events.nit_cliente IS 'Coordinadora tenant identifier (D-09 multi-tenant key)';
    COMMENT ON COLUMN order_carrier_events.codigo_estado_idem IS 'Generated STORED = COALESCE(codigo_estado, ''''). Used by UNIQUE INDEX for NULL-safe idempotency. NEVER set explicitly on INSERT — Postgres derives it (Pitfall 4 revision-locked).';
    ```

    DO NOT include `GRANT ALL ON order_carrier_events TO ...` — table already granted in `20260410000003_order_carrier_events.sql:37-38`.

    DO NOT include `seed_coordinadora_api_v2_flag` SQL here — feature flag seed is in Plan 10 (separate migration).

    Commit message: `feat(coordinadora-api): add carrier-events extension migration (additive + generated column for idempotency)`
  </action>
  <verify>
    <automated>test -f supabase/migrations/20260526000000_coordinadora_carrier_events_extension.sql &amp;&amp; grep -c "ALTER COLUMN order_id DROP NOT NULL" supabase/migrations/20260526000000_coordinadora_carrier_events_extension.sql | grep -q "^1$" &amp;&amp; grep -c "idx_carrier_events_coordinadora_idempotency" supabase/migrations/20260526000000_coordinadora_carrier_events_extension.sql | grep -q "^1$" &amp;&amp; grep -c "GENERATED ALWAYS AS (COALESCE(codigo_estado, '')) STORED" supabase/migrations/20260526000000_coordinadora_carrier_events_extension.sql | grep -q "^1$" &amp;&amp; grep -c "codigo_estado_idem" supabase/migrations/20260526000000_coordinadora_carrier_events_extension.sql | awk '{ exit ($1 &gt;= 3 ? 0 : 1) }' &amp;&amp; grep -c "ADD COLUMN IF NOT EXISTS tracking_number" supabase/migrations/20260526000000_coordinadora_carrier_events_extension.sql | grep -q "^1$"</automated>
  </verify>
  <acceptance_criteria>
    - File `supabase/migrations/20260526000000_coordinadora_carrier_events_extension.sql` exists
    - Contains `ALTER COLUMN order_id DROP NOT NULL` exactly once
    - Contains `idx_carrier_events_coordinadora_idempotency` exactly once (CREATE UNIQUE INDEX line)
    - Contains `GENERATED ALWAYS AS (COALESCE(codigo_estado, '')) STORED` exactly once (the generated column definition)
    - Contains `codigo_estado_idem` at least 3 times (ADD COLUMN, CREATE UNIQUE INDEX column list, COMMENT)
    - Contains 11 `ADD COLUMN IF NOT EXISTS` lines (tracking_number, fecha, hora, codigo, codigo_estado, codigo_novedad, nit_cliente, div_cliente, vinculo_guia, source, env) PLUS the separate `ADD COLUMN IF NOT EXISTS codigo_estado_idem` for the generated column
    - UNIQUE INDEX column list is `(workspace_id, tracking_number, fecha, hora, codigo, codigo_estado_idem)` — plain identifiers ONLY (no `COALESCE(...)` expression inside the CREATE UNIQUE INDEX line itself)
    - Contains `WHERE carrier = 'coordinadora'` (partial index condition — does not conflict with Envia rows)
    - Contains the UPDATE backfill `SET source = 'cron:envia' WHERE source IS NULL AND carrier ILIKE '%envia%'`
    - Does NOT contain `CREATE TABLE` (additive only — no new tables here)
    - Does NOT contain `GRANT ALL ON order_carrier_events` (already granted by 20260410000003)
    - Filename timestamp `20260526000000` is later than all existing migrations (lexicographic ordering ensures it applies last)
  </acceptance_criteria>
  <done>Migration file committed to git with the generated-column idempotency workaround. Ready for user to apply in prod via Supabase Studio.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: [BLOCKING] PAUSE — User applies migration in production Supabase (Regla 5)</name>
  <what-built>Migration file `supabase/migrations/20260526000000_coordinadora_carrier_events_extension.sql` is committed but NOT YET APPLIED in production database.</what-built>
  <how-to-verify>
    User MUST:

    1. Open Supabase Studio at https://supabase.com/dashboard for the production project
    2. Navigate to SQL Editor
    3. Copy the ENTIRE content of `supabase/migrations/20260526000000_coordinadora_carrier_events_extension.sql` and paste into a new SQL query
    4. Click "Run" — verify zero errors
    5. Verify the schema change took effect with these read-only queries (paste each one):

       ```sql
       -- Verify order_id is now NULLable
       SELECT is_nullable FROM information_schema.columns
       WHERE table_name='order_carrier_events' AND column_name='order_id';
       -- Expected: YES
       ```

       ```sql
       -- Verify all 11 new columns exist
       SELECT column_name FROM information_schema.columns
       WHERE table_name='order_carrier_events'
         AND column_name IN ('tracking_number','fecha','hora','codigo','codigo_estado','codigo_novedad','nit_cliente','div_cliente','vinculo_guia','source','env')
       ORDER BY column_name;
       -- Expected: 11 rows
       ```

       ```sql
       -- Verify the generated column codigo_estado_idem exists and IS STORED+generated
       SELECT column_name, is_generated, generation_expression
       FROM information_schema.columns
       WHERE table_name='order_carrier_events' AND column_name='codigo_estado_idem';
       -- Expected: 1 row with is_generated='ALWAYS' and generation_expression containing COALESCE(codigo_estado, ...)
       ```

       ```sql
       -- Verify the partial UNIQUE INDEX exists AND references codigo_estado_idem (plain column, not expression)
       SELECT indexname, indexdef FROM pg_indexes
       WHERE tablename='order_carrier_events'
         AND indexname='idx_carrier_events_coordinadora_idempotency';
       -- Expected: 1 row with indexdef containing:
       --   * "codigo_estado_idem" (plain column reference)
       --   * "WHERE (carrier = 'coordinadora'::text)" (partial predicate)
       --   * NO "COALESCE" substring inside the index column list (the COALESCE lives in the generated column, not the index expression)
       ```

       ```sql
       -- Verify existing Envia rows have source='cron:envia' backfilled
       SELECT COUNT(*) FROM order_carrier_events WHERE source = 'cron:envia';
       -- Expected: >= count of existing Envia rows (may be 0 if no Envia rows exist yet)
       ```

    6. Once ALL 5 verification queries pass, type "applied" in this chat to unblock downstream work.
  </how-to-verify>
  <resume-signal>Type "applied" to confirm migration is live in production. If you see any errors, paste them here.</resume-signal>
  <done>User has confirmed via "applied" signal. Production database has order_id NULLABLE + 11 new columns + generated column codigo_estado_idem + partial UNIQUE INDEX referencing it + Envia backfill. Code that references new columns can now safely deploy. Plan 06 `onConflict: '...,codigo_estado_idem'` will match the index at runtime.</done>
</task>

</tasks>

<verification>
- Migration file exists at expected path with correct content (grep checks pass)
- User has manually confirmed migration applied in production (Regla 5 satisfied)
- Production schema verified via 5 read-only queries (incl. is_generated=ALWAYS on codigo_estado_idem)
</verification>

<success_criteria>
1. `supabase/migrations/20260526000000_coordinadora_carrier_events_extension.sql` committed to git
2. User has typed "applied" confirming production migration succeeded
3. Generated column `codigo_estado_idem` is STORED + auto-populated from COALESCE(codigo_estado, '')
4. UNIQUE INDEX references plain column `codigo_estado_idem` (matchable by PostgREST onConflict)
5. All downstream plans (02+) are unblocked
</success_criteria>

<output>
After completion, create `.planning/standalone/coordinadora-api-integration/01-SUMMARY.md` documenting:
- Migration filename + commit SHA
- Timestamp user confirmed "applied"
- Output of the 5 verification queries (paste raw results — especially the generated column metadata)
- Confirmation: index column list contains `codigo_estado_idem` (NOT a COALESCE expression)
- Any deviations from the locked SQL (should be zero)
</output>
