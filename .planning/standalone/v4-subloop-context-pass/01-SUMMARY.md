---
phase: v4-subloop-context-pass
plan: 01
subsystem: somnio-v4/sub-loop
tags: [rag, context-pass, state-machine, v4-only, additive]
dependency_graph:
  requires: [somnio-v4-rag-generative, somnio-v4-turn-ledger]
  provides: [stateContext-in-RAG-generation-prompt]
  affects: [somnio-v4-agent, sub-loop/prompt, sub-loop/index]
tech_stack:
  added: []
  patterns: [optional-field-threading, helper-function-null-guard, anti-regression-by-emptiness-check]
key_files:
  created:
    - src/lib/agents/somnio-v4/sub-loop/__tests__/generation-context.test.ts
  modified:
    - src/lib/agents/somnio-v4/sub-loop/index.ts
    - src/lib/agents/somnio-v4/sub-loop/prompt.ts
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts
decisions:
  - C-01: SubLoopContext.stateContext? OPCIONAL — path CRM (crm-gate.ts) no lo pasa y sigue compilando
  - C-02: stateContext solo va a buildGenerationPrompt (CALL 2), NO al tooling (CALL 1)
  - C-03: instruccion ligera "responde SOLO lo nuevo" — NO filtrado/scoring (futuro)
  - C-04: sin migracion DB (data ya en V4AgentInput), sin feature flag (v4 DORMANT)
metrics:
  duration: ~20min
  completed: 2026-06-01
  tasks_completed: 3
  tasks_total: 3
  files_changed: 4
---

# Phase v4-subloop-context-pass Plan 01: stateContext en sub-loop RAG Summary

**One-liner:** Inyecta datosCapturados + atendidoPrevio + recentBotMessages en el prompt de generacion RAG del sub-loop v4, con anti-regresion garantizada cuando stateContext es ausente/vacio.

## Baseline

SHA Regla 6: `72ee8e95` (commit que agrego el mini-plan `#2` al wave6).
SHA work baseline: `7ebd392d` (HEAD al arrancar la ejecucion del plan).

## Files Changed

| Archivo | Cambio |
|---------|--------|
| `src/lib/agents/somnio-v4/sub-loop/index.ts` | + import Atendido; + campo `stateContext?` en SubLoopContext; thread a buildGenerationPrompt en runRagSubLoop |
| `src/lib/agents/somnio-v4/sub-loop/prompt.ts` | + import Atendido; + interface GenerationStateContext; + buildStateContextBlock helper; buildGenerationPrompt firma extendida con 4° param opcional |
| `src/lib/agents/somnio-v4/somnio-v4-agent.ts` | + stateContext: { datosCapturados, atendidoPrevio, recentBotMessages } en call site RAG |
| `src/lib/agents/somnio-v4/sub-loop/__tests__/generation-context.test.ts` | NUEVO — 22 tests (casos A/B/C/D/E/F) |

## 3 Campos Pasados (stateContext)

1. **datosCapturados** (`Record<string, string>`) — quién es el cliente (pack, nombre, ciudad, etc.). Permite que el RAG responda contextualizado sin que el LLM tenga que inferirlo de la historia cruda.

2. **atendidoPrevio** (`Atendido[]`) — topics/templates atendidos en el turno anterior (via `input.turnLedgerDims?.atendido`). Labels semanticos (template_intent:precio, kb_topic:contraindicaciones, etc.) — mas legibles que IDs crudos.

3. **recentBotMessages** (`string[]`) — texto literal de las ultimas 2 respuestas del bot (ya computadas en `somnio-v4-agent.ts:162`). Para que el modelo no repita frases textuales.

## Acceptance Criteria Results

### Task 1

| Criterio | Resultado |
|----------|-----------|
| `grep -c "stateContext" sub-loop/index.ts` >= 2 | 2 (PASS) |
| `grep -c "stateContext" somnio-v4-agent.ts` >= 1 | 1 (PASS) |
| tooling call NO recibe stateContext | 0 matches (PASS) |
| `npx tsc --noEmit` — 0 errores en archivos cambiados | PASS |

### Task 2

| Criterio | Resultado |
|----------|-----------|
| `grep -c "CONTEXTO DE LA CONVERSACION\|stateContext" prompt.ts` >= 1 | 11 (PASS) |
| buildGenerationPrompt sin stateContext = output identico a antes | PASS (Caso B/null identicos) |
| `npx tsc --noEmit` exits 0 | PASS |

### Task 3

| Criterio | Resultado |
|----------|-----------|
| generation-context.test.ts exits 0, >= 3 casos | 22/22 PASS (6 casos A-F) |
| Suite sub-loop existente sin nuevas regresiones | 77/78 PASS + 2 skip (1 pre-existing debt M1) |

## Verification Gates

### TypeScript
- `npx tsc --noEmit` — sin errores nuevos en archivos cambiados. Los 2 errores pre-existentes (`.next/dev/types/validator.ts` linea 962; `conversations.test.ts`) no tocados.

### Vitest
- `npx vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/generation-context.test.ts` — 22/22 PASS
- Suite completa sub-loop — 77/78 PASS + 2 skip (fallo pre-existente: `few-shots.test.ts > M1 probability framing > compañero (humano)?experto` — deuda anterior al plan, documentada en instrucciones del orquestador)

### Regla 6 Greps

| Check | Resultado |
|-------|-----------|
| `git diff --name-only 72ee8e95..HEAD -- src/lib/agents/somnio-v3/ src/lib/agents/godentist/ src/lib/agents/godentist-fb-ig/ src/lib/agents/somnio-recompra/ src/lib/agents/somnio-pw-confirmation/ src/lib/agents/engine/v3-production-runner.ts src/lib/agents/interruption-system-v2/` | 0 lineas (PASS) |
| CheckpointId count (checkpoints.ts) | 8 (PASS) |
| `git diff --name-only 72ee8e95..HEAD -- src/` solo archivos somnio-v4 | ONLY somnio-v4 (PASS) |

## Commits

| Hash | Mensaje |
|------|---------|
| `0dcd5a11` | feat(v4-subloop-context-pass-01): pasar stateContext al path RAG del sub-loop |
| `6335dcc3` | test(v4-subloop-context-pass-01): tests generacion-context (22 casos A/B/C/D/E/F) |

## Deviations from Plan

None — plan ejecutado exactamente como escrito.

- `generation-call.ts` no requirio cambios (buildGenerationPrompt se llama en index.ts, no en generation-call.ts; el systemPrompt ya es un string compilado antes de pasar a runGenerationCall).
- 4 campos en el plan eran solo orientativos sobre la firma final; la implementacion real usa `GenerationStateContext` interface exportada desde prompt.ts (mas limpio que repetir el inline type en index.ts).

## Known Stubs

Ninguno. El contexto se pasa end-to-end: agente → SubLoopContext → buildGenerationPrompt → system prompt del LLM.

## Threat Flags

Ninguno — cambio puramente interno al sub-loop v4 (DORMANT). Sin nuevos endpoints, auth paths, ni DB access patterns.

## Self-Check: PASSED

- `src/lib/agents/somnio-v4/sub-loop/__tests__/generation-context.test.ts` — FOUND
- `src/lib/agents/somnio-v4/sub-loop/index.ts` — FOUND (stateContext interface)
- `src/lib/agents/somnio-v4/sub-loop/prompt.ts` — FOUND (buildStateContextBlock + buildGenerationPrompt 4° param)
- `src/lib/agents/somnio-v4/somnio-v4-agent.ts` — FOUND (stateContext call site)
- Commits `0dcd5a11` y `6335dcc3` — FOUND en git log
