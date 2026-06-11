---
phase: somnio-v4-consolidation
date: 2026-06-10
status: passed
checks_passed: 20
checks_total: 20
---

# Verificación — somnio-v4-consolidation

**Meta del standalone:** Consolidar internamente el agente `somnio-sales-v4` en dos waves: (W1) eliminar código muerto con CERO cambio de comportamiento, gateado por GATE-W1; (W2) extraer un core unificado de orquestación del turno (`core/`) que haga que producción y sandbox sean wrappers del MISMO `runTurn`, logrando paridad por construcción. v4 permanece DORMANT en producción durante todo el proceso.

**Verificado contra:** codebase en HEAD (origin/main limpio), GATE-W1.md, GATE-W2.md, BASELINE.md.

**Re-verificación:** No — verificación inicial.

---

## Veredicto

**PASSED — 20/20 checks.**

El standalone cumplió su objetivo estructural: el mecanismo de turno v4 (restart loop, Path A/B, 8 checkpoints, drains, heartbeat, finally-release) es ahora código único en `src/lib/agents/somnio-v4/core/`. Producción (`v4-production-runner.ts`, 1295→572 líneas) y sandbox (`engine-v4.ts`, 768→330 líneas) son wrappers delgados que consumen el mismo `runTurn`. La clase de bug del 2026-05-28 (fix de `dropOwnEntry`/`carryState` que se tuvo que aplicar dos veces, una en cada lado) es estructuralmente imposible. Suite canónica: **353 passed | 7 skipped | 0 failed**. TypeScript: exit 0. Todo pusheado a origin/main.

---

## Checks

| # | Check | Esperado | Observado | Estado |
|---|-------|----------|-----------|--------|
| 1 | `core/` directory exists | `src/lib/agents/somnio-v4/core/` con 5 archivos + `__tests__/` | Existe: `turn-orchestrator.ts`, `types.ts`, `checkpoint-gate.ts`, `restart-context.ts`, `drain.ts`, `__tests__/drain.test.ts` | PASS |
| 2 | `runTurn` exportado de `turn-orchestrator.ts` | `export async function runTurn(...)` | Línea 49: `export async function runTurn(` | PASS |
| 3 | `TurnCoreAdapters` exportado de `types.ts` | Interface `TurnCoreAdapters` exportada | Línea 213: `export interface TurnCoreAdapters` | PASS |
| 4 | `drainPendingAndCombine` exportado de `drain.ts` | `export async function drainPendingAndCombine(...)` | Línea 35: `export async function drainPendingAndCombine(args: {` | PASS |
| 5 | `runCheckpointGate` + `CHECKPOINT_PLACEMENTS` en `checkpoint-gate.ts` | Ambos exportados; 8 placements | `runCheckpointGate` en l.65, `CHECKPOINT_PLACEMENTS` en l.127 con 8 ckpt_* entries | PASS |
| 6 | `v4-production-runner.ts` importa y llama `runTurn` | Import de `core/turn-orchestrator` + llamada `await runTurn(...)` | l.47: `import { runTurn } from '@/lib/agents/somnio-v4/core/turn-orchestrator'`; l.103: `result = await runTurn(coreInput, prodAdapters)` | PASS |
| 7 | `engine-v4.ts` importa y llama `runTurn` | Import de `./core/turn-orchestrator` + llamada `await runTurn(...)` | l.44: `import { runTurn } from './core/turn-orchestrator'`; l.148: `const result = await runTurn(coreInput, adapters)` | PASS |
| 8 | Runner y engine sin restart-loop propio | Cero `while (` en runner y engine | `grep -n "while\s*("` retorna vacío en ambos archivos | PASS |
| 9 | Runner y engine sin `readAndClearPending` directo | Cero llamadas directas al drain de Redis | `grep readAndClearPending\|drainPending` retorna vacío en runner y engine | PASS |
| 10 | Runner y engine sin `checkpoint(` directo | Cero llamadas directas; solo via core | `grep "checkpoint("` (no comentarios/imports) retorna vacío en runner y engine | PASS |
| 11 | Código muerto eliminado: `mapOutcomeToAgentOutput` | 0 hits en `src/` (excluido tests) | `grep -rn mapOutcomeToAgentOutput src/` retorna vacío | PASS |
| 12 | Código muerto eliminado: `shouldCreateOrder` en V4AgentOutput (D-13) | Removido de `somnio-v4/types.ts` y del runner v4 | `types.ts` no tiene el campo; `v4-production-runner.ts` no tiene hits; `somnio-v4-agent.ts` l.20 documenta "borrado en D-13" | PASS |
| 13 | Código muerto eliminado: `runLegacySubLoop` → renombrado (D-17) | 0 hits de `runLegacySubLoop` en src/; `runCrmMutationSubLoop` activo | `grep runLegacySubLoop src/` retorna vacío; `runCrmMutationSubLoop` vive en `sub-loop/index.ts` y `crm-gate.ts` | PASS |
| 14 | `confidence` legacy con @deprecated en `comprehension-schema.ts` (D-15) | Campo marcado `@deprecated`, conservado para compatibilidad | l.36-42: campo `confidence` marcado `@deprecated` con nota sobre `agent_turns.confidence` y guards de escalación | PASS |
| 15 | `LockEventLabel` union = 11 labels (D-16) | 11 labels (14 originales − 3 sin emisor: `follower_woke`, `lock_force_acquired_after_ttl_expiry`, `heartbeat_renewed`) | `observability.ts` contiene exactamente 11 labels en el union; `agent-scope.md` actualizado al conteo 11 | PASS |
| 16 | Suite canónica: 353 passed \| 7 skipped \| 0 failed | `npx vitest run <SUITE_CMD> --exclude '**smoke-rag**'` → 353\|7\|0 | Corrida en vivo: **353 passed \| 7 skipped (38 files passed \| 1 skipped)**, 0 failed — duración 122.77s | PASS |
| 17 | TypeScript: `tsc --noEmit` exit 0 | Cero errores de source | Exit code 0, output vacío (los ruidos de `.next/dev/` son generados y no contaron) | PASS |
| 18 | Todo pusheado a origin/main | `git log origin/main..HEAD` vacío | Output vacío — todo en remoto | PASS |
| 19 | Regla 6: v3/godentist/recompra/pw-confirmation intactos | 0 commits de este standalone en archivos fuera de la lista permitida | `git log --grep="somnio-v4-consolidation" -- v3-production-runner.ts / messaging.ts / godentist/ / recompra/ / pw-confirmation/` → 0 resultados; diff-cero del standalone verificado en GATE-W2.md (8 archivos flaggeados = trabajo concurrente `vivificacion-v3`, verificado nominalmente) | PASS |
| 20 | `INTERRUPTION-PARITY.md` reducido a diferencias de adapters (D-07) | Doc re-titulado "Diferencias de adapters", mecanismo = código único en `core/`, regla nueva = cambio al mecanismo → solo en `core/` | Verificado: título actualizado, preámbulo declara "paridad POR CONSTRUCCIÓN", `NO comparten código`=0, `por construcción`≥1, §4 regla nueva; `ARCHITECTURE.md` ganó §1.1 `core/` con tabla de los 5 archivos | PASS |

