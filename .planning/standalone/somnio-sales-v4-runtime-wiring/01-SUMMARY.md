---
phase: somnio-sales-v4-runtime-wiring
plan: 01
subsystem: somnio-v4 runtime
tags: [v4-runtime-wiring, engine, runner-clone, ai-sdk-deps, gemini, openai]
wave: 0
status: complete
date_completed: 2026-05-06
duration_estimate: ~1.5h
requires:
  - somnio-v4 standalone shipped (Plans 01-12.1 — commit 7d9bb2e)
  - Vercel env vars GOOGLE_GENERATIVE_AI_API_KEY + OPENAI_API_KEY_SALESV4
provides:
  - "@ai-sdk/google + @ai-sdk/openai deps installed (D-9, D-30)"
  - "V4ProductionRunner class — paralelo a V3ProductionRunner, clon mecánico (D-13)"
  - "engine/index.ts re-exporta V4ProductionRunner (consumible desde @/lib/agents/engine)"
affects:
  - src/lib/agents/engine/v4-production-runner.ts (NEW)
  - src/lib/agents/engine/index.ts (re-export V4ProductionRunner)
  - src/lib/agents/engine/types.ts (extend agentModule union — Rule 3)
  - package.json + package-lock.json (deps installed in Task 1, commit 3122fce)
tech-stack:
  added:
    - "@ai-sdk/google@^3.0.67 (Gemini provider — Plan 05 swap target en comprehension + nunca-decir)"
    - "@ai-sdk/openai@^3.0.61 (GPT-4o mini provider — Plan 05 swap target en sub-loop)"
  patterns:
    - "Duplicated runner pattern (D-13): cero shared helpers, cero abstract base — clon byte-by-byte para que cuando v3 muera se borre limpio"
    - "Single-route runner: v4 SOLO atiende somnio-sales-v4 (cero branches por agentModule)"
key-files:
  created:
    - src/lib/agents/engine/v4-production-runner.ts (560 lines)
    - .planning/standalone/somnio-sales-v4-runtime-wiring/01-SUMMARY.md
  modified:
    - src/lib/agents/engine/index.ts (+1 line: re-export V4ProductionRunner)
    - src/lib/agents/engine/types.ts (extend agentModule union: add 'somnio-v4')
    - package.json + package-lock.json (deps committed Task 1, hash 3122fce)
decisions:
  - D-9 honored: deps @ai-sdk/google + @ai-sdk/openai instaladas con versions lockeadas del RESEARCH (^3.0.67 y ^3.0.61)
  - D-13 honored: V4ProductionRunner clonado 100% mecánico — cero shared helpers, cero abstract base, cero refactor a V3ProductionRunner
  - D-15 honored: rate-limit bucket aislado vive en routes/middleware (fuera del runner). Runner no referencia rate-limit hardcoded
  - D-30 honored: env vars custom names confirmadas en Vercel (GOOGLE_GENERATIVE_AI_API_KEY default, OPENAI_API_KEY_SALESV4 con sufijo para aislar key de v4 sub-loop de KB sync)
  - Regla 6 honored: cero edits a v3-production-runner.ts (git diff vacío post-commit)
metrics:
  commits: 3 (Task 1 = 3122fce upstream, Task 3 = c9c8323, SUMMARY = pending)
  lines_added: ~560 (v4-production-runner.ts) + 2 (index.ts + types.ts)
  files_created: 1 (v4-production-runner.ts)
  files_modified: 2 (index.ts, types.ts)
  clone_similarity_pct: ~95
---

# Phase somnio-sales-v4-runtime-wiring Plan 01: Setup deps + V4ProductionRunner skeleton — Summary

Wave 0 setup completo: deps `@ai-sdk/google` + `@ai-sdk/openai` instaladas con versions lockeadas de RESEARCH, env vars Vercel confirmadas, y `V4ProductionRunner` clonado 100% mecánico de `V3ProductionRunner` (D-13) con substituciones literales aplicadas y switch routing reducido a single-path `import('../somnio-v4')`. v3-production-runner.ts intocado (Regla 6).

## Resultado por Task

### Task 1: Instalar deps AI SDK Google + OpenAI (D-9, D-30) ✓

