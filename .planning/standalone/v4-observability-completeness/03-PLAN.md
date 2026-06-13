---
phase: v4-observability-completeness
plan: 03
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/lib/agents/somnio-v4/crm-gate.ts
  - src/lib/agents/somnio-v4/sub-loop/index.ts
  - src/lib/agents/somnio-v4/__tests__/crm-gate-observability.test.ts
  - src/lib/agents/somnio-v4/__tests__/subloop-observability.test.ts
autonomous: true
requirements: [D-02, D-03]
user_setup: []

must_haves:
  truths:
    - "El CRM gate emite a observabilidad cuando NO prende (crm_gate_skipped con el motivo) y cuando prende+completa (crm_gate_completed con tools/success/orderId)"
    - "El RAG sub-loop emite qué topic KB recuperó + similarity + confidence por paso (explica el flip generated↔no_match percibido por el usuario)"
    - "Los errores por paso del sub-loop (tooling/generation/invariant) llegan a agent_observability_events (hoy emitRagError solo hace onDebug+throw)"
    - "El gate y el sub-loop etiquetan sus eventos con restart_iteration (D-03)"
  artifacts:
    - path: "src/lib/agents/somnio-v4/crm-gate.ts"
      provides: "Eventos orquestador crm_gate_skipped/crm_gate_completed + restart_iteration en los 4 eventos existentes (consume RunCrmGateArgs.restartIteration provisto por Plan 01)"
      contains: "crm_gate_completed"
    - path: "src/lib/agents/somnio-v4/sub-loop/index.ts"
      provides: "subloop_tooling_completed + subloop_generation_completed + recordEvent en emitRagError (consume SubLoopContext.restartIteration provisto por Plan 01)"
      contains: "subloop_tooling_completed"
  key_links:
    - from: "src/lib/agents/somnio-v4/crm-gate.ts (runCrmGate :323/:369)"
      to: "agent_observability_events"
      via: "recordV4Event('crm_gate_skipped'/'crm_gate_completed')"
      pattern: "crm_gate_completed"
    - from: "src/lib/agents/somnio-v4/sub-loop/index.ts (tras tooling :287 / generation :393)"
      to: "agent_observability_events"
      via: "recordV4Event('subloop_tooling_completed'/'subloop_generation_completed')"
      pattern: "subloop_(tooling|generation)_completed"
---

<objective>
Iluminar los 2 subsistemas hoy ciegos a nivel diagnóstico (D-02): el **CRM gate** (orquestador `runCrmGate` mudo) y el **RAG sub-loop** (solo emite el outcome terminal). Para el gate: añadir eventos de orquestador `crm_gate_skipped` (no prendió) y `crm_gate_completed` (prendió+completó), consumir `args.restartIteration` (campo de tipo provisto por Plan 01), y añadir `restart_iteration` a los 4 eventos PRE-EXISTENTES del hint builder (NO duplicarlos). Para el sub-loop: emitir `subloop_tooling_completed` (topic + kbHits[{topic,similarity}] + finishReason + latency — explica el flip `generated↔no_match`), `subloop_generation_completed` (responseConfidence + binary + threshold + latency), añadir un `recordEvent` dentro de `emitRagError` (hoy solo hace onDebug+throw → los errores por paso NUNCA llegan a la DB), y consumir `args.ctx.restartIteration` (campo de tipo provisto por Plan 01; el gate lo threadea a runCrmSubLoop).

Purpose: el usuario percibe una inconsistencia `generated↔no_match` y el gate fue uno de los 2 sospechosos del throw en `1b561aaf`. Estos eventos cierran ambas zonas ciegas. ADITIVO (Regla 6).

Output: `crm-gate.ts` + `sub-loop/index.ts` instrumentados + 2 suites nuevas.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/v4-observability-completeness/RESEARCH.md
@.planning/standalone/v4-observability-completeness/PATTERNS.md

<interfaces>
<!-- Capturado this session — NO explorar de nuevo. -->

Helper (Plan 01) — src/lib/agents/somnio-v4/observability.ts:
```typescript
export function recordV4Event(label: string, payload: Record<string, unknown>, opts?: { restartIteration?: number; durationMs?: number }): void
```
PII — src/lib/agents/shared/crm-mutation-tools/helpers.ts: `idSuffix(uuid)` (últimos 8 chars). Import: `@/lib/agents/shared/crm-mutation-tools/helpers`.

