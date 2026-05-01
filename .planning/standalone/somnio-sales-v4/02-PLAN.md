---
plan: 02
phase: somnio-sales-v4
wave: 0
depends_on: [01]
files_modified:
  - supabase/migrations/20260501100100_somnio_v4_agent_unknown_cases.sql
  - supabase/migrations/20260501100200_somnio_v4_platform_config.sql
  - supabase/migrations/20260501100400_somnio_v4_match_knowledge_base_rpc.sql
addresses_decisions: [D-03, D-05, D-06, D-11, D-12, D-51, D-58]
addresses_research_pitfalls: [Pitfall 8, Pitfall 9]
autonomous: false
estimated_tasks: 6
must_haves:
  truths:
    - "Tabla agent_unknown_cases existe en producción con embedding(1536) + status enum"
    - "Función Postgres cluster_unknown_cases existe y es invocable vía RPC"
    - "Función Postgres match_knowledge_base existe y retorna nunca_decir TEXT[] en cada hit (B-01 fix + W-09)"
    - "Key 'somnio_v4_low_confidence_threshold' = 0.70 existe en platform_config"
    - "Usuario confirmó las TRES migraciones aplicadas ANTES del push"
  artifacts:
    - path: "supabase/migrations/20260501100100_somnio_v4_agent_unknown_cases.sql"
      provides: "agent_unknown_cases table + cluster_unknown_cases SQL function"
      contains: "CREATE OR REPLACE FUNCTION cluster_unknown_cases"
    - path: "supabase/migrations/20260501100200_somnio_v4_platform_config.sql"
      provides: "Threshold 0.70 + kb_sync_enabled true"
      contains: "somnio_v4_low_confidence_threshold"
    - path: "supabase/migrations/20260501100400_somnio_v4_match_knowledge_base_rpc.sql"
      provides: "match_knowledge_base RPC con cosine distance + nunca_decir TEXT[] en RETURNS"
      contains: "CREATE OR REPLACE FUNCTION public.match_knowledge_base"
  key_links:
    - from: "Inngest cron unknown-cases-cluster (Plan 09)"
      to: "supabase.rpc('cluster_unknown_cases', ...)"
      via: "RPC SQL function"
      pattern: "FUNCTION cluster_unknown_cases"
    - from: "comprehension.ts (Plan 06)"
      to: "platform_config.somnio_v4_low_confidence_threshold"
      via: "domain getPlatformConfig lookup at runtime"
      pattern: "somnio_v4_low_confidence_threshold"
    - from: "kb-search-tool.ts (Plan 05)"
      to: "supabase.rpc('match_knowledge_base', ...)"
      via: "RPC retorna canonical_response + nunca_decir + related_topics + distance"
      pattern: "FUNCTION public.match_knowledge_base"
---

<!-- CONTEXT-AMENDMENT (revision W-07):
     RESEARCH supersedió la decisión D-05 sobre HDBSCAN.
     Ver RESEARCH.md líneas 13, 129, 529: HDBSCAN fue downgradeado a "pgvector cosine neighborhood
     vía SQL function" (RESEARCH §Example 3). Razón: HDBSCAN requiere extensión externa que no
     está disponible en Supabase managed. La función `cluster_unknown_cases` implementa el
     equivalente operativo (similarity threshold + min cluster size) con pgvector + plpgsql,
     sin pérdida funcional para el volumen de unknown cases de Somnio (D-06: clusters de >=10
     en ventana 30 días). El nombre "HDBSCAN" en CONTEXT.md D-05 se mantiene por hash de decisión,
     pero la implementación real es pgvector neighborhood.
-->

<objective>
Crear migraciones de:
1. `agent_unknown_cases` table (status enum, cluster_id, embedding 1536) + SQL function `cluster_unknown_cases` que retorna pares case_id/cluster_id (RESEARCH §Example 3)
2. `platform_config` seed con `somnio_v4_low_confidence_threshold = 0.70` y `somnio_v4_kb_sync_enabled = true`
3. **(B-01 fix)** RPC `match_knowledge_base` para cosine similarity search sobre `agent_knowledge_base` — incluye `nunca_decir TEXT[]` en RETURNS (W-09 — alimenta post-gen check de Plan 05). Mover esta migración aquí (Wave 0) consolida toda la creación de RPCs/SQL antes del HALT, manteniendo Plan 05 puramente autónomo (sin migration → sin HALT en Wave 1).