**Estado: ALREADY COMMITTED (commit `3122fce` upstream — orchestrator).**

Verificado post-hoc en `package.json`:

```json
"@ai-sdk/google": "^3.0.67",
"@ai-sdk/openai": "^3.0.61",
```

Versions exactas lockeadas (matching RESEARCH §Setup ejecutado).

- `@ai-sdk/google@^3.0.67` → consumido en Plan 05 (`comprehension.ts:84`, `sub-loop/nunca-decir-check.ts:34` — Gemini 2.5 Flash-Lite por D-30).
- `@ai-sdk/openai@^3.0.61` → consumido en Plan 05 (`sub-loop/index.ts:54` — GPT-4o mini, único viable para tools+Output.object combinados, D-30 Pitfall LoopOutcome).

`@ai-sdk/anthropic@^3.0.43` y `ai@^6.0.86` ya estaban presentes (intactos).

Compatibility OK con AI SDK v6 (RESEARCH §B1 confirmó schema parity Gemini ↔ Anthropic con re-shape `LoopOutcomeSchema` deferido a Plan 02 — D-29).

### Task 2: HALT checkpoint — Confirmar env vars Vercel (D-30) ✓

**Estado: SATISFIED via chat confirmation pre-execution.**

Confirmación textual del usuario (verbatim): **"ESTOY si."**

Esto satisface el contract del checkpoint:
- `GOOGLE_GENERATIVE_AI_API_KEY` presente en Production scope (lookup default de `@ai-sdk/google`).
- `OPENAI_API_KEY_SALESV4` presente en Production scope (sufijo custom `_SALESV4` deliberado por D-30 — aísla la key de v4 sub-loop de la key vieja `OPENAI_API_KEY` de KB sync con scopes restringidos). Plan 05 usa `createOpenAI({ apiKey: process.env.OPENAI_API_KEY_SALESV4 })`.

Sin redeploy requerido en este Plan — el redeploy efectivo lo hace push de Plans 04/05 cuando el modelo swap entre en producción.

### Task 3: Clonar v3-production-runner.ts → v4-production-runner.ts (D-13) ✓

**Estado: COMMITTED en `c9c8323`.**

#### Substituciones literales aplicadas

| De (v3) | A (v4) |
|---|---|
| `V3ProductionRunner` (class name + 1 referencia recursiva en `processMessage(input, retryCount + 1)`) | `V4ProductionRunner` |
| Header comment "Somnio Sales Agent v3" | "Somnio Sales Agent v4 (standalone: somnio-sales-v4-runtime-wiring, D-13)" |
| `[V3-RUNNER]` (logger prefix, 14 occurrences) | `[V4-RUNNER]` |
| `agentModule: this.config.agentModule ?? 'somnio-v3'` | `?? 'somnio-v4'` |
| `shouldWriteAgentModule = ... && this.config.agentModule !== 'somnio-v3'` | `!== 'somnio-v4'` |
| `import type { V3AgentInput, V3AgentOutput, ProcessedMessage } from '../somnio-v3/types'` | `import type { V4AgentInput, V4AgentOutput, ProcessedMessage } from '../somnio-v4/types'` |
| Variable types `V3AgentInput` / `V3AgentOutput` | `V4AgentInput` / `V4AgentOutput` |
| Error codes `V3_AGENT_ERROR` / `V3_ENGINE_ERROR` | `V4_AGENT_ERROR` / `V4_ENGINE_ERROR` |
| Switch routing en línea 153 (5 branches: godentist / godentist-fb-ig / somnio-recompra / somnio-pw-confirmation / else somnio-v3) | **Reemplazado por single-path:** `const { processMessage } = await import('../somnio-v4'); output = await processMessage(v4Input)` |

**Preservado verbatim (clone fidelity):**

