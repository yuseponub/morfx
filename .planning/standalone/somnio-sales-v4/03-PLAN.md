---
plan: 03
phase: somnio-sales-v4
wave: 0
depends_on: [01, 02]
files_modified:
  - supabase/migrations/20260501100300_somnio_v4_template_clone.sql
addresses_decisions: [D-13, D-26, D-27, D-59]
addresses_research_pitfalls: [Pitfall 1]
autonomous: false
estimated_tasks: 4
must_haves:
  truths:
    - "Todos los rows de agent_templates con agent_id='somnio-sales-v3' tienen contraparte con agent_id='somnio-sales-v4' en producción"
    - "Cero involucramiento Meta — operación 100% Postgres interno (Pitfall 1)"
    - "Template 'handoff_humano' existe en el catálogo v4 (D-59) — si no existe en v3, se crea explícitamente"
    - "Usuario confirmó ejecución antes del push"
  artifacts:
    - path: "supabase/migrations/20260501100300_somnio_v4_template_clone.sql"
      provides: "INSERT…SELECT clone de templates v3 → v4 + asegurar handoff_humano"
      contains: "INSERT INTO public.agent_templates"
  key_links:
    - from: "response-track.ts (Plan 06) usando SOMNIO_V4_AGENT_ID"
      to: "agent_templates.agent_id='somnio-sales-v4'"
      via: "TemplateManager filtra por agent_id"
      pattern: "agent_id = 'somnio-sales-v4'"
    - from: "Sub-loop no_match (Plan 05)"
      to: "Template handoff_humano de v4"
      via: "Lookup explícito por intent='handoff_humano'"
      pattern: "intent = 'handoff_humano'"
---

<objective>
Crear migración SQL que clona TODOS los templates de `agent_templates` con `agent_id='somnio-sales-v3'` a registros nuevos con `agent_id='somnio-sales-v4'`, contenido idéntico.

Patrón: `INSERT … SELECT` con guard `NOT EXISTS` (PATTERNS.md "Pattern B" — más limpio que Pattern A; v4 no modifica contenido por D-26).

Verificar/crear template `handoff_humano` (D-59 lo requiere; si v3 no lo tiene, lo agregamos explícito).

**Pitfall 1:** `agent_templates` es tabla Postgres INTERNAL, NO templates Meta HSM. Cero re-approval Meta. Pure SQL.

Output: 1 archivo SQL, committed; HALT para que el usuario ejecute en prod.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/standalone/somnio-sales-v4/CONTEXT.md
@.planning/standalone/somnio-sales-v4/RESEARCH.md
@.planning/standalone/somnio-sales-v4/PATTERNS.md
@supabase/migrations/20260427210000_pw_confirmation_template_catalog.sql
</context>

<interfaces>
<!-- agent_templates schema (verbatim de la lectura del archivo de v3) -->
Columnas relevantes para clonar: `id` (PK uuid), `agent_id` (TEXT, lo que cambia), `workspace_id` (UUID NULL), `intent` (TEXT), `visit_type` (TEXT), `priority` (TEXT — CORE/COMPLEMENTARIA), `orden` (INT), `content_type` (TEXT — texto/imagen/template), `content` (TEXT), `delay_s` (INT).

NOTA: el schema exacto debe verificarse durante el execute — si la columna se llama distinto en prod, Task 1 ajusta. RESEARCH confirma estas columnas en el pattern file `20260427210000_pw_confirmation_template_catalog.sql`.
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Crear migración INSERT…SELECT clone con handoff_humano fallback</name>
  <files>supabase/migrations/20260501100300_somnio_v4_template_clone.sql</files>
  <read_first>
    - .planning/standalone/somnio-sales-v4/PATTERNS.md (sección "YYYYMMDD_somnio_v4_template_clone.sql" — Pattern B verbatim)
    - .planning/standalone/somnio-sales-v4/CONTEXT.md (D-26, D-27, D-59)
    - .planning/standalone/somnio-sales-v4/RESEARCH.md (Pitfall 1 — agent_templates es interno, no Meta)
    - supabase/migrations/20260427210000_pw_confirmation_template_catalog.sql (header pattern, comentarios Regla 5)
  </read_first>
  <action>
Crear `supabase/migrations/20260501100300_somnio_v4_template_clone.sql`:

```sql
-- Standalone: somnio-sales-v4 / Plan 03
-- Clona TODOS los templates de somnio-sales-v3 a somnio-sales-v4 con contenido idéntico.
-- Pitfall 1 (RESEARCH): agent_templates es tabla Postgres INTERNAL, NO templates Meta HSM.
--   Cero involucramiento Meta. Cero re-approval. Pure SQL operation.
-- Pattern: PATTERNS.md "Pattern B — INSERT … SELECT FROM existing v3 rows"
-- D-26: contenido IDÉNTICO; v4 sólo cambia agent_id.
-- D-59: garantizar handoff_humano existe en v4 (si v3 no lo tiene, crear).
-- Regla 5: usuario aplica manualmente.

-- ROLLBACK (al final del archivo, comentado):
--   DELETE FROM public.agent_templates WHERE agent_id = 'somnio-sales-v4';

-- Pre-check: log cuántos rows hay en v3 para diff post-apply
DO $$
DECLARE v3_count INT;
BEGIN
  SELECT COUNT(*) INTO v3_count FROM public.agent_templates WHERE agent_id = 'somnio-sales-v3';
  RAISE NOTICE 'Templates somnio-sales-v3 a clonar: %', v3_count;
END $$;

-- Clone bulk: INSERT … SELECT con guard NOT EXISTS por (intent, visit_type, orden, workspace_id)
-- IMPORTANTE: si el schema real de agent_templates tiene columnas adicionales (created_at, updated_at, etc.),
-- agregarlas aquí o dejar que defaults las llenen.
INSERT INTO public.agent_templates (
  id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s
)
SELECT
  gen_random_uuid(),
  'somnio-sales-v4',
  v3.workspace_id,
  v3.intent,
  v3.visit_type,
  v3.priority,
  v3.orden,
  v3.content_type,
  v3.content,
  v3.delay_s
FROM public.agent_templates v3
WHERE v3.agent_id = 'somnio-sales-v3'
  AND NOT EXISTS (
    SELECT 1 FROM public.agent_templates v4
    WHERE v4.agent_id = 'somnio-sales-v4'
      AND v4.intent = v3.intent
      AND v4.visit_type IS NOT DISTINCT FROM v3.visit_type
      AND v4.orden = v3.orden
      AND v4.workspace_id IS NOT DISTINCT FROM v3.workspace_id
  );

-- D-59: garantizar template handoff_humano para v4 (si v3 no lo tiene, agregarlo nuevo)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.agent_templates
    WHERE agent_id = 'somnio-sales-v4' AND intent = 'handoff_humano'
  ) THEN
    INSERT INTO public.agent_templates (
      id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s
    ) VALUES (
      gen_random_uuid(),
      'somnio-sales-v4',
      'a3843b3f-c337-4836-92b5-89c58bb98490',  -- Somnio workspace
      'handoff_humano',
      NULL,                                     -- aplica a cualquier visit_type
      'CORE',
      0,
      'texto',
      'Un asesor te responde en breve. Gracias por tu paciencia.',
      0
    );
    RAISE NOTICE 'Template handoff_humano creado nuevo para somnio-sales-v4 (no existía en v3)';
  ELSE
    RAISE NOTICE 'Template handoff_humano ya existe en somnio-sales-v4 (clonado de v3)';
  END IF;
END $$;

-- Post-check: confirmar conteos parejos
DO $$
DECLARE
  v3_count INT;
  v4_count INT;
BEGIN
  SELECT COUNT(*) INTO v3_count FROM public.agent_templates WHERE agent_id = 'somnio-sales-v3';
  SELECT COUNT(*) INTO v4_count FROM public.agent_templates WHERE agent_id = 'somnio-sales-v4';
  RAISE NOTICE 'Post-clone: v3=% v4=% (v4 puede ser >= v3 si se creó handoff_humano nuevo)', v3_count, v4_count;
  IF v4_count < v3_count THEN
    RAISE EXCEPTION 'Clone incompleto: v4 (%)< v3 (%)', v4_count, v3_count;
  END IF;
END $$;
```

Notas operativas:
- Si el schema real tiene columnas adicionales (ej. `created_at`, `updated_at`), el SELECT debe agregarlas o dejar que los defaults DDL las pueblen — verificar al ejecutar.
- `IS NOT DISTINCT FROM` en lugar de `=` para que NULLs se traten como iguales en el guard `NOT EXISTS`.
- El template `handoff_humano` se crea con texto seguro y conservador; el operador puede ajustarlo después vía UI.
  </action>
  <verify>
    <automated>test -f supabase/migrations/20260501100300_somnio_v4_template_clone.sql && grep -q "INSERT INTO public.agent_templates" supabase/migrations/20260501100300_somnio_v4_template_clone.sql && grep -q "WHERE v3.agent_id = 'somnio-sales-v3'" supabase/migrations/20260501100300_somnio_v4_template_clone.sql && grep -q "'somnio-sales-v4'" supabase/migrations/20260501100300_somnio_v4_template_clone.sql && grep -q "intent = 'handoff_humano'" supabase/migrations/20260501100300_somnio_v4_template_clone.sql && grep -q "NOT EXISTS" supabase/migrations/20260501100300_somnio_v4_template_clone.sql</automated>
  </verify>
  <acceptance_criteria>
    - Archivo existe
    - Contiene `INSERT INTO public.agent_templates` con SELECT FROM v3
    - Contiene literal `'somnio-sales-v4'` (D-13)
    - Contiene literal `'somnio-sales-v3'` (origen del clone)
    - Contiene guard `NOT EXISTS` para idempotencia
    - Contiene bloque DO $$ que asegura `handoff_humano` (D-59)
    - Contiene RAISE NOTICE para diagnostics
    - Contiene rollback comentado al inicio
  </acceptance_criteria>
  <done>SQL file de clone listo; contenido idéntico (D-26) garantizado.</done>