Purpose: Sin estas tablas/RPCs no hay observation loop, ni clustering, ni KB retrieval, ni threshold parametrizable.

Output: 3 archivos SQL committed; HALT para que el usuario los aplique en prod.
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
<!-- platform_config schema (verbatim de supabase/migrations/20260420000443_platform_config.sql) -->

```sql
CREATE TABLE IF NOT EXISTS public.platform_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
GRANT ALL ON TABLE public.platform_config TO service_role;
```

JSONB literals: `0.70::jsonb` (numérico), `true::jsonb` (booleano). NUNCA usar `'true'` (string).

<!-- pgvector cosine clustering query (RESEARCH §Example 3 lines 753-781) -->
La SQL function `cluster_unknown_cases` debe encapsular la consulta cosine-neighborhood: cluster_size = peers con `1 - (a.embedding <=> b.embedding) > similarity_threshold`, agrupando por case_id, retornando filas donde HAVING COUNT >= min_cluster_size.

<!-- match_knowledge_base RETURNS shape (B-01 + W-09) -->
La RPC `match_knowledge_base` retorna POR cada hit:
- `topic TEXT`
- `canonical_response TEXT`
- `nunca_decir TEXT[]` ← **W-09 NEW** — alimenta el post-gen check de Plan 05
- `escalate_triggers TEXT[]`
- `related_topics TEXT[]`
- `category TEXT`
- `distance NUMERIC`

Plan 05 `kb-search-tool.ts` lee `result.nunca_decir` directamente (no parsea de canonical_response).
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Crear migración agent_unknown_cases + cluster_unknown_cases function</name>
  <files>supabase/migrations/20260501100100_somnio_v4_agent_unknown_cases.sql</files>
  <read_first>
    - .planning/standalone/somnio-sales-v4/PATTERNS.md (sección "YYYYMMDD_somnio_v4_agent_unknown_cases.sql")
    - .planning/standalone/somnio-sales-v4/RESEARCH.md (Example 3 SQL completo)
    - .planning/standalone/somnio-sales-v4/CONTEXT.md (D-05, D-06, D-58)
  </read_first>
  <action>
Crear `supabase/migrations/20260501100100_somnio_v4_agent_unknown_cases.sql` con contenido EXACTO:

