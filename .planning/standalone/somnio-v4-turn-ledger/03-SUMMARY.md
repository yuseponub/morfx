---
phase: somnio-v4-turn-ledger
plan: 03
subsystem: somnio-sales-v4 (DORMANT) — turn ledger construction in agent
tags: [turn-ledger, agent, RAG, D-05, D-17, regla-6]
requires:
  - "TurnLedger / TurnLedgerDims / Atendido / CrmActionRegistrada (Plan 01)"
  - "commitTurn(workingState, ledger) (Plan 01)"
  - "session_state.turn_ledger_dims column applied in prod (Plan 02)"
provides:
  - "TurnLedger COMPLETO construido en somnio-v4-agent.ts (incl. modeTransition + messagesSent)"
  - "commitTurn cableado en los 7 commit-paths reales (R1,R2,R3,R4,R5,R6,R10)"
  - "FIX CENTRAL D-05: rama RAG (mapOutcome generated) registra atendido kb_topic desde outcome.*"
affects:
  - "Plan 04 (observability) emitirá el ledger COMPLETO (modeTransition/messagesSent ya poblados)"
  - "Plan 05 (runner threading) persistirá output.turnLedgerDims en session_state.turn_ledger_dims"
tech-stack:
  added: []
  patterns:
    - "Ledger acumulado en memoria DESPUÉS de decidir (D-12) + commitTurn wrap en cada return real"
    - "prevMode capturado al inicio del turno (antes de merge/decisión) para modeTransition.from"
    - "buildCrmActionsFromAcciones deriva crmActions del turno desde acciones crmAction:true"
key-files:
  created:
    - src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts
  modified:
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts
decisions:
  - "D-05 cerrado: la rama RAG ya NO pierde sourceTopic/responseConfidence/responseText"
  - "D-17 honrado: ledger construido puebla modeTransition+messagesSent (no fantasma)"
  - "D-06 honrado: ningún código intra-turno LEE turnLedgerDims (gate grep verde)"
  - "D-07 honrado: R7/R8/R9 (interrupt/catch) NO commitean — passthrough input.* intacto"
  - "timer (R10) sin comprehension → comprehension sintético { intent:'timer_expired', confidence:1 }"
metrics:
  duration_min: 25
  completed: 2026-05-29
  tasks: 2
  commits: 2
---

# Phase somnio-v4-turn-ledger Plan 03: TurnLedger COMPLETO + commitTurn en agente — Summary

Cierra el ciclo del Unified Turn Ledger v4: el agente ahora construye un `TurnLedger` COMPLETO (incl. `modeTransition` + `messagesSent`, D-17) y lo funde vía `commitTurn` en los 7 commit-paths reales. El FIX CENTRAL es D-05 — la rama RAG (`mapOutcomeToAgentOutput`, `outcome.status==='generated'`) ahora registra `atendido kind:'kb_topic'` DESDE `outcome.sourceTopic / responseConfidence / responseText`; antes ese return serializaba solo `state` y perdía el registro del topic atendido. Reemplaza los defaults vacíos que Plan 01 sembró en ~15 constructores por el output real de `commitTurn` en los return-paths reales, dejando intactos los interrupt/error paths (D-07). Cero cambio de comportamiento determinista (D-02/D-12).

## What Was Built

