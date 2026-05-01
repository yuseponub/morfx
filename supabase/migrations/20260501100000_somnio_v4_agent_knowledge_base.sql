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
