---
phase: somnio-v4-consolidation
plan: 02
type: execute
wave: 2
depends_on: ["01"]
files_modified:
  - src/lib/agents/somnio-v4/somnio-v4-agent.ts
  - src/lib/agents/somnio-v4/types.ts
  - src/lib/agents/somnio-v4/slots.ts
  - src/lib/agents/somnio-v4/escalation.ts
  - src/lib/agents/somnio-v4/comprehension-schema.ts
  - src/lib/agents/somnio-v4/engine-v4.ts
  - src/lib/agents/somnio-v4/__tests__/escalation.test.ts
  - src/inngest/functions/agent-timers-v4.ts
autonomous: true
requirements: [D-12, D-13, D-15]
must_haves:
  truths:
    - "El plumbing isCrmMutation/casReject (params siempre-false + ramas inalcanzables) no existe más en el path del agente"
    - "mapOutcomeToAgentOutput (~233 líneas muertas, cero call sites) está borrada entera"
    - "shouldCreateOrder/orderData no existen en V4AgentOutput ni en sus ~12 asignaciones ni en agent-timers-v4.ts"
    - "El campo confidence legacy 0-100 sigue EXISTIENDO y FUNCIONANDO idéntico (guards.ts R0 intacto) — solo gana @deprecated"
    - "SubLoopReason del sub-loop (output-schema.ts) NO fue tocado — crm_mutation/cas_reject siguen vivos para runCrmSubLoop"
    - "Suite v4 completa verde con asserts intactos salvo los 2 tests de escalation.test.ts sancionados por D-12 (Pitfall 13)"
  artifacts:
    - path: "src/lib/agents/somnio-v4/types.ts"
      provides: "V4AgentOutput sin shouldCreateOrder/orderData, subLoopReason reducido a 'low_confidence' | 'razonamiento_libre' | null"
    - path: "src/lib/agents/somnio-v4/comprehension-schema.ts"
      provides: "campo confidence con JSDoc @deprecated (NO borrado — Pitfall 4)"
      contains: "@deprecated"
  key_links:
    - from: "src/lib/agents/somnio-v4/guards.ts"
      to: "confidence legacy 0-100"
      via: "guard R0 handoff — INTACTO (load-bearing, Pitfall 4)"
      pattern: "confidence < LOW_CONFIDENCE_THRESHOLD"
    - from: "src/lib/agents/somnio-v4/crm-gate.ts"
      to: "runCrmSubLoop con reason 'crm_mutation'"
      via: "import desde './sub-loop' — INTACTO"
      pattern: "runCrmSubLoop"
---

<objective>
Wave 1 — limpieza de código muerto del lado del AGENTE: D-12 (plumbing isCrmMutation/casReject + mapOutcomeToAgentOutput muerta entera — Pitfall 3), D-13 (shouldCreateOrder/orderData con sus 3 consumidores reales — Pitfall 1), y D-15 resuelto a DEPRECACIÓN (confidence legacy es load-bearing — Pitfall 4).

Purpose: que el core de Wave 2 se extraiga de código ya limpio (orden W1→W2 estricto del RESEARCH).
Output: ~280+ líneas muertas eliminadas, types honestos, cero cambio de comportamiento.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-v4-consolidation/CONTEXT.md (D-12, D-13, D-15)
@.planning/standalone/somnio-v4-consolidation/RESEARCH.md (Pitfalls 1, 3, 4, 13)
@.planning/standalone/somnio-v4-consolidation/PATTERNS.md (§somnio-v4-agent.ts, §agent-timers-v4.ts, §D-15)
@.planning/standalone/somnio-v4-consolidation/BASELINE.md (SUITE_CMD — gate D-09)

NOTA SOBRE LINE REFS: las referencias :NNN de RESEARCH/PATTERNS son del HEAD del 2026-06-10. Localizar SIEMPRE por grep/patrón; usar los números solo como pista de vecindad.