- **Task 1 — TurnLedger COMPLETO + commitTurn en R1,R2,R3,R5,R6 (commit `40b51c7a`):**
  - Imports: `commitTurn` desde `./state`; tipos `Atendido`, `CrmActionRegistrada`, `TurnLedger`.
  - Helper `buildCrmActionsFromAcciones(acciones, origen, turno)`: deriva `crmActions` del turno desde acciones `crmAction:true` filtradas por `turno + origen` (result `'success'` inferido del push exitoso; shape D-04 completo lo llena el orquestador del standalone #2).
  - `prevMode = computeMode(state)` capturado al inicio de `processUserMessage` (antes del merge) → `modeTransition.from`.
  - **R1 (guard blocked):** ledger `atendido:[handoff]`, `modeTransition→handoff`, `messagesSent:0`, `commitTurn(mergedState, ledger)`.
  - **R2 (silencio natural):** ledger `atendido:[{kind:'silence'}]` (D-15), `messagesSent:0`, crmActions del turno, `commitTurn`.
  - **R3 (happy path con mensajes):** `atendido` armado desde lo que el turno hizo — `sales_action` (si hubo acción no-silence, `templateIds: salesTemplateIntents`) + `template_intent` (si hubo `infoTemplateIntents`, `intent: analysis.intent.primary`); crmActions del turno; `messagesSent = templateIdsSent.length`; `commitTurn`.
  - **mapOutcomeToAgentOutput (R4/R5/R6):** firma extendida con `prevMode`; helper interno `buildLedgerDims(atendido, toMode, messagesSent)`; cada return real (no_match handoff, generated, template + null-guard handoffs) sobrescribe `turnLedgerDims` con `commitTurn(state, ledger)`. **R5 generated = FIX CENTRAL D-05**: `atendido:[{kind:'kb_topic', topic: outcome.sourceTopic, confidence: outcome.responseConfidence ?? 0, texto: outcome.responseText, turno: state.turnCount}]`. El branch interrupt (`outcome.reason.startsWith('interrupted_at_ckpt_')`) mantiene el default vacío + `errorMessage` (descarta turno, D-07).
  - 2 call sites de `mapOutcomeToAgentOutput` (early-escalation + cas_reject) pasan `prevMode`.
  - Test NUEVO `__tests__/somnio-v4-agent.test.ts` con harness que invoca el agente REAL mockeando sus dependencias (`comprehend / guards / sales-track / response-track / runSubLoop / threshold / invocations / observability`) — 7 tests: RAG kb_topic, silence, template_intent, modeTransition+messagesSent (R3), decisiones intactas (D-02), no-intra-read (D-06 vía grep del source), R1 handoff.

- **Task 2 — commitTurn en R10 (timer) + crmActions origen timer (commit `98b17203`):**
  - `processSystemEvent` (R10): `prevMode` capturado antes de registrar la acción del timer; ledger COMPLETO con comprehension sintético `{ intent:'timer_expired', confidence:1 }` (timers no tienen comprehension), `atendido` sales_action/template_intent, `crmActions` origen `'timer'`, `modeTransition + messagesSent`; `commitTurn(state, ledger)`.
  - 2 tests nuevos: `timer ledger` (crmActions origen:timer con `crear_orden`) + `timer atendido` (sales_action con `ofrecer_promos`).

## Verification Results

- `npx vitest run somnio-v4-agent.test.ts` → **9/9 verde**.
- Suite v4 non-LLM (somnio-v4-agent + state + escalation + transitions + invocations + comprehension-schema + engine-v4-lock) → **53/53 verde**. (smoke-rag-a/b NO ejecutados — golpean LLM en vivo, flaky pre-existente per 01-SUMMARY deferred-items.)
- `npx tsc --noEmit` → 0 errores nuevos en somnio-v4 (único pre-existente: `v4-production-runner-pathb.test.ts`, deferred Plan 01).
- `grep -c "commitTurn(" somnio-v4-agent.ts` → **10** (≥5 requerido; incluye 7 return-paths + helper refs).
- `grep -c "kind: 'kb_topic'" somnio-v4-agent.ts` → **1** (rama generated, D-05).
- `grep -c "modeTransition" somnio-v4-agent.ts` → **12** (poblado en todos los commit-paths, D-17 no fantasma).
- D-06: `grep -nE 'turnLedgerDims\s*[.\[]'` (excluyendo `input.turnLedgerDims` passthrough) → **0 lecturas intra-turno**.
- R7/R8/R9 intactos: 3× `input.turnLedgerDims ?? { atendido: [], crmActions: [] }` passthrough presentes; los 3 `errorMessage:` returns sin tocar.
- **Regla 6:** cambios confinados a `somnio-v4-agent.ts` + su test nuevo (ambos v4-specific). v4 sigue DORMANT — sin cambio de comportamiento determinista.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] test usaba `primary:'razonamiento_libre'` que no es V4_INTENTS válido**
- **Found during:** Task 1 (typecheck)
- **Issue:** El plan describe el test RAG escalando por `razonamiento_libre`, pero ese string NO es miembro del enum `V4_INTENTS` (TS2322). `decideSubLoopReason` mapea `intent==='otro'` a `razonamiento_libre`, y `'otro'` SÍ es válido + tiene `intent_confidence` bajo (escala igual).
- **Fix:** Usar `primary:'otro'` con `intent_confidence:0.2` (< threshold 0.7) → escalación a sub-loop. Comportamiento de escalación idéntico al intencionado por el plan.
- **Files modified:** `somnio-v4-agent.test.ts`
- **Commit:** `98b17203` (fix incluido en el commit de Task 2 tras descubrirse en el typecheck final)

### Nota de diseño (no desviación)

- **modeTransition NO se persiste por commitTurn (D-17 by design).** El test `modeTransition+messagesSent` no puede leerlo de `output.turnLedgerDims` (que es el subset persistido `{atendido,crmActions}`). Se asertan los proxies OBSERVABLES: `output.newMode === modeTransition.to`, `output.messages` (proxy de messagesSent) y el `atendido` poblado. El ledger COMPLETO con `modeTransition`/`messagesSent` ya está construido en memoria — Plan 04 lo emite a observability. Esto honra D-17 (persistir subset, emitir completo).

## Deferred Issues

Ninguno nuevo causado por este plan. Pre-existente (SCOPE BOUNDARY, no tocado): smoke-rag-a/b flaky por LLM en vivo + `v4-production-runner-pathb.test.ts` fixture sin `timestamp` (ambos documentados en deferred-items de Plan 01).

## Push (Regla 5)

Plan 02 confirmó la migración `turn_ledger_dims` aplicada en producción. El código de este plan (que escribe ese subset al output) es seguro de pushear. v4 DORMANT (0 workspaces) → ningún tráfico ejercita el path en prod. Push a Vercel a discreción del usuario (este executor NO empuja — sin instrucción explícita de push en el prompt).

## Self-Check: PASSED

- `src/lib/agents/somnio-v4/somnio-v4-agent.ts` — FOUND (commitTurn × 7 paths + kb_topic D-05)
- `src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts` — FOUND (CREADO, 9 tests verdes)
- Commit `40b51c7a` — FOUND
- Commit `98b17203` — FOUND