```sql
-- Standalone: somnio-sales-v4 / Plan 02
-- agent_unknown_cases table + cluster_unknown_cases() SQL function.
-- Regla 5: usuario aplica manualmente en prod.
-- Pattern: PATTERNS.md "YYYYMMDD_somnio_v4_agent_unknown_cases.sql" + RESEARCH §Example 3
-- pgvector ya habilitado por Plan 01.

CREATE TABLE IF NOT EXISTS public.agent_unknown_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  conversation_id UUID NOT NULL,
  message TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  intent TEXT,
  confidence NUMERIC(4,3),
  knowledge_queried TEXT[] NOT NULL DEFAULT '{}',
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'ready_for_promotion', 'promoted', 'dismissed')),
  cluster_id UUID,
  promoted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

CREATE INDEX IF NOT EXISTS agent_unknown_cases_workspace_agent_status_idx
  ON public.agent_unknown_cases (workspace_id, agent_id, status);

CREATE INDEX IF NOT EXISTS agent_unknown_cases_cluster_idx
  ON public.agent_unknown_cases (cluster_id) WHERE cluster_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS agent_unknown_cases_embedding_hnsw_idx
  ON public.agent_unknown_cases USING hnsw (embedding vector_cosine_ops);

GRANT ALL    ON TABLE public.agent_unknown_cases TO service_role;
GRANT SELECT ON TABLE public.agent_unknown_cases TO authenticated;

-- SQL function de clustering (RESEARCH §Example 3 — lines 753-781)
-- Retorna pares (case_id, cluster_id) — caller marca status='ready_for_promotion' por case_id.
CREATE OR REPLACE FUNCTION public.cluster_unknown_cases(
  p_workspace_id UUID,
  p_agent_id TEXT,
  p_similarity_threshold NUMERIC,
  p_min_cluster_size INT,
  p_window_days INT
) RETURNS TABLE(case_id UUID, cluster_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cluster_id UUID;
  rec RECORD;
BEGIN
  FOR rec IN
    WITH pending AS (
      SELECT id, embedding, conversation_id
      FROM public.agent_unknown_cases
      WHERE workspace_id = p_workspace_id
        AND agent_id = p_agent_id
        AND status = 'pending'
        AND created_at > timezone('America/Bogota', NOW()) - (p_window_days * INTERVAL '1 day')
    ),
    neighbors AS (
      SELECT
        a.id AS a_case_id,
        b.id AS b_case_id,
        1 - (a.embedding <=> b.embedding) AS similarity
      FROM pending a
      JOIN pending b ON a.id <> b.id
      WHERE 1 - (a.embedding <=> b.embedding) > p_similarity_threshold
    ),
    cluster_seeds AS (
      SELECT a_case_id, COUNT(b_case_id) AS peer_count
      FROM neighbors
      GROUP BY a_case_id
      HAVING COUNT(b_case_id) >= (p_min_cluster_size - 1)  -- self + peers >= min_cluster_size
    )
    SELECT a_case_id FROM cluster_seeds ORDER BY peer_count DESC
  LOOP
    -- Seed cluster_id si la fila aún no fue asignada en una pasada anterior
    IF NOT EXISTS (
      SELECT 1 FROM public.agent_unknown_cases
      WHERE id = rec.a_case_id AND cluster_id IS NOT NULL
    ) THEN
      v_cluster_id := gen_random_uuid();
      -- Retornar el case_id como pertenecer al cluster
      case_id := rec.a_case_id;
      cluster_id := v_cluster_id;
      RETURN NEXT;
      -- Y todos sus vecinos transitivos (similarity > threshold)
      FOR rec IN
        SELECT b_case_id AS id
        FROM (
          SELECT
            b.id AS b_case_id,
            1 - (a.embedding <=> b.embedding) AS similarity
          FROM public.agent_unknown_cases a
          JOIN public.agent_unknown_cases b ON a.id <> b.id
          WHERE a.id = case_id
            AND a.workspace_id = p_workspace_id
            AND b.workspace_id = p_workspace_id
            AND a.agent_id = p_agent_id
            AND b.agent_id = p_agent_id
            AND b.status = 'pending'
            AND 1 - (a.embedding <=> b.embedding) > p_similarity_threshold
        ) sub
      LOOP
        case_id := rec.id;
        cluster_id := v_cluster_id;
        RETURN NEXT;
      END LOOP;
    END IF;
  END LOOP;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cluster_unknown_cases(UUID, TEXT, NUMERIC, INT, INT) TO service_role;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS public.cluster_unknown_cases(UUID, TEXT, NUMERIC, INT, INT);
-- DROP TABLE IF EXISTS public.agent_unknown_cases;
```

Notas:
- Constraint `status` enum es CHECK (no creates ENUM type) — más simple, igual robustez.
- Function es `SECURITY DEFINER` para que el cron de Inngest la pueda invocar como service_role.
- HNSW también sobre `agent_unknown_cases.embedding` para que clustering escale.
  </action>
  <verify>
    <automated>test -f supabase/migrations/20260501100100_somnio_v4_agent_unknown_cases.sql && grep -q "CREATE OR REPLACE FUNCTION public.cluster_unknown_cases" supabase/migrations/20260501100100_somnio_v4_agent_unknown_cases.sql && grep -q "vector(1536)" supabase/migrations/20260501100100_somnio_v4_agent_unknown_cases.sql && grep -q "USING hnsw (embedding vector_cosine_ops)" supabase/migrations/20260501100100_somnio_v4_agent_unknown_cases.sql && grep -q "status IN ('pending', 'ready_for_promotion', 'promoted', 'dismissed')" supabase/migrations/20260501100100_somnio_v4_agent_unknown_cases.sql && grep -q "GRANT EXECUTE ON FUNCTION public.cluster_unknown_cases" supabase/migrations/20260501100100_somnio_v4_agent_unknown_cases.sql</automated>
  </verify>
  <acceptance_criteria>
    - Archivo existe
    - Contiene `CREATE TABLE IF NOT EXISTS public.agent_unknown_cases`
    - Columna `embedding vector(1536) NOT NULL` presente
    - CHECK constraint con 4 estados válidos
    - 3 índices definidos (workspace_agent_status, cluster_idx parcial, HNSW)
    - SQL function `cluster_unknown_cases` con 5 parámetros (UUID, TEXT, NUMERIC, INT, INT)
    - Function es `SECURITY DEFINER`
    - GRANT EXECUTE explícito a service_role
  </acceptance_criteria>
  <done>SQL file completo, idempotente, con clustering function compilable.</done>