CRM GATE — estado REAL verificado (RESEARCH era PARCIALMENTE INEXACTO):
- crm-gate.ts:44 YA importa getCollector. 4 eventos YA existen DENTRO del hint builder (NO en el orquestador): `crm_gate_createOrder_skipped` (:187, :195, :217) y `crm_gate_move_blocked` (:260). MANTENERLOS — solo añadir restart_iteration. NO duplicar esos labels.
- Lo MUDO es el orquestador `runCrmGate` (:312-370): el early-return no-fired (:323 `return { crmActions: [] }`) y el completed (:369 `return { crmActions, crmResult }`) NO emiten nada.
- RunCrmGateArgs (:135-157) ya tiene lockHandle?/lockChannel?/lockIdentifier? — añadir `restartIteration?: number` con el mismo patrón opcional.
- runCrmGate corre `runCrmSubLoop` (import :42); `extractCrmResult` produce `crmResult` con `.success` y `.orderId`.

SUB-LOOP — sub-loop/index.ts:
- RESPONSE_CONFIDENCE_THRESHOLD = 0.70 (:46).
- Tras tooling: `const tooling = toolingResult.output` (:286) + `const toolingStep = extractStepData(toolingResult.rawResult)` (:287). En scope: `tooling.topic_seleccionado`, `tooling.should_handoff`, `toolingStep.kbHits` (array {topic, similarity} — extractStepData :147), `toolingStep.finishReason`, `toolingResult.latencyMs`.
- Tras generation: `const generation = generationResult.output` (:393). En scope: `generation.responseConfidence`, `generation.binary` (si existe), `generationResult.latencyMs`. Threshold check :418.
- emitRagError (:667-713) hoy: hace `args.onDebug?.(...)` + `throw` — CERO recordEvent. Confirmar el cuerpo al editar; añadir un recordEvent ANTES del throw.
- Eventos terminales existentes: `subloop_completed` :339/:549/:620; `subloop_nunca_decir_violation` :476; `subloop_escalation_trigger_match` :501. MANTENERLOS.
- RunSubLoopArgs (:129) tiene `{ reason, ctx: SubLoopContext, onDebug? }`; SubLoopContext (:81) extends SubLoopToolsContext + lock fields. Añadir `restartIteration?: number` a SubLoopContext.
- runCrmSubLoop (importado por crm-gate) comparte RunSubLoopArgs — threadear restartIteration por su ctx también.

Idiom existente para emit (copiar verbatim) — sub-loop/index.ts:339:
```typescript
getCollector()?.recordEvent('pipeline_decision', 'subloop_completed', { agent: SOMNIO_V4_AGENT_ID, reason: args.reason, outcome: outcome.status, sourceTopic: outcome.sourceTopic, requiresHuman: outcome.requiresHuman })
```
(Usar recordV4Event para los NUEVOS eventos, para inyectar restart_iteration uniforme.)

