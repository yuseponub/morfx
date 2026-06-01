-- supabase/migrations/20260601100000_kb_scope_summary.sql
-- Standalone: ui-agent-content-editor / Plan 02
-- Regla 5: el usuario aplica esta migracion MANUALMENTE en produccion (Supabase Studio)
--          ANTES de pushear cualquier codigo que referencie la columna scope_summary
--          (Pitfall 6 — el modo de falla exacto que motivo Regla 5).
-- Regla 6: toca UNICAMENTE filas del agente 'somnio-sales-v4' en el workspace
--          'a3843b3f-c337-4836-92b5-89c58bb98490' (Somnio, DORMANT en prod).
--          Cada UPDATE de backfill esta explicitamente scopeado por agent_id + workspace_id;
--          ningun otro agente (v3 / godentist / recompra / pw-confirmation) es tocado.
--
-- Cambios:
--   1. Agrega columna scope_summary TEXT (NULL permitido — parser.ts:24 .optional()).
--      Hoy scope_summary vive SOLO en el frontmatter .md de cada topic (D-10).
--   2. Backfill: un UPDATE por cada uno de los 18 topics v4, copiando el valor del
--      bloque YAML `scope_summary: |` de cada .md verbatim.
--   NOTA: el re-embed (regenerar embedding desde buildContentToEmbed con scope_summary
--         ya poblado) NO es posible en SQL puro (requiere una llamada a OpenAI).
--         Se ejecuta UNA vez DESPUES de aplicar esta migracion via
--         scripts/reembed-kb-v4.ts (Plan 02 Task 3).

ALTER TABLE public.agent_knowledge_base
  ADD COLUMN IF NOT EXISTS scope_summary TEXT;   -- NULL allowed (parser.ts:24 .optional())

-- ============================================================================
-- BACKFILL — un UPDATE por topic (18 total). Valores copiados verbatim del
-- bloque YAML `scope_summary: |` de cada .md. Single quotes escapados duplicandolos.
-- Cada UPDATE scopeado por topic + agent_id + workspace_id (Regla 6).
-- ============================================================================

-- product/formula
UPDATE public.agent_knowledge_base
   SET scope_summary = 'Preguntas sobre qué tiene el producto, sus ingredientes activos (melatonina, magnesio),
cuáles son sus componentes, su composición, de qué está hecho, qué incluye la fórmula,
o si tiene algún otro ingrediente además de los listados.'
 WHERE topic = 'formula'
   AND agent_id = 'somnio-sales-v4'
   AND workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490';

-- product/contenido
UPDATE public.agent_knowledge_base
   SET scope_summary = 'Preguntas sobre cuántos comprimidos trae el frasco, cuántas pastillas vienen, qué tamaño
es la presentación, cuánto rinde un frasco, para cuántos días o noches alcanza, si hay
frascos más chicos o más grandes, o si viene en gotas.'
 WHERE topic = 'contenido'
   AND agent_id = 'somnio-sales-v4'
   AND workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490';

-- product/contraindicaciones
UPDATE public.agent_knowledge_base
   SET scope_summary = 'Preguntas sobre si el producto es seguro de tomar, si tiene contraindicaciones,
riesgos, efectos secundarios, o si puede tomarse teniendo CUALQUIER condición
médica preexistente o diagnosticada. Cubre tanto las 5 categorías generales
explícitas (autoinmune, lupus, anticoagulantes, hipertensión con medicación,
embarazo/lactancia, menores de 14) como cualquier otra condición no listada
(gastritis, gastrointestinal, digestiva, migrañas, ansiedad, depresión, tiroides,
hipotiroidismo, hipertiroidismo, diabetes tipo 1 o 2, asma, EPOC, cardíaca,
renal, hepática, neurológica, fibromialgia, artritis, condición crónica,
condición aguda, post-operatorio, etc.). También cubre rango etario válido
(14 años en adelante, sin límite superior — incluye adultos mayores 60+/65+
/tercera edad por defecto a handoff humano por comorbilidades comunes a esa
edad). Patrón típico: "tengo X condición, puedo tomarlo / me sirve / me afecta /
es seguro / lo recomiendan".'
 WHERE topic = 'contraindicaciones'
   AND agent_id = 'somnio-sales-v4'
   AND workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490';