DECLARACIÓN D-11 (Pitfall 2): este plan toca `src/inngest/functions/agent-timers-v4.ts`, que NO está en la lista original de D-11. Se declara aquí su EXTENSIÓN explícita: el archivo es v4-ONLY (agent-timers-v3.ts queda intacto — verificar con `git diff --name-only` que v3 no aparece), por lo que el espíritu de Regla 6 se preserva. Es el ÚNICO archivo extra permitido.
</context>

<tasks>

<task type="auto">
  <name>Task 1: D-12 + Pitfall 3 — borrar plumbing isCrmMutation/casReject y mapOutcomeToAgentOutput entera</name>
  <read_first>
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts (estado actual: call site de decideSubLoopReason con isCrmMutation/casReject ~:414-415; función muerta mapOutcomeToAgentOutput ~:1217-1450)
    - src/lib/agents/somnio-v4/escalation.ts (EscalationInput + ramas ~:51-56)
    - src/lib/agents/somnio-v4/slots.ts (params siempre-false ~:118/:152 + narrowings defensivos ~:125-131/:156-161)
    - src/lib/agents/somnio-v4/types.ts (union V4AgentOutput.subLoopReason ~:283)
    - src/lib/agents/somnio-v4/__tests__/escalation.test.ts (los 2 tests de las ramas a borrar ~:46-61)
    - src/lib/agents/somnio-v4/sub-loop/output-schema.ts (SOLO para confirmar que NO se toca)
  </read_first>
  <files>src/lib/agents/somnio-v4/somnio-v4-agent.ts, src/lib/agents/somnio-v4/escalation.ts, src/lib/agents/somnio-v4/slots.ts, src/lib/agents/somnio-v4/types.ts, src/lib/agents/somnio-v4/__tests__/escalation.test.ts, src/lib/agents/somnio-v4/engine-v4.ts</files>
  <action>
    1. `grep -rn "isCrmMutation\|casReject" src/lib/agents/somnio-v4/` para obtener la lista exacta de sites (excluir sub-loop/output-schema.ts y crm-gate.ts del borrado — el reason 'crm_mutation' del SUB-LOOP está VIVO vía runCrmSubLoop, verificado crm-gate.ts:338-339).
    2. En `escalation.ts`: quitar `isCrmMutation` y `casReject` de `EscalationInput` y borrar las ramas que los chequean (~:51-56). El tipo de retorno de `decideSubLoopReason` se estrecha a `'low_confidence' | 'razonamiento_libre' | null`.
    3. En `somnio-v4-agent.ts`: quitar los args `isCrmMutation: false, casReject: false` del call a `decideSubLoopReason` (~:414-415).
    4. En `slots.ts`: quitar los params siempre-false (~:118/:152). Los narrowings defensivos (~:125-131/:156-161) que comparen `subLoopReason` contra `'crm_mutation'`/`'cas_reject'`: si `npx tsc --noEmit` los marca como comparación imposible tras estrechar el union, limpiarlos; si compilan, dejarlos (no-ops correctos — Pitfall 13).
    5. Pitfall 3: borrar ENTERA la función `mapOutcomeToAgentOutput` de `somnio-v4-agent.ts` (~:1217-1450, ~233 líneas; confirmar cero call sites con `grep -n "mapOutcomeToAgentOutput(" src/ --include="*.ts" -r` — solo deben aparecer la definición y comentarios).
    6. En `types.ts`: reducir el union `V4AgentOutput.subLoopReason` a `'low_confidence' | 'razonamiento_libre' | null` (lo único que el slot resolver emite — verificado RESEARCH en slots :980/:492/:880).
    7. En `engine-v4.ts`: actualizar el comentario (~:323) que menciona mapOutcomeToAgentOutput — el mecanismo discriminator sigue vivo vía `resolveLowSlot`; reescribir el comentario para reflejar eso. (El comentario homólogo del runner ~:435 lo actualiza el Plan 03 — NO tocar el runner en este plan.)
    8. CARVE-OUT D-09 SANCIONADO (Pitfall 13): borrar los 2 tests de `escalation.test.ts` (~:46-61) que prueban las ramas isCrmMutation/casReject eliminadas. NINGÚN otro assert se modifica.
    9. PROHIBIDO: tocar `sub-loop/output-schema.ts`, `crm-gate.ts`, `sub-loop/index.ts`.
    10. Gate D-09: `npx tsc --noEmit` + SUITE_CMD (de BASELINE.md) verdes. Commit: `refactor(somnio-v4-consolidation 02): D-12 borra plumbing isCrmMutation/casReject + mapOutcomeToAgentOutput muerta (~233 líneas)`.
  </action>
  <verify>
    <automated>npx tsc --noEmit && grep -rn "mapOutcomeToAgentOutput\|isCrmMutation\|casReject" src/lib/agents/somnio-v4/ --include="*.ts" | grep -v "sub-loop/" | grep -v "crm-gate" | wc -l  # debe ser 0</automated>
  </verify>
  <acceptance_criteria>
    - `grep -rn "mapOutcomeToAgentOutput" src/lib/agents/somnio-v4/somnio-v4-agent.ts` retorna 0 matches
    - `grep -rn "isCrmMutation\|casReject" src/lib/agents/somnio-v4/escalation.ts src/lib/agents/somnio-v4/slots.ts src/lib/agents/somnio-v4/somnio-v4-agent.ts src/lib/agents/somnio-v4/types.ts` retorna 0 matches
    - `grep -n "crm_mutation" src/lib/agents/somnio-v4/sub-loop/output-schema.ts` retorna ≥1 match (NO tocado)
    - `grep -n "runCrmSubLoop" src/lib/agents/somnio-v4/crm-gate.ts` retorna ≥1 match (NO tocado)
    - `grep -n "subLoopReason" src/lib/agents/somnio-v4/types.ts` muestra el union con exactamente `'low_confidence' | 'razonamiento_libre' | null`
    - SUITE_CMD verde; escalation.test.ts pierde exactamente 2 tests vs baseline (declarado)
  </acceptance_criteria>
  <done>Plumbing muerto fuera; union honesto; sub-loop intacto; suite verde.</done>
