---
phase: sms-time-window-by-type
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/20260418040000_sms_source_not_null.sql
autonomous: true

must_haves:
  truths:
    - "Query de distribución de sms_messages.source ejecutada en producción y resultado documentado en el summary"
    - "Archivo supabase/migrations/20260418040000_sms_source_not_null.sql existe con UPDATE condicional + ALTER COLUMN SET NOT NULL"
    - "La migración fue aplicada en producción por el usuario vía Supabase Studio"
    - "Post-apply: SELECT COUNT(*) FROM sms_messages WHERE source IS NULL retorna 0"
    - "sms_messages.source es NOT NULL en el schema de producción"
  artifacts:
    - path: "supabase/migrations/20260418040000_sms_source_not_null.sql"
      provides: "Migración que hace NOT NULL la columna source + backfill condicional a 'automation'"
      contains: "ALTER COLUMN source SET NOT NULL"
  key_links:
    - from: "supabase/migrations/20260418040000_sms_source_not_null.sql"
      to: "sms_messages.source column (creada en 20260316100000_sms_onurix_foundation.sql:94)"
      via: "ALTER TABLE sms_messages ALTER COLUMN source SET NOT NULL"
      pattern: "ALTER COLUMN source SET NOT NULL"
---

<objective>
Crear la migración que enforza por contrato de schema que `sms_messages.source` nunca sea NULL, y aplicarla en producción ANTES de pushear el código que depende de ella (Regla 5 de CLAUDE.md).

Propósito: Defender la compliance marketing-vs-transactional por contrato de DB (columna NOT NULL) y no por runtime check. Con esta migración, ningún SMS persistido en producción puede tener origen ambiguo — condición necesaria para que el guard permisivo del Plan 02 sea seguro (D-02).

Output: 1 archivo de migración SQL nuevo + confirmación del usuario de que fue aplicada en prod.

**Nota sobre autonomous=true:** Task 1 es autónomo (crea el archivo + commit). Task 2 es `checkpoint:human-action` que provee el gate de Regla 5 independientemente del flag de plan-level. El plan como conjunto pausa en Task 2 por el checkpoint, no por el flag de frontmatter.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/sms-time-window-by-type/CONTEXT.md
@.planning/standalone/sms-time-window-by-type/RESEARCH.md
@supabase/migrations/20260316100000_sms_onurix_foundation.sql
@supabase/migrations/20260418030000_sms_provider_state_raw.sql
@CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Crear archivo de migración 20260418040000_sms_source_not_null.sql</name>
  <files>supabase/migrations/20260418040000_sms_source_not_null.sql</files>
  <read_first>
    - .planning/standalone/sms-time-window-by-type/CONTEXT.md (completo — decisiones D-02 y D-05)
    - .planning/standalone/sms-time-window-by-type/RESEARCH.md §Example 1 (contenido SQL verbatim)
    - supabase/migrations/20260316100000_sms_onurix_foundation.sql (línea 94, confirma que ADD COLUMN source DEFAULT 'automation' ya existe)
    - supabase/migrations/20260418030000_sms_provider_state_raw.sql (última migración aplicada — template de estilo)
    - CLAUDE.md §"Regla 5: Migración Antes de Deploy" (contexto bloqueante)
  </read_first>
  <action>
Crear el archivo `supabase/migrations/20260418040000_sms_source_not_null.sql` con el siguiente contenido VERBATIM (tomado de RESEARCH.md §Example 1):

