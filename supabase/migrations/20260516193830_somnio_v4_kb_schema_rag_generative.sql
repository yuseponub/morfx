-- supabase/migrations/20260516193830_somnio_v4_kb_schema_rag_generative.sql
-- Standalone: somnio-v4-rag-generative / Plan 01
-- Regla 5: usuario aplica manualmente en producción ANTES de pushear código del Plan 02/03.
-- Regla 6: v4 sigue dormant — no afecta producción hasta Plan 08 (flip routing rule).
--
-- Cambios:
--  1. Agrega 5 columnas nuevas a `agent_knowledge_base` (D-01 #2..#6 + D-05):
--     - hechos_del_producto TEXT
--     - posicion_del_negocio TEXT
--     - debe_contener TEXT[] NOT NULL DEFAULT '{}'
--     - cuando_escalar TEXT[] NOT NULL DEFAULT '{}'
--     - tone_override TEXT
--  2. Marca `canonical_response` deprecated para somnio-v4 (D-24) — otros agentes
--     pueden seguir usándola.
--  3. DROP + CREATE del RPC `match_knowledge_base` con RETURNS shape extendido
--     (Postgres requiere drop explícito si cambia el shape de RETURN TABLE).

ALTER TABLE public.agent_knowledge_base
  ADD COLUMN IF NOT EXISTS hechos_del_producto TEXT,
  ADD COLUMN IF NOT EXISTS posicion_del_negocio TEXT,
  ADD COLUMN IF NOT EXISTS debe_contener TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cuando_escalar TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tone_override TEXT;

COMMENT ON COLUMN public.agent_knowledge_base.canonical_response IS
  'DEPRECATED para somnio-v4 (RAG-generative, 2026-05-16). Otros agentes pueden seguir usándolo.';

-- Drop & recreate RPC con nuevas columnas en RETURNS:
DROP FUNCTION IF EXISTS public.match_knowledge_base(UUID, TEXT, vector(1536), TEXT, INT);

CREATE OR REPLACE FUNCTION public.match_knowledge_base(
  p_workspace_id UUID,
  p_agent_id TEXT,
  p_query_embedding vector(1536),
  p_category TEXT DEFAULT NULL,
  p_limit INT DEFAULT 3
) RETURNS TABLE(
  topic TEXT,
  canonical_response TEXT,
  nunca_decir TEXT[],
  escalate_triggers TEXT[],
  related_topics TEXT[],
  category TEXT,
  -- NUEVAS para RAG-generative:
  hechos_del_producto TEXT,
  posicion_del_negocio TEXT,
  debe_contener TEXT[],
  cuando_escalar TEXT[],
  tone_override TEXT,
  distance NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.topic, kb.canonical_response, kb.nunca_decir,
    kb.escalate_triggers, kb.related_topics, kb.category,
    kb.hechos_del_producto, kb.posicion_del_negocio, kb.debe_contener,
    kb.cuando_escalar, kb.tone_override,
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

-- ROLLBACK manual (NO ejecutar salvo emergencia):
--   1. ALTER TABLE public.agent_knowledge_base
--        DROP COLUMN IF EXISTS hechos_del_producto,
--        DROP COLUMN IF EXISTS posicion_del_negocio,
--        DROP COLUMN IF EXISTS debe_contener,
--        DROP COLUMN IF EXISTS cuando_escalar,
--        DROP COLUMN IF EXISTS tone_override;
--   2. Re-aplicar el RPC desde supabase/migrations/20260501100400_somnio_v4_match_knowledge_base_rpc.sql
--      (RETURNS shape original sin las 5 columnas nuevas).