- `_v3:` namespace keys en `datos_capturados` (DB compat) — 14 occurrences mantenidas: `_v3:pendingUserMessage`, `_v3:preloaded`, `_v3:agent_module`, `_v3:accionesEjecutadas`, `_v3:ofiInter`. Cuando v3 sessions se cierran al flip (D-38 padre), v4 arranca con sessions nuevas y la convención queda como artefacto histórico inofensivo.
- Path A / Path B interruption handling (líneas ~218+ del v4)
- `NoRepetitionFilter` wiring con flag legacy `USE_NO_REPETITION` — Plan 06 refactoriza a `USE_NO_REPETITION_V4` (D-16)
- `VersionConflictError` retry logic con `MAX_VERSION_CONFLICT_RETRIES = 3`
- `EngineInput` / `EngineOutput` / `EngineAdapters` / `EngineConfig` contract intacto

**Eliminado del v4 runner (no aplica):**

- `applyGodentistValTagIfNeeded()` (~50 líneas) + su llamada en sección 4b. V4 SOLO atiende `somnio-sales-v4` — godentist y godentist-fb-ig siguen en V3 runner (Regla 6).
- 4 branches del switch routing (~25 líneas) — godentist, godentist-fb-ig, somnio-recompra, somnio-pw-confirmation siguen ruteándose vía `V3ProductionRunner`.

#### Diff stats

| Archivo | Líneas |
|---|---|
| v3-production-runner.ts | 648 |
| v4-production-runner.ts | 560 |
| Diferencia | -88 líneas (~13.6%) |
| Similarity overlap | ~95% donde la lógica es paralela |

Las 88 líneas eliminadas vienen de:
- `applyGodentistValTagIfNeeded()` + JSDoc de godentist VAL tag (~50 líneas)
- 4 branches del switch routing godentist/godentist-fb-ig/somnio-recompra/somnio-pw-confirmation (~25 líneas)
- Comentarios godentist/recompra-specific (~13 líneas)

#### Divergencia V3AgentInput vs V4AgentInput

**Ninguna divergencia que requiera adaptación inline.** Comparación de los 2 shapes en `somnio-v3/types.ts:136` vs `somnio-v4/types.ts:141`:

| Campo | V3 | V4 |
|---|---|---|
| `message: string` | ✓ | ✓ idéntico |
| `history: ...[]` | ✓ | ✓ idéntico |
| `currentMode: string` | ✓ | ✓ idéntico |
| `intentsVistos: string[]` | ✓ | ✓ idéntico |
| `templatesEnviados: string[]` | ✓ | ✓ idéntico |
| `datosCapturados: Record<string,string>` | ✓ | ✓ idéntico |
| `packSeleccionado: string \| null` | ✓ | ✓ idéntico |
| `accionesEjecutadas?: AccionRegistrada[]` | ✓ | ✓ **idéntico** (D-26 padre — V4 usa el mismo first-class field) |
| `turnNumber: number` | ✓ | ✓ idéntico |
| `workspaceId: string` | ✓ | ✓ idéntico |
| `systemEvent?: SystemEvent` | ✓ | ✓ idéntico |
| `sessionId?: string` | ✓ | ✓ idéntico |

V4AgentOutput agrega 1 campo opcional NUEVO: `requiresHuman?: boolean` (D-60 padre — sub-loop no_match flag) que no afecta el path de save state ni construcción del input. El runner lo ignora a propósito en este Plan; Plan 12 padre wires esto a `session_state.requires_human` via webhook-processor + storage adapter.

Cero TODO comments necesarios — el clone es directo.

#### Verification gates (todos pass)

| Gate | Resultado |
|---|---|
| `test -f src/lib/agents/engine/v4-production-runner.ts` | OK |
| `grep -q "export class V4ProductionRunner"` | OK (1 match) |
| `grep -c "V4AgentInput"` | 3 matches |
| `grep -c "V4AgentOutput"` | 2 matches |
| `grep -q "import('../somnio-v4')"` | OK (1 match) |
| `grep -q "V4ProductionRunner" engine/index.ts` | OK (1 match — re-export) |
| `git diff v3-production-runner.ts` | empty (Regla 6 — v3 intocado) |
| `npx tsc --noEmit` errores en v4-production-runner.ts | 0 |
| Forbidden literals (`'godentist'`, `'somnio-recompra'`, `'somnio-pw-confirmation'`, `'somnio-v3'`, `'godentist-fb-ig'`) | 0 |
| `_v3:` namespace keys preservados (DB compat) | 14 occurrences (esperado) |

