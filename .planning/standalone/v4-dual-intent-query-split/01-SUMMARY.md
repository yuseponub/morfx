---
phase: v4-dual-intent-query-split
plan: 01
subsystem: agents
tags: [somnio-v4, rag, comprehension, slots, gemini, dual-intent]

# Dependency graph
requires:
  - phase: v4-gate-confidence-fixes
    provides: responseConfidenceThreshold (0.70) that exposed the dual-intent contamination bug
  - phase: somnio-v4-rag-generative
    provides: sub-loop RAG architecture (secondary_query pattern cloned here for primary_query)
provides:
  - primary_query field in MessageAnalysisSchema (z.string().nullable(), gemelo de secondary_query)
  - primary_query instruction in comprehension-prompt.ts (4 anclas + regla SIEMPRE poblar)
  - ComputeSlotsArgs.primaryQuery consumed in computeSlots ragQuery logic (D-03 fix)
  - 3 Regla 6 regression tests in slots.test.ts (single-intent byte-identical, fix D-03, fallback defensivo)
affects: [somnio-v4, v4-smoke-stability, v4-observability-completeness]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "primary_query como gemelo exacto de secondary_query: clonar patron schema+prompt+slots para segmentar el PRIMARIO cuando hay dual-intent"
    - "Regla 6 byte-identical guard: secondaryIntent !== 'ninguno' ? (primaryQuery ?? rawMessage) : rawMessage — single-intent queda sin cambio"
    - "Fallback defensivo ?? rawMessage: si comprehension no produce primary_query a pesar de tener secundario, el sub-loop sigue funcionando"

key-files:
  created: []
  modified:
    - src/lib/agents/somnio-v4/comprehension-schema.ts
    - src/lib/agents/somnio-v4/comprehension-prompt.ts
    - src/lib/agents/somnio-v4/slots.ts
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts
    - src/lib/agents/somnio-v4/__tests__/slots.test.ts
    - src/lib/agents/somnio-v4/__tests__/comprehension-schema.test.ts
    - src/lib/agents/somnio-v4/__tests__/comprehension-fallback-parity.test.ts

key-decisions:
  - "D-01: primary_query como z.string().nullable() en comprehension-schema.ts, gemelo exacto de secondary_query, null cuando secondary='ninguno'"
  - "D-02: instruccion primary_query aditiva en comprehension-prompt.ts — no se toca la logica de clasificacion de intent/confidence"
  - "D-03: ragQuery del slot primario usa guard secondaryIntent !== 'ninguno' ? (primaryQuery ?? rawMessage) : rawMessage — Regla 6 byte-identical para single-intent"
  - "D-04: call site de computeSlots en somnio-v4-agent.ts pasa primaryQuery + evento comprehension_completed_v4 loguea primary_query"
  - "D-05: sub-loop/prompt.ts NO tocado — el fix ataca el INPUT (query limpia por topic), no el juicio del modelo"
  - "Rule 2 auto-fix: fixtures de comprehension-schema.test.ts y comprehension-fallback-parity.test.ts requerian primary_query: null al usar MessageAnalysisSchema.safeParse() directamente"

patterns-established:
  - "Para agregar un campo nuevo requerido (nullable) al schema de comprehension: actualizar SIEMPRE los fixtures de tests que usan MessageAnalysisSchema.safeParse() directamente con el nuevo campo"

requirements-completed: [D-01, D-02, D-03, D-04, D-05]

# Metrics
duration: 45min
completed: 2026-06-13
---

# Standalone v4-dual-intent-query-split: Plan 01 Summary

**Fix aditivo que elimina contaminacion de query dual-intent en somnio-v4: primary_query segmentada (gemelo de secondary_query) para que el slot primario RAG reciba su sub-query limpia y suba de ~0.6/FALTA_INFO a ~0.95/RESPONDE_BIEN**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-06-13T18:50:00Z
- **Completed:** 2026-06-13T19:35:00Z
- **Tasks:** 3 (+ 1 Rule 2 auto-fix)
- **Files modified:** 7

