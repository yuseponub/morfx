-- ============================================================
-- UI Editorial Dashboard v2 — Activacion per-workspace
-- ============================================================
-- Standalone: .planning/standalone/ui-redesign-dashboard/
-- Flag: workspaces.settings.ui_dashboard_v2.enabled (boolean, JSONB)
-- Default: false (Regla 6 — NO afecta produccion hasta activacion explicita)
-- Scope: 7 modulos (CRM, Pedidos, Tareas, Agentes, Automatizaciones,
--        Analytics+Metricas, Configuracion).
--        NO incluye /whatsapp (ese tiene su propio flag ui_inbox_v2.enabled).
-- ============================================================

-- ============================================================
-- PASO 1: Identificar el workspace UUID de Somnio
-- ============================================================
-- Ejecutar primero para confirmar el ID + estado actual de ambos flags:
SELECT
  id,
  name,
  settings->'ui_inbox_v2' AS inbox_v2_state,
  settings->'ui_dashboard_v2' AS dashboard_v2_state
FROM workspaces
WHERE name ILIKE '%somnio%';

-- Reemplazar <workspace-uuid> en los snippets siguientes con el id real.
-- Ejemplo historico (NO garantizado actual): 'a3843b3f-c337-4836-92b5-89c58bb98490'

-- ============================================================
-- PASO 2: Activar (idempotente — usa create_missing=true para crear
--         la llave intermedia 'ui_dashboard_v2' si no existe)
-- ============================================================
UPDATE workspaces
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{ui_dashboard_v2,enabled}',
  'true'::jsonb,
  true  -- create_missing — necesario si la llave 'ui_dashboard_v2' no existe aun
)
WHERE id = '<workspace-uuid>';

-- Verificar:
SELECT
  id,
  name,
  settings->'ui_dashboard_v2' AS dashboard_v2_state
FROM workspaces
WHERE id = '<workspace-uuid>';
-- Esperado: dashboard_v2_state = {"enabled": true}

-- ============================================================
-- PASO 3: Rollback inmediato (si QA visual descubre regresion)
-- ============================================================
UPDATE workspaces
SET settings = jsonb_set(settings, '{ui_dashboard_v2,enabled}', 'false'::jsonb)
WHERE id = '<workspace-uuid>';

-- Verificar rollback:
SELECT
  id,
  name,
  settings->'ui_dashboard_v2' AS dashboard_v2_state
FROM workspaces
WHERE id = '<workspace-uuid>';
-- Esperado: dashboard_v2_state = {"enabled": false}

-- ============================================================
-- PASO 4 (diagnostico): inspeccionar adopcion del flag en todos los workspaces
-- ============================================================
-- Util para confirmar que el default es false (Regla 6) y auditar
-- post-rollout quienes estan activos:
SELECT
  id,
  name,
  settings->'ui_dashboard_v2'->>'enabled' AS dashboard_v2,
  settings->'ui_inbox_v2'->>'enabled'     AS inbox_v2,
  created_at
FROM workspaces
ORDER BY name;

-- ============================================================
-- NOTAS
-- ============================================================
-- 1. La activacion tiene efecto inmediato — el resolver server-side
--    `getIsDashboardV2Enabled(workspaceId)` lee el flag en cada page
--    load del segment `(dashboard)`. No requiere redeploy ni cache bust.
--
-- 2. NO hay migracion de schema asociada — solo flip del JSONB.
--
-- 3. Si Somnio ya tiene ui_inbox_v2 activo, la coexistencia es soportada
--    por diseno (D-DASH-03):
--    {"ui_inbox_v2": {"enabled": true}, "ui_dashboard_v2": {"enabled": true}}
--    es valida y esperada post-activacion.
--
-- 4. Para activacion masiva (todos los workspaces premium, etc.) sin tocar
--    cada uno individualmente: WHERE clause mas amplia. NO recomendado
--    sin QA per-workspace.
--
-- 5. Admin UI para flipear el flag sin SQL: deferred a standalone separado
--    (low-priority — operativo, no frecuente).
--
-- 6. Checklist QA pre-activacion: ver LEARNINGS.md §9.1.
--
-- 7. Post-activacion, verificar coherencia visual navegando los 7 modulos
--    editoriales + /whatsapp (inbox v2 separate flag) + fuera-de-scope
--    (super-admin, sandbox, onboarding) — ver D-DASH-04 mitigaciones.
-- ============================================================