</task>

<task type="auto">
  <name>Task 2: D-13 + Pitfall 1 — borrar shouldCreateOrder/orderData de V4AgentOutput y sus 3 consumidores</name>
  <read_first>
    - src/lib/agents/somnio-v4/types.ts (campos shouldCreateOrder/orderData en V4AgentOutput)
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts (asignaciones `shouldCreateOrder:` — grep da la lista; incluye el setter real del timer path `processSystemEvent` ~:1177-1183 con isCreateOrder)
    - src/inngest/functions/agent-timers-v4.ts (líneas ~:330-475: log :351, bloque consumidor :432-452, return :456-463, helper createTimerOrderV4)
    - src/lib/agents/somnio-v4/engine-v4.ts (~:597 — mapeo a debugTurn.orchestration.shouldCreateOrder)
    - .planning/standalone/somnio-v4-consolidation/RESEARCH.md §Pitfall 1 (análisis de alcanzabilidad + receta (a)-(d))
  </read_first>
  <files>src/lib/agents/somnio-v4/types.ts, src/lib/agents/somnio-v4/somnio-v4-agent.ts, src/inngest/functions/agent-timers-v4.ts, src/lib/agents/somnio-v4/engine-v4.ts</files>
  <action>
    Seguir la receta exacta de RESEARCH Pitfall 1:
    1. (a) En `types.ts`: borrar `shouldCreateOrder` y `orderData` de `V4AgentOutput`.
    2. (a) En `somnio-v4-agent.ts`: `grep -n "shouldCreateOrder\|orderData" src/lib/agents/somnio-v4/somnio-v4-agent.ts` y borrar TODAS las asignaciones (~12 sites; varias ya desaparecieron con mapOutcomeToAgentOutput en Task 1). Incluye el setter del timer path en `processSystemEvent` (~:1177-1183, `isCreateOrder`) — el camino timer-createOrder es conductualmente inalcanzable (ninguna transición `timer_expired:*` produce acciones de CREATE_ORDER_ACTIONS — verificado en transitions.ts:316-414 + constants.ts:204-210).
    3. (b) En `agent-timers-v4.ts`: borrar el bloque consumidor `if (output.shouldCreateOrder && output.orderData) { ... createTimerOrderV4(...) }` (~:432-452); quitar `shouldCreateOrder: output.shouldCreateOrder` del logger.info (~:351); quitar `shouldCreateOrder`, `orderCreated`, `orderError` del return (~:456-463) y las declaraciones locales que queden huérfanas.
    4. (Open Question 2 RESUELTA: BORRAR) Tras quitar el consumidor, `grep -n "createTimerOrderV4" src/ -r` — si retorna solo la definición, borrar el helper completo. Es re-construible y D-19 del crm-subloop ya desacopló create-por-timer a propósito.
    5. (c) En `engine-v4.ts` (~:597): poblar `shouldCreateOrder: false` como LITERAL en el build de DebugTurn (el tipo `DebugTurn` de `src/lib/sandbox/types.ts` NO se toca — está FUERA del scope D-11, compartido con sandbox v3).
    6. (d) PROHIBIDO: tocar `src/lib/sandbox/types.ts` y `pipeline-tab.tsx`.
    7. Gate D-09: `npx tsc --noEmit` + SUITE_CMD verdes (un typecheck rojo en agent-timers-v4.ts a mitad de camino es el warning sign esperado del Pitfall 1 — se resuelve completando el paso 3, no revirtiendo). Commit: `refactor(somnio-v4-consolidation 02): D-13 borra shouldCreateOrder/orderData + camino timer createOrder muerto (Pitfall 1)`.
  </action>
  <verify>
    <automated>npx tsc --noEmit && grep -rn "shouldCreateOrder" src/lib/agents/somnio-v4/types.ts src/lib/agents/somnio-v4/somnio-v4-agent.ts src/inngest/functions/agent-timers-v4.ts | wc -l  # debe ser 0</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "shouldCreateOrder\|orderData" src/lib/agents/somnio-v4/types.ts` retorna 0 matches
    - `grep -n "createTimerOrderV4" src/ -r --include="*.ts"` retorna 0 matches
    - `grep -n "shouldCreateOrder" src/lib/agents/somnio-v4/engine-v4.ts` retorna exactamente 1 match y es el literal `shouldCreateOrder: false`
    - `git diff --name-only` NO incluye `src/lib/sandbox/types.ts` ni archivo alguno de `src/components` / pipeline-tab
    - `git diff --name-only` NO incluye `src/inngest/functions/agent-timers-v3.ts` (Regla 6)
    - SUITE_CMD verde con asserts intactos
  </acceptance_criteria>
  <done>V4AgentOutput sin campos fantasma; timer path muerto eliminado; DebugTurn compila con literal.</done>