Baseline tsc tiene 2 errores pre-existentes en `src/lib/domain/__tests__/conversations.test.ts` (TS7022/TS7024 sobre `eqMock`) — **no relacionados con Plan 01**, presentes desde antes del commit `3122fce`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extender union `EngineConfig.agentModule` para incluir `'somnio-v4'`**
- **Found during:** Task 3 — al escribir `agentModule: this.config.agentModule ?? 'somnio-v4'`, TypeScript rechaza con type error (`'somnio-v4'` no asignable al union actual).
- **Issue:** `EngineConfig.agentModule` en `src/lib/agents/engine/types.ts:158` es union literal cerrado: `'somnio-v3' | 'godentist' | 'somnio-recompra' | 'somnio-pw-confirmation' | 'godentist-fb-ig'`. Sin extender, el V4ProductionRunner no compila.
- **Fix:** Añadir `'somnio-v4'` al union — cambio aditivo de 1 valor en literal type.
- **Files modified:** `src/lib/agents/engine/types.ts` (1 línea)
- **Commit:** `c9c8323` (incluido en Task 3 commit)
- **Impact assessment:** Cero afectación a v3-production-runner.ts (no usa el nuevo valor). Cero afectación a otros consumidores actuales del union (sandbox, webhook-processor) — todos siguen pasando los valores existentes. El nuevo valor `'somnio-v4'` solo lo usa el V4ProductionRunner. **NO viola Regla 6** (v3 sigue intocado).
- **Rationale:** Plan listed `files_modified` como `[package.json, package-lock.json, v4-production-runner.ts, engine/index.ts]`. La extensión de `types.ts` no estaba en la lista pero es **bloqueante** para que el runner compile. Aplicar Rule 3 es correcto — sin esto el plan no puede declarar Task 3 done.

### Auth gates

Task 2 fue un `checkpoint:human-action` para verificar env vars en Vercel. El usuario confirmó verbatim "ESTOY si." pre-execution, satisfaciendo el contract sin pause. Documentado en flujo normal del Task 2.

## Threat Flags

Ninguno. El V4ProductionRunner no introduce nueva surface de seguridad — usa los mismos adapters (Storage, Timer, Messaging, Orders, Debug) que V3ProductionRunner que ya pasaron threat-model en standalone padre. Cero nuevos endpoints, cero nuevas auth paths, cero nuevos schema changes.

## Known Stubs

Ninguno. El runner está completo y compila. Plan 06 refactorizará el flag `USE_NO_REPETITION` → `USE_NO_REPETITION_V4` (D-16) — eso es deuda planificada, no stub.

## Próximo paso

Plan 02 (`02-PLAN.md`): re-shape `LoopOutcomeSchema` (D-29) — eliminar `z.discriminatedUnion` + `z.literal(false)` + `z.record` que TODOS los providers (Anthropic, Gemini, OpenAI) rechazan, reemplazar por `z.object` + `z.enum` + `z.nullable` + validación post-hoc en `sub-loop/index.ts`. Bloqueante para Plan 05 (model swap) que necesita el schema compatible con Gemini + GPT-4o mini.

## Self-Check

**Status: PASSED**

Verificaciones ejecutadas post-write:

1. `test -f src/lib/agents/engine/v4-production-runner.ts` → FOUND
2. `git log --oneline -5` muestra commit `c9c8323` (Task 3) y `3122fce` (Task 1) → FOUND
3. `git diff src/lib/agents/engine/v3-production-runner.ts` → empty (Regla 6 honored)
4. `npx tsc --noEmit 2>&1 | grep "v4-production-runner"` → 0 errors
5. `grep -c "_v3:"` → 14 (preservados intencionalmente para DB compat)
6. Forbidden literals (`'godentist'`, `'somnio-recompra'`, `'somnio-pw-confirmation'`, `'somnio-v3'`, `'godentist-fb-ig'`) → 0 occurrences
7. `engine/index.ts` re-exporta V4ProductionRunner → confirmed
8. Task 1 deps committed upstream (3122fce) — verificable en `package.json` con versions ^3.0.67 / ^3.0.61
