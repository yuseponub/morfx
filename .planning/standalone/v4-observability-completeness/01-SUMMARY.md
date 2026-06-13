---
phase: v4-observability-completeness
plan: 01
subsystem: somnio-sales-v4 observability instrumentation (base layer)
tags: [observability, somnio-v4, additive, regla-6]
requires: []
provides:
  - "Helper recordV4Event (dual-emission no-throw, inyecta restart_iteration uniforme)"
  - "Tipos opcionales backward-compat: V4AgentInput.restartIteration?, V4AgentOutput.errorStage?, RunCrmGateArgs.restartIteration?, SubLoopContext.restartIteration?"
  - "Threading de ctx.restartIteration en el v4Input builder + agent_routed del core"
affects:
  - src/lib/agents/somnio-v4/observability.ts
  - src/lib/agents/somnio-v4/types.ts
  - src/lib/agents/somnio-v4/crm-gate.ts
  - src/lib/agents/somnio-v4/sub-loop/index.ts
  - src/lib/agents/somnio-v4/core/turn-orchestrator.ts
tech-stack:
  added: []
  patterns:
    - "Dual-emission no-throw (modelo emitLockEvent) con try/catch global"
    - "restart_iteration snake_case uniforme en payload (= drain.ts:62)"
    - "Campos de tipo opcionales `?` backward-compat (analog sessionId?/errorMessage?)"
key-files:
  created:
    - src/lib/agents/somnio-v4/observability.ts
    - src/lib/agents/somnio-v4/observability.test.ts
  modified:
    - src/lib/agents/somnio-v4/types.ts
    - src/lib/agents/somnio-v4/crm-gate.ts
    - src/lib/agents/somnio-v4/sub-loop/index.ts
    - src/lib/agents/somnio-v4/core/turn-orchestrator.ts
decisions:
  - "Centralizar los 4 campos de tipo en wave 1 rompe el acoplamiento same-wave: Plan 02 (CALLS) y Plan 03 (consumo gate/sub-loop) dependen SOLO de este plan, no entre sí"
  - "label como string LIBRE (NO LockEventLabel) — los labels v4 nuevos son invisibles a los asserts toHaveLength(11) y filter-based (Pitfall 1/2)"
  - "category locked a 'pipeline_decision' — sin EventCategory nueva"
metrics:
  duration: "~6 min"
  completed: "2026-06-13"
  tasks: 3
  files: 6
---

# Phase v4-observability-completeness Plan 01: Base de instrumentación v4 Summary

Helper `recordV4Event` (dual-emission no-throw que inyecta `restart_iteration` uniforme) + 4 campos de tipo opcionales que el resto de los planes consumen + threading de `ctx.restartIteration` en el core. Prerequisito de TODA la instrumentación downstream (Planes 02/03/04).

## Qué se construyó

**Task 1 — `recordV4Event` + suite (commit `d1d6ef86`)**
- `src/lib/agents/somnio-v4/observability.ts`: helper modelado en `emitLockEvent` con tres diferencias clave: (a) `label: string` LIBRE (NO `LockEventLabel`), (b) try/catch global no-throw que protege el `console.log` de un payload circular (Pitfall 6), (c) inyecta `restart_iteration: opts.restartIteration ?? 0` (D-03, snake_case). Acepta `opts.durationMs` (4º arg a `recordEvent`). Import absoluto `@/lib/observability` (Pitfall 3 — para que el `vi.mock` de los tests lo intercepte). También exporta `type V4Stage` para tipar el `stage` del spine.
- `src/lib/agents/somnio-v4/observability.test.ts`: 5 tests verdes (category pipeline_decision + restart_iteration explícito, default 0, durationMs como 4º arg, collector null no-op, recordEvent throw NO propaga — Regla 6).

**Task 2 — campos de tipo opcionales (commit `5e50619a`)**
- `V4AgentInput.restartIteration?: number` (D-03), `V4AgentOutput.errorStage?: string` (D-01), `RunCrmGateArgs.restartIteration?: number` (D-03), `SubLoopContext.restartIteration?: number` (D-03). Los 4 opcionales/backward-compat — ningún campo existente cambió. Aquí NO se instrumenta gate/sub-loop (eso es Plan 03); solo se añade el campo de tipo.

**Task 3 — threading en el core (commit `35b8d1e1`)**
- El `v4Input` builder pasa `restartIteration: ctx.restartIteration` (RestartContext, ya en scope — sin contador nuevo). El evento `agent_routed` lleva `restart_iteration: ctx.restartIteration` en el payload (etiqueta el send-loop por iteración — D-03). Cambio puramente aditivo de payload; sin tocar loop/orden de send/discriminadores de drain.

## Nota de PARITY (importante para mantenimiento)

`core/turn-orchestrator.ts` es **COMPARTIDO** por el prod runner (`engine/v4-production-runner.ts`) Y el sandbox engine (`somnio-v4/engine-v4.ts`). Los cambios de Task 3 aparecen en AMBOS lados — eso es **DESEABLE** (paridad de observabilidad) e inofensivo: el sandbox mockea `getCollector` a no-op, así que el `agent_routed`/`restartIteration` no escribe nada extra en el path sandbox. Regla de mantenimiento (de CLAUDE.md): cambio al mecanismo → SOLO en `core/`.

## Contrato del helper (relevante para Planes 02/03)

`recordV4Event` debe recibir **solo payloads planos/redactados** — el helper NO redacta PII por sí mismo. Los planes downstream que embeben mensajes de usuario deben pasar por `bodyTruncate`/`idSuffix` (de `@/lib/agents/shared/crm-mutation-tools/helpers`) ANTES de llamar al helper (T-obs01-01 del threat model). Este plan no embebe PII.

## Acoplamiento roto (por qué wave 1 centraliza los tipos)

Plan 02 (que pasa los VALORES en las calls del agente) y Plan 03 (que consume los valores en gate/sub-loop) ambos dependen de los 4 campos de tipo. Definirlos aquí (wave 1) crea una dependencia cross-wave limpia (02→01, 03→01) en vez de un acoplamiento same-wave 02↔03.

## Deviations from Plan

None - plan executed exactly as written. (TDD Task 1: el helper + los 5 tests se entregaron en un solo commit `feat` ya que el done-criteria del plan es "suite de 5 tests verde"; el helper se escribió verbatim del plan/PATTERNS y la suite pasó en verde de inmediato.)

## Verification results

- `npx vitest run src/lib/agents/somnio-v4/observability.test.ts` → 5/5 PASS
- `npx vitest run src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts` → 13/13 PASS (asserts filter-based intactos — Pitfall 2)
- `npx vitest run src/lib/agents/interruption-system-v2/__tests__/observability.test.ts` → 6/6 PASS (toHaveLength(11) intacto — paridad LockEventLabel)
- `npx tsc --noEmit` → exit 0 (memory build_subprojects_break_next_build: tsc=0 predice Vercel verde)

## Self-Check: PASSED

- src/lib/agents/somnio-v4/observability.ts — FOUND
- src/lib/agents/somnio-v4/observability.test.ts — FOUND
- Commits d1d6ef86, 5e50619a, 35b8d1e1 — FOUND
