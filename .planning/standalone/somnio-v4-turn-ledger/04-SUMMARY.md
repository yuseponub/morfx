---
phase: somnio-v4-turn-ledger
plan: 04
subsystem: somnio-sales-v4 (DORMANT) — turn ledger wiring (runner + sandbox + observability)
tags: [turn-ledger, runner, sandbox, observability, paridad, D-04, D-07, D-13, D-17, regla-6]
requires:
  - "TurnLedger / TurnLedgerDims / Atendido / CrmActionRegistrada (Plan 01)"
  - "commitTurn + V4AgentOutput.turnLedgerDims (Plan 01)"
  - "session_state.turn_ledger_dims column applied in prod (Plan 02)"
  - "TurnLedger COMPLETO construido en somnio-v4-agent.ts con modeTransition+messagesSent (Plan 03)"
provides:
  - "v4-production-runner: restaura turn_ledger_dims + persiste PATH B + carryState (P3) + NO Path A (P6)"
  - "v4-production-runner: emite el ledger COMPLETO a observability (kb_topic_registered + crm_action_recorded + turn_ledger_committed)"
  - "engine-v4 (sandbox): paridad restore/persist/carryState/newState→DebugTurn de las dims"
  - "SandboxState.turnLedgerDims tipado FUERTE con TurnLedgerDims (W-3, narrowing kb_topic sin unknown)"
  - "V4AgentOutput.turnLedgerSummary? (runtime-only) que el agente puebla desde su TurnLedger (D-17b — runner NO recalcula)"
affects:
  - "Plan 05 (debug panel) lee SandboxState.turnLedgerDims via DebugTurn.stateAfter"
  - "Consumidores de observabilidad cross-sesion: agent_observability_events con 3 labels nuevos"
tech-stack:
  added: []
  patterns:
    - "split persist/observability (D-17): persistir subset en columna, emitir completo via collector"
    - "summary passthrough (turnLedgerSummary): el agente expone los campos no-persistidos del ledger; el runner los emite (sin recalcular)"
    - "paridad de mecanismo runner↔sandbox sin shared code (INTERRUPTION-PARITY.md)"
    - "emit defensivo (default vacio) para no crashear el turno ante output legacy/mock"
key-files:
  created: []
  modified:
    - src/lib/agents/engine/v4-production-runner.ts
    - src/lib/agents/somnio-v4/engine-v4.ts
    - src/lib/sandbox/types.ts
    - src/lib/agents/somnio-v4/types.ts
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts
    - src/lib/agents/engine/__tests__/v4-production-runner-pathb.test.ts
decisions:
  - "D-17b honrado: turnLedgerSummary (runtime-only) expone modeTransition/confidence/messagesSent/intent; el runner los EMITE — ningun campo fantasma"
  - "Reconciliacion <action> vs <interfaces>: turnLedgerSummary lo expone el AGENTE (pedirlos al output, NO recalcular en runner). NO se requirio PARAR"
  - "P6 verificado semanticamente: Path A (if wasInterruptedWithZeroSends) NO persiste dims; solo PATH B (else)"
  - "P3: carryState arrastra dims (Path B output.turnLedgerDims; seed-reprocess seed.turnLedgerDims); turnCount NO vive en el ledger → cero double-increment"
  - "Robustez (Rule 2): emit + saveState defensivos con default {atendido:[],crmActions:[]} ante output sin dims"
metrics:
  duration_min: 45
  completed: 2026-05-29
  tasks: 3
  commits: 3
---

# Phase somnio-v4-turn-ledger Plan 04: Wiring Runner + Sandbox + Observability — Summary

Cablea las dims del Unified Turn Ledger v4 end-to-end en producción y sandbox con paridad obligatoria (P4), y emite el ledger COMPLETO como eventos de observabilidad para queryability cross-sesión (D-13/D-17b). El runner de producción ahora restaura `turn_ledger_dims` de la columna al construir `V4AgentInput`, lo arrastra en `carryState` para que un reprocess Path B no pierda ni re-registre efectos (P3), lo persiste SOLO en PATH B (Path A descarta el turno, P6), y post-commit emite 3 tipos de evento (`kb_topic_registered`, `crm_action_recorded`, `turn_ledger_committed`) consumiendo los campos del ledger que NO se persisten en el blob per-sesión — así ninguno queda fantasma. El sandbox `engine-v4` replica el mecanismo (restore/persist/carryState/newState→DebugTurn). v4 sigue DORMANT — cero cambio de comportamiento en prod.