</task>

<task type="auto">
  <name>Task 2: Crear migración platform_config seed</name>
  <files>supabase/migrations/20260501100200_somnio_v4_platform_config.sql</files>
  <read_first>
    - supabase/migrations/20260420000443_platform_config.sql (analog verbatim)
    - .planning/standalone/somnio-sales-v4/CONTEXT.md (D-03 = 0.70, D-11 parametrizable)
    - .planning/standalone/somnio-sales-v4/PATTERNS.md (sección "YYYYMMDD_somnio_v4_platform_config.sql")
  </read_first>
  <action>
Crear `supabase/migrations/20260501100200_somnio_v4_platform_config.sql`:

```sql
-- Standalone: somnio-sales-v4 / Plan 02
-- Seed platform_config keys para v4.
-- Pattern: 20260420000443_platform_config.sql verbatim
-- D-03 threshold inicial = 0.70; D-11 parametrizable

INSERT INTO public.platform_config (key, value) VALUES
  ('somnio_v4_low_confidence_threshold', '0.70'::jsonb),
  ('somnio_v4_kb_sync_enabled',          'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ROLLBACK:
-- DELETE FROM public.platform_config WHERE key IN
--   ('somnio_v4_low_confidence_threshold', 'somnio_v4_kb_sync_enabled');
```

Notas:
- `'0.70'::jsonb` literal — NO `'0.70'` string, NO `0.70` (sin cast).
- `'true'::jsonb` literal — NO `'true'`, NO `true` sin cast.
- `ON CONFLICT (key) DO NOTHING` — idempotente.
  </action>
  <verify>
    <automated>test -f supabase/migrations/20260501100200_somnio_v4_platform_config.sql && grep -q "'somnio_v4_low_confidence_threshold', '0.70'::jsonb" supabase/migrations/20260501100200_somnio_v4_platform_config.sql && grep -q "ON CONFLICT (key) DO NOTHING" supabase/migrations/20260501100200_somnio_v4_platform_config.sql</automated>
  </verify>
  <acceptance_criteria>
    - Archivo existe
    - Contiene literal `'somnio_v4_low_confidence_threshold', '0.70'::jsonb`
    - Contiene literal `'somnio_v4_kb_sync_enabled', 'true'::jsonb`
    - ON CONFLICT idempotency presente
  </acceptance_criteria>
  <done>SQL seed file listo.</done>
</task>

<task type="auto">
  <name>Task 3: Crear migración match_knowledge_base RPC (B-01 + W-09)</name>
  <files>supabase/migrations/20260501100400_somnio_v4_match_knowledge_base_rpc.sql</files>
  <read_first>
    - supabase/migrations/20260501100000_somnio_v4_agent_knowledge_base.sql (Plan 01 — schema base con `nunca_decir` column)
    - .planning/standalone/somnio-sales-v4/RESEARCH.md (Pitfall 8 — HNSW index ya creado en Plan 01)
    - .planning/standalone/somnio-sales-v4/CONTEXT.md (D-51 — NUNCA-decir post-gen check)
  </read_first>
  <action>
Crear `supabase/migrations/20260501100400_somnio_v4_match_knowledge_base_rpc.sql`:

```sql
-- Standalone: somnio-sales-v4 / Plan 02 (B-01 — moved here from Plan 05)
-- RPC match_knowledge_base: cosine similarity search sobre agent_knowledge_base.
-- Usado por kb-search-tool.ts del sub-loop (Plan 05).
-- W-09: incluye `nunca_decir TEXT[]` en RETURNS para alimentar post-gen check (D-51).
-- Regla 5: usuario aplica manualmente.

CREATE OR REPLACE FUNCTION public.match_knowledge_base(
  p_workspace_id UUID,
  p_agent_id TEXT,
  p_query_embedding vector(1536),
  p_category TEXT DEFAULT NULL,
  p_limit INT DEFAULT 3
) RETURNS TABLE(
  topic TEXT,
  canonical_response TEXT,
  nunca_decir TEXT[],            -- W-09 NEW: alimenta checkNuncaDecir en Plan 05
  escalate_triggers TEXT[],
  related_topics TEXT[],
  category TEXT,
  distance NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.topic,
    kb.canonical_response,
    kb.nunca_decir,
    kb.escalate_triggers,
    kb.related_topics,
    kb.category,
    (kb.embedding <=> p_query_embedding)::NUMERIC AS distance
  FROM public.agent_knowledge_base kb
  WHERE kb.workspace_id = p_workspace_id
    AND kb.agent_id = p_agent_id
    AND (p_category IS NULL OR kb.category = p_category)
  ORDER BY kb.embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_knowledge_base(UUID, TEXT, vector(1536), TEXT, INT) TO service_role;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS public.match_knowledge_base(UUID, TEXT, vector(1536), TEXT, INT);
```

Notas:
- `nunca_decir TEXT[]` en RETURNS — NUEVO vs versión original en Plan 05 (W-09).
- Plan 01 ya creó la columna `agent_knowledge_base.nunca_decir TEXT[] NOT NULL DEFAULT '{}'`.
- SECURITY DEFINER + GRANT EXECUTE explícito a service_role (LEARNING).
  </action>
  <verify>
    <automated>test -f supabase/migrations/20260501100400_somnio_v4_match_knowledge_base_rpc.sql && grep -q "CREATE OR REPLACE FUNCTION public.match_knowledge_base" supabase/migrations/20260501100400_somnio_v4_match_knowledge_base_rpc.sql && grep -q "embedding <=> p_query_embedding" supabase/migrations/20260501100400_somnio_v4_match_knowledge_base_rpc.sql && grep -q "nunca_decir TEXT\[\]" supabase/migrations/20260501100400_somnio_v4_match_knowledge_base_rpc.sql && grep -q "kb.nunca_decir" supabase/migrations/20260501100400_somnio_v4_match_knowledge_base_rpc.sql && grep -q "GRANT EXECUTE" supabase/migrations/20260501100400_somnio_v4_match_knowledge_base_rpc.sql</automated>
  </verify>
  <acceptance_criteria>
    - Archivo existe
    - Function `match_knowledge_base` con 5 params
    - Usa `embedding <=> p_query_embedding` (cosine distance)
    - RETURNS incluye `nunca_decir TEXT[]` (W-09)
    - SELECT incluye `kb.nunca_decir`
    - SECURITY DEFINER + GRANT EXECUTE explícito
  </acceptance_criteria>
  <done>RPC migration lista, alimenta el post-gen check del sub-loop con datos reales.</done>
</task>

<task type="auto">
  <name>Task 4: Commit local de las TRES migraciones</name>
  <files>supabase/migrations/20260501100100_somnio_v4_agent_unknown_cases.sql, supabase/migrations/20260501100200_somnio_v4_platform_config.sql, supabase/migrations/20260501100400_somnio_v4_match_knowledge_base_rpc.sql</files>
  <read_first>
    - CLAUDE.md (Regla 5)
  </read_first>
  <action>
```bash
git add supabase/migrations/20260501100100_somnio_v4_agent_unknown_cases.sql supabase/migrations/20260501100200_somnio_v4_platform_config.sql supabase/migrations/20260501100400_somnio_v4_match_knowledge_base_rpc.sql
git commit -m "feat(somnio-v4): plan-02 — migrations agent_unknown_cases + platform_config + match_knowledge_base RPC

- agent_unknown_cases table con embedding(1536), 4 estados (pending/ready_for_promotion/promoted/dismissed), HNSW index
- cluster_unknown_cases() SQL function (pgvector cosine neighborhood, RESEARCH §Example 3)
- platform_config keys somnio_v4_low_confidence_threshold=0.70 (D-03), somnio_v4_kb_sync_enabled=true
- match_knowledge_base() RPC para cosine search del sub-loop kb-search-tool (B-01 — moved from Plan 05)
  - RETURNS incluye nunca_decir TEXT[] (W-09 — alimenta post-gen check D-51)

Standalone: somnio-sales-v4
Decisions: D-03, D-05, D-06, D-11, D-12, D-51, D-58
Revision fixes: B-01 (RPC en Wave 0 — Plan 05 queda autónomo), W-09 (nunca_decir en RETURNS), W-07 (HDBSCAN→pgvector neighborhood)

Co-Authored-By: Claude <noreply@anthropic.com>"
```
NO push aún.
  </action>
  <verify>
    <automated>git log -1 --pretty=%s | grep -q "feat(somnio-v4): plan-02"</automated>
  </verify>
  <acceptance_criteria>
    - Commit local con mensaje plan-02
    - Tres archivos en HEAD
  </acceptance_criteria>
  <done>Commit local listo, sin push.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 5: HALT — Usuario aplica las TRES migraciones en prod</name>
  <what-built>3 migraciones SQL listas: agent_unknown_cases + platform_config seed + match_knowledge_base RPC.</what-built>
  <how-to-verify>
