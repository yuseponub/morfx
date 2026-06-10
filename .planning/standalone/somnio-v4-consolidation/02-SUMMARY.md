---
phase: somnio-v4-consolidation
plan: 02
subsystem: somnio-v4
tags: [dead-code-removal, D-12, D-13, D-15, escalation, v4-agent, agent-timers]

# Dependency graph
requires:
  - phase: somnio-v4-consolidation/01
    provides: "BASELINE.md (SUITE_CMD gate D-09) + baseline operativo Smoke A/B (gate D-10)"
provides:
  - "Plumbing isCrmMutation/casReject borrado del path del agente (D-12)"
  - "Función muerta mapOutcomeToAgentOutput (~233 líneas) eliminada (Pitfall 3)"
  - "Campos fantasma shouldCreateOrder/orderData fuera de V4AgentOutput + 3 consumidores (D-13)"
  - "Helper createTimerOrderV4 + camino timer-createOrder muerto eliminados (Pitfall 1)"
  - "confidence legacy 0-100 deprecado (NO borrado — load-bearing en guards.ts R0) (D-15)"
  - "Core de Wave 2 ahora se extrae de código ya limpio (orden W1→W2 estricto)"
affects: [planes 03..12 de somnio-v4-consolidation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Narrow-union-by-path: el path del agente expone AgentSubLoopReason (2 valores) mientras el sub-loop conserva SubLoopReason (4 valores) — separación de contratos por consumidor"
    - "Deprecate-not-delete para campos load-bearing con escala auto-reportada distinta (Pitfall 4)"
    - "Comment-token hygiene: gates grep wc-l==0 obligan a no dejar el token borrado ni en comentarios"

key-files:
  created:
    - .planning/standalone/somnio-v4-consolidation/02-SUMMARY.md
  modified:
    - src/lib/agents/somnio-v4/escalation.ts
    - src/lib/agents/somnio-v4/slots.ts
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts
    - src/lib/agents/somnio-v4/types.ts
    - src/lib/agents/somnio-v4/engine-v4.ts
    - src/lib/agents/somnio-v4/unknown-cases/capture.ts
    - src/lib/agents/somnio-v4/comprehension-schema.ts
    - src/lib/agents/somnio-v4/__tests__/escalation.test.ts
    - src/inngest/functions/agent-timers-v4.ts

key-decisions:
  - "D-12: borrado el plumbing isCrmMutation/casReject + mapOutcomeToAgentOutput muerta; sub-loop SubLoopReason (output-schema.ts) INTACTO"
  - "D-13: borrados shouldCreateOrder/orderData + helper createTimerOrderV4 (Open Question 2 resuelta a BORRAR — camino timer conductualmente inalcanzable)"
  - "D-15: resuelto a DEPRECAR (no borrar) por su cláusula condicional (>2 consumidores) — guards.ts R0 load-bearing (Pitfall 4)"
  - "Extensión D-11 con agent-timers-v4.ts declarada y acotada (Pitfall 2); v3 intacto"

patterns-established:
  - "Separación de contratos por consumidor: AgentSubLoopReason (path agente) vs SubLoopReason (sub-loop CRM gate)"
  - "Token hygiene en comentarios para satisfacer gates grep | wc -l == 0"

requirements-completed: [D-12, D-13, D-15]

# Metrics
duration: ~35min
completed: 2026-06-10
---

# Phase somnio-v4-consolidation Plan 02: Limpieza de código muerto del agente (D-12/D-13/D-15) Summary

**629 líneas de código muerto eliminadas del lado del AGENTE (plumbing isCrmMutation/casReject + mapOutcomeToAgentOutput ~233 líneas + shouldCreateOrder/orderData + helper createTimerOrderV4), con types honestos, sub-loop intacto, confidence legacy deprecado (load-bearing), y CERO cambio de comportamiento — suite v4 verde (346 passed).**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-06-10
- **Tasks:** 3
- **Files modified:** 9 (8 de somnio-v4/** + agent-timers-v4.ts)
- **Líneas:** 73 insertions, **629 deletions**

## Accomplishments

- **D-12 (Pitfall 3 + 13):** borrado el plumbing siempre-false `isCrmMutation`/`casReject` (escalation.ts EscalationInput + ramas; slots.ts ×2 call sites + narrowings redundantes; somnio-v4-agent.ts call site) y la función muerta `mapOutcomeToAgentOutput` entera (~233 líneas, cero call sites verificado por grep). Union `V4AgentOutput.subLoopReason` reducido a `'low_confidence' | 'razonamiento_libre' | null`. El `SubLoopReason` del sub-loop (`output-schema.ts`, 4 valores) y `crm-gate.ts` (`runCrmSubLoop`) quedaron INTACTOS.
- **D-13 (Pitfall 1):** borrados `shouldCreateOrder`/`orderData` de `V4AgentOutput` + sus ~12 asignaciones (11 user-path `false` + setter del timer path con `isCreateOrder`). En `agent-timers-v4.ts` (extensión D-11 declarada): borrado el bloque consumidor + refs en log/return + el helper `createTimerOrderV4` entero (Open Question 2 → BORRAR). `engine-v4.ts` pobla `DebugTurn.orchestration.shouldCreateOrder` con literal `false` (sandbox/types.ts NO tocado).
- **D-15 (Pitfall 4):** `confidence` legacy 0-100 DEPRECADO (no borrado) con JSDoc `@deprecated` en `comprehension-schema.ts` y `types.ts` (`intentInfo.confidence`), documentando que es load-bearing en `guards.ts` R0 (gate handoff con escala auto-reportada distinta a `intent_confidence`) + columna `agent_turns.confidence` + tabs del debug panel. Borrado diferido. CERO cambios de comportamiento.

## Task Commits

Cada task fue commiteado atómicamente (gate D-09: tsc + SUITE_CMD verde por commit):

1. **Task 1: D-12 plumbing + mapOutcomeToAgentOutput** - `f5261abc` (refactor) — 7 files, +48/-332
2. **Task 2: D-13 shouldCreateOrder/orderData + timer path muerto** - `8c94ca40` (refactor) — 4 files, +18/-297
3. **Task 3: D-15 deprecación confidence legacy** - `aa360eef` (docs) — 2 files, +7

## Files Created/Modified

- `src/lib/agents/somnio-v4/escalation.ts` — EscalationInput sin isCrmMutation/casReject; nuevo tipo `AgentSubLoopReason`; decideSubLoopReason estrechado a 2 reasons
- `src/lib/agents/somnio-v4/slots.ts` — quitados los params siempre-false + narrowings redundantes; usa `primaryReason`/`secondaryReason` directos
- `src/lib/agents/somnio-v4/somnio-v4-agent.ts` — call site limpio; función muerta `mapOutcomeToAgentOutput` borrada; ~12 asignaciones shouldCreateOrder/orderData removidas; local huérfano `isCreateOrder` removido; docstrings actualizados
- `src/lib/agents/somnio-v4/types.ts` — `V4AgentOutput.subLoopReason` reducido; `shouldCreateOrder`/`orderData` borrados; `@deprecated` en `intentInfo.confidence`
- `src/lib/agents/somnio-v4/engine-v4.ts` — comentario de discriminator actualizado (resolveLowSlot); `shouldCreateOrder: false` literal en DebugTurn
- `src/lib/agents/somnio-v4/unknown-cases/capture.ts` — comentario stale del mapper actualizado
- `src/lib/agents/somnio-v4/comprehension-schema.ts` — JSDoc `@deprecated` sobre el campo `confidence` (z.number 0-100, NO borrado)
- `src/lib/agents/somnio-v4/__tests__/escalation.test.ts` — −2 tests sancionados (crm_mutation/cas_reject); `base` object sin los 2 flags
- `src/inngest/functions/agent-timers-v4.ts` — bloque consumidor + log ref + return fields + helper createTimerOrderV4 borrados

## Lista final de asignaciones eliminadas (D-13)

- `somnio-v4-agent.ts` user path: 11 líneas `shouldCreateOrder: false,` (sites 231/254/295/324/374/494/549/813/882/985/1035 del HEAD pre-edit)
- `somnio-v4-agent.ts` timer path (`processSystemEvent`): `shouldCreateOrder: isCreateOrder` + bloque `orderData: isCreateOrder ? {...} : undefined` + local `isCreateOrder`
- `agent-timers-v4.ts`: `shouldCreateOrder: output.shouldCreateOrder` en logger.info + bloque `if (output.shouldCreateOrder && output.orderData) { createTimerOrderV4(...) }` + `shouldCreateOrder`/`orderCreated`/`orderError` del return + locals `orderCreated`/`orderError` + helper `createTimerOrderV4` (incl. interfaces CreateTimerOrderArgs/CreateTimerOrderResult)
- `engine-v4.ts`: `shouldCreateOrder: output.shouldCreateOrder` → `shouldCreateOrder: false` literal

## Confirmación de los 2 tests sancionados (D-12 / Pitfall 13)

`src/lib/agents/somnio-v4/__tests__/escalation.test.ts` pasó de **6 → 4 tests**. Borrados:
1. `returns "crm_mutation" when isCrmMutation=true (gana sobre confidence)`
2. `returns "cas_reject" as top priority (gana sobre todos los demás flags)`

Razón: probaban ramas del plumbing que se borró. Esos reasons NO son decisión del path del agente — los maneja el CRM gate vía `runCrmSubLoop` con el `SubLoopReason` completo del sub-loop (que NO se tocó). Ningún otro assert se modificó. Carve-out sancionado del gate D-09.

## Decisions Made

- **Open Question 2 (D-13) resuelta a BORRAR `createTimerOrderV4`:** tras quitar el consumidor, el grep confirmó que solo quedaba la definición → borrado. El camino timer-createOrder es conductualmente inalcanzable (ninguna transición `timer_expired:*` produce `CREATE_ORDER_ACTIONS`) y re-construible si algún día un timer necesitara mutar CRM.
- **D-15 → DEPRECAR (no borrar):** confirmado por grep que el `confidence` legacy tiene >2 consumidores (guards.ts R0 load-bearing, columna agent_turns.confidence, 3 tabs del debug panel, evento comprehension_completed). Sustituir por `intent_confidence*100` cambiaría el guard R0 (escalas auto-reportadas distintas) → violaría el invariante absoluto.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Comentario stale del mapper en unknown-cases/capture.ts**
- **Found during:** Task 1 (verificación del gate grep mapOutcomeToAgentOutput | wc -l == 0)
- **Issue:** `unknown-cases/capture.ts:80` tenía un comentario pre-existente que referenciaba `mapOutcomeToAgentOutput` (la función borrada), rompiendo el gate literal del plan (`wc -l == 0`)
- **Fix:** comentario actualizado para referenciar el path actual ("el mapeo del slot resolver del sub-loop outcome → V4AgentOutput")
- **Files modified:** src/lib/agents/somnio-v4/unknown-cases/capture.ts
- **Verification:** gate Task 1 `grep ... | grep -v sub-loop/ | grep -v crm-gate | wc -l` == 0
- **Committed in:** f5261abc (Task 1 commit)

**2. [Rule 3 - Blocking] Token hygiene en comentarios nuevos para satisfacer gates literales**
- **Found during:** Tasks 1 y 2 (gates `wc -l == 0` / "exactamente 1 match")
- **Issue:** los comentarios explicativos que escribí mencionaban los tokens borrados (`isCrmMutation`/`casReject`/`createTimerOrderV4`/`shouldCreateOrder`), incrementando el conteo de los gates grep del plan
- **Fix:** reformulados los comentarios para describir el cambio sin repetir el token exacto borrado (ej. "los flags siempre-false", "el helper inline", "el campo legacy del V4AgentOutput")
- **Files modified:** escalation.ts, slots.ts, engine-v4.ts, agent-timers-v4.ts, escalation.test.ts
- **Verification:** gate Task 1 == 0; gate Task 2 engine-v4 `shouldCreateOrder` == 1 (el literal `false`)
- **Committed in:** f5261abc + 8c94ca40 (commits de las respectivas tasks)

---

**Total deviations:** 2 auto-fixed (ambos Rule 3 - blocking de gates verificables)
**Impact on plan:** Cero scope creep — ambas correcciones son housekeeping de comentarios para satisfacer los gates literales que el propio plan define. No alteran código ejecutable ni comportamiento.

## Issues Encountered

- **Pitfall 1 (warning sign esperado):** tras borrar `shouldCreateOrder`/`orderData` de `types.ts`, el typecheck quedó rojo en `agent-timers-v4.ts` (TYPE-coupled). Resuelto completando el paso 3 (borrado del consumidor), no revirtiendo — exactamente como el RESEARCH anticipó.
- **mapOutcomeToAgentOutput verificada como muerta:** los nombres en `v4-production-runner-restart.test.ts` mencionan la función en comentarios/describe-strings, pero NO la importan ni la llaman (ejercitan el agente vía `runSubLoop`). Confirmado: cero imports/exports/call-sites reales → borrado seguro.

## Verificación

- `npx tsc --noEmit` exit 0 tras cada task.
- SUITE_CMD (BASELINE.md) verde tras cada task: **346 passed | 7 skipped | 0 failed** (= 348 baseline − 2 tests sancionados de escalation.test.ts).
- Regla 6: `webhook-processor-routing.test.ts` (8) + `media-gate-v4.test.ts` (5) = 13/13 verdes.
- Gate D-11 extendido: `git diff --name-only a8cb5609..HEAD -- src/` solo contiene `somnio-v4/**` + `agent-timers-v4.ts`. `agent-timers-v3.ts` NO aparece (Regla 6). Archivos prohibidos (sandbox/types.ts, pipeline-tab, guards.ts, comprehension.ts, output-schema.ts, crm-gate.ts, v3-production-runner) = 0.
- sub-loop `output-schema.ts` (crm_mutation/cas_reject vivos): 5 matches preservados. `crm-gate.ts` (runCrmSubLoop): 2 matches preservados.

## Next Phase Readiness

- Wave 1 (limpieza del agente) completa para D-12/D-13/D-15. El core de Wave 2 se extraerá de código ya limpio (orden W1→W2 estricto del RESEARCH cumplido para estos 3 mandatos).
- Pendientes de Wave 1 en OTROS planes de este standalone: D-14 (branch fallback del runner), D-16 (labels muertos), D-17 (rename runLegacySubLoop + docs sync), D-18 (comentar crash-recovery). Este plan NO los toca.
- D-10 gate de fin de wave (Smoke A/B) lo corre el plan que cierre Wave 1, no este plan individual.

## Self-Check: PASSED

- 7/7 archivos clave modificados existen en disco
- 1/1 SUMMARY creado (02-SUMMARY.md)
- 3/3 commits verificados en git log (`f5261abc`, `8c94ca40`, `aa360eef`)
- 0 deletions de archivos (solo borrado a nivel de líneas) en los 3 commits

---
*Phase: somnio-v4-consolidation*
*Plan: 02*
*Completed: 2026-06-10*
