---
plan: 01
phase: somnio-sales-v4
wave: 0
depends_on: []
files_modified:
  - supabase/migrations/20260501100000_somnio_v4_agent_knowledge_base.sql
addresses_decisions: [D-04, D-12, D-45, D-47, D-49, D-50, D-51, D-56]
addresses_research_pitfalls: [Pitfall 8, Pitfall 9]
autonomous: false
estimated_tasks: 4
must_haves:
  truths:
    - "Tabla agent_knowledge_base existe en producción Somnio con extension pgvector habilitada"
    - "Tabla incluye columna `nunca_decir TEXT[]` (D-51 — fuente de verdad para post-gen NUNCA-decir check del sub-loop)"
    - "Índice HNSW vector_cosine_ops existe sobre columna embedding"
    - "GRANTs explícitos a service_role + authenticated están aplicados"
    - "Usuario confirmó migración aplicada en producción ANTES de continuar a wave siguiente"
  artifacts:
    - path: "supabase/migrations/20260501100000_somnio_v4_agent_knowledge_base.sql"
      provides: "DDL agent_knowledge_base + pgvector extension + HNSW index + GRANTs + nunca_decir column"
      contains: "CREATE EXTENSION IF NOT EXISTS vector"
  key_links:
    - from: "agent_knowledge_base.embedding"
      to: "pgvector vector(1536) type"
      via: "CREATE EXTENSION IF NOT EXISTS vector ejecutado primero"
      pattern: "vector\\(1536\\)"
    - from: "agent_knowledge_base"
      to: "service_role / authenticated"
      via: "GRANT statements explícitos"
      pattern: "GRANT (ALL|SELECT) ON TABLE public.agent_knowledge_base"
    - from: "agent_knowledge_base.nunca_decir"
      to: "kb-search-tool RPC result + post-gen NUNCA-decir check (Plan 05)"
      via: "TEXT[] column persisted from parser.sections.nuncaDecir (Plan 04 sync.ts)"
      pattern: "nunca_decir TEXT\\[\\]"
---

<objective>
Crear migración Supabase que habilita pgvector, define la tabla `agent_knowledge_base` con embedding 1536-dim, columna `nunca_decir TEXT[]` para reglas post-gen check (D-51), índice HNSW vector_cosine_ops, y GRANTs explícitos. Esta es la PRIMERA migración de v4.

Purpose: Sin esta tabla no hay retrieval de KB. Sin pgvector + HNSW las queries del sub-loop son O(n) sequential scan (Pitfall 8). Sin GRANTs explícitos service_role obtiene `permission denied` (LEARNING migration `20260420000443`). Sin la columna `nunca_decir` el post-gen check del sub-loop (D-51) queda como no-op (revision feedback W-09 — hacerlo funcional desde día 1).

Output:
- 1 archivo SQL en `supabase/migrations/`
- HALT: usuario aplica manualmente en producción ANTES de cualquier código que dependa de la tabla.
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
@supabase/migrations/20260420000443_platform_config.sql
</context>

<interfaces>
<!-- LEARNING migration GRANTs pattern (extracted from supabase/migrations/20260420000443_platform_config.sql:23-37) -->

```sql
GRANT ALL    ON TABLE public.<table> TO service_role;
GRANT SELECT ON TABLE public.<table> TO authenticated;
```

Sin GRANTs Supabase Studio crea la tabla pero `service_role` recibe `permission denied`. Patrón obligatorio para v4.

<!-- nunca_decir column rationale (D-51 + revision W-09) -->