</task>

<task type="auto">
  <name>Task 3: D-15 — deprecar (NO borrar) el campo confidence legacy 0-100</name>
  <read_first>
    - src/lib/agents/somnio-v4/comprehension-schema.ts (campo confidence en :36-38 — ya tiene describe() de "Campo legacy v3")
    - src/lib/agents/somnio-v4/types.ts (intentInfo.confidence)
    - src/lib/agents/somnio-v4/guards.ts (:25 — guard R0 load-bearing; NO TOCAR)
    - .planning/standalone/somnio-v4-consolidation/RESEARCH.md §Pitfall 4 (por qué deprecar y no borrar: >2 consumidores, guard R0 con escala distinta a intent_confidence)
  </read_first>
  <files>src/lib/agents/somnio-v4/comprehension-schema.ts, src/lib/agents/somnio-v4/types.ts</files>
  <action>
    D-15 se resolvió por su propia cláusula condicional: el grep mostró >2 consumidores (guards.ts:25 R0 load-bearing, runner→agent_turns.confidence, DebugTurn→3 tabs UI, evento comprehension_completed) → DEPRECAR, no borrar.
    1. En `comprehension-schema.ts`, añadir JSDoc encima del campo `confidence` (z.number 0-100):
    ```typescript
    /** @deprecated Escala legacy 0-100 (v3). Nuevos consumidores deben usar intent_confidence (0.0-1.0).
     *  NO BORRAR: load-bearing en guards.ts R0 (gate de handoff — escala auto-reportada DISTINTA a
     *  intent_confidence, sustituir cambiaría el guard) + columna agent_turns.confidence + tabs del
     *  debug panel. Borrado diferido a standalone futuro (D-15 somnio-v4-consolidation, Pitfall 4). */
    ```
    2. En `types.ts`, añadir el mismo `@deprecated` (versión corta, referenciando comprehension-schema.ts) sobre `intentInfo.confidence` (localizar con `grep -n "confidence" src/lib/agents/somnio-v4/types.ts`).
    3. CERO cambios de comportamiento: NO tocar guards.ts, NO tocar el mapeo del runner, NO tocar comprehension.ts, NO mapear a intent_confidence*100 en ningún sitio.
    4. Gate D-09: `npx tsc --noEmit` + SUITE_CMD verdes. Commit: `docs(somnio-v4-consolidation 02): D-15 deprecación del confidence legacy 0-100 (load-bearing — Pitfall 4, borrado diferido)`.
  </action>
  <verify>
    <automated>grep -c "@deprecated" src/lib/agents/somnio-v4/comprehension-schema.ts && grep -B5 "confidence < LOW_CONFIDENCE_THRESHOLD" src/lib/agents/somnio-v4/guards.ts | head -8</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "@deprecated" src/lib/agents/somnio-v4/comprehension-schema.ts` ≥ 1
    - `grep -c "@deprecated" src/lib/agents/somnio-v4/types.ts` ≥ 1
    - `git diff --name-only` NO incluye guards.ts ni comprehension.ts
    - El campo `confidence: z.number()` sigue existiendo en comprehension-schema.ts (`grep -n "confidence: z.number()" src/lib/agents/somnio-v4/comprehension-schema.ts` ≥ 1)
    - SUITE_CMD verde sin ningún assert cambiado
  </acceptance_criteria>
  <done>Campo deprecado con rationale documentado; comportamiento idéntico byte a byte.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| Ninguna nueva | Borrado de código muerto verificado + comentarios; superficie de input sin cambios |

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-cons-02 | T (Tampering) | guard R0 (guards.ts) | mitigate | Prohibición explícita de tocar guards.ts en Task 3; acceptance criteria verifica que no aparece en el diff |
</threat_model>

<verification>
- `npx tsc --noEmit` verde tras cada task.
- SUITE_CMD (BASELINE.md) verde tras cada task; único delta de tests permitido: -2 en escalation.test.ts (sancionado D-12/Pitfall 13).
- Gate D-11 extendido: `git diff --name-only <commit baseline>..HEAD -- src/` solo contiene archivos de la lista permitida (somnio-v4/**, agent-timers-v4.ts). CERO matches fuera.
- Regla 6: `npx vitest run src/lib/agents/production/__tests__/webhook-processor-routing.test.ts src/lib/agents/media/__tests__/media-gate-v4.test.ts` verde.
</verification>

<success_criteria>
- D-12 implementado: plumbing fuera, mapOutcomeToAgentOutput borrada, union reducido, sub-loop SubLoopReason intacto.
- D-13 implementado: campos fuera de V4AgentOutput, agent-timers-v4 limpio, createTimerOrderV4 borrado, DebugTurn/sandbox types intactos.
- D-15 implementado como DEPRECACIÓN (per su cláusula condicional + Pitfall 4) — comportamiento del guard R0 sin cambios.
- Extensión D-11 con agent-timers-v4.ts declarada y acotada (Pitfall 2).
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-v4-consolidation/02-SUMMARY.md` (incluye: líneas borradas por mandato, lista final de asignaciones eliminadas, confirmación de los 2 tests sancionados).
</output>
