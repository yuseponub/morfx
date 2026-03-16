-- Migration: Add 'formula' intent templates for somnio-sales-v3
-- Purpose: New intent for ingredient/composition questions (separate from 'contenido' which is about the bottle/quantity)
-- Idempotent: only inserts if no formula templates exist for somnio-sales-v3

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM agent_templates
    WHERE agent_id = 'somnio-sales-v3' AND intent = 'formula'
    LIMIT 1
  ) THEN

    INSERT INTO agent_templates (id, agent_id, workspace_id, intent, visit_type, priority, orden, content_type, content, delay_s)
    VALUES
      -- formula CORE
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'formula', 'primera_vez', 'CORE', 0, 'texto', 'Su formula contiene 50mg de citrato de magnesio y 10mg de melatonina para reparar los trastornos del sueño😴', 0),

      -- formula COMPLEMENTARIA (tiempoefecto1)
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'formula', 'primera_vez', 'COMPLEMENTARIA', 1, 'texto', 'Verás los resultados desde los primeros 3-7 dias de uso. La melatonina te ayudará a descansar mejor mediante un proceso regulando tu ciclo biologico de sueño. El magnesio entrara como un relajante que te ayudara a calmar tu mente y tu cuerpo, haciendo que dormir sea mas facil.', 5),

      -- formula OPCIONAL (tiempoefecto2)
      (gen_random_uuid(), 'somnio-sales-v3', NULL, 'formula', 'primera_vez', 'OPCIONAL', 2, 'texto', 'Lo ideal es que con los días y de forma natural se ajuste tu reloj biológico y puedas tener un descanso profundo y reparador. Recuerda que no es un somnífero‼️', 4);

    RAISE NOTICE 'Inserted formula templates for somnio-sales-v3';
  ELSE
    RAISE NOTICE 'Formula templates for somnio-sales-v3 already exist, skipping';
  END IF;
END $$;
