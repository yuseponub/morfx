---
phase: v4-observability-completeness
plan: 02
subsystem: somnio-sales-v4 error path + spine instrumentation
tags: [observability, somnio-v4, additive, regla-6, error-path]
requires: [01]
provides:
  - "engine_error event en agent_observability_events con stage + errorMessage(redactado) + stackFrames + restart_iteration (D-01)"
  - "errorStage en V4AgentOutput — contrato consumido por el runner (Plan 04) para armar el mensaje limpio al chat del operador"
  - "restart_iteration en los 4 eventos *_result del agente (D-02/D-03)"
  - "restartIteration threadeado a las CALLS runCrmGate + runSubLoop(slot+vision) — consumido por Plan 03 para etiquetar gate/sub-loop"
affects:
  - src/lib/agents/somnio-v4/somnio-v4-agent.ts
  - src/lib/agents/somnio-v4/__tests__/somnio-v4-error-path.test.ts
tech-stack:
  added: []
  patterns:
    - "currentStage: V4Stage como var local actualizada al entrar a cada stage; el catch externo la lee"
    - "recordV4Event('engine_error', ...) (helper no-throw del Plan 01) en el catch — Regla 6"
    - "PII-safe: bodyTruncate(errMsg, 200) en el errorMessage embebido; stack crudo solo en stackFrames (DB)"
    - "restart_iteration snake_case uniforme en payload (= drain.ts)"
key-files:
  created:
    - src/lib/agents/somnio-v4/__tests__/somnio-v4-error-path.test.ts
  modified:
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts
decisions:
  - "Task 1 + Task 2 commiteados juntos (1 commit) — ambos modifican el MISMO archivo somnio-v4-agent.ts de forma interleaved; git add -p (interactivo) no está disponible, y ambas tareas se verificaron juntas (tsc + 3 suites verdes)"
  - "errorMessage del output (discriminador de drain) NO se toca — solo se AÑADE errorStage al objeto del return"
  - "restartIteration threadeado también a la rama vision de runSubLoop (NOTE del plan: opcional, hecho por consistencia)"
metrics:
  duration: "~12 min"
  completed: "2026-06-13"
  tasks: 2
  files: 2
---

# Phase v4-observability-completeness Plan 02: Error path + spine del agente v4 Summary

Cierra el agujero negro del error path (D-01) e instrumenta el spine del agente (D-02/D-03) en `somnio-v4-agent.ts`. Cuando el agente revienta, ahora emite un evento `engine_error` con el motivo REAL, stack truncado (5 frames), EL STAGE donde reventó y `restart_iteration` — y el `errorStage` viaja en el `V4AgentOutput` para que el runner (Plan 04) arme un mensaje limpio al chat del operador. Cambio puramente aditivo (Regla 6).

## Qué se construyó

**Task 1 — currentStage + engine_error + errorStage (D-01)**
- Imports: `recordV4Event, type V4Stage` desde `./observability` (helper del Plan 01) + `bodyTruncate` desde `@/lib/agents/shared/crm-mutation-tools/helpers`.
- Al inicio de `processUserMessage`: `const restartIteration = input.restartIteration ?? 0` + `let currentStage: V4Stage = 'comprehension'`.
- `currentStage` se actualiza al ENTRAR a cada stage: `guards`, `sales-track`, `crm-gate`, `response-track`, `sub-loop-slot` (comprehension es el default; el send vive en el core, no aplica aquí).
- El catch externo (antes :1014) ahora:
  - amplía el slice del stack a 5 frames (`.slice(0, 5)`, D-01 dice 3-5);
  - emite `recordV4Event('engine_error', { stage: currentStage, errorMessage: bodyTruncate(errMsg, 200), stackFrames: errStack ?? null, agent: SOMNIO_V4_AGENT_ID }, { restartIteration })`;
  - añade `errorStage: currentStage` al objeto del `return`;
  - **conserva** `errorMessage: errStack ? \`${errMsg} :: ${errStack}\` : errMsg` (discriminador de drain del orchestrator INTACTO).
- Suite nueva `somnio-v4-error-path.test.ts`: 6 tests con un **spy collector** (`recordEvent = vi.fn()`, NO el no-op de la suite existente). Fuerza el throw mockeando `resolveSalesTrack` para que tire. Cubre: stage+restart_iteration en el emit, errorMessage truncado vs stackFrames, PII-trunc a 200 chars, errorStage+success:false en el output con errorMessage discriminador intacto, restartIteration=2 propagado, y Pitfall 2 (un path NO-error no emite engine_error ni setea errorStage).