La columna `nunca_decir TEXT[]` persiste las reglas extraídas de la sección `## NUNCA decir` del .md de KB. Plan 04 `sync.ts` parsea `parsed.sections.nuncaDecir` y lo escribe a esta columna. Plan 02 `match_knowledge_base` RPC retorna esta columna en cada hit. Plan 05 `kb-search-tool.ts` lee `result.nunca_decir` directamente del RPC y lo pasa al post-gen check (`checkNuncaDecir`) para que la validación Haiku tenga insumo real, no array vacío.
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Crear archivo de migración agent_knowledge_base</name>
  <files>supabase/migrations/20260501100000_somnio_v4_agent_knowledge_base.sql</files>
  <read_first>
    - .planning/standalone/somnio-sales-v4/PATTERNS.md (sección "YYYYMMDD_somnio_v4_agent_knowledge_base.sql" — pattern completo)
    - .planning/standalone/somnio-sales-v4/RESEARCH.md (Pitfall 8, Pitfall 9, sección Storage)
    - .planning/standalone/somnio-sales-v4/CONTEXT.md (D-56 — schema completo de columnas, D-51 NUNCA decir post-gen check)
    - supabase/migrations/20260420000443_platform_config.sql (LEARNING GRANTs pattern verbatim)
  </read_first>
  <action>
Crear archivo `supabase/migrations/20260501100000_somnio_v4_agent_knowledge_base.sql` con el siguiente contenido EXACTO (literal — no parafrasear):

```sql
-- Standalone: somnio-sales-v4 / Plan 01
-- Crea tabla agent_knowledge_base con pgvector embedding(1536) + HNSW index + GRANTs.
-- Regla 5: este SQL NO se aplica automáticamente. Usuario lo aplica en prod ANTES de Plan 04+.
-- Pattern: PATTERNS.md "YYYYMMDD_somnio_v4_agent_knowledge_base.sql" + LEARNING from 20260420000443
-- Revision W-09: incluye columna `nunca_decir` para post-gen check funcional desde día 1 (D-51)

CREATE EXTENSION IF NOT EXISTS vector;  -- Pitfall 9: idempotente, Supabase Studio lo permite

CREATE TABLE IF NOT EXISTS public.agent_knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  category TEXT NOT NULL CHECK (category IN ('product', 'policies', 'edge-cases', 'faqs-no-templated')),
  embedding vector(1536) NOT NULL,
  canonical_response TEXT,
  nunca_decir TEXT[] NOT NULL DEFAULT '{}',  -- D-51 / W-09: reglas post-gen check del sub-loop
  escalate_triggers TEXT[] NOT NULL DEFAULT '{}',
  related_topics TEXT[] NOT NULL DEFAULT '{}',
  source_md_path TEXT NOT NULL,
  body_hash TEXT NOT NULL,
  last_reviewed_at DATE NOT NULL,
  reviewed_by TEXT NOT NULL,
  hit_count INT NOT NULL DEFAULT 0,
  promoted_to_transition BOOLEAN NOT NULL DEFAULT false,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  CONSTRAINT agent_knowledge_base_uniq UNIQUE (topic, agent_id, workspace_id)
);

-- Pitfall 8: HNSW index para queries pgvector cosine sub-100ms
CREATE INDEX IF NOT EXISTS agent_knowledge_base_embedding_hnsw_idx
  ON public.agent_knowledge_base USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS agent_knowledge_base_workspace_agent_idx
  ON public.agent_knowledge_base (workspace_id, agent_id);

-- LEARNING from 20260420000443_platform_config.sql:23-37 — GRANTs explícitos obligatorios
GRANT ALL    ON TABLE public.agent_knowledge_base TO service_role;
GRANT SELECT ON TABLE public.agent_knowledge_base TO authenticated;

-- ROLLBACK (separado, no se ejecuta automáticamente):
-- DROP INDEX IF EXISTS public.agent_knowledge_base_embedding_hnsw_idx;
-- DROP INDEX IF EXISTS public.agent_knowledge_base_workspace_agent_idx;
-- DROP TABLE IF EXISTS public.agent_knowledge_base;
```

