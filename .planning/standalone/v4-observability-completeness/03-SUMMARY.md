---
phase: v4-observability-completeness
plan: 03
subsystem: somnio-v4 / observabilidad (CRM gate + RAG sub-loop)
tags: [observability, crm-gate, rag-sub-loop, restart-iteration, additive]
requires:
  - "Plan 01: recordV4Event helper + campos de tipo opcionales (RunCrmGateArgs.restartIteration, SubLoopContext.restartIteration)"
  - "Plan 02: threading de restartIteration en los call sites de somnio-v4-agent.ts (runCrmGate / runSubLoop de slot)"
provides:
  - "crm-gate.ts: eventos orquestador crm_gate_skipped / crm_gate_completed + restart_iteration en los 4 eventos pre-existentes + forwarding a runCrmSubLoop"
  - "sub-loop/index.ts: subloop_tooling_completed + subloop_generation_completed + subloop_error (emitRagError ahora alcanza la DB)"
affects:
  - "agent_observability_events (nuevos labels free-string en category pipeline_decision)"
tech-stack:
  added: []
  patterns:
    - "recordV4Event (helper Plan 01) para inyectar restart_iteration uniforme (D-03)"
    - "idSuffix(orderId) para redacción PII del orderId (T-obs03-01)"
    - "bodyTruncate(errMsg, 200) para el message del subloop_error (T-obs03-02)"
key-files:
  created:
    - src/lib/agents/somnio-v4/__tests__/crm-gate-observability.test.ts
    - src/lib/agents/somnio-v4/__tests__/subloop-observability.test.ts
  modified:
    - src/lib/agents/somnio-v4/crm-gate.ts
    - src/lib/agents/somnio-v4/sub-loop/index.ts
decisions:
  - "D-02: spine de eventos en los 2 subsistemas hoy ciegos (CRM gate orquestador + RAG sub-loop por paso)"
  - "D-03: cada evento nuevo/tocado lleva restart_iteration (snake_case) desde args.restartIteration (gate) o args.ctx.restartIteration (sub-loop)"
metrics:
  duration: ~25min
  completed: 2026-06-13
  tasks: 2
  files: 4
---

# Phase v4-observability-completeness Plan 03: CRM gate + RAG sub-loop observability Summary

Iluminación de los 2 subsistemas v4 antes ciegos a nivel diagnóstico: el **orquestador del CRM gate** (`runCrmGate` no emitía nada al prender/no-prender) y el **RAG sub-loop** (solo emitía el outcome terminal `subloop_completed`, y `emitRagError` solo hacía `onDebug + throw` sin tocar la DB). Puramente ADITIVO (Regla 6) — cero cambio de comportamiento del agente, solo `recordEvent`.

## What Changed

### Task 1 — CRM gate (commit `dd83161c`)
- `runCrmGate` ahora emite **`crm_gate_skipped`** (`reason: 'not_fired'`) en el early-return cuando el gate no prende, y **`crm_gate_completed`** (`fired:true`, `crmActionsCount`, `tools`, `success`, `orderId` redactado vía `idSuffix`) antes del return exitoso.
- Los **4 eventos pre-existentes** del hint builder (`crm_gate_createOrder_skipped` x3 + `crm_gate_move_blocked`) se **preservaron sin renombrar** y ahora llevan `restart_iteration` (leído de `args.restartIteration ?? 0` dentro de `buildCrmHint`).
- El gate **forwardea** `restartIteration` al `ctx` de `runCrmSubLoop`, para que los eventos del sub-loop CRM hereden la iteración.

### Task 2 — RAG sub-loop (commit `76efbcde`)
- **`subloop_tooling_completed`**: emitido tras computar `toolingStep` (cubre tanto el camino handoff como el de éxito) con `topicSelected`, `shouldHandoff`, `kbHits[{topic,similarity}]`, `finishReason`, `latencyMs`.
- **`subloop_generation_completed`**: emitido tras `generationResult.output` con `responseConfidence`, `binary`, `threshold` (0.70), `latencyMs`.
- **`subloop_error`** dentro de `emitRagError` ANTES del throw — `errorType` (mapeado del param `reason` de la función, que carga `tooling_call_error` / `generation_call_error` / `invariant_violation: ...`), `errorName` y `message` truncado a 200 chars. Los errores por paso ya alcanzan `agent_observability_events`.
- Los 3 eventos consumen `args.ctx.restartIteration ?? 0` (D-03). Terminales existentes (`subloop_completed` x4, `subloop_nunca_decir_violation`, `subloop_escalation_trigger_match`, `subloop_invariant_violation`) intactos.

## El flip generated↔no_match ahora es diagnosticable

La inconsistencia que el usuario percibía (un mismo topic da `generated` en un turno y `no_match` en otro) ahora es reconstruible desde la DB combinando:
- `subloop_tooling_completed` — qué topic recuperó el KB y con qué similarity por hit.
- `subloop_generation_completed` — la `responseConfidence` auto-reportada vs el `threshold` 0.70 y el `binary` backstop.

Antes esos datos solo fluían a `args.onDebug?.()` (sandbox-only) y nunca quedaban persistidos.

## Corrección a RESEARCH

RESEARCH afirmaba que `crm-gate.ts` estaba "totalmente mudo". Es **inexacto** (ya confirmado en PATTERNS §Verification): el archivo ya importaba `getCollector` y emitía 4 eventos dentro de `buildCrmHint`. Por eso este plan **augmentó, no reescribió** — añadió eventos a nivel orquestador con labels NUEVOS distintos (`crm_gate_skipped` / `crm_gate_completed`) y solo threadeó `restart_iteration` a los 4 existentes, manteniendo la timeline inequívoca.

## Threading de restartIteration

Los campos de tipo (`RunCrmGateArgs.restartIteration?` y `SubLoopContext.restartIteration?`) ya existían (provistos por Plan 01). Este plan **consume** el valor:
- Gate: `args.restartIteration ?? 0`.
- Sub-loop: `args.ctx.restartIteration ?? 0`.
- El gate forwardea `restartIteration` a `runCrmSubLoop` por su `ctx`; el threading desde el agente (call `runSubLoop` de slot) lo hizo Plan 02.

## Deviations from Plan

Ninguna. El plan se ejecutó tal como está escrito. (Una precisión esperada por el propio plan: el param que carga el tipo de error en `emitRagError` se llama `reason`, no `errorType` — se mapeó al campo `errorType` del payload como indicaban los critical_constraints.)

## Verification

- `npx vitest run crm-gate-observability.test.ts crm-gate.test.ts` → 11/11 verde.
- `npx vitest run subloop-observability.test.ts smoke-rag-a.test.ts smoke-rag-b.test.ts engine-v4-lock.test.ts` → 47/47 verde (los smokes corrieron con keys reales y muestran los nuevos eventos `restart_iteration` disparándose en vivo; engine-v4-lock filter-based se mantiene verde).
- `npx tsc --noEmit` → exit 0.
- Regla 3: `git diff` de ambos archivos modificados → 0 matches `createAdminClient` / `@supabase/supabase-js` añadidos.

## Known Stubs

Ninguno. Todos los eventos están cableados a `recordV4Event` / `getCollector` reales.

## Self-Check: PASSED

- Archivos creados verificados (crm-gate-observability.test.ts, subloop-observability.test.ts, 03-SUMMARY.md).
- Commits verificados en git log: `dd83161c` (Task 1), `76efbcde` (Task 2).