Test mock: spy `const recordEvent = vi.fn()` + `vi.mock('@/lib/observability', () => ({ getCollector: () => ({ recordEvent }) }))`. Para sub-loop, mockear las CALLs de tooling/generation para controlar el output.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: CRM gate — eventos orquestador + restart_iteration + RunCrmGateArgs.restartIteration (D-02/D-03)</name>
  <read_first>
    - src/lib/agents/somnio-v4/crm-gate.ts (full — :44 import, :135-157 RunCrmGateArgs, :187/:195/:217/:260 eventos existentes, :312-370 runCrmGate orquestador, :323 early-return, :369 completed return)
    - src/lib/agents/somnio-v4/observability.ts (recordV4Event)
    - src/lib/agents/shared/crm-mutation-tools/helpers.ts:54 (idSuffix)
    - src/lib/agents/somnio-v4/__tests__/crm-gate.test.ts (setup de mocks del gate para modelar la suite nueva)
  </read_first>
  <behavior>
    - Test 1: cuando el gate NO prende (accion fuera de CRM_GATE_ACTIONS y category != 'datos'), recordEvent recibe ('pipeline_decision', 'crm_gate_skipped', objectContaining({ reason: 'not_fired', restart_iteration: 0 })).
    - Test 2: cuando el gate prende y completa, recordEvent recibe ('pipeline_decision', 'crm_gate_completed', objectContaining({ fired: true, crmActionsCount, tools, success })).
    - Test 3: con args.restartIteration = 3, los eventos del gate llevan restart_iteration: 3.
    - Test 4: los 4 eventos existentes (crm_gate_createOrder_skipped/crm_gate_move_blocked) siguen emitiéndose Y ahora llevan restart_iteration.
  </behavior>
  <action>
    En `src/lib/agents/somnio-v4/crm-gate.ts`:

    1. Import: `import { recordV4Event } from './observability'` y `import { idSuffix } from '@/lib/agents/shared/crm-mutation-tools/helpers'`.

    2. `RunCrmGateArgs.restartIteration?` YA existe (lo añadió Plan 01) — NO redeclarar el campo de tipo aquí. El valor lo pasa Plan 02 desde la call `runCrmGate({...})`.

    3. En `runCrmGate` (:312), leer `const restartIteration = args.restartIteration ?? 0` al inicio.

    4. ANTES del early-return `:323` (gate NO prende), emitir:
    ```typescript
    recordV4Event('crm_gate_skipped', {
      agent: SOMNIO_V4_AGENT_ID,
      accion: args.accion ?? null,
      category: args.category,
      reason: 'not_fired',
    }, { restartIteration })
    ```
    (Usar la constante de agent id que el archivo ya tenga en scope; si no la importa, usar el string literal o importar SOMNIO_V4_AGENT_ID de './config' — verificar al leer.)

    5. ANTES del return completed `:369` (`return { crmActions, crmResult }`), emitir:
    ```typescript
    recordV4Event('crm_gate_completed', {
      agent: SOMNIO_V4_AGENT_ID,
      fired: true,
      crmActionsCount: crmActions.length,
      tools: crmActions.map((a) => a.tool),
      success: crmResult?.success ?? false,
      orderId: crmResult?.orderId ? idSuffix(crmResult.orderId) : null,
    }, { restartIteration })
    ```

    6. A los 4 eventos PRE-EXISTENTES (:187, :195, :217 `crm_gate_createOrder_skipped`; :260 `crm_gate_move_blocked`): añadir `restart_iteration: <iteración>` al payload. Como esos viven en el hint builder `buildCrmHint` (no en runCrmGate), threadear el valor: añadir un parámetro/propagar `restartIteration` desde runCrmGate al buildCrmHint, o leerlo si buildCrmHint ya recibe args. Verificar la firma de buildCrmHint al leer; pasar `restartIteration` y añadir el campo plano a esos 4 payloads (NO migrarlos al helper — solo añadir el campo, cambio mínimo).

    CRÍTICO: NO duplicar los labels existentes. `crm_gate_skipped`/`crm_gate_completed` son labels NUEVOS distintos de los 4 existentes (timeline inequívoca — PATTERNS §Verification).

    Crear `src/lib/agents/somnio-v4/__tests__/crm-gate-observability.test.ts` con spy de recordEvent, modelando el setup de `crm-gate.test.ts`. Implementar los 4 tests del bloque <behavior>.
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/__tests__/crm-gate-observability.test.ts src/lib/agents/somnio-v4/__tests__/crm-gate.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "recordV4Event('crm_gate_skipped'" src/lib/agents/somnio-v4/crm-gate.ts` retorna match
    - `grep -n "recordV4Event('crm_gate_completed'" src/lib/agents/somnio-v4/crm-gate.ts` retorna match
    - `grep -n "args.restartIteration ?? 0" src/lib/agents/somnio-v4/crm-gate.ts` retorna match (consume el campo provisto por Plan 01)
    - `grep -c "crm_gate_createOrder_skipped" src/lib/agents/somnio-v4/crm-gate.ts` >= 3 (los existentes intactos — NO borrados)
    - `grep -c "restart_iteration" src/lib/agents/somnio-v4/crm-gate.ts` >= 1 (threadeado a los existentes)
    - `git diff src/lib/agents/somnio-v4/crm-gate.ts | grep '^+' | grep -c "createAdminClient\|@supabase/supabase-js"` == 0 (Regla 3)
    - `npx vitest run src/lib/agents/somnio-v4/__tests__/crm-gate-observability.test.ts src/lib/agents/somnio-v4/__tests__/crm-gate.test.ts` exit 0
  </acceptance_criteria>
  <done>El orquestador del gate emite crm_gate_skipped/crm_gate_completed; los 4 eventos existentes intactos + con restart_iteration (consumiendo args.restartIteration provisto por Plan 01/02); suites verdes.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Sub-loop RAG — subloop_tooling_completed + subloop_generation_completed + recordEvent en emitRagError + SubLoopContext.restartIteration (D-02/D-03)</name>
  <read_first>
    - src/lib/agents/somnio-v4/sub-loop/index.ts (:46 threshold, :81 SubLoopContext, :129 RunSubLoopArgs, :147 extractStepData, :286-330 tooling, :369-440 generation, :667-713 emitRagError, :339/:549/:620 subloop_completed existentes)
    - src/lib/agents/somnio-v4/observability.ts (recordV4Event)
    - src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts (modelo de mocks de las CALLs tooling/generation)
  </read_first>
  <behavior>
    - Test 1: tras un tooling call exitoso, recordEvent recibe ('pipeline_decision', 'subloop_tooling_completed', objectContaining({ topicSelected, kbHits, finishReason, restart_iteration })) y kbHits es array de { topic, similarity }.
    - Test 2: tras generation, recordEvent recibe ('pipeline_decision', 'subloop_generation_completed', objectContaining({ responseConfidence, threshold: 0.70, restart_iteration })).
    - Test 3: cuando un paso tira (mockear tooling call para throw), emitRagError emite ('pipeline_decision', 'subloop_error', objectContaining({ errorType: 'tooling_call_error', restart_iteration })) ANTES de relanzar.
    - Test 4: con ctx.restartIteration = 5, los 3 eventos llevan restart_iteration: 5.
    - Test 5: los subloop_completed existentes siguen emitiéndose (no regresión).
  </behavior>
  <action>
    En `src/lib/agents/somnio-v4/sub-loop/index.ts`:

    1. Import: `import { recordV4Event } from './observability'` (ruta relativa correcta desde sub-loop/ es `'../observability'` — verificar: el helper vive en `src/lib/agents/somnio-v4/observability.ts`, sub-loop está en `src/lib/agents/somnio-v4/sub-loop/`, así que es `'../observability'`).

    2. `SubLoopContext.restartIteration?` YA existe (lo añadió Plan 01) — NO redeclarar el campo de tipo aquí. El valor llega vía `args.ctx.restartIteration` (lo pasa Plan 02 en la call del agente; el gate lo pasa en su ctx — ver step 6 abajo).

    3. Tras tooling (después de :287 `const toolingStep = extractStepData(...)`), emitir:
    ```typescript
    recordV4Event('subloop_tooling_completed', {
      agent: SOMNIO_V4_AGENT_ID,
      reason: args.reason,
      topicSelected: tooling.topic_seleccionado ?? null,
      shouldHandoff: tooling.should_handoff ?? false,
      kbHits: (toolingStep.kbHits ?? []).map((h) => ({ topic: h.topic, similarity: h.similarity })),
      finishReason: toolingStep.finishReason ?? null,
      latencyMs: toolingResult.latencyMs,
    }, { restartIteration: args.ctx.restartIteration ?? 0 })
    ```

    4. Tras generation (después de :393 `const generation = generationResult.output`), emitir:
    ```typescript
    recordV4Event('subloop_generation_completed', {
      agent: SOMNIO_V4_AGENT_ID,
      reason: args.reason,
      responseConfidence: generation.responseConfidence,
      binary: (generation as { binary?: unknown }).binary ?? null,
      threshold: RESPONSE_CONFIDENCE_THRESHOLD,
      latencyMs: generationResult.latencyMs,
    }, { restartIteration: args.ctx.restartIteration ?? 0 })
    ```
    (Solo campos planos — Pitfall 6. NO pasar rawResult crudo.)

    5. Dentro de `emitRagError` (:667-713), ANTES del `throw`, añadir:
    ```typescript
    recordV4Event('subloop_error', {
      agent: SOMNIO_V4_AGENT_ID,
      reason: args.reason,
      errorType,                                  // el param que emitRagError ya recibe (tooling_call_error / generation_call_error / invariant_violation)
      message: err instanceof Error ? err.message : String(err),
    }, { restartIteration: args.ctx.restartIteration ?? 0 })
    ```
    (Verificar el nombre exacto del param de tipo de error y del error en la firma de emitRagError al leer; usar bodyTruncate si el message puede traer PII — importar de helpers si aplica.)

    6. NO tocar los subloop_completed/nunca_decir/escalation existentes (mantener — son terminales). Opcional: añadirles restart_iteration si es trivial, pero NO es requerido (los nuevos eventos + el outcome cubren D-02).

    7. Threading desde el GATE (este plan owns crm-gate.ts): en `runCrmSubLoop` (crm-gate.ts:338, donde el gate invoca el sub-loop), añadir `restartIteration: args.restartIteration ?? 0` al objeto `ctx` que el gate le pasa al sub-loop. Así los eventos del sub-loop CRM heredan la iteración. El threading desde el AGENTE (call runSubLoop de slot en somnio-v4-agent.ts:697) ya lo hizo Plan 02 (pasa `restartIteration` en su ctx). Si por orden de ejecución el agente aún no lo pasara, el default `?? 0` mantiene tsc verde y los tests pasan restartIteration explícito vía mock.

    Crear `src/lib/agents/somnio-v4/__tests__/subloop-observability.test.ts` con spy de recordEvent + mocks de las CALLs tooling/generation, implementando los 5 tests del bloque <behavior>.
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/__tests__/subloop-observability.test.ts src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts src/lib/agents/somnio-v4/__tests__/smoke-rag-b.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "subloop_tooling_completed" src/lib/agents/somnio-v4/sub-loop/index.ts` retorna match
    - `grep -n "subloop_generation_completed" src/lib/agents/somnio-v4/sub-loop/index.ts` retorna match
    - `grep -n "recordV4Event('subloop_error'" src/lib/agents/somnio-v4/sub-loop/index.ts` retorna match (emitRagError ahora SÍ emite a DB)
    - `grep -c "args.ctx.restartIteration ?? 0" src/lib/agents/somnio-v4/sub-loop/index.ts` >= 2 (consume el campo provisto por Plan 01 en los eventos del sub-loop)
    - `grep -c "subloop_completed" src/lib/agents/somnio-v4/sub-loop/index.ts` >= 3 (terminales existentes intactos)
    - `git diff src/lib/agents/somnio-v4/sub-loop/index.ts | grep '^+' | grep -c "createAdminClient\|@supabase/supabase-js"` == 0 (Regla 3)
    - `npx tsc --noEmit` exit 0
    - `npx vitest run src/lib/agents/somnio-v4/__tests__/subloop-observability.test.ts src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts src/lib/agents/somnio-v4/__tests__/smoke-rag-b.test.ts` exit 0
  </acceptance_criteria>
  <done>El sub-loop emite subloop_tooling_completed (topic+kbHits+similarity), subloop_generation_completed (responseConfidence+threshold) y subloop_error (vía emitRagError); consume args.ctx.restartIteration (provisto por Plan 01/02) + el gate lo threadea a runCrmSubLoop; terminales existentes intactos; suites verdes.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| sub-loop/gate → agent_observability_events | KB hits, error messages, orderId pueden contener datos sensibles |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-obs03-01 | Information Disclosure | crm_gate_completed orderId | mitigate | `idSuffix(orderId)` emite solo los últimos 8 chars del UUID, no el id completo (reuso PII helper). |
