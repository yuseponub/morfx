---
phase: agent-varixcenter
plan: 10
subsystem: database
tags: [agent_templates, varixcenter, sql-migration, template-catalog, supabase]

# Dependency graph
requires:
  - phase: agent-varixcenter Plan 01
    provides: VARIXCENTER_AGENT_ID = 'varixcenter' (config.ts) + constants (ACTION_TEMPLATE_MAP, INFORMATIONAL_INTENTS)
  - phase: agent-varixcenter Plan 06
    provides: response-track.ts (getTemplatesForIntents lookup por intent + priority CORE/COMPLEMENTARIA)
provides:
  - "Migración SQL con 46 templates bajo agent_id='varixcenter' (workspace c6621640-...)"
  - "Saludo custom 2 filas (AMENDA D-12) — bienvenida CORE + CTA COMPLEMENTARIA"
  - "Catálogo idempotente (DELETE antes de INSERT) listo para apply en prod"
affects: [agent-varixcenter Wave 6 / Plan 11 (push código + activación routing rule)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Catalog migration verbatim PLANTILLAS.md clonado del analog godentist-fb-ig (shape de columnas idéntico)"
    - "Sanity checks DO blocks (count + saludo + precios) embebidos en la migración para fail-fast en apply"

key-files:
  created:
    - supabase/migrations/20260611165220_varixcenter_template_catalog.sql
  modified: []

key-decisions:
  - "workspace_id = c6621640-... (NO NULL global) — aísla el catálogo al workspace target; resuelto por TemplateManager via workspace_id.eq"
  - "priority 'COMPLEMENTARIA' (no abreviatura 'COMP' de PLANTILLAS.md) — matchea el enum real de la columna en godentist baseline"
  - "saludo_comp insertado como intent='saludo' priority='COMPLEMENTARIA' (no intent='saludo_comp') — combined path del response-track agrupa por intent='saludo'"
  - "46 rows (no ~44): se incluyen TODOS los IDs de PLANTILLAS §2-§8 + 2 filas de saludo"

patterns-established:
  - "Template catalog migration con DO-block sanity checks (count exact + content LIKE) que abortan el COMMIT si el catálogo no cuadra"

requirements-completed: [VARIX-TEMPLATES]

# Metrics
duration: ~10min
completed: 2026-06-11
---

# Phase agent-varixcenter Plan 10: Catálogo de Templates Varixcenter Summary

**Migración SQL idempotente con 46 templates bajo agent_id='varixcenter' (workspace c6621640-...), saludo custom 2 filas AMENDA D-12, precios D-06 verbatim — SQL creado, apply en prod PENDIENTE (checkpoint Task 2).**

## Performance

- **Duration:** ~10 min
- **Tasks:** 1 de 2 (Task 2 = checkpoint human-action del orquestador)
- **Files created:** 1

## Accomplishments
- Migración `20260611165220_varixcenter_template_catalog.sql` con 46 rows verbatim de PLANTILLAS.md §2-§8
- Saludo custom 2 filas (AMENDA D-12): `saludo` CORE "¡Hola! 👋 Bienvenido a VarixCenter, donde tus várices son cosa del pasado ✨" + `saludo` COMPLEMENTARIA "¿Deseas agendar tu valoración?" — NO las 5 opciones A-E (descartadas)
- Idempotencia: `DELETE FROM agent_templates WHERE agent_id='varixcenter'` antes de los 8 bloques INSERT
- 3 sanity-check DO blocks embebidos (count=46, saludo D-12, precios D-06) que abortan el COMMIT si fallan
- Cross-check de IDs: **34/34** IDs requeridos por el código presentes (0 faltantes)

## Task Commits

1. **Task 1: Generar migración SQL ~46 templates** - `c39de170` (feat)

_Task 2 es checkpoint human-action (apply en prod) — manejado por el orquestador, no commiteado aquí._

## Files Created/Modified
- `supabase/migrations/20260611165220_varixcenter_template_catalog.sql` - Catálogo de 46 templates del agente varixcenter (saludo D-12 + §2-§8 PLANTILLAS.md) con DELETE idempotente y 3 sanity checks

## Decisions Made
- **workspace_id = `c6621640-ba67-43de-9f05-905f09a6dc8f`** (no NULL global): el objetivo lo especifica explícitamente y aísla el catálogo al workspace Varixcenter. El TemplateManager lo resuelve via `workspace_id.is.null OR workspace_id.eq.{workspaceId}`, por lo que `getTemplatesForIntents('varixcenter', workspaceId, ...)` los recoge sin problema.
- **priority `'COMPLEMENTARIA'`** (no la abreviatura "COMP" de la tabla de PLANTILLAS.md): el enum real de la columna `priority` en `agent_templates` es `'CORE' | 'COMPLEMENTARIA' | 'OPCIONAL'` (verificado contra el catálogo godentist baseline). PLANTILLAS.md usa "COMP" solo como abreviatura visual.
- **Saludo complementario como `intent='saludo'` priority='COMPLEMENTARIA'** (no `intent='saludo_comp'`): el combined path del response-track agrupa por `intent='saludo'` y filtra el CORE; la fila COMPLEMENTARIA debe vivir bajo el mismo intent.
- **46 rows** (el plan estimaba ~44): se insertaron TODOS los IDs de §2-§8 de PLANTILLAS.md + las 2 filas de saludo. Conteo desglosado: saludo 2 + triage 1 + info-tipo 6 + precios/info 12 + síntomas 3 + flujo 9 + escape 8 + follow-ups 5 = 46.

## Cross-check de Template IDs (success criteria)

Los 34 IDs que el código (`response-track.ts` + `ACTION_TEMPLATE_MAP` + `INFORMATIONAL_INTENTS` + `TIPO_VENAS_TEMPLATE_MAP` + `INTENT_TEMPLATE_OVERRIDE`) busca están **todos presentes** en el SQL:

`saludo, triage, info_vasitos(+_comp), info_grandes(+_comp), info_ambas(+_comp), precio_valoracion, precio_tratamiento, info_laser, info_examen_doppler, info_medias, ubicacion, horarios, financiacion, seguros_eps, fuera_de_ciudad, no_diagnostico, english_response, pedir_datos, pedir_datos_parcial, pedir_fecha, mostrar_disponibilidad, sin_disponibilidad, confirmar_cita, cita_agendada, invitar_agendar, handoff, no_interesa, retoma_datos, retoma_fecha, retoma_horario, retoma_confirmacion`

**Faltantes: 0.** Extras (no usados directamente por el mapeo pero válidos del playbook): `precio_cirugia, financiacion_opcional, preguntas_medicas, pedir_texto, paciente_antiguo, reagendamiento, cancelar_cita, queja, despedida, retoma_post_info, mostrar_disponibilidad_jornada`.

## Deviations from Plan

None - plan executed exactly as written. (El conteo final 46 vs "~44" del plan es esperado — el plan estimaba con "~"; se insertaron todos los templates de §2-§8.)

## Issues Encountered
- El primer intento de Write apuntó al checkout compartido en lugar del worktree; corregido escribiendo en la ruta absoluta del worktree. Sin impacto.
- Nota de ajuste "11:10": el critical_instruction pedía corregir si algún template mencionaba el slot "11:10". Ningún template lo menciona (el único rango horario en `horarios` es "8:00am a 11:30am", rango de jornada, no slot). No requirió cambio.

## User Setup Required

**CHECKPOINT human-action (Task 2 — BLOCKING, Regla 5):** El operador debe aplicar la migración en el Supabase de PRODUCCIÓN de MorfX ANTES de pushear el código del agente (Wave 6 / Plan 11). Ver detalle en la sección CHECKPOINT del retorno al orquestador.

## Next Phase Readiness
- SQL listo y commiteado (`c39de170`).
- **Bloqueante:** apply en prod (checkpoint Task 2). Hasta confirmar `count=46`, NO se debe pushear el código del agente (Pitfall 7 — getTemplatesForIntents retornaría Map vacío → degradación silenciosa).
- Tras el apply confirmado, Wave 6 (Plan 11) puede pushear el código + crear la routing rule manual.

## Self-Check: PASSED
- FOUND: supabase/migrations/20260611165220_varixcenter_template_catalog.sql
- FOUND commit: c39de170 (feat — migración catálogo)
- FOUND: .planning/standalone/agent-varixcenter/10-SUMMARY.md

---
*Phase: agent-varixcenter*
*Completed: 2026-06-11*
*Estado: SQL creado, apply en prod CONFIRMADO 2026-06-11 (count=46, saludo D-12 verificado via REST)*