Notas:
- NO modificar nombres de columnas — están enumeradas en CONTEXT.md D-56 verbatim.
- COLUMNA NUEVA: `nunca_decir TEXT[] NOT NULL DEFAULT '{}'` (revision W-09 / D-51).
- NO omitir `CREATE EXTENSION IF NOT EXISTS vector` (Pitfall 9 — sin extension `vector(1536)` falla con "type vector does not exist").
- NO omitir HNSW index (Pitfall 8).
- NO omitir GRANTs (LEARNING).
- Sí incluir `IF NOT EXISTS` para idempotencia.
  </action>
  <verify>
    <automated>test -f supabase/migrations/20260501100000_somnio_v4_agent_knowledge_base.sql && grep -q "CREATE EXTENSION IF NOT EXISTS vector" supabase/migrations/20260501100000_somnio_v4_agent_knowledge_base.sql && grep -q "vector(1536)" supabase/migrations/20260501100000_somnio_v4_agent_knowledge_base.sql && grep -q "nunca_decir TEXT\[\] NOT NULL DEFAULT" supabase/migrations/20260501100000_somnio_v4_agent_knowledge_base.sql && grep -q "USING hnsw (embedding vector_cosine_ops)" supabase/migrations/20260501100000_somnio_v4_agent_knowledge_base.sql && grep -q "GRANT ALL    ON TABLE public.agent_knowledge_base TO service_role" supabase/migrations/20260501100000_somnio_v4_agent_knowledge_base.sql && grep -q "GRANT SELECT ON TABLE public.agent_knowledge_base TO authenticated" supabase/migrations/20260501100000_somnio_v4_agent_knowledge_base.sql</automated>
  </verify>
  <acceptance_criteria>
    - Archivo existe en `supabase/migrations/20260501100000_somnio_v4_agent_knowledge_base.sql`
    - Contiene literal `CREATE EXTENSION IF NOT EXISTS vector;`
    - Contiene literal `vector(1536) NOT NULL`
    - Contiene literal `nunca_decir TEXT[] NOT NULL DEFAULT '{}'` (W-09)
    - Contiene literal `USING hnsw (embedding vector_cosine_ops)`
    - Contiene literal `GRANT ALL    ON TABLE public.agent_knowledge_base TO service_role;`
    - Contiene literal `GRANT SELECT ON TABLE public.agent_knowledge_base TO authenticated;`
    - Contiene CHECK constraint `category IN ('product', 'policies', 'edge-cases', 'faqs-no-templated')`
    - Contiene UNIQUE constraint `(topic, agent_id, workspace_id)`
  </acceptance_criteria>
  <done>Archivo SQL creado, idempotente (IF NOT EXISTS), GRANTs explícitos presentes, columna nunca_decir incluida.</done>
</task>

<task type="auto">
  <name>Task 2: Commit de la migración (sin push hasta confirmación)</name>
  <files>supabase/migrations/20260501100000_somnio_v4_agent_knowledge_base.sql</files>
  <read_first>
    - CLAUDE.md (Regla 5 — migración antes de deploy)
    - .claude/rules/code-changes.md (commits atómicos)
  </read_first>
  <action>
Ejecutar:
```bash
git add supabase/migrations/20260501100000_somnio_v4_agent_knowledge_base.sql
git commit -m "feat(somnio-v4): plan-01 task-1 — migration agent_knowledge_base + pgvector + HNSW + nunca_decir

- CREATE EXTENSION IF NOT EXISTS vector
- agent_knowledge_base table con embedding(1536) + 19 columnas (D-56 + nunca_decir W-09)
- nunca_decir TEXT[] (D-51 — post-gen NUNCA-decir check funcional desde día 1)
- HNSW index vector_cosine_ops (Pitfall 8)
- GRANTs service_role + authenticated (LEARNING 20260420000443)

Standalone: somnio-sales-v4
Decisions: D-04, D-12, D-45, D-47, D-49, D-50, D-51, D-56

Co-Authored-By: Claude <noreply@anthropic.com>"
```

