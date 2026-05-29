---
phase: somnio-v4-turn-ledger
plan: 01
subsystem: somnio-sales-v4 (DORMANT) — state persistence / turn ledger
tags: [types, serialization, turn-ledger, D-17, regla-6]
requires: []
provides:
  - "TurnLedger (registro completo en memoria) — src/lib/agents/somnio-v4/types.ts"
  - "TurnLedgerDims (subset persistido {atendido,crmActions}) — types.ts"
  - "Atendido discriminated union (5 variantes incl. silence) — types.ts"
  - "CrmActionRegistrada (shape D-04 verbatim) — types.ts"
  - "commitTurn(workingState, ledger) — src/lib/agents/somnio-v4/state.ts"
  - "deserializeState param turnLedgerDims (default graceful) — state.ts"
  - "SessionState.turn_ledger_dims? opcional aditivo — src/lib/agents/types.ts"
affects:
  - "Plan 02 (migración columna turn_ledger_dims) consume TurnLedgerDims shape"
  - "Plan 03 (runner threading) cablea commitTurn en los return-paths reales"
  - "Plan 04 (observability) emite el TurnLedger COMPLETO (modeTransition/confidence/messagesSent)"
tech-stack:
  added: []
  patterns:
    - "Discriminated union por kind (precedente Invocation/SystemEvent)"
    - "first-class field + commitTurn wrap (espejo del patrón accionesEjecutadas/quick-009)"
    - "split persist/observability (D-17): persistir subset, emitir completo"
key-files:
  created:
    - src/lib/agents/somnio-v4/__tests__/state.test.ts
  modified:
    - src/lib/agents/somnio-v4/types.ts
    - src/lib/agents/somnio-v4/state.ts
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts
    - src/lib/agents/types.ts
    - src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts
    - src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts
decisions:
  - "D-17 honrado: TurnLedger (completo) != TurnLedgerDims (persistido), documentado en código"
  - "V4AgentOutput.turnLedgerDims requerido → constructores con default vacío; Plan 03 cablea commitTurn"
  - "SessionState.turn_ledger_dims tipado unknown[] para evitar import cross-módulo (no as any)"
metrics:
  duration_min: 30
  completed: 2026-05-29
  tasks: 3
  commits: 3
---

# Phase somnio-v4-turn-ledger Plan 01: Tipos Turn Ledger + commitTurn + Contrato de Persistencia — Summary

Fundación del Unified Turn Ledger v4: define `TurnLedger` (registro completo en memoria del turno) y su subconjunto persistido `TurnLedgerDims` como tipos DISTINTOS por diseño (D-17), implementa el punto de commit único `commitTurn` que envuelve `serializeState` añadiendo solo `{atendido, crmActions}`, y agrega el campo opcional `turn_ledger_dims` a `SessionState` sin repetir la deuda del `as any`. Cero cambio de comportamiento determinista — es capa de efectos/tipos pura. Nada se persiste a DB todavía (eso es la migración del Plan 02).

## What Was Built

- **Task 1 — Tipos (commit `24fee0e9`):**
  - `Atendido` discriminated union por `kind` con exactamente 5 variantes: `template_intent`, `sales_action`, `kb_topic`, `handoff`, `silence` (D-15: silence SÍ se registra; es solo un `Atendido`, NO un `AccionRegistrada`).
  - `CrmActionRegistrada` shape EXACTO D-04: `{ tool, args, result, code?, origen, stageAtTime? }`.
  - `TurnLedgerDims` = `{ atendido, crmActions }` (subset PERSISTIDO) con comentario D-17.
  - `TurnLedger` = `{ comprehension, atendido, crmActions, modeTransition?, messagesSent }` (registro COMPLETO) con comentario D-17.
  - `V4AgentInput.turnLedgerDims?` opcional (backward-compat); `V4AgentOutput.turnLedgerDims` requerido.

