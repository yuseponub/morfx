---
phase: agent-godentist
plan: 07
type: execute
wave: 3
depends_on: ["agent-godentist-06"]
files_modified:
  - supabase/migrations/YYYYMMDDHHMMSS_godentist_templates.sql
autonomous: false

must_haves:
  truths:
    - "All ~70 templates are inserted into agent_templates with agent_id='godentist'"
    - "Templates have correct intent, visit_type, orden, content_type, priority, and delay_s"
    - "Variable placeholders ({{nombre}}, {{campos_faltantes}}, etc.) are preserved in content"
    - "Migration is idempotent (can be run multiple times without duplicates)"
  artifacts:
    - path: "supabase/migrations/YYYYMMDDHHMMSS_godentist_templates.sql"
      provides: "SQL migration with all GoDentist templates"
      min_lines: 200
  key_links:
    - from: "supabase/migrations/YYYYMMDDHHMMSS_godentist_templates.sql"
      to: "src/lib/agents/godentist/config.ts"
      via: "agent_id = 'godentist' matches GODENTIST_AGENT_ID"
      pattern: "godentist"
---

<objective>
Create the SQL migration that seeds all ~70 GoDentist templates into the agent_templates table.

Purpose: The response track loads templates from the database. All ~70 templates from the PLANTILLAS.md design doc must be seeded for the agent to produce responses.

Output: SQL migration file with all templates. User must apply migration before deploying code.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-godentist/PLANTILLAS.md
@.planning/standalone/agent-godentist/DISENO-COMPLETO.md
@src/lib/agents/godentist/constants.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create SQL migration for all GoDentist templates</name>
  <files>supabase/migrations/YYYYMMDDHHMMSS_godentist_templates.sql</files>
  <action>
Create a SQL migration file. Use the current timestamp for the filename (e.g., `20260317210000_godentist_templates.sql`).

First, check the agent_templates table schema:
```sql
-- Check existing table structure
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'agent_templates';
```

The migration should:

1. **Delete existing GoDentist templates** (for idempotency):
```sql
DELETE FROM agent_templates WHERE agent_id = 'godentist';
```

2. **Insert all templates** from PLANTILLAS.md. Each template needs:
   - `id`: UUID (use gen_random_uuid())
   - `agent_id`: 'godentist'
   - `intent`: template intent name (matches what response-track.ts looks up)
   - `visit_type`: 'primera_vez' (always, following v3 pattern)
   - `orden`: sequential within intent (1 for CORE, 2 for COMP, 3 for OPCIONAL)
   - `content_type`: 'texto' (all templates are text)
   - `content`: template text with {{variable}} placeholders preserved
   - `delay_s`: 0 for CORE, 3 for COMPLEMENTARIA, 5 for OPCIONAL
   - `priority`: 'CORE', 'COMPLEMENTARIA', or 'OPCIONAL'
   - `workspace_id`: NULL (global templates)

**Template mapping (intent names must match response-track.ts resolution):**

SALUDO:
- intent='saludo', priority='CORE', content=saludo text

OPCIONAL UNIVERSAL:
- intent='recordatorio_sin_compromiso', priority='OPCIONAL', content=reminder text

PRECIOS (22 CORE + 14 COMP):
- intent='precio_corona', priority='CORE', content=corona price text
- intent='precio_corona', priority='COMPLEMENTARIA', content=corona comp text (orden=2)
- intent='precio_protesis', priority='CORE'...
- intent='precio_protesis', priority='COMPLEMENTARIA'...
- ... (all 23 services from PLANTILLAS.md)

NOTE: For `precio_ortodoncia_general`, use intent='precio_ortodoncia_general' — this is the overview template that lists all orthodontic options.

INFORMACIONALES:
- intent='valoracion_costo', priority='CORE'
- intent='valoracion_costo', priority='COMPLEMENTARIA' (comp text, orden=2)
- intent='valoracion_costo', priority='COMPLEMENTARIA' (excepcion text, orden=3 — the maxilofacial exception)
- intent='financiacion', priority='CORE' (use 'financiacion_resumen' content but intent='financiacion')
- intent='financiacion', priority='COMPLEMENTARIA' (medios_pago content, orden=2)
- intent='ubicacion', priority='CORE'
- intent='horarios', priority='CORE'
- intent='horarios', priority='COMPLEMENTARIA'
- intent='materiales', priority='CORE'
- intent='menores', priority='CORE'
- intent='seguros_eps', priority='CORE'
- intent='urgencia', priority='CORE'
- intent='urgencia', priority='COMPLEMENTARIA'
- intent='garantia', priority='CORE'
- intent='objecion_precio', priority='CORE'

FLUJO DE AGENDAMIENTO:
- intent='pedir_datos', priority='CORE'
- intent='pedir_datos_parcial', priority='CORE', content with {{campos_faltantes}}
- intent='confirmar_cita', priority='CORE', content with {{nombre}}, {{telefono}}, {{sede_preferida}}
- intent='cita_agendada', priority='CORE', content with confirmation
- intent='invitar_agendar', priority='CORE'

ESCAPE / CONTROL:
- intent='handoff', priority='CORE'
- intent='reagendamiento', priority='CORE'
- intent='cancelar_cita', priority='CORE'
- intent='fuera_horario', priority='CORE'
- intent='no_interesa', priority='CORE'
- intent='despedida', priority='CORE'

FOLLOW-UPS:
- intent='retoma_post_info', priority='CORE' (same as invitar_agendar)
- intent='retoma_datos', priority='CORE', content with {{campos_faltantes}}
- intent='retoma_confirmacion', priority='CORE'
- intent='retoma_final', priority='CORE'

ENGLISH:
- intent='english_response', priority='CORE'

IMPORTANT: Use exact content from PLANTILLAS.md. Preserve all emojis, line breaks (\n), and {{variable}} placeholders. Use E'' string syntax for content with special characters.

Make sure ALL ~70 templates are included. Count them at the end:
```sql
-- Verification query (not part of migration, just for checking)
-- SELECT count(*), priority FROM agent_templates WHERE agent_id = 'godentist' GROUP BY priority;
```
  </action>
  <verify>
Count INSERT statements: should be approximately 70.
Verify no SQL syntax errors by reviewing the file.
  </verify>
  <done>
Migration file inserts all ~70 templates with correct agent_id, intent, priority, content, and variable placeholders. Migration is idempotent (deletes before inserting).
  </done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <action>Apply the migration to production database</action>
  <instructions>
The migration file has been created at `supabase/migrations/YYYYMMDDHHMMSS_godentist_templates.sql`.

Apply it to the production Supabase database:
1. Open the Supabase dashboard
2. Go to SQL Editor
3. Paste and run the migration SQL
4. Verify: `SELECT count(*) FROM agent_templates WHERE agent_id = 'godentist';` — should return approximately 70
  </instructions>
  <resume-signal>Type "migration applied" when complete</resume-signal>
</task>

</tasks>

<verification>
- Migration file exists and has ~70 INSERT statements
- All templates from PLANTILLAS.md are covered
- Intent names match what response-track.ts looks up
- Variable placeholders preserved in content
- Migration applied to production
</verification>

<success_criteria>
- `SELECT count(*) FROM agent_templates WHERE agent_id = 'godentist'` returns ~70
- All template intents match response-track.ts resolution
- Variable substitution works ({{nombre}}, {{campos_faltantes}}, etc.)
</success_criteria>

<output>
After completion, create `.planning/standalone/agent-godentist/07-SUMMARY.md`
</output>