-- product/dependencia
UPDATE public.agent_knowledge_base
   SET scope_summary = 'Preguntas sobre si el producto genera adicción, dependencia o vicio, si el cuerpo se
acostumbra, si después se puede dejar de tomar sin problema, si hay que retirarlo
paulatinamente, o cómo se compara con sedantes recetados como zolpidem o clonazepam
respecto a generar dependencia.'
 WHERE topic = 'dependencia'
   AND agent_id = 'somnio-sales-v4'
   AND workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490';

-- product/efectividad
UPDATE public.agent_knowledge_base
   SET scope_summary = 'Preguntas sobre si el producto funciona, si sirve, en cuánto tiempo se sienten los efectos,
cuándo va a notar resultados, si se siente desde la primera noche, o por qué tras varios
días aún no nota cambios.'
 WHERE topic = 'efectividad'
   AND agent_id = 'somnio-sales-v4'
   AND workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490';

-- product/registro_sanitario
UPDATE public.agent_knowledge_base
   SET scope_summary = 'Preguntas sobre si el producto está aprobado o registrado legalmente, si tiene registro
sanitario INVIMA, si está certificado por FDA o alguna autoridad, si es legal de vender,
quién es el fabricante o laboratorio, o si tiene número de certificado oficial.'
 WHERE topic = 'registro_sanitario'
   AND agent_id = 'somnio-sales-v4'
   AND workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490';

-- product/como_se_toma
UPDATE public.agent_knowledge_base
   SET scope_summary = 'Preguntas sobre cómo se toma el producto, cuál es la dosis, cuándo tomarlo, a qué hora,
cuántos comprimidos al día, si se mastica o se traga entero, con agua o sin agua, si se
puede partir el comprimido, o si una dosis distinta a la estándar es válida.'
 WHERE topic = 'como_se_toma'
   AND agent_id = 'somnio-sales-v4'
   AND workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490';

-- policies/devoluciones
UPDATE public.agent_knowledge_base
   SET scope_summary = 'Cualquier consulta sobre devoluciones, reembolsos, garantía, cambios del producto,
reclamos por producto dañado, o solicitudes tipo "no me sirvió, lo quiero devolver".
Todas estas se gestionan por equipo humano, el bot no redacta respuesta.'
 WHERE topic = 'devoluciones'
   AND agent_id = 'somnio-sales-v4'
   AND workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490';

-- policies/envio
UPDATE public.agent_knowledge_base
   SET scope_summary = 'Preguntas sobre cuánto tarda el envío, cuándo llega el pedido, si llega el mismo día,
qué ciudades cubren, si hay envío a una ciudad específica, qué transportadora usan,
o si despachan al exterior (Miami, Madrid, México, EEUU, Europa).'
 WHERE topic = 'envio'
   AND agent_id = 'somnio-sales-v4'
   AND workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490';

-- policies/pago
UPDATE public.agent_knowledge_base
   SET scope_summary = 'Preguntas sobre cómo pagar, métodos de pago aceptados (contra-entrega, transferencia
Bancolombia, Nequi, Daviplata, tarjeta crédito o débito, link de pago), si reciben
efectivo, o si aceptan métodos no listados como criptomonedas, Bitcoin o PayPal.'
 WHERE topic = 'pago'
   AND agent_id = 'somnio-sales-v4'
   AND workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490';

-- edge-cases/insomnio_largo_plazo
UPDATE public.agent_knowledge_base
   SET scope_summary = 'Preguntas de clientes con insomnio crónico que llevan meses o años sin poder dormir,