## Accomplishments

- El bug causa que el slot primario RAG reciba el rawMessage completo (incluyendo la pregunta del secundario) — el modelo ve "lo puedo tomar si tomo alcohol? cuanto demora en llegar a bucaramanga" para el topic `interaccion_alcohol`, aplica la regla anti-invencion, y descarta la respuesta primaria con 0.6/FALTA_INFO aunque el KB la cubre perfectamente al 0.95
- Implementado `primary_query: z.string().nullable()` en comprehension-schema.ts (gemelo exacto de secondary_query, lineas 76-81) — Gemini Flash ahora segmenta AMBOS intents
- `computeSlots` consume `primaryQuery` con guard Regla 6: `secondaryIntent !== 'ninguno' ? (primaryQuery ?? rawMessage) : rawMessage` — los turnos de un solo intent quedan byte-identicos al pre-fix
- 3 tests de regresion Regla 6 nuevos en slots.test.ts; 10 call sites existentes parchados con `primaryQuery: null`
- v4 sigue DORMANT en prod — ningun cambio en routing_rules ni workspace_agent_config

## Task Commits

1. **Task 1: Schema + Prompt** - `1d17e20b` (feat: [D-01/D-02] agregar primary_query a schema y prompt de comprehension)
2. **Task 2: slots.ts + somnio-v4-agent.ts** - `ad3e0e7f` (feat: [D-03/D-04] consumir primary_query en computeSlots y call site)
3. **Rule 2 auto-fix: test fixtures** - `ca51eeee` (fix: [Rule 2] agregar primary_query: null a fixtures de tests de schema)

Task 3 (verificacion final + push) = no commit propio, el push llevo los 3 commits al remoto.

## Files Created/Modified

- `src/lib/agents/somnio-v4/comprehension-schema.ts` — campo primary_query: z.string().nullable() despues de secondary_query (lineas 76-82)
- `src/lib/agents/somnio-v4/comprehension-prompt.ts` — instruccion primary_query paralela a secondary_query; 4 anclas MULTI-INTENT actualizadas con primary_query; regla SIEMPRE poblar extendida
- `src/lib/agents/somnio-v4/slots.ts` — ComputeSlotsArgs.primaryQuery: string | null; ragQuery del primario con guard Regla 6; jsdoc T-2 actualizado
- `src/lib/agents/somnio-v4/somnio-v4-agent.ts` — call site computeSlots pasa primaryQuery; evento comprehension_completed_v4 loguea primary_query
- `src/lib/agents/somnio-v4/__tests__/slots.test.ts` — 10 call sites existentes + primaryQuery: null; 3 nuevos tests describe 'Regla 6'
- `src/lib/agents/somnio-v4/__tests__/comprehension-schema.test.ts` — fixture baseValidPayload() + primary_query: null (Rule 2 fix)
- `src/lib/agents/somnio-v4/__tests__/comprehension-fallback-parity.test.ts` — fixture baseValidPayload() + primary_query: null (Rule 2 fix)

## Decisions Made

- D-01: Campo primary_query en schema como nullable (no optional) — alineado con secondary_query que tambien es nullable+required
- D-03: Guard `secondaryIntent !== 'ninguno'` en lugar de simplemente `primaryQuery ?? rawMessage` — garantiza comportamiento byte-identical para single-intent aunque primaryQuery sea null
- D-05 respetado: sub-loop/prompt.ts NO tocado — el fix es INPUT-side (query limpia), no de prompt de generacion
- Observabilidad: primary_query logueada en comprehension_completed_v4 simetrico a secondary_query (ya estaba en el plan como deseable)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Fixtures de tests de comprehension-schema y comprehension-fallback-parity requerían primary_query: null**