**Task 2 — restart_iteration en el spine + threading a las calls (D-02/D-03)**
- `restart_iteration: restartIteration` (campo plano snake_case) añadido a los 4 eventos *_result existentes (mínima-invasiva, sin migrar al helper): `comprehension_completed_v4`, `guard` blocked, `guard` passed, `sales_track_result`, `response_track_result`.
- `restartIteration` threadeado a la call `runCrmGate({...})` (junto a los lock fields) — `RunCrmGateArgs.restartIteration?` lo acepta (Plan 01).
- `restartIteration` threadeado al `ctx` de `runSubLoop({...})` en el slot resolver Y en la rama vision — `SubLoopContext.restartIteration?` lo acepta (Plan 01).

## Contrato de errorStage (relevante para Plan 04 — runner)

El `V4AgentOutput.errorStage` (tipo `string`, añadido por Plan 01) lleva el `V4Stage` donde reventó el agente (`'comprehension' | 'guards' | 'sales-track' | 'crm-gate' | 'response-track' | 'sub-loop-slot' | 'send'`). El runner (`v4-production-runner.ts:597-600`, el agujero del `V4_AGENT_ERROR` hardcodeado) debe leer `output.errorStage` para construir un `error.message` específico (ej. `V4_AGENT_ERROR @ crm-gate: <reason corto>`) en vez del genérico `'V4 agent processing failed'` — **SIN stack** (el operador no quiere stack en la conversación; el stack vive solo en `engine_error.stackFrames` de la DB de observabilidad). Cuando `errorStage` es undefined, el output NO pasó por el catch externo (fue un early-return de interrupción o un path normal).

## Threading de restartIteration — hecho aquí (los tipos los proveyó Plan 01)

Plan 02 pasa los VALORES de `restartIteration` a las calls `runCrmGate` + `runSubLoop`. Plan 03 (consumo en gate/sub-loop) los recibirá vía los campos de tipo opcionales que Plan 01 definió (`RunCrmGateArgs.restartIteration?`, `SubLoopContext.restartIteration?`). Acoplamiento cross-wave limpio (02→01, 03→01).

## Regla 6 — el agente corre idéntico

Cambios puramente aditivos: `currentStage` es var local, `engine_error` es `recordV4Event` (helper no-throw del Plan 01), `errorStage` es campo opcional del output, `restartIteration`/`restart_iteration` es telemetría opcional. El `errorMessage` del output (discriminador de drain) NO se tocó. La suite existente del agente (`somnio-v4-agent.test.ts`) y la de lock (`engine-v4-lock.test.ts`) siguen verdes — confirma cero behavior change.

## Deviations from Plan

**[Proceso] Task 1 + Task 2 entregados en un solo commit (`1bbcd001`).** El plan describe 2 tasks, pero ambos modifican el MISMO archivo `somnio-v4-agent.ts` con cambios interleaved (las asignaciones de `currentStage`, los `restart_iteration` de los eventos y el threading a las calls se entremezclan). `git add -p` (staging interactivo por hunk) no está disponible en este entorno, así que dividir el archivo por task habría requerido un split artificial frágil. Ambas tareas se verificaron juntas (tsc=0 + 3 suites verdes) y son un único cambio aditivo coherente. El test suite nuevo (artifact de Task 1) se incluyó en el mismo commit.

## Verification results

- `npx vitest run src/lib/agents/somnio-v4/__tests__/somnio-v4-error-path.test.ts` → 6/6 PASS
- `npx vitest run src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts` → PASS (suite existente verde — no-op mock inofensivo)
- `npx vitest run src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts` → PASS (asserts filter-based intactos)
- Combinado (3 suites) → 35/35 PASS
- `npx tsc --noEmit` → exit 0
- Grep gates: `recordV4Event('engine_error'`=1, `errorStage: currentStage`=1, `currentStage = '`=5, `bodyTruncate(errMsg, 200)`=1, `slice(0, 5)`=1, `restart_iteration: restartIteration`=5, `restartIteration,`=8, createAdminClient/@supabase añadidos=0 (Regla 3).

## Self-Check: PASSED

- src/lib/agents/somnio-v4/__tests__/somnio-v4-error-path.test.ts — FOUND
- src/lib/agents/somnio-v4/somnio-v4-agent.ts (modificado) — FOUND
- Commit 1bbcd001 — FOUND
