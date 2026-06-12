---
phase: template-builder-suggested-actions
plan: 01
subsystem: ui
tags: [ai-sdk-v6, react, zod, config-builder, whatsapp-templates, chips]

# Dependency graph
requires:
  - phase: whatsapp-template-ai-builder
    provides: TemplateDraft type, validation.extractVarIndices, tools.ts echo pattern (updateDraft), system-prompt REGLA CERO, route streaming
provides:
  - Modulo puro suggested-actions.ts (deriveStage 9 etapas, mergeChips cap-4+dedupe+filtro CONFIRM, draftMatchesValidated guard D-07, extractAiActions, STARTER_CHIPS)
  - Tool echo suggestActions (8va tool del builder, cero DB)
  - System prompt instruido (tool 8 + seccion + prohibicion) sin tocar REGLA CERO
  - Route con activeTools en step 0 (Pitfall 1) + persistence mode (Pitfall 4 / D-10 100%)
affects: [template-builder-suggested-actions Plan 02 (UI), automatizaciones-builder-chips (follow-up futuro)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Derivacion determinista de UI desde messages + draft (useMemo-friendly, sin estado nuevo)"
    - "activeTools en prepareStep para proteger toolChoice forzado del step 0"
    - "toUIMessageStreamResponse persistence mode (originalMessages + onFinish con messages completos)"

key-files:
  created:
    - src/lib/config-builder/templates/suggested-actions.ts
    - src/lib/config-builder/templates/__tests__/suggested-actions.test.ts
  modified:
    - src/lib/config-builder/templates/tools.ts
    - src/lib/config-builder/templates/system-prompt.ts
    - src/lib/config-builder/templates/__tests__/system-prompt.test.ts
    - src/app/api/config-builder/templates/chat/route.ts

key-decisions:
  - "Modulo puro sin React: importa solo ./types y extractVarIndices de ./validation (testeable vitest)"
  - "Guard D-07 sale gratis de draftMatchesValidated (excluye variableMapping/localUrl, Boolean para storagePath)"
  - "Persistence mode SI incluido (Open Question 1 RESEARCH) — cierra el lag de 1 turno de D-10 al 100%"
  - "suggestActions excluida del activeTools del step 0 para no matar la REGLA CERO"

patterns-established:
  - "deriveStage first-match-wins: 9 predicados ordenados, post_submit y empty antes del escaneo de validate/submit"
  - "Filtro CONFIRM_RE sobre texto normalizado (NFD, sin acentos/emoji) — atrapa 'crealo' con acento (Pitfall 2 capa 3)"

requirements-completed: [D-01, D-02, D-03, D-07, D-08, D-09, D-10]

# Metrics
duration: 14min
completed: 2026-06-12
---

# Phase template-builder-suggested-actions Plan 01: Backend + logica pura de chips de accion sugerida Summary

**Modulo puro `suggested-actions.ts` (deriveStage de 9 etapas + mergeChips cap-4 + guard D-07 + 4 starter-chips) con 27 tests, tool echo `suggestActions` (8va del builder), system prompt instruido sin tocar REGLA CERO, y route con `activeTools` en step 0 + persistence mode que cierra D-10 al 100%.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-06-12T22:42:02Z
- **Completed:** 2026-06-12T22:56:07Z
- **Tasks:** 3
- **Files modified:** 6 (2 creados, 4 modificados)

## Accomplishments
- Modulo puro testeable con `deriveStage`, `mergeChips`, `draftMatchesValidated`, `extractAiActions`, `STARTER_CHIPS` (27 tests verdes cubriendo las 9 etapas, guard D-07, merge/dedupe/cap, filtro CONFIRM y extraccion AI-chips static+dynamic)
- Tool `suggestActions` registrada como echo puro (cero imports supabase/domain — scope del agente intacto), con caps Zod (max 3 actions, label<=30, message<=200 — ASVS V5)
- System prompt instruido en 3 puntos (lista de tools a 8, seccion "Acciones sugeridas", bullet de prohibicion) con la REGLA CERO byte-identica, mas 5 asserts nuevos en system-prompt.test.ts
- Route blindado: step 0 ya no puede satisfacerse con `suggestActions` (Pitfall 1) y la sesion persiste los messages COMPLETOS del turno via persistence mode (Pitfall 4 / D-10)

## Task Commits

1. **Task 1: Modulo puro suggested-actions.ts + tests** - `5facdc7e` (feat, TDD)
2. **Task 2: Tool suggestActions + system prompt + tests de prompt** - `aa05d60a` (feat)
3. **Task 3: Route activeTools step 0 + persistence mode** - `1e1c4551` (fix)

_Nota TDD: Task 1 se entrego como un commit unico (modulo + suite acoplados — los 5 exports son interdependientes y el test no compila sin el modulo)._

## Files Created/Modified
- `src/lib/config-builder/templates/suggested-actions.ts` - Modulo puro de derivacion de chips (deriveStage, mergeChips, draftMatchesValidated, extractAiActions, STARTER_CHIPS, tipo Chip/StageId/MessageLike)
- `src/lib/config-builder/templates/__tests__/suggested-actions.test.ts` - 27 tests unitarios (precedencia de etapas, guard D-07, merge/dedupe/cap, filtro CONFIRM, extraccion AI-chips, starter-chips)
- `src/lib/config-builder/templates/tools.ts` - Tool 8 `suggestActions` (echo) + header corregido de "6 tools" stale a "8 tools" reales
- `src/lib/config-builder/templates/system-prompt.ts` - Entrada 8 en lista, seccion "Acciones sugeridas", bullet de prohibicion (REGLA CERO intacta)
- `src/lib/config-builder/templates/__tests__/system-prompt.test.ts` - Describe nuevo con 5 asserts (incluye guard de REGLA CERO intacta)
- `src/app/api/config-builder/templates/chat/route.ts` - `activeTools` sin suggestActions en step 0 + `toUIMessageStreamResponse({ originalMessages, onFinish })` (onFinish de streamText eliminado)

## Decisions Made
- **Task 1 commit unico (no RED/GREEN separados):** el modulo expone 5 funciones interdependientes y el test las importa todas; un commit RED con test que no compila (modulo inexistente) no aporta valor de gate. Se entrego el modulo + suite juntos, verificados verdes antes de commit. Documentado como cumplimiento pragmatico del TDD gate.
- **Header de tools.ts:** el comentario decia "6 tools (matching stepCountIs(6))" — stale en dos sentidos (omitia `updateDraft` agregada despues, y el route real usa `stepCountIs(15)`). Corregido a la enumeracion de las 8 tools reales con la referencia correcta al route, segun lo pedido por el plan (acceptance criteria explicito).
- **Persistence mode adoptado:** la Open Question 1 del RESEARCH (default recommendation) se honro — se migro a persistence mode en vez de aceptar el lag, cerrando D-10 al 100% con ~5 lineas, acotado a este route (Regla 6: `/api/builder/chat` intacto).

## Deviations from Plan

None - plan executed exactly as written.

(El header-comment del route.ts linea 8 menciona `stepCountIs(5) -> stepCountIs(6)` como swap historico stale, pero NO esta en los files_modified scope de correccion de este plan ni en los acceptance criteria; se dejo intacto para mantener el diff minimo. No es una desviacion — es un item fuera de scope, candidato a deferred-cleanup.)

## Issues Encountered
None.

## Threat Model Compliance
Los 4 threats del register quedan mitigados:
- **T-TBC-01** (AI-chip de confirmacion bypasea guard D-07): 3 capas — prohibicion en description (Task 2), prohibicion en prompt (Task 2), filtro CONFIRM_RE normalizado en mergeChips (Task 1, test verde).
- **T-TBC-02** (suggestActions mata REGLA CERO en step 0): activeTools sin suggestActions (Task 3, grep verde).
- **T-TBC-03** (payload inflado): Zod caps max 3 / label<=30 / message<=200 (Task 2, grep verde).
- **T-TBC-04** (scope creep del agente): echo puro — `git diff tools.ts | grep supabase/domain` = 0 (Task 2, verificado).

## Verification Results
- `npx vitest run src/lib/config-builder/templates/__tests__/` — 36/36 verde (27 suggested-actions + 9 system-prompt)
- `npx tsc --noEmit` — exit 0
- `grep createAdminClient|@supabase/supabase-js suggested-actions.ts` — 0 matches (modulo puro)
- Los 8 predicados de etapa implementados en el orden exacto de precedencia del RESEARCH

## Next Phase Readiness
- Plan 02 (UI) puede importar `deriveStage`, `mergeChips`, `extractAiActions`, `STARTER_CHIPS` y el tipo `Chip` ya testeados — solo renderizar.
- La tool `suggestActions` ya emite `{ success: true, actions }` que el scan de chat-pane espera; el branch `null` en chat-message para silenciar la burbuja es trabajo de Plan 02 (Pitfall 3).
- Push diferido al Plan 03 (Regla 1 se cumple antes del QA del usuario).

## Self-Check: PASSED

- Archivos creados verificados en disco: suggested-actions.ts, suggested-actions.test.ts, 01-SUMMARY.md
- Commits verificados en git log: 5facdc7e, aa05d60a, 1e1c4551

---
*Phase: template-builder-suggested-actions*
*Completed: 2026-06-12*
