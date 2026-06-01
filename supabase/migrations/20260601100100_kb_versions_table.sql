-- supabase/migrations/20260601100100_kb_versions_table.sql
-- Standalone: ui-agent-content-editor / Plan 02
-- Regla 5: el usuario aplica esta migracion MANUALMENTE en produccion (Supabase Studio)
--          ANTES de pushear cualquier codigo que referencie agent_knowledge_base_versions
--          (Waves 2/4 de este standalone consumen la tabla para ver/buscar/restaurar — D-01b).
-- Regla 6: tabla NUEVA aditiva; no toca ninguna fila/columna de agentes en produccion.
--          El FK ON DELETE CASCADE referencia agent_knowledge_base (tabla v4-only en uso real).
-- Regla 2: created_at usa timezone('America/Bogota', NOW()).
--
-- Proposito (D-01b): tabla dedicada de versiones para snapshot-on-save + busqueda + restore.
--   Se prefirio tabla dedicada sobre JSONB (RESEARCH §KB Versioning): buscar versiones previas
--   es trivial con WHERE/ORDER BY, y mantiene los snapshots fuera de la fila caliente que
--   carga el vector(1536).
--   NO se almacena el vector aqui (1536 floats x N versiones = desperdicio); el restore
--   regenera el vector via buildContentToEmbed (Plan 04).

CREATE TABLE IF NOT EXISTS public.agent_knowledge_base_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id UUID NOT NULL REFERENCES public.agent_knowledge_base(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  agent_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  category TEXT NOT NULL,
  scope_summary TEXT,
  hechos_del_producto TEXT,
  posicion_del_negocio TEXT,
  debe_contener TEXT[] NOT NULL DEFAULT '{}',
  nunca_decir TEXT[] NOT NULL DEFAULT '{}',
  cuando_escalar TEXT[] NOT NULL DEFAULT '{}',
  tone_override TEXT,
  escalate_triggers TEXT[] NOT NULL DEFAULT '{}',
  related_topics TEXT[] NOT NULL DEFAULT '{}',
  body_hash TEXT,
  version_num INT NOT NULL,
  edited_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE (kb_id, version_num)
);

CREATE INDEX IF NOT EXISTS idx_kb_versions_kb_id ON public.agent_knowledge_base_versions (kb_id, version_num DESC);
CREATE INDEX IF NOT EXISTS idx_kb_versions_topic ON public.agent_knowledge_base_versions (workspace_id, agent_id, topic);

GRANT ALL ON TABLE public.agent_knowledge_base_versions TO service_role;
GRANT SELECT ON TABLE public.agent_knowledge_base_versions TO authenticated;

-- ROLLBACK manual (NO ejecutar salvo emergencia):
--   DROP TABLE IF EXISTS public.agent_knowledge_base_versions;