## What Was Built

- **Task 1 — Threading en v4-production-runner (commit `84777c82`):**
  - Restore: `sessionTurnLedgerDims` leído de `rawState.turn_ledger_dims` con default graceful `{atendido:[],crmActions:[]}` (sesiones legacy sin columna o con `{}`).
  - `seed` type + assignment ganan `turnLedgerDims` (default desde sesión; carryState lo override en reprocess).
  - `V4AgentInput` build pasa `turnLedgerDims: seed.turnLedgerDims` (passthrough al agente para coherencia; interrupt/error lo preservan vía D-07).
  - `carryState` type + ambos assignments (seed-reprocess `seed.turnLedgerDims`; Path B send-loop `output.turnLedgerDims`) — P3, sin double-increment.
  - PATH B `saveState` persiste `turn_ledger_dims: output.turnLedgerDims`; PATH A (`if (wasInterruptedWithZeroSends)`) NO incluye dims (P6).
  - Import `TurnLedgerDims` desde `../somnio-v4/types`. Cero `createAdminClient` nuevo.

- **Task 2 — Paridad sandbox (commit `8c41ae20`):**
  - `SandboxState.turnLedgerDims?: TurnLedgerDims` (tipado FUERTE, W-3 — el state-tab del Plan 05 hace narrowing `a.kind==='kb_topic'` sin unknown). Import desde `somnio-v4/types`.
  - `engine-v4`: `seedState` restaura dims con default; `carryState` Path B + `newState` cargan `output.turnLedgerDims`.
  - Las dims llegan a `DebugTurn` vía `stateAfter: newState` (consumo Plan 05). NO se tocó la lógica Path A/B ni el restart loop (paridad de mecanismo).

- **Task 3 — Emit del ledger COMPLETO (commit `19cd8ee4`):**
  - `V4AgentOutput.turnLedgerSummary?` (runtime-only, NUNCA persistido): `{intent, confidence, modeTransition?, messagesSent}`.
  - Helper `buildLedgerSummary(ledger)` en el agente deriva el summary del MISMO `TurnLedger` ya construido; poblado en los 7 commit-paths (R1 guard, R2 silence, R3 happy, R10 timer, R4 no_match, R5 generated, R6 template + 2 null-guards). Interrupt/error (R7/R8/R9) lo dejan `undefined` (turno descartado).
  - Runner post-commit (PATH B) emite vía `getCollector()?.recordEvent('pipeline_decision', ...)`:
    - `kb_topic_registered` por cada `atendido kind:'kb_topic'` → `{topic, confidence, turno}` (sin texto completo — solo metadata queryable).
    - `crm_action_recorded` por cada `crmAction` → `{tool, result, origen, code?}` (args redactados — D-08 difiere observabilidad CRM completa).
    - `turn_ledger_committed` (summary del turno) → `{intent, confidence, modeTransition, messagesSent}` desde `turnLedgerSummary` (D-17b — consume los campos no-persistidos; sin él quedarían muertos).
  - Emit + saveState defensivos (default vacío) ante output sin dims — robustez (Rule 2).

## Verification Results