</task>

<task type="auto">
  <name>Task 2: Commit local de la migración de clone</name>
  <files>supabase/migrations/20260501100300_somnio_v4_template_clone.sql</files>
  <read_first>
    - CLAUDE.md (Regla 5)
  </read_first>
  <action>
```bash
git add supabase/migrations/20260501100300_somnio_v4_template_clone.sql
git commit -m "feat(somnio-v4): plan-03 — template clone v3→v4 con handoff_humano fallback

- INSERT…SELECT clone de agent_templates desde somnio-sales-v3 a somnio-sales-v4
- Contenido idéntico (D-26)
- Guard NOT EXISTS para idempotencia
- DO\$\$ block asegura handoff_humano (D-59)
- Pitfall 1: cero involucramiento Meta — agent_templates es Postgres interno

Standalone: somnio-sales-v4
Decisions: D-13, D-26, D-27, D-59

Co-Authored-By: Claude <noreply@anthropic.com>"
```

NO push aún.
  </action>
  <verify>
    <automated>git log -1 --pretty=%s | grep -q "feat(somnio-v4): plan-03"</automated>
  </verify>
  <acceptance_criteria>
    - Commit local plan-03 existe
  </acceptance_criteria>
  <done>Commit local listo, sin push.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: HALT — Usuario aplica clone en prod</name>
  <what-built>Migración de clone de templates v3→v4 lista localmente.</what-built>
  <how-to-verify>
**STOP — REGLA 5.**

Pasos del usuario:
1. Supabase Studio → SQL Editor (prod MorfX)
2. Ejecutar `20260501100300_somnio_v4_template_clone.sql`
3. Leer los `RAISE NOTICE` en el output del SQL editor para verificar conteos
4. Verificación adicional:
```sql
-- Conteo
SELECT agent_id, COUNT(*) FROM agent_templates
WHERE agent_id IN ('somnio-sales-v3', 'somnio-sales-v4')
GROUP BY agent_id;
-- expect: v4 >= v3

-- Sample diff de contenido (deben ser idénticos por intent/visit_type/orden)
SELECT v3.intent, v3.content = v4.content AS same
FROM agent_templates v3
JOIN agent_templates v4
  ON v4.agent_id = 'somnio-sales-v4'
 AND v4.intent = v3.intent
 AND v4.visit_type IS NOT DISTINCT FROM v3.visit_type
 AND v4.orden = v3.orden
 AND v4.workspace_id IS NOT DISTINCT FROM v3.workspace_id
WHERE v3.agent_id = 'somnio-sales-v3'
LIMIT 10;
-- expect: same=true para todos

-- handoff_humano existe
SELECT * FROM agent_templates WHERE agent_id='somnio-sales-v4' AND intent='handoff_humano';
-- expect: 1 row
```
5. Confirmar al asistente.
  </how-to-verify>
  <resume-signal>Usuario escribe "templates v4 clonados"</resume-signal>
</task>

<task type="auto">
  <name>Task 4: Push tras confirmación</name>
  <files>(remoto)</files>
  <read_first>
    - CLAUDE.md (Regla 1)
  </read_first>
  <action>
Tras confirmación, ejecutar:
```bash
git push origin main
```
  </action>
  <verify>
    <automated>git log origin/main --oneline | head -5 | grep -q "plan-03"</automated>
  </verify>
  <acceptance_criteria>
    - Commit plan-03 en origin/main
    - Vercel deploy ok
  </acceptance_criteria>
  <done>Templates clonados en prod + push completo.</done>
</task>

</tasks>

<verification>
- v4 tiene su catálogo independiente de templates con contenido idéntico a v3
- Template `handoff_humano` existe explícitamente en v4
- Cero involucramiento Meta confirmado (Pitfall 1)
</verification>

<success_criteria>
- Plan 06 (response-track) podrá usar `SOMNIO_V4_AGENT_ID` como filter y obtener resultados
- Plan 05 (sub-loop no_match) podrá referenciar `handoff_humano` como template ID
</success_criteria>

<output>
Crear `.planning/standalone/somnio-sales-v4/03-SUMMARY.md` con:
- Conteo v3 vs v4 post-clone
- Confirmación handoff_humano existe
- Hash del commit en origin/main
</output>