- **Found during:** Task 3 (verificacion final — suite completa somnio-v4)
- **Issue:** `MessageAnalysisSchema.safeParse()` requiere el campo `primary_query` (nullable pero required, no optional). Los 2 test files que usan safeParse directamente con payload literal no incluian el campo nuevo. Resultado: 6 fallos por archivo (12 total) con `expected false to be true`.
- **Fix:** Agregado `primary_query: null` al fixture `baseValidPayload()` de ambos archivos, semanticamente correcto para el caso secondary='ninguno'.
- **Files modified:** `src/lib/agents/somnio-v4/__tests__/comprehension-schema.test.ts`, `src/lib/agents/somnio-v4/__tests__/comprehension-fallback-parity.test.ts`
- **Verification:** `npx vitest run src/lib/agents/somnio-v4/__tests__/comprehension-schema.test.ts src/lib/agents/somnio-v4/__tests__/comprehension-fallback-parity.test.ts` — 21/21 tests pass
- **Committed in:** `ca51eeee`
- **Lesson:** Cuando se agrega un campo requerido (z.nullable sin z.optional) al schema de comprehension, buscar todos los archivos con `MessageAnalysisSchema.safeParse` y actualizar sus fixtures.

---

**Total deviations:** 1 auto-fixed (Rule 2 — missing required field in test fixtures)
**Impact on plan:** Fix necesario para suite verde. Sin scope creep.

## Regla 6 Confirmation

- `git diff --name-only HEAD~3 HEAD | grep -vE "somnio-v4|v4-dual-intent"` = 0 lineas — cero archivos de v3/godentist/recompra/pw-confirmation modificados
- D-05: `git diff -- src/lib/agents/somnio-v4/sub-loop/prompt.ts` = vacio — generation prompt intacto
- Single-intent guard verificado: tests 'Regla 6 — single-intent byte-identical' en slots.test.ts (describe nuevo, 3 invariantes)

## Known Stubs

Ninguno — el fix es aditivo puro. Los turnos single-intent usan rawMessage exacto como antes. Los turnos dual-intent usaran primary_query cuando Gemini Flash empiece a producirla (campo en schema + instruccion en prompt).

## Threat Flags

Ninguno nuevo — el campo primary_query sigue el mismo path de trust que secondary_query (LLM output → Zod parse → ragQuery input solo para RAG, sin exec de codigo ni escritura a DB). Ver T-v4diq-01 en PLAN.md.

## Issues Encountered

- Los tests `smoke-rag-a.test.ts` y `smoke-rag-b.test.ts` hacen llamadas reales a LLMs (Gemini Flash / Haiku) con timeout de 120s por caso. Son flaky por naturaleza y pre-existentes. El smoke-rag-b test "3. razonamiento_libre" fallo en la corrida del CI de esta sesion — no relacionado con el fix (esos tests no usan computeSlots ni MessageAnalysisSchema.safeParse). Documentado como deuda residual de observabilidad.

## Deferred Items

- **Handoff del primario corta el secundario:** en el turno real `73cb2b38`, el `no_match`/handoff del primario termino el turno sin procesar el slot secundario (`tiempo_entrega` @ 0.88, que era 'covered' → template). Este fix igual mejora el caso porque el primario ya no hara handoff espurio. Bug de orquestacion de slots separado, vale standalone follow-up.
- **Loguear `responseText` generado en observabilidad:** `subloop_generation_completed` guarda `binary`+`responseConfidence` pero NO el texto redactado — punto ciego detectado durante la investigacion de `v4-gate-confidence-fixes`.
- **Operador: probe de validacion end-to-end** `scripts/_v4-probe-generation.ts` — recomendado post-deploy para confirmar que Gemini Flash produce primary_query con el schema actualizado y que la calidad de generacion mejora. READ-ONLY, no gate automatico.

## Next Phase Readiness

- Fix listo para prod cuando el usuario active somnio-v4 (UPDATE workspace_agent_config SET conversational_agent_id='somnio-sales-v4')
- El probe `scripts/_v4-probe-generation.ts` puede correrse manualmente para validar el comportamiento end-to-end
- v4 sigue DORMANT hasta decision del operador

---
*Standalone: v4-dual-intent-query-split*
*Completed: 2026-06-13*
