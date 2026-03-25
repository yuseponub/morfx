-- GoDentist: Add horarios_generales_sede and pedir_fecha_con_sugerencia templates
-- Run this in Supabase SQL editor BEFORE deploying the code change.

-- 1. horarios_generales_sede — shown when robot returns 0 slots for a date
INSERT INTO agent_templates (
  agent_id,
  workspace_id,
  intent,
  content,
  content_type,
  priority,
  orden,
  is_active
)
SELECT
  ac.id,
  ac.workspace_id,
  'horarios_generales_sede',
  E'Para la fecha {{fecha}} no encontramos citas disponibles en {{sede_preferida}}.\n\nNuestro horario de atencion en esa sede es:\n{{horario_general}}\n\nTe gustaria probar con otra fecha mas cercana?',
  'texto',
  'CORE',
  0,
  true
FROM agent_configs ac
WHERE ac.agent_type = 'godentist'
LIMIT 1;

-- 2. pedir_fecha_con_sugerencia — shown when fecha_vaga exists and we suggest a specific date
INSERT INTO agent_templates (
  agent_id,
  workspace_id,
  intent,
  content,
  content_type,
  priority,
  orden,
  is_active
)
SELECT
  ac.id,
  ac.workspace_id,
  'pedir_fecha_con_sugerencia',
  E'Para {{fecha_vaga}}, te parece el {{fecha_sugerida}}? O si prefieres otra fecha, me dices cual te queda bien',
  'texto',
  'CORE',
  0,
  true
FROM agent_configs ac
WHERE ac.agent_type = 'godentist'
LIMIT 1;