NO ejecutar `git push` aún — el push se hará después de la confirmación del usuario en Task 4.
  </action>
  <verify>
    <automated>git log -1 --pretty=%s | grep -q "feat(somnio-v4): plan-01 task-1"</automated>
  </verify>
  <acceptance_criteria>
    - Commit local existe con mensaje empezando con "feat(somnio-v4): plan-01 task-1"
    - Archivo SQL está en HEAD
    - NO se ejecutó git push todavía
  </acceptance_criteria>
  <done>Commit local listo, sin push.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: HALT — Usuario aplica migración en producción</name>
  <what-built>
    Migración `20260501100000_somnio_v4_agent_knowledge_base.sql` lista localmente.
  </what-built>
  <how-to-verify>
**STOP — REGLA 5 BLOQUEANTE.**

Antes de continuar al Plan 02, el usuario DEBE aplicar la migración en producción manualmente.

Pasos para el usuario:
1. Abrir Supabase Studio del proyecto productivo MorfX → SQL Editor
2. Copiar el contenido completo de `supabase/migrations/20260501100000_somnio_v4_agent_knowledge_base.sql`
3. Ejecutar en producción
4. Verificar:
   ```sql
   SELECT extname FROM pg_extension WHERE extname = 'vector';
   -- expect: 1 row

   SELECT column_name, data_type FROM information_schema.columns
   WHERE table_name = 'agent_knowledge_base' ORDER BY ordinal_position;
   -- expect: 20 rows (id, workspace_id, agent_id, topic, keywords, category, embedding,
   --          canonical_response, nunca_decir, escalate_triggers, related_topics,
   --          source_md_path, body_hash, last_reviewed_at, reviewed_by, hit_count,
   --          promoted_to_transition, last_seen_at, created_at, updated_at)

   SELECT indexname FROM pg_indexes WHERE tablename = 'agent_knowledge_base';
   -- expect: 3 rows (PK + HNSW + workspace_agent)
   ```
5. Confirmar al asistente que la migración fue aplicada exitosamente

NO continuar al Plan 02 hasta confirmación explícita del usuario.
  </how-to-verify>
  <resume-signal>Usuario escribe "migración 01 aplicada" o equivalente</resume-signal>
</task>

<task type="auto">
  <name>Task 4: Push tras confirmación</name>
  <files>(ninguno — push remoto)</files>
  <read_first>
    - CLAUDE.md (Regla 1 — push obligatorio tras cambios)
  </read_first>
  <action>
Solo después de la confirmación del usuario en Task 3, ejecutar:
```bash
git push origin main
```
  </action>
  <verify>
    <automated>git log origin/main --oneline | head -1 | grep -q "plan-01 task-1"</automated>
  </verify>
  <acceptance_criteria>
    - `git log origin/main` muestra el commit task-1 en HEAD remoto
    - Vercel inicia deploy (no falla porque la migración ya está en prod)
  </acceptance_criteria>
  <done>Migración aplicada en prod + commit pushado a origin/main.</done>
</task>

</tasks>

<verification>
- Tabla `agent_knowledge_base` queryable en producción (20 columnas incl. `nunca_decir`)
- pgvector extension habilitada
- HNSW index existe
- GRANTs aplicados correctamente
- Usuario confirmó aplicación antes del push
</verification>

<success_criteria>
- 1 archivo de migración creado, committed, pushed (en ese orden tras confirmación)
- Schema en prod coincide con CONTEXT.md D-56 + W-09 (nunca_decir column)
- Plan 02 puede asumir la tabla existe (incluyendo nunca_decir)
- Plan 04 sync.ts puede escribir a `nunca_decir`
- Plan 05 kb-search-tool puede leer `nunca_decir` desde el RPC
</success_criteria>

<output>
Después de completar, crear `.planning/standalone/somnio-sales-v4/01-SUMMARY.md` con:
- Confirmación de migración aplicada
- Output de queries de verificación que el usuario corrió (incluyendo column count = 20)
- Hash del commit pushado
</output>