**STOP — REGLA 5 BLOQUEANTE.**

Pasos del usuario (ORDEN IMPORTA — la RPC depende de la columna `nunca_decir` creada por Plan 01):

1. Supabase Studio → SQL Editor (proyecto productivo MorfX)
2. Ejecutar primero `20260501100100_somnio_v4_agent_unknown_cases.sql` (depende de pgvector ya habilitado por Plan 01)
3. Ejecutar después `20260501100200_somnio_v4_platform_config.sql`
4. Ejecutar después `20260501100400_somnio_v4_match_knowledge_base_rpc.sql` (depende de columna `nunca_decir` aplicada por Plan 01)
5. Verificación:
```sql
-- Tabla agent_unknown_cases
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'agent_unknown_cases';
-- expect: 14 rows

-- Function cluster_unknown_cases
SELECT proname FROM pg_proc WHERE proname = 'cluster_unknown_cases';
-- expect: 1 row

-- Function match_knowledge_base
SELECT proname FROM pg_proc WHERE proname = 'match_knowledge_base';
-- expect: 1 row

-- Verificar que match_knowledge_base retorna `nunca_decir` en su RETURNS:
SELECT pg_get_function_result(oid)
FROM pg_proc WHERE proname = 'match_knowledge_base';
-- expect: ... nunca_decir text[] ...

-- Platform config
SELECT key, value FROM platform_config WHERE key LIKE 'somnio_v4_%';
-- expect:
-- somnio_v4_low_confidence_threshold | 0.7
-- somnio_v4_kb_sync_enabled          | true
```
6. Confirmar al asistente.
  </how-to-verify>
  <resume-signal>Usuario escribe "migraciones 02 aplicadas"</resume-signal>
</task>

<task type="auto">
  <name>Task 6: Push tras confirmación</name>
  <files>(ninguno — push remoto)</files>
  <read_first>
    - CLAUDE.md (Regla 1)
  </read_first>
  <action>
Tras confirmación explícita del usuario, ejecutar:
```bash
git push origin main
```
  </action>
  <verify>
    <automated>git log origin/main --oneline | head -3 | grep -q "plan-02"</automated>
  </verify>
  <acceptance_criteria>
    - Commit plan-02 en origin/main
    - Vercel deploy iniciado sin errores de schema
  </acceptance_criteria>
  <done>Migraciones aplicadas en prod, código pushado.</done>
</task>

</tasks>

<verification>
- `agent_unknown_cases` queryable en prod
- `cluster_unknown_cases` invocable vía RPC
- `match_knowledge_base` invocable vía RPC y retorna `nunca_decir` en cada hit
- `platform_config.somnio_v4_low_confidence_threshold` = 0.70
- Usuario confirmó aplicación antes del push
</verification>

<success_criteria>
- 3 archivos SQL committed + pushed tras confirmación
- Schema en prod permite que Plan 09 (clustering) y Plan 06 (comprehension threshold) funcionen
- Plan 05 puede consumir el RPC `match_knowledge_base` sin crear migraciones adicionales (autónomo)
- Plan 04 sync.ts puede escribir a la columna `nunca_decir` y el sub-loop la lee del RPC (W-09 post-gen check funcional desde día 1)
</success_criteria>

<output>
Después de completar, crear `.planning/standalone/somnio-sales-v4/02-SUMMARY.md` con outputs de queries de verificación (incluyendo `pg_get_function_result` de match_knowledge_base mostrando `nunca_decir text[]`).
</output>