- **Paridad P4:** `grep -c "turnLedgerDims" v4-production-runner.ts` → **9** (≥4); `engine-v4.ts` → **3** (≥3).
- **P6 semántico:** `awk` del bloque `if (wasInterruptedWithZeroSends) {…} else` → **0** matches de `turn_ledger_dims` (Path A NO persiste).
- **Emit:** `kb_topic_registered` + `crm_action_recorded` + `turn_ledger_committed` presentes en el runner; `modeTransition`/`messagesSent` consumidos en el `turn_ledger_committed`.
- **Tests:** `somnio-v4-agent.test.ts` 9/9 + `state.test.ts` 7/7 + `engine-v4-lock.test.ts` 11/11 + `v4-production-runner-restart.test.ts` + `v4-production-runner-pathb.test.ts` → **8/8 runner**. Suite v4 completa: **87/93 passed, 3 skipped, 3 failed** (los 3 fallos = LLM-live flaky pre-existente: `smoke-rag-b` caso 2 clasificación nondeterminista, documentado en deferred-items de Plan 01/03; NO causado por este plan — el `pathb` ahora pasa).
- **tsc:** 0 errores nuevos en archivos tocados; los 3 errores TS pre-existentes en `pathb.test.ts` (fixtures sin `timestamp` + sin `turnLedgerDims`) RESUELTOS al threadear el contrato real. Errores restantes en el proyecto (`.next/dev/types/validator.ts`, `conversations.test.ts`) confirmados pre-existentes vía `git stash` — fuera de scope.
- **Regla 6 / interruption-system-v2:** `git diff --name-only | grep interruption-system-v2` → **0**. Cero archivos de agentes no-v4 tocados. Cambios confinados a runner v4 + sandbox engine v4 + sandbox/types (campo aditivo opcional) + somnio-v4 types/agent + 1 fixture de test v4.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Emit crasheaba el turno cuando output.turnLedgerDims era undefined (fixture/legacy)**
- **Found during:** Task 3 (suite completa)
- **Issue:** El bloque de emit hacía `for (const a of output.turnLedgerDims.atendido)`. El fixture `agentOut` de `v4-production-runner-pathb.test.ts` (predata el ledger) omite `turnLedgerDims` (cast `as V4AgentOutput`), → `undefined` en runtime → `Cannot read properties of undefined` → catch del runner → `success:false`. Los 2 tests de Path B fallaban (`expected false to be true`).
- **Fix:** Emit + saveState defensivos con `output.turnLedgerDims ?? { atendido: [], crmActions: [] }` (no crashea ante output legacy/mock; en prod el contrato garantiza presencia). Además se threadeó `turnLedgerDims` al fixture `agentOut` para reflejar el contrato real.
- **Files modified:** `v4-production-runner.ts`, `v4-production-runner-pathb.test.ts`
- **Commit:** `19cd8ee4`

**2. [Rule 3 - Blocking] error TS2741/TS2322 pre-existente formalizado en archivos tocados**
- **Found during:** Task 1 + Task 3
- **Issue:** (a) `seed.accionesEjecutadas` es `unknown[]` → `AccionRegistrada[]` (error pre-existente en HEAD línea ~350, verificado vía `git stash`). (b) `pathb.test.ts` líneas 213/218 `intentInfo` sin `timestamp` (TS2741, deferred Plan 01).
- **Fix:** (a) Cast explícito `seed.accionesEjecutadas as V4AgentInput['accionesEjecutadas']` con comentario (error pre-existente, no nuevo). (b) `intentInfo.timestamp` añadido a los 3 sitios del fixture. Resultado: ambos archivos compilan limpio — cero errores TS nuevos + 3 pre-existentes resueltos.
- **Files modified:** `v4-production-runner.ts`, `v4-production-runner-pathb.test.ts`
- **Commits:** `84777c82`, `19cd8ee4`

### Nota de diseño (reconciliación del plan, no desviación)

- **`turnLedgerSummary` no existía en `V4AgentOutput` (Plan 03 no lo threadeó).** El `<action>` de Task 3 decía "PARAR si no llega", pero el `<interfaces>` (línea 100) decía "el ejecutor de Plan 04 debe pedirlos al output del agente (NO recalcular)". Reconciliación: se añadió `V4AgentOutput.turnLedgerSummary?` (runtime-only) poblado por el AGENTE desde su propio `TurnLedger` ya construido (la fuente de verdad). El runner solo lo EMITE — NO recalcula `modeTransition`. La instrucción de PARAR aplicaba únicamente a recalcular en el runner, lo cual NO se hizo. Cero recálculo en el runner.

## Push (Regla 5)

Plan 02 confirmó la migración `turn_ledger_dims` aplicada en producción. El código que lee/escribe la columna es seguro. v4 DORMANT (0 workspaces) → ningún tráfico ejercita el path en prod. El push lo maneja el orquestador (este executor NO empuja).

## Self-Check: PASSED

- `src/lib/agents/engine/v4-production-runner.ts` — FOUND (restore + PATH B persist + carryState + emit 3 eventos)
- `src/lib/agents/somnio-v4/engine-v4.ts` — FOUND (paridad restore/persist/carryState/newState)
- `src/lib/sandbox/types.ts` — FOUND (turnLedgerDims tipado fuerte)
- `src/lib/agents/somnio-v4/types.ts` — FOUND (turnLedgerSummary)
- `src/lib/agents/somnio-v4/somnio-v4-agent.ts` — FOUND (buildLedgerSummary + 7 commit-paths)
- Commit `84777c82` — FOUND
- Commit `8c41ae20` — FOUND
- Commit `19cd8ee4` — FOUND
