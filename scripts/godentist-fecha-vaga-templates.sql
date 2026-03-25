-- GoDentist: Add horarios_generales_sede and pedir_fecha_con_sugerencia templates
-- Run this in Supabase SQL editor BEFORE deploying the code change.

-- 1. horarios_generales_sede — shown when robot returns 0 slots for a date
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'horarios_generales_sede', 'primera_vez', 'CORE', 0, 'texto',
   E'Para la fecha {{fecha}} no encontramos citas disponibles en {{sede_preferida}}.\n\nNuestro horario de atencion en esa sede es:\n{{horario_general}}\n\nTe gustaria probar con otra fecha mas cercana?', 0);

-- 2. pedir_fecha_con_sugerencia — shown when fecha_vaga exists and we suggest a specific date
INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
VALUES
  (gen_random_uuid(), 'godentist', NULL, 'pedir_fecha_con_sugerencia', 'primera_vez', 'CORE', 0, 'texto',
   E'Para {{fecha_vaga}}, te parece el {{fecha_sugerida}}? O si prefieres otra fecha, me dices cual te queda bien', 0);
