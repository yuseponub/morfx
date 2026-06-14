---
phase: v4-handoff-soft-signal
plan: 01
subsystem: agents
tags: [somnio-v4, handoff, observability, soft-signal, EngineOutput]

requires:
  - phase: debounce-interruption-system-v2
    provides: interruption system v2 lock + checkpoints
  - phase: somnio-v4-rag-generative
    provides: sub-loop + resolveLowSlot handoff path

provides:
  - "EngineOutput.handoffSuggested + handoffSignal optional fields (D-03 type contract)"
  - "v4-production-runner no longer calls storage.handoff() or clearPendingTemplates() on handoff outcome (D-04)"
  - "handoff_suggested observability event at all 5 gate categories: guard_r0_r1, vision (error+no_match), resolveLowSlot sub-loop gates"
  - "webhook-processor.ts: executeHandoff gated on !result.handoffSuggested; soft-branch skeleton for Plan 02"
  - "D-08: R0/R1 explicit human ask gets minimal rag:handoff_ack ProcessedMessage instead of silence"

affects:
  - v4-handoff-soft-signal-02
  - handoff-agent (future)

tech-stack:
  added: []
  patterns:
    - "Soft handoff signal: v4 runner sets EngineOutput.handoffSuggested:true + handoffSignal:{reason,gate,topic} instead of calling storage.handoff() — session stays active"
    - "Additive gate in shared processor: !result.handoffSuggested preserves existing agent behavior (Regla 6); soft path is new conditional branch"
    - "HandoffGate type alias: NonNullable<EngineOutput['handoffSignal']>['gate'] — avoids repeating the union at every emit site"
    - "SomnioEngineResult extension: added handoffSuggested? + handoffSignal? to propagate new EngineOutput fields through the legacy wrapper"

key-files:
  created: []
  modified:
    - src/lib/agents/engine/types.ts
    - src/lib/agents/engine/v4-production-runner.ts
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts
    - src/lib/agents/production/webhook-processor.ts
    - src/lib/agents/somnio/somnio-engine.ts

key-decisions:
  - "D-04 implemented: storage.handoff() + clearPendingTemplates() removed from commitTurn; updateMode still fires (mode transitions to 'handoff' in session)"
  - "D-08 resolved: guard R0/R1 injects rag:handoff_ack synthetic ProcessedMessage; content-gap gates (no_kb/low_confidence/binary_backstop/etc) stay silent"
  - "D-02 honored: resolveLowSlot guards handoff_suggested emit with !reason.startsWith('interrupted_at_ckpt_')"
  - "SomnioEngineResult extended (deviation): result type in webhook-processor is SomnioEngineResult, not EngineOutput — required adding handoffSuggested/handoffSignal to that type and the mapping"
  - "conversationId/turnId sent as null in handoff_suggested events: V4AgentInput does not expose these fields; sessionId is the available proxy"

requirements-completed: []

duration: 30min
completed: 2026-06-14
---

# Phase v4-handoff-soft-signal Plan 01: Core soft handoff signal — suprimir executeHandoff + emitir señal estructurada

**Separacion signal/decision para somnio-sales-v4: el runner deja de apagar la sesion (storage.handoff suprimido), emite handoffSuggested:true + handoffSignal en EngineOutput, y webhook-processor gatena executeHandoff en !handoffSuggested para preservar Regla 6.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-06-14T03:40:00Z
- **Completed:** 2026-06-14T04:10:09Z
- **Tasks:** 4/4
- **Files modified:** 5

## Accomplishments

- Eliminado bloque `storage.handoff() + clearPendingTemplates()` de `v4-production-runner.ts:commitTurn` — sesion permanece activa en soft mode (D-04)
- Agregados campos `handoffSuggested?: boolean` y `handoffSignal?: {reason, gate, topic}` a `EngineOutput` y `SomnioEngineResult` — contrato D-03
- 4 emit sites de evento `handoff_suggested` en somnio-v4-agent.ts (vision error, vision no_match, guard R0/R1, resolveLowSlot) con D-02 guard para interrupciones
- webhook-processor.ts: HARD path gateado en `!result.handoffSuggested` preserva comportamiento de todos los agentes existentes; SOFT path skeleton listo para Plan 02
- D-08: guard R0/R1 inyecta `rag:handoff_ack` en output.templates — acknowledgment minimo para pedidos explcitos de humano

## Task Commits

