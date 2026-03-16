-- Migration: Rename 'efectos' to 'contraindicaciones' with new content + add 'dependencia' intent
-- Idempotent: checks before each operation

DO $$
BEGIN
  -- 1. Rename efectos -> contraindicaciones (update intent name + content)
  IF EXISTS (
    SELECT 1 FROM agent_templates
    WHERE agent_id = 'somnio-sales-v3' AND intent = 'efectos'
    LIMIT 1
  ) THEN
    -- Delete old efectos templates and insert new contraindicaciones
    DELETE FROM agent_templates
    WHERE agent_id = 'somnio-sales-v3' AND intent = 'efectos';

    INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
    VALUES
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'contraindicaciones', 'primera_vez', 'CORE', 0, 'texto', 'La melatonina es un compuesto orgánico natural, y el citrato de magnesio es un mineral. Ambos siendo productos orgánicos no tienen ningún tipo de efecto secundario.', 0),
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'contraindicaciones', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto', 'Sin embargo, en casos de toma de anticoagulantes recomendamos consultar con tu medico de confianza antes de consumirlo, ya que combinar la melatonina con estos podría generar efectos adversos.', 4);

    RAISE NOTICE 'Renamed efectos -> contraindicaciones with new content';
  ELSIF NOT EXISTS (
    SELECT 1 FROM agent_templates
    WHERE agent_id = 'somnio-sales-v3' AND intent = 'contraindicaciones'
    LIMIT 1
  ) THEN
    -- Fresh insert if neither exists
    INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
    VALUES
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'contraindicaciones', 'primera_vez', 'CORE', 0, 'texto', 'La melatonina es un compuesto orgánico natural, y el citrato de magnesio es un mineral. Ambos siendo productos orgánicos no tienen ningún tipo de efecto secundario.', 0),
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'contraindicaciones', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto', 'Sin embargo, en casos de toma de anticoagulantes recomendamos consultar con tu medico de confianza antes de consumirlo, ya que combinar la melatonina con estos podría generar efectos adversos.', 4);

    RAISE NOTICE 'Inserted contraindicaciones templates';
  ELSE
    RAISE NOTICE 'contraindicaciones templates already exist, skipping';
  END IF;

  -- 2. Add dependencia intent
  IF NOT EXISTS (
    SELECT 1 FROM agent_templates
    WHERE agent_id = 'somnio-sales-v3' AND intent = 'dependencia'
    LIMIT 1
  ) THEN
    INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
    VALUES
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'dependencia', 'primera_vez', 'CORE', 0, 'texto', 'La melatonina es un compuesto orgánico natural, y el citrato de magnesio es un mineral. Ambos siendo productos orgánicos no causan dependencia.', 0);

    RAISE NOTICE 'Inserted dependencia templates';
  ELSE
    RAISE NOTICE 'dependencia templates already exist, skipping';
  END IF;
END $$;