que ya toman medicamentos recetados para dormir (zolpidem, clonazepam, alprazolam,
pastillas para dormir), o que mencionan depresión, ansiedad severa o sufrimiento
emocional fuerte ligado al sueño.'
 WHERE topic = 'insomnio_largo_plazo'
   AND agent_id = 'somnio-sales-v4'
   AND workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490';

-- edge-cases/interaccion_alcohol
UPDATE public.agent_knowledge_base
   SET scope_summary = 'Preguntas sobre si puede tomarse el producto junto con alcohol, trago, cerveza, vino,
ron o licor, si una copa o cerveza es seguro, o qué hacer si la persona ya bebió esa
noche y quiere igual tomar la dosis.'
 WHERE topic = 'interaccion_alcohol'
   AND agent_id = 'somnio-sales-v4'
   AND workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490';

-- edge-cases/interaccion_medicamentos
UPDATE public.agent_knowledge_base
   SET scope_summary = 'Preguntas del cliente que ya está tomando un medicamento recetado específico y quiere
saber si puede combinarlo con el producto. Incluye familias farmacológicas como
antidepresivos, ansiolíticos, anticoagulantes, medicamentos para hipertensión, diabetes
o tiroides, y casos de polifarmacia (varios recetados a la vez).'
 WHERE topic = 'interaccion_medicamentos'
   AND agent_id = 'somnio-sales-v4'
   AND workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490';

-- edge-cases/uso_en_embarazo
UPDATE public.agent_knowledge_base
   SET scope_summary = 'Preguntas sobre si el producto puede tomarse durante el embarazo, estando embarazada,
en lactancia, dando pecho, postparto, o buscando embarazo, y si hay alguna restricción
específica para mujeres gestantes o madres lactantes.'
 WHERE topic = 'uso_en_embarazo'
   AND agent_id = 'somnio-sales-v4'
   AND workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490';

-- edge-cases/uso_en_ninos
UPDATE public.agent_knowledge_base
   SET scope_summary = 'Preguntas sobre si el producto sirve para un niño, hijo, hija, adolescente o menor de
edad, desde qué edad se puede dar, si los menores de 14 lo pueden tomar, si requiere
pediatra, o si una dosis menor sirve para edades chicas.'
 WHERE topic = 'uso_en_ninos'
   AND agent_id = 'somnio-sales-v4'
   AND workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490';

-- faqs-no-templated/alternativas_naturales
UPDATE public.agent_knowledge_base
   SET scope_summary = 'Preguntas sobre alternativas naturales al producto, hábitos para dormir mejor sin tomar
nada (higiene del sueño), hierbas o infusiones (manzanilla, valeriana, tilo), remedios
caseros, o si solo con buenos hábitos basta sin necesidad de comprar nada.'
 WHERE topic = 'alternativas_naturales'
   AND agent_id = 'somnio-sales-v4'
   AND workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490';

-- faqs-no-templated/duracion_efecto
UPDATE public.agent_knowledge_base
   SET scope_summary = 'Preguntas sobre cuántas horas dura el efecto del producto, si va a permitir dormir toda
la noche, si despierta a media noche, si deja "resaca" o pesadez al día siguiente, o
cómo se compara la duración con la de un medicamento recetado para dormir.'
 WHERE topic = 'duracion_efecto'
   AND agent_id = 'somnio-sales-v4'
   AND workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490';

-- faqs-no-templated/precio_comparativo
UPDATE public.agent_knowledge_base
   SET scope_summary = 'Preguntas sobre si el producto es caro o más barato comparado con otras marcas,
alternativas en farmacia (melatonina sola, magnesio solo), competidores con nombre
específico, si vale la pena pagar el precio, o tablas comparativas de precio.'
 WHERE topic = 'precio_comparativo'
   AND agent_id = 'somnio-sales-v4'
   AND workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490';

-- ============================================================================
-- ROLLBACK manual (NO ejecutar salvo emergencia):
--   ALTER TABLE public.agent_knowledge_base DROP COLUMN IF EXISTS scope_summary;
-- ============================================================================