| T-obs03-02 | Information Disclosure | subloop_error message | mitigate | El message del error se trunca (bodyTruncate si aplica PII) y solo se emiten campos planos (errorType, reason) — NO el rawResult del SDK (Pitfall 6). |
| T-obs03-03 | Information Disclosure | subloop_tooling_completed kbHits | accept | kbHits son topic strings + similarity (números) del catálogo interno, no PII del usuario. Necesarios para diagnosticar el flip generated↔no_match. |
| T-obs03-04 | Denial of Service | console.log payload circular (kbHits/generation) | mitigate | recordV4Event envuelve en try/catch global; se emiten SOLO datos planos (map a {topic, similarity}), nunca toolingResult.rawResult crudo. |
</threat_model>

<verification>
- `npx vitest run src/lib/agents/somnio-v4/__tests__/crm-gate-observability.test.ts` exit 0
- `npx vitest run src/lib/agents/somnio-v4/__tests__/subloop-observability.test.ts` exit 0
- `npx vitest run src/lib/agents/somnio-v4/__tests__/crm-gate.test.ts src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts src/lib/agents/somnio-v4/__tests__/smoke-rag-b.test.ts` exit 0
- `npx tsc --noEmit` exit 0
</verification>

<success_criteria>
- Gate: crm_gate_skipped/crm_gate_completed emitidos + 4 existentes intactos con restart_iteration
- Sub-loop: subloop_tooling_completed (topic+kbHits+similarity) + subloop_generation_completed (confidence+threshold) + subloop_error (errores por paso ahora en DB)
- restartIteration consumido vía args.restartIteration (gate) + args.ctx.restartIteration (sub-loop); tipos provistos por Plan 01
- Suites verdes, tsc verde, sin admin client nuevo
</success_criteria>

<output>
Tras completar, crear `.planning/standalone/v4-observability-completeness/03-SUMMARY.md`. Documentar: que el flip generated↔no_match ahora es diagnosticable vía subloop_tooling_completed + subloop_generation_completed; la corrección a RESEARCH (el gate NO estaba totalmente mudo — se augmentó, no se reescribió); y que el threading de restartIteration se consumió desde los campos de tipo provistos por Plan 01 (gate via args.restartIteration, sub-loop via args.ctx.restartIteration + el gate forwarding a runCrmSubLoop).
</output>