---

## Artefactos verificados

| Artefacto | Líneas | Rol confirmado |
|-----------|--------|----------------|
| `core/turn-orchestrator.ts` | 666 | Restart loop + Path A/B + heartbeat + finally-release — mecanismo único |
| `core/types.ts` | 298 | `TurnCoreAdapters`, `TurnCoreInput`, `TurnResult`, `CommittedTurn`, `CarryState` |
| `core/checkpoint-gate.ts` | 168 | `runCheckpointGate` + `CHECKPOINT_PLACEMENTS` (8 colocaciones) |
| `core/restart-context.ts` | 103 | `createRestartContext`, `dropOwnEntry`, `RestartContext` |
| `core/drain.ts` | 100 | `drainPendingAndCombine` (consolida los 5 drain-sites) |
| `engine/v4-production-runner.ts` | 572 | Wrapper prod (1295→572); implementa `TurnCoreAdapters` de prod + retry `VersionConflictError` |
| `somnio-v4/engine-v4.ts` | 330 | Wrapper sandbox (768→330); construye adapters de memoria + llama `runTurn` |
| `core/__tests__/drain.test.ts` | — | 7 tests del core (los +7 que llevan 348→353 en la suite) |

---

## Comportamiento de los 9 mecanismos

Los gates documentales (GATE-W1.md + GATE-W2.md) demuestran equivalencia de comportamiento observable vs el baseline 2026-06-10 (`224c09ee`):

- **Wave 1 (D-10):** Smoke A + B EQUIVALENTE. 2 flaky-del-generador documentados en BASELINE (A/10, A/11) — causa raíz descarta Wave 1 (diff de `escalation.ts` solo borra params siempre-false; los triggers vivos quedan byte-idénticos).
- **Wave 2 (D-10):** Smoke A + B EQUIVALENTE. Ola de saturación de Gemini afectó varios casos en los dos runs (infra, no FAIL del sistema — Pitfall 12). Divergencias de decisión residuales (A/11, A/13, B/1, B/3) = flaky del generador en dirección segura (generated→handoff), con diff D-11 vacío en la lógica de generación/gate como prueba de que Wave 2 no las causó.
- Los 9 mecanismos (lock+fencing, Path A/B, 8 checkpoints, comprehension, state machine+tracks, sub-loop RAG 3-calls, crm-gate, turn ledger, no-repetición) quedan funcionando idéntico al baseline.

---

## Gaps

Ninguno.

---

## Notas

1. **`shouldCreateOrder` en archivos fuera de v4** (v3, recompra, pw-confirmation, sandbox, somnio, somnio-v2/v3): no es deuda de este standalone — esos agentes tienen su propio campo homónimo load-bearing. D-13 solo apuntaba al campo en `V4AgentOutput`/`v4-production-runner.ts`, que está efectivamente eliminado.

2. **CLAUDE.md §interruption-system-v2** todavía menciona "14 labels" en un bullet del cron sweeper ("REVISION B1 — 14th label"). Este es un dato histórico contextual (explica cuándo se añadió `lock_orphan_swept_by_cron`), no un conteo de labels actuales — los gates del mismo párrafo ya dicen "11 event labels enforceable". No es una inconsistencia bloqueante; es comentario histórico.

3. **Flaky carve-outs de Smoke A/B** (A/10, A/11, A/13, B/1, B/3): documentados en BASELINE.md y en ambos GATE files con causa raíz que descarta el refactor. La deuda P1-3 (comprehension/sub-loop sin fallback ante saturación de Gemini) sigue abierta, pero es pre-existente al standalone y no es scope de este trabajo.

4. **v4 DORMANT en producción** durante todo el standalone (0 workspaces con `conversational_agent_id='somnio-sales-v4'`). El deploy a Vercel no afecta tráfico de ningún agente real.

---

_Verificado: 2026-06-10_
_Verificador: Claude (gsd-verifier)_