- **Task 2 — commitTurn + serialización (commit `dfc7fbdb`):**
  - `commitTurn(workingState, ledger)` llama `serializeState(workingState)` (no reimplementa) y añade SOLO `{atendido, crmActions}`. `modeTransition`/`comprehension`/`messagesSent` NO entran en el retorno (D-17 — los consume el emit a observability del Plan 04).
  - `truncateTexto(s, 500)` aplicado a cada `kb_topic.texto` (T-ledger-01).
  - `redactArgs` con phone last-4 / email local-part enmascarado en `crmActions.args` (T-ledger-02, redacción mínima defensiva; observabilidad CRM completa diferida al standalone #2 D-08).
  - `deserializeState` gana param `turnLedgerDims` al final con default graceful `{ atendido: [], crmActions: [] }` (D-16); NO se devuelve dentro de `AgentState` (working state).
  - `state.test.ts` NUEVO: 7 tests (roundtrip D-17 con aserción de keys exactas, truncación, no-toca atendido sin texto, redacción PII, ledger vacío, 2× legacy graceful).

- **Task 3 — Campo en SessionState (commit `d9463b3d`):**
  - `turn_ledger_dims?: { atendido: unknown[]; crmActions: unknown[] }` aditivo opcional. Tipado `unknown[]` para evitar import cross-módulo; el runner v4 castea a `TurnLedgerDims` al leer (Plan 03/05 W-3). Regla 6 OK por opcionalidad.

## Verification Results

- `npx vitest run src/lib/agents/somnio-v4/__tests__/state.test.ts` → **7/7 verde** (archivo NUEVO).
- `npx tsc --noEmit` → 0 errores nuevos en somnio-v4 / state / shared types. (Único error de tipo en suite = pre-existente en `v4-production-runner-pathb.test.ts`, ver deferred-items.)
- `grep -n "commitTurn" state.ts` + `serializeState(workingState)` → commitTurn envuelve serializeState (key_link confirmado).
- `grep "interface TurnLedger\b"` + `grep "interface TurnLedgerDims"` → ambos tipos distintos presentes (D-17).
- `grep "turn_ledger_dims" src/lib/agents/types.ts` → campo opcional presente.
- **Regla 6:** `grep` de `TurnLedger|commitTurn|turn_ledger_dims|turnLedgerDims` en v3/godentist/godentist-fb-ig/recompra/pw-confirmation → **0 matches**. Cambios confinados a archivos v4 + `types.ts` compartido (aditivo opcional) + 1 fixture de test consumidor de v4.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] V4AgentOutput.turnLedgerDims requerido rompía compilación en ~15 constructores**
- **Found during:** Task 1
- **Issue:** El plan exige `V4AgentOutput.turnLedgerDims` requerido (must_have + `<done>`), pero ningún return-path del agente lo poblaba (eso es scope Plan 03). Hacerlo requerido introdujo ~15 errores TS2741 en `somnio-v4-agent.ts` + fixtures de test (`engine-v4-lock.test.ts`, `restart-loop.test.ts`), violando el success criterion "no new errors in somnio-v4".
- **Fix:** Añadido `turnLedgerDims: { atendido: [], crmActions: [] }` (default vacío) a cada constructor de `V4AgentOutput`: `baseOutput` de `mapOutcome` (cubre los 6 returns de mapOutcome de un golpe), los 3 returns interrupt/error (con `input.turnLedgerDims ?? {...}` para preservar dims del input al descartar el turno), y los 4 happy-paths serializados. Comentados como "Plan 01: default; Plan 03 cablea commitTurn". Cero cambio de comportamiento determinista — solo cumple el contrato de tipo. Plan 03 reemplaza los defaults con el output real de `commitTurn`.
- **Files modified:** `somnio-v4-agent.ts`, `engine-v4-lock.test.ts`, `restart-loop.test.ts`
- **Commit:** `24fee0e9`

## Deferred Issues

Ver `deferred-items.md`. Dos issues pre-existentes (SCOPE BOUNDARY, no causados por este plan):
1. `v4-production-runner-pathb.test.ts:213,218` — fixtures `intentInfo` sin `timestamp` (existe en HEAD, verificado vía `git stash`).
2. Smoke RAG flaky por LLM en vivo: `smoke-rag-a` caso 15 (`AI_RetryError: high demand`) + `smoke-rag-b` caso 1 (clasificación nondeterminista). Ambos golpean `kb_search` + generación con modelos reales — código que este plan NO tocó. 71/76 tests pasan; los 3 skipped son del propio diseño de las suites.

## Self-Check: PASSED

- `src/lib/agents/somnio-v4/types.ts` — FOUND (TurnLedger + TurnLedgerDims + Atendido + CrmActionRegistrada)
- `src/lib/agents/somnio-v4/state.ts` — FOUND (commitTurn export)
- `src/lib/agents/somnio-v4/__tests__/state.test.ts` — FOUND (CREADO)
- `src/lib/agents/types.ts` — FOUND (turn_ledger_dims)
- Commit `24fee0e9` — FOUND
- Commit `dfc7fbdb` — FOUND
- Commit `d9463b3d` — FOUND
