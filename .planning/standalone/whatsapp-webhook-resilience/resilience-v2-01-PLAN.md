---
phase: standalone/whatsapp-webhook-resilience
plan: 01
type: implementation
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/20260225_webhook_events_retry_columns.sql
  - CLAUDE.md
autonomous: true

must_haves:
  truths:
    - "Migration adds retry_count INTEGER NOT NULL DEFAULT 0 column to whatsapp_webhook_events"
    - "Migration adds reprocessed_at TIMESTAMPTZ column to whatsapp_webhook_events"
    - "Migration DROPs existing CHECK constraint and CREATEs new one with 5 statuses: pending, processed, failed, reprocessed, dead_letter"
    - "Migration is idempotent-safe (uses DROP CONSTRAINT IF EXISTS)"
    - "CLAUDE.md contains Regla 5 about migration-before-deploy workflow"
  artifacts:
    - path: "supabase/migrations/20260225_webhook_events_retry_columns.sql"
      provides: "Schema changes for retry tracking and expanded status flow"
      contains: "retry_count"
    - path: "CLAUDE.md"
      provides: "Regla 5 documenting migration-before-deploy process rule"
      contains: "Regla 5"
  key_links: []
---

<objective>
Create the database migration that adds retry tracking columns and expanded status values to whatsapp_webhook_events, and add Regla 5 to CLAUDE.md to prevent future migration-deploy desync incidents.

Purpose: The migration is a prerequisite for all code changes (Plans 02 and 03 depend on the new columns and status values existing). Regla 5 codifies the operational rule that caused the original 20-hour outage.
Output: One migration SQL file ready to apply, and CLAUDE.md updated with the new rule.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/whatsapp-webhook-resilience/CONTEXT-v2.md
@.planning/standalone/whatsapp-webhook-resilience/RESEARCH-v2.md
@supabase/migrations/20260220_whatsapp_webhook_events.sql
@CLAUDE.md
</context>

<feature>
  <name>Retry Columns Migration + Regla 5</name>
  <files>
    supabase/migrations/20260225_webhook_events_retry_columns.sql
    CLAUDE.md
  </files>
  <behavior>
    Task 1: Create migration file `supabase/migrations/20260225_webhook_events_retry_columns.sql`

    The migration must:
    1. Add `retry_count INTEGER NOT NULL DEFAULT 0` to whatsapp_webhook_events
    2. Add `reprocessed_at TIMESTAMPTZ` (nullable) to whatsapp_webhook_events
    3. DROP the existing CHECK constraint `whatsapp_webhook_events_status_check`
    4. CREATE a new CHECK constraint with the same name allowing 5 statuses:
       'pending', 'processed', 'failed', 'reprocessed', 'dead_letter'
    5. Add a partial index on failed events with retry_count < 3 for efficient replay queries:
       `CREATE INDEX idx_wa_webhook_events_replayable ON whatsapp_webhook_events(status, retry_count, created_at ASC) WHERE status = 'failed' AND retry_count < 3;`

    IMPORTANT: PostgreSQL does not support ALTER CONSTRAINT. Must DROP and re-CREATE.
    Use `DROP CONSTRAINT IF EXISTS` for idempotency safety.

    SQL pattern (from RESEARCH-v2.md):
    ```sql
    ALTER TABLE whatsapp_webhook_events
      ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN reprocessed_at TIMESTAMPTZ;

    ALTER TABLE whatsapp_webhook_events
      DROP CONSTRAINT IF EXISTS whatsapp_webhook_events_status_check;

    ALTER TABLE whatsapp_webhook_events
      ADD CONSTRAINT whatsapp_webhook_events_status_check
      CHECK (status IN ('pending', 'processed', 'failed', 'reprocessed', 'dead_letter'));
    ```

    Task 2: Add Regla 5 to CLAUDE.md

    Add after the existing Regla 4 section (before "## Stack Tecnologico"):

    ```markdown
    ## Regla 5: Migracion Antes de Deploy

    TODA migracion de base de datos DEBE aplicarse en produccion ANTES de pushear codigo que la usa.

    Workflow obligatorio:
    1. Crear archivo de migracion en `supabase/migrations/`
    2. **PAUSAR** — pedir al usuario que aplique la migracion en produccion
    3. **ESPERAR** confirmacion explicita del usuario
    4. Solo entonces pushear el codigo que depende del nuevo schema

    **PROHIBIDO:** Pushear codigo que referencia columnas, tablas o constraints que no existen en produccion.

    Razon: El incidente de 20h de mensajes perdidos fue causado por codigo desplegado que referenciaba una columna inexistente, y el mecanismo de resiliencia tampoco funcionó porque su tabla tampoco existia.
    ```
  </behavior>
  <implementation>
    1. Create migration file with ADD COLUMN, DROP/CREATE CONSTRAINT, and new index.
    2. Edit CLAUDE.md to insert Regla 5 after the Regla 4 section, before Stack Tecnologico.
  </implementation>
</feature>

<verification>
```bash
cd /mnt/c/Users/Usuario/Proyectos/morfx-new

# Verify migration file exists and has correct content
cat supabase/migrations/20260225_webhook_events_retry_columns.sql

# Verify CLAUDE.md has Regla 5
grep -n "Regla 5" CLAUDE.md

# Verify migration SQL syntax (basic check — no DB connection needed)
grep "retry_count" supabase/migrations/20260225_webhook_events_retry_columns.sql
grep "reprocessed_at" supabase/migrations/20260225_webhook_events_retry_columns.sql
grep "dead_letter" supabase/migrations/20260225_webhook_events_retry_columns.sql
grep "DROP CONSTRAINT" supabase/migrations/20260225_webhook_events_retry_columns.sql
```
Migration file exists with retry_count, reprocessed_at, expanded CHECK constraint. CLAUDE.md contains Regla 5.

IMPORTANT: After this plan completes, the executor MUST pause and ask the user to apply the migration in production before proceeding to Plan 02.
</verification>

<success_criteria>
- Migration file created at supabase/migrations/20260225_webhook_events_retry_columns.sql
- Migration adds retry_count INTEGER NOT NULL DEFAULT 0
- Migration adds reprocessed_at TIMESTAMPTZ
- Migration DROPs old CHECK and CREATEs new one with 5 statuses
- Migration adds partial index for replayable events
- CLAUDE.md has Regla 5 section explaining migration-before-deploy workflow
- No other files modified
</success_criteria>

<output>
After completion, create `.planning/standalone/whatsapp-webhook-resilience/resilience-v2-01-SUMMARY.md`

CRITICAL: After this plan, PAUSE execution. Ask the user to apply the migration in production. Do NOT proceed to Plan 02 until user confirms the migration is applied. This follows Regla 5.
</output>