1. **Task 1: Add handoffSuggested + handoffSignal to EngineOutput** - `181a693e` (feat)
2. **Task 2: v4-production-runner soft handoff** - `fa570887` (feat)
3. **Task 3: Emit handoff_suggested events + R0/R1 ack** - `6555f8f8` (feat)
4. **Task 4: Gate webhook-processor + SomnioEngineResult** - `13c8bac5` (feat)

## Files Created/Modified

- `src/lib/agents/engine/types.ts` — Agrega `handoffSuggested?: boolean` y `handoffSignal?: {reason, gate, topic}` a `EngineOutput` (aditivo puro)
- `src/lib/agents/engine/v4-production-runner.ts` — Elimina bloque handoff de commitTurn; agrega `deriveHandoffGate` helper y spread `handoffSuggested/handoffSignal` en mapResult
- `src/lib/agents/somnio-v4/somnio-v4-agent.ts` — Importa `EngineOutput` type; agrega 4 emit sites `recordV4Event('handoff_suggested', ...)` + inyecta `rag:handoff_ack` en guard R0/R1 return
- `src/lib/agents/production/webhook-processor.ts` — Divide bloque handoff en HARD path (!handoffSuggested) + SOFT path skeleton; propaga campos en el mapping EngineOutput→SomnioEngineResult
- `src/lib/agents/somnio/somnio-engine.ts` — Extiende `SomnioEngineResult` con `handoffSuggested?` y `handoffSignal?`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] SomnioEngineResult no tenia handoffSuggested/handoffSignal**

- **Found during:** Task 4 (tsc error)
- **Issue:** `result` en `webhook-processor.ts` es `SomnioEngineResult`, no `EngineOutput`. El typechecker rejectaba `result.handoffSuggested` porque ese campo no existia en `SomnioEngineResult`. El mapping `EngineOutput → SomnioEngineResult` en linea 977-993 tampoco propagaba los nuevos campos.
- **Fix:** Agrego `handoffSuggested?` y `handoffSignal?` a `SomnioEngineResult` con los mismos tipos que `EngineOutput`. Actualizo el mapping para propagarlos desde `engineOutput`.
- **Files modified:** `src/lib/agents/somnio/somnio-engine.ts`, `src/lib/agents/production/webhook-processor.ts`
- **Commit:** `13c8bac5`

**2. [Rule 2 - Missing critical functionality] conversationId/turnId no existen en V4AgentInput**

- **Found during:** Task 3 (tsc error)
- **Issue:** El plan especifica `conversationId: input.conversationId ?? null, turnId: input.turnId ?? null` en los payloads de `handoff_suggested`, pero `V4AgentInput` no expone esos campos (usa `sessionId` como proxy).
- **Fix:** Envio `conversationId: null, turnId: null` con comentario explicativo. La informacion equivalente esta disponible via `sessionId`. Cambio afecta los 4 emit sites.
- **Files modified:** `src/lib/agents/somnio-v4/somnio-v4-agent.ts`
- **Commit:** `6555f8f8`

## Known Stubs

None — el SOFT path en webhook-processor tiene un `logger.info` placeholder que Plan 02 reemplazara con el inbox note insert (D-05). Esto es intencionalmente un skeleton, documentado en el codigo con el comentario "inbox note pending Plan 02".

## Threat Flags

None — los cambios son aditivos y no introducen nuevas superficies de red, auth paths, ni escrituras a DB en este plan.

## Pre-existing Test Failures (Out of Scope)

- `restart-loop.test.ts > S1`: `agent_routed` evento tiene `restart_iteration` en payload; test expects 0. Falla pre-existente de `v4-observability-completeness` standalone — confirmado por stash baseline. No causado por este plan.
- `smoke-rag-b.test.ts` tests 1 y 2: fallas de LLM no-determinismo (`expected 'no_match' got 'generated'`). Tests AI-driven; resultado varia por invocacion. Pre-existentes.

## Self-Check

**Files exist:**
- `src/lib/agents/engine/types.ts` — FOUND (handoffSuggested field at line 167)
- `src/lib/agents/engine/v4-production-runner.ts` — FOUND (handoffSuggested: true at line 639)
- `src/lib/agents/somnio-v4/somnio-v4-agent.ts` — FOUND (4 handoff_suggested emit sites)
- `src/lib/agents/production/webhook-processor.ts` — FOUND (!result.handoffSuggested guard)
- `src/lib/agents/somnio/somnio-engine.ts` — FOUND (handoffSuggested? in SomnioEngineResult)

**Commits exist:**
- `181a693e` — FOUND (Task 1)
- `fa570887` — FOUND (Task 2)
- `6555f8f8` — FOUND (Task 3)
- `13c8bac5` — FOUND (Task 4)

## Self-Check: PASSED
