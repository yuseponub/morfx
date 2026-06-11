---
phase: somnio-v4-consolidation
plan: 10
subsystem: somnio-v4
tags: [D-04, D-05, wave-7, runner-wrapper, core-consumer, B1-B11, A13, characterization-suite]

# Dependency graph
requires:
  - phase: somnio-v4-consolidation/09
    provides: "core/turn-orchestrator.ts (runTurn) + core/types.ts (TurnCoreAdapters/TurnResult/CoreSeedState/CommittedTurn) — el runner los consume"
provides:
  - "v4-production-runner.ts reescrito como WRAPPER del core (572 líneas, era 1295): implementa TurnCoreAdapters de producción (B1-B11) + mapea TurnResult → EngineOutput. PRIMER consumidor del core (D-04 demostrado: las suites de caracterización del runner = suite de facto del core, verdes sin asserts cambiados)"
  - "Contrato getSeedState(carry?) — el builder aplica el carryState que el core setea en un reprocess Path B (el core lo setea pero NO lo re-lee; delega al builder que conoce el shape: prod DB vs sandbox SandboxState). Resuelve la deuda heredada 08/09-SUMMARY"
affects: [Plan 11 engine→wrapper sandbox (implementará el MISMO contrato getSeedState(carry) + CoreSeedState.visionContext)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "wrapper-over-core: el runner de producción NO contiene mecanismo (restart loop / Path A/B / heartbeat / finally) — todo vive en runTurn. El runner solo inyecta efectos de entorno (DB/WhatsApp/Inngest) vía TurnCoreAdapters + mapea el resultado neutral a EngineOutput"
    - "capability-as-closure: cada capability prod (B1-B11) es un closure sobre this.adapters/this.config — el core gatea por `if (adapters.metodo)` (optional-method, cero flags de entorno)"
    - "retry-around-core (B9): VersionConflictError retry (máx 3) en el WRAPPER alrededor de runTurn (el core no conoce el error de persistencia prod); re-entry con el MISMO lockHandle → release doble safe por owner-check"
    - "single-emit preservation: agent_routed lo emite el CORE dentro del loop (post-agent-invoke); el wrapper NO re-emite (evita doble-emit = regresión de observabilidad)"

key-files:
  created:
    - .planning/standalone/somnio-v4-consolidation/10-SUMMARY.md
  modified:
    - src/lib/agents/engine/v4-production-runner.ts
    - src/lib/agents/somnio-v4/core/types.ts
    - src/lib/agents/somnio-v4/core/turn-orchestrator.ts
    - src/lib/agents/engine/__tests__/v4-production-runner-pathb.test.ts
    - src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts

key-decisions:
  - "B9 VersionConflictError retry en el wrapper (no en el core): el core es agnóstico de la capa de persistencia prod; el retry re-entra processMessage con el MISMO lockHandle (releaseLockIfOwner es owner-checked → el release del finally del core es no-op safe en el re-entry, T-cons-14)"
  - "agent_routed NO se re-emite en el wrapper: el core ya lo emite dentro del loop (single emit por invocación del agente, igual que el runner viejo). Doble-emit habría sido regresión de observabilidad. El literal queda como comentario en mapResult (referencia B11)"
  - "Timer onCustomerMessage movido a getSeedState (no a send): el runner viejo lo llamaba una vez por turno ANTES del send (incluso en turnos con 0 templates, ej handoff). getSeedState siempre corre ≥1 vez → cubre el caso 0-sends. Guard customerTimerCancelled = una sola cancelación por processMessage (idempotente)"
  - "preloadedData→v4Input.datosCapturados NO se re-cablea: el runner viejo inyectaba preloadedData en el agent input (línea 359), pero el V4ProductionRunner SIEMPRE se construye con { agentModule: 'somnio-v4' } SIN preloadedData (webhook-processor :900) → la rama era dead para v4. preloadOnce solo persiste el marker DB (no-op en práctica para v4). Byte-equivalente para el path real"

requirements-completed: [D-04, D-05]

# Metrics
duration: ~70min
completed: 2026-06-10
---

# Phase somnio-v4-consolidation Plan 10: runner → wrapper del core (D-04) Summary

**One-liner:** `v4-production-runner.ts` pasa de 1295 a 572 líneas reescrito como WRAPPER del core de turno v4 — implementa los `TurnCoreAdapters` de producción (B1 `getSeedState` fetch sesión per-iteración + carryState aplicado, B2/D-18 legacy pending + `savePathARollback`, B3 pending-templates, B4 `preloadOnce`, B5 `filterOutbound` no-repetición, B7 `commitTurn` post-send completo + ledger emit, B8 `recordDebug`), envuelve `runTurn` con el retry de `VersionConflictError` (B9, máx 3, mismo lockHandle → release doble safe por owner-check), y mapea el `TurnResult` neutral a `EngineOutput` (B11 — zombie→`V4_ZOMBIE_LAMBDA_EXIT`, error→`success:false` C5); el restart loop / Path A/B / heartbeat / finally-release viven SOLO en el core (D-04 demostrado: las suites de caracterización del runner = suite de facto del core, **353 passed | 7 skipped | 0 failed con asserts INTACTOS**, tsc exit 0, firma pública del runner sin cambios → webhook-processor.ts intacto).

## Lo que se hizo

### Task 1 — runner reescrito como wrapper + adapters de producción (commit `185626db`)

- **`processMessage` del runner** = threading de lock fields desde `EngineInput` → `TurnCoreInput` → retry-wrapper de `VersionConflictError` (B9, máx 3) → `runTurn(coreInput, prodAdapters)` → `mapResult` (B11).
- **`buildProdAdapters(input)`** construye los `TurnCoreAdapters` como closures:
  - `getSeedState(carry?)`: fetch sesión per-iteración + extracción `_v3:` keys + `acciones_ejecutadas` (columna o `_v3:` fallback) + `turn_ledger_dims` + intents_vistos string[] + **carryState aplicado** (`carry ?? sessionDerived`, patrón del runner viejo :296). Lee `_v3:pendingUserMessage` y lo expone vía `getLegacyPendingMessage`. Cancela timers (onCustomerMessage) una vez por turno. Threadea `visionContext`.
  - `commitTurn`: bloque post-send completo (B7) — saveState + emit ledger (`kb_topic_registered`/`crm_action_recorded`/`turn_ledger_committed`) + templates_enviados (solo IDs realmente enviados) + `state_committed` + updateMode (optimistic lock) + timer signals + addTurn user/assistant + addIntentSeen + handoff. `orderCreated` de `output.crmResult` (D-06 / Pitfall 6).
  - `filterOutbound`: NoRepetitionFilter gated `USE_NO_REPETITION_V4` + registry + minifrases (B5); `rag:*` siempre pasa (R4-B).
  - `preloadOnce` (B4), `recordDebug` (B8), `savePathARollback` (B2/D-18), `getPendingTemplates`/`savePendingTemplates`/`clearPendingTemplates` (B3 — delegados condicionalmente al storage adapter), `send` (delega a `adapters.messaging.send` — V4MessagingAdapter hace CKPT-7.N interno).
  - NO implementa `beforeAgentInvoke`/`onResultReady` (sandbox-only → el core salta esas ramas).
- **`mapResult(result, input)`** (B11): `zombie_exit`→`{success:false, code:'V4_ZOMBIE_LAMBDA_EXIT'}`; `error`→`{success:false, code:'V4_ENGINE_ERROR'}` (contrato prod C5); `completed`→`EngineOutput` (`success`, `messages`, `newMode` undefined si `wasInterruptedWithZeroSends`, `tokensUsed`, `messagesSent`, `response`, `orderCreated`/`orderId`/`contactId` de `crmResult`).
- BORRADO del runner: `while`, `drainPendingAndCombine`, `runCheckpointGate`, `startHeartbeat`, finally-release — todo vive en el core.
- Gate: tsc exit 0; runTurn=6; forbidden(`while`/drain/ckptGate/heartbeat)=0; VersionConflictError=6; agent_routed=2 (comentarios); D-18=4; wc=572 (<700); diff sin webhook-processor.ts/messaging.ts.

### Task 2 — setup de mocks sancionado A13 + suite completa verde (commit `981bd7e1`)

- `v4-production-runner-pathb.test.ts`: `vi.mock('@/lib/agents/somnio-v4', ...)` → `vi.mock('@/lib/agents/somnio-v4/somnio-v4-agent', ...)` — el core importa estáticamente el archivo directo del agente (el runner viejo hacía `await import('../somnio-v4')` del index). Setup sancionado A13/Pitfall 8.
- `interruption-system-v2/__tests__/restart-loop.test.ts`: MISMO fix (no estaba en los archivos del plan pero vive en el SUITE_CMD y también driva el V4ProductionRunner). El mock v3 de ese archivo YA usaba el specifier directo `somnio-v3/somnio-v3-agent` — el v4 lo alinea.
- Gate: ambas suites verdes; `git diff -U0 | grep expect(` = **0 líneas expect modificadas** en los 3 archivos de test; SUITE_CMD **353 passed | 7 skipped | 0 failed**.

## Contrato actualizado del core (cambios sancionados — ver Deviations)

```typescript
// TurnCoreAdapters.getSeedState ahora recibe el carryState que el core setea en Path B reprocess
getSeedState(carry?: CarryState | null): Promise<CoreSeedState>
// CoreSeedState ganó visionContext (path image-respond v4)
interface CoreSeedState { /* ...; */ visionContext?: { descripcion: string; categoria: string } }
```

Plan 11 (engine sandbox) implementará el MISMO contrato: su `getSeedState(carry)` aplica el carry sobre su `SandboxState` local; su `CoreSeedState.visionContext` = `input.visionContext`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CoreSeedState +visionContext — regresión introducida por la extracción del Plan 09**
- **Found during:** Task 1 (lectura del runner viejo :332 — threadea `visionContext` al V4AgentInput; el core del Plan 09 lo dropeó)
- **Issue:** el runner viejo pasaba `input.visionContext` al `V4AgentInput` (path image-respond v4, media-gate `vision_respond`). El `turn-orchestrator.ts` del Plan 09 construye `v4Input` sin `visionContext` → el path de visión v4 se rompería al activarse.
- **Fix:** `CoreSeedState.visionContext?` (campo neutral — `descripcion` + `categoria`, NO tipos de WhatsApp); el orquestador lo threadea (`visionContext: seed.visionContext`); el wrapper lo resuelve en `getSeedState` desde `EngineInput.visionContext`.
- **Files:** core/types.ts, core/turn-orchestrator.ts
- **Commit:** 185626db

**2. [Rule 1 - Bug] getSeedState(carry) — el core seteaba ctx.carryState pero NUNCA lo re-leía (Path B reprocess habría re-saludado/re-enviado)**
- **Found during:** Task 1 (el pathb test exige `intentsVistos=['saludo']` + `templatesEnviados` contiene `t-saludo` en iter 2 — el carryState debe aplicarse)
- **Issue:** el core del Plan 09 computa `ctx.carryState`/`ctx.carrySource` desde seed/output y los setea antes del `continue`, pero usa `seed = await adapters.getSeedState()` directo y NUNCA re-lee `ctx.carryState` (el comentario :152 decía "carryState ya aplicado por el adapter en getSeedState" pero el adapter no tenía cómo verlo). Resultado: un reprocess Path B re-saludaría / re-enviaría templates ya enviados.
- **Fix:** `getSeedState(carry?: CarryState | null)` — el core pasa `ctx.carryState`; el builder aplica `carry ?? sessionDerived` (el patrón del runner viejo :296). Resuelve la deuda heredada explícita en 08/09-SUMMARY ("Plan 11 parametriza el builder de carryState vía el adapter getSeedState").
- **Files:** core/types.ts, core/turn-orchestrator.ts, v4-production-runner.ts (wrapper aplica el carry)
- **Commit:** 185626db

**3. [Rule 3 - Blocking] restart-loop.test.ts también requería el fix A13 (no estaba en los archivos del plan, pero vive en el SUITE_CMD)**
- **Found during:** Task 2 (SUITE_CMD completo: 4 fails en `interruption-system-v2/__tests__/restart-loop.test.ts`)
- **Issue:** ese test mockea `@/lib/agents/somnio-v4` (index) y driva el V4ProductionRunner; tras el rewire el core importa `somnio-v4-agent` directo → el mock no intercepta → el agente real corre y los canned outputs no se devuelven.
- **Fix:** mismo cambio de specifier sancionado A13 (`@/lib/agents/somnio-v4` → `@/lib/agents/somnio-v4/somnio-v4-agent`). Cero asserts tocados.
- **Files:** src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts
- **Commit:** 981bd7e1

---

**Total deviations:** 3 (2× Rule 1 — gaps reales del Plan 09 que la extracción introdujo, fijados preservando byte-equivalencia; 1× Rule 3 — el mismo setup sancionado A13 en un test del SUITE_CMD no listado en el plan). Cero scope creep, **cero asserts cambiados** en ningún test.

## Verificación

- `npx tsc --noEmit` exit 0 tras cada task.
- SUITE_CMD: **353 passed | 7 skipped | 0 failed** (= baseline canónico Plan 09). Cero asserts cambiados (`git diff -U0 | grep "^[+-].*expect(" | wc -l` = 0 across los 3 test files).
- Acceptance Task 1: runTurn=6 (≥1); `grep -cE "while \(|drainPendingAndCombine|runCheckpointGate|startHeartbeat"` = 0; VersionConflictError=6 (≥1); agent_routed=2 (≥1); D-18=4 (≥1); `wc -l`=572 (<700).
- Regla 6 (Gate D-11): diff = {v4-production-runner.ts, 2 test files del runner, restart-loop.test.ts del SUITE_CMD, core/types.ts, core/turn-orchestrator.ts}. **webhook-processor.ts, messaging.ts, v3-production-runner.ts, godentist/recompra/pw-confirmation, v4-messaging-adapter.ts AUSENTES del diff.**
- Firma pública del runner: `constructor(adapters, config)` + `processMessage(input, retryCount=0): Promise<EngineOutput>` — sin cambios → webhook-processor.ts no tocado.

## must_haves — truths verificadas

- ✅ "v4-production-runner.ts es un wrapper delgado: threading de lock fields + adapters de producción + mapeo TurnResult→EngineOutput — el restart loop vive SOLO en el core" → 572 líneas, 0 `while`/drain/ckptGate/heartbeat.
- ✅ "Las suites de caracterización (restart + pathb) pasan con asserts INTACTOS — solo cambios de vi.mock sancionados A13/D-09" → 0 expect modificados.
- ✅ "El retry de VersionConflictError (máx 3) queda en el wrapper ALREDEDOR del core (B9) — el release doble es safe por owner-check" → `processMessage` re-entra con el mismo input/lockHandle.
- ✅ "webhook-processor.ts NO cambió — sigue instanciando el runner con la misma firma pública" → ausente del diff.

## Commits

| Commit | Tipo | Descripción |
|--------|------|-------------|
| `185626db` | refactor | runner reescrito como wrapper del core (D-04) — adapters prod B1-B11 + deviations Rule 1 core (visionContext + getSeedState carry) |
| `981bd7e1` | test | vi.mock del agente apunta al specifier del core (setup sancionado A13) — asserts intactos |

## Next Phase Readiness

- **Plan 11 (engine→wrapper sandbox):** implementa el MISMO `TurnCoreAdapters` con adapters de memoria + el loop sintético CKPT-7.N absorbido en el send-adapter; `beforeAgentInvoke` = sleep `simulateProdTimingMs`; `onResultReady` = `redis.set(sandbox-result:{id})`. Mapea `TurnResult` → `V4EngineOutput` (build SandboxState/DebugTurn; error→`success:true` `[Error v4]` — divergencia INTENCIONAL C5). **Contrato ya pinneado por este plan:** `getSeedState(carry)` aplica el carryState sobre el SandboxState local; `CoreSeedState.visionContext` = `input.visionContext`. La deuda heredada 08/09 (parametrizar carryState builder) queda RESUELTA aquí.

## Self-Check: PASSED

- 1/1 archivo clave del artifact existe (v4-production-runner.ts con `runTurn`)
- 2/2 commits verificados en git log (`185626db`, `981bd7e1`)
- 0 deletions de archivos en los 2 commits (solo edición de líneas; el runner se reescribió in-place)

---
*Phase: somnio-v4-consolidation*
*Plan: 10*
*Completed: 2026-06-10*
