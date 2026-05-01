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