```sql
-- Migration: 20260418040000_sms_source_not_null.sql
-- Phase: standalone/sms-time-window-by-type (D-02, D-05)
-- Depends on: 20260316100000_sms_onurix_foundation.sql (adds source column)
--             20260418030000_sms_provider_state_raw.sql (last prior migration)
--
-- Enforces by contract that every sms_messages row has a source value.
-- This is the compliance defense for the permissive isTransactionalSource
-- helper: if source is never NULL, no SMS silently bypasses the marketing guard
-- due to missing origin data.

-- 1. Conditional backfill — safe to run even if zero NULL rows exist.
--    All pre-existing SMS in prod are transactional (no campaign module yet),
--    so 'automation' is the correct default value.
UPDATE sms_messages
SET source = 'automation'
WHERE source IS NULL;

-- 2. Enforce NOT NULL. DEFAULT 'automation' from foundation migration preserved.
--    After this, any insert without explicit source falls back to 'automation'
--    via the column default. The RPC insert_and_deduct_sms_message already
--    requires p_source TEXT as a non-default parameter, so domain callers
--    cannot omit it.
ALTER TABLE sms_messages
  ALTER COLUMN source SET NOT NULL;

-- ============================================================================
-- END OF MIGRATION
-- Verification query (run post-apply, expected null_count = 0):
--   SELECT COUNT(*) AS null_count FROM sms_messages WHERE source IS NULL;
-- Expected: 0
-- ============================================================================
```

NO agregar CHECK constraint (RESEARCH §Q2 descarta — defer). NO modificar el default existente. El archivo es idempotente: el UPDATE es seguro aunque no haya rows NULL.

Verificar timestamp: el archivo DEBE llamarse `20260418040000_sms_source_not_null.sql` (estrictamente mayor al último `20260418030000_sms_provider_state_raw.sql`).

Commit atómico en español:
```
feat(sms-source-not-null): migración NOT NULL en sms_messages.source

- Backfill condicional source='automation' si hay rows NULL
- ALTER COLUMN source SET NOT NULL
- Defensa por contrato para guard marketing-vs-transactional (D-02)

Co-Authored-By: Claude <noreply@anthropic.com>
```
  </action>
  <verify>
    <automated>test -f supabase/migrations/20260418040000_sms_source_not_null.sql && grep -q "ALTER COLUMN source SET NOT NULL" supabase/migrations/20260418040000_sms_source_not_null.sql && grep -q "UPDATE sms_messages" supabase/migrations/20260418040000_sms_source_not_null.sql && grep -q "WHERE source IS NULL" supabase/migrations/20260418040000_sms_source_not_null.sql</automated>
  </verify>
  <acceptance_criteria>
    - `test -f supabase/migrations/20260418040000_sms_source_not_null.sql` exits 0
    - `grep -c "ALTER COLUMN source SET NOT NULL" supabase/migrations/20260418040000_sms_source_not_null.sql` returns 1
    - `grep -c "UPDATE sms_messages" supabase/migrations/20260418040000_sms_source_not_null.sql` returns 1
    - `grep -c "WHERE source IS NULL" supabase/migrations/20260418040000_sms_source_not_null.sql` returns 1
    - `grep -c "CHECK (source IN" supabase/migrations/20260418040000_sms_source_not_null.sql` returns 0 (NO CHECK constraint — defer per Q2)
    - El archivo NO modifica el DEFAULT 'automation' existente
    - Git commit existe con prefijo `feat(sms-source-not-null)`
  </acceptance_criteria>
  <done>Archivo de migración creado, committeado, listo para que el usuario lo aplique en producción.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: CHECKPOINT Regla 5 — Usuario corre distribución + aplica migración en prod</name>
  <files>N/A (acción humana en Supabase Studio)</files>
  <read_first>
    - .planning/standalone/sms-time-window-by-type/CONTEXT.md §D-05 (decisión del backfill condicional)
    - .planning/standalone/sms-time-window-by-type/RESEARCH.md §"Production distribution query" (queries Q1, Q2, Q3)
    - CLAUDE.md §"Regla 5: Migración Antes de Deploy" (por qué este checkpoint es bloqueante)
    - supabase/migrations/20260418040000_sms_source_not_null.sql (archivo creado en Task 1)
  </read_first>
  <what-built>
Task 1 creó la migración `supabase/migrations/20260418040000_sms_source_not_null.sql` con backfill condicional + NOT NULL constraint.

La migración NO se ha aplicado a producción todavía. Regla 5 de CLAUDE.md exige que la migración se aplique en prod ANTES de pushear código que dependa de ella (Plan 02).
  </what-built>
  <how-to-verify>
PASO 1 — Correr las queries de distribución en Supabase Studio (SQL editor) contra la DB de producción y pegar el output en el chat:

