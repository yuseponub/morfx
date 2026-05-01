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