```sql
-- Query 1: Distribución de source values
SELECT source, COUNT(*) AS n
FROM sms_messages
GROUP BY source
ORDER BY n DESC;

-- Query 2: NULL count específico (D-05 gate)
SELECT COUNT(*) AS null_count FROM sms_messages WHERE source IS NULL;

-- Query 3: Source strings inesperados (fuera del set canónico)
SELECT DISTINCT source
FROM sms_messages
WHERE source IS NOT NULL
  AND source NOT IN ('automation', 'domain-call', 'script', 'campaign', 'marketing');
```

PASO 2 — Interpretar según RESEARCH.md §"Interpretation rules for planner":
- Query 1: esperado solo 'automation' (confirma universo transaccional).
- Query 2: esperado 0 (el default 'automation' de la migración foundation backfilleó al momento de ADD COLUMN).
- Query 3: esperado empty (lista canónica exhaustiva).

PASO 3 — Aplicar la migración en Supabase Studio:
- Abrir `supabase/migrations/20260418040000_sms_source_not_null.sql` localmente.
- Copiar el contenido del archivo al SQL editor de Supabase Studio de producción.
- Ejecutar.
- Confirmar: debería terminar sin error. Si la query 2 retornó > 0, el UPDATE corre primero y luego el ALTER succeds.

PASO 4 — Verificar post-apply corriendo en Supabase Studio:

```sql
-- 1. NOT NULL aplicado
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'sms_messages' AND column_name = 'source';
-- Esperado: is_nullable = 'NO', column_default = ''automation''::text

-- 2. Sanity check final
SELECT COUNT(*) AS null_count FROM sms_messages WHERE source IS NULL;
-- Esperado: 0
```

PASO 5 — Pegar los resultados de los 4 pasos en el chat y confirmar.
  </how-to-verify>
  <acceptance_criteria>
    - Output de Query 1 pegado en el chat (distribución de source values en prod)
    - Output de Query 2 pegado en el chat (null_count)
    - Output de Query 3 pegado en el chat (source strings inesperados)
    - Migración ejecutada sin error en Supabase Studio de producción
    - Post-apply: `is_nullable = 'NO'` para `sms_messages.source`
    - Post-apply: `null_count = 0`
    - Confirmación explícita del usuario: "migración aplicada, null_count=0"
  </acceptance_criteria>
  <resume-signal>
Responder "migración aplicada, null_count=0" (o pegar los outputs y decir "listo — procede con Plan 02"). Si hay rows NULL o errores inesperados, describir el issue para ajustar el plan antes de continuar.
  </resume-signal>
  <done>Migración aplicada en producción, null_count confirmado = 0, column NOT NULL en schema prod, usuario autorizó avanzar al Plan 02.</done>
</task>

</tasks>

<verification>
- supabase/migrations/20260418040000_sms_source_not_null.sql existe y commiteado
- Grep confirma: UPDATE, WHERE source IS NULL, ALTER COLUMN source SET NOT NULL (3 patterns presentes)
- NO CHECK constraint en la migración (defer per Q2)
- Timestamp del archivo estrictamente mayor a 20260418030000_sms_provider_state_raw.sql
- Checkpoint completado: usuario ejecutó queries + aplicó migración + confirmó null_count=0 en prod
- Regla 5 respetada: NINGÚN código que dependa de source NOT NULL se ha pusheado aún (el Plan 02 recién arranca después de este checkpoint)
</verification>

<success_criteria>
- Archivo SQL de migración creado y commiteado en la rama main local
- Migración aplicada en producción por el usuario (confirmación explícita en chat)
- `sms_messages.source` es NOT NULL en schema prod
- Datos en prod: distribución documentada; null_count = 0
- Listo para proceder con Plan 02 (refactor de código TS) sin riesgo de Regla 5 drift
</success_criteria>

<output>
Después de completar, crear `.planning/standalone/sms-time-window-by-type/01-SUMMARY.md` con:
- Output literal de Query 1, Query 2, Query 3 (distribución prod)
- Confirmación de usuario de que la migración fue aplicada
- Timestamp de aplicación
- Cualquier sorpresa (rows NULL encontrados, sources inesperados, etc.)
</output>
</output>
