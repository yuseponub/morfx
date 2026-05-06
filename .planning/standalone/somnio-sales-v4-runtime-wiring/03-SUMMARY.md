---
phase: somnio-sales-v4-runtime-wiring
plan: 03
subsystem: somnio-v4 sandbox runtime
tags: [v4-runtime-wiring, engine-v4, sandbox-route, sandbox-wrapper, debug-turn-extension, b-2-fix, gemini-flash-lite]
wave: 2
depends_on: [01, 02]
status: complete
date_completed: 2026-05-06
duration_estimate: ~1h
addresses_decisions: [D-1, D-13, D-14, D-19, D-20, D-21, D-22, D-30]
addresses_research_pitfalls: [B-2]
requires:
  - Plan 01 shipped (V4ProductionRunner + deps + env vars confirmed)
  - Plan 02 shipped (LoopOutcomeSchema flat + invariant validation)
provides:
  - "src/lib/agents/somnio-v4/engine-v4.ts — SomnioV4Engine sandbox wrapper paralelo a SomnioV3Engine"
  - "Branch agentId === 'somnio-sales-v4' en /api/sandbox/process/route.ts (additivo)"
  - "DebugTurn extendido en src/lib/sandbox/types.ts con 4 campos opcionales (subLoopReason / kbHits / nuncaDecirMatches / threshold) — D-20"
  - "AnyModelId union en src/lib/agents/types.ts (ClaudeModel | NonAnthropicModelId) — habilita gemini-2.5-flash-lite + gpt-4o-mini en ModelTokenEntry.model (D-30)"
affects:
  - src/lib/agents/somnio-v4/engine-v4.ts (NEW)
  - src/app/api/sandbox/process/route.ts (additive branch)
  - src/lib/sandbox/types.ts (DebugTurn V4 extensions)
  - src/lib/agents/types.ts (NonAnthropicModelId + AnyModelId — Rule 3 fix)
tech-stack:
  added: []
  patterns:
    - "Sandbox wrapper duplicate (D-13): clon mecanico de engine-v3.ts con substituciones literales — cero shared helpers"
    - "Dynamic import del engine-v4 dentro del branch (vs static import en v3) — cold-start ligero del sandbox endpoint"
    - "DebugTurn extension via campos opcionales (D-20) — UI renderiza condicional sin tab nueva"
    - "Type union additive (AnyModelId = ClaudeModel | NonAnthropicModelId) — Plan 05 model swap usa el nuevo subset sin tocar consumidores existentes"
key-files:
  created:
    - src/lib/agents/somnio-v4/engine-v4.ts (191 lines)
    - .planning/standalone/somnio-sales-v4-runtime-wiring/03-SUMMARY.md
  modified:
    - src/app/api/sandbox/process/route.ts (+20 lines — branch additivo)
    - src/lib/sandbox/types.ts (+15 lines — DebugTurn V4 extensions)
    - src/lib/agents/types.ts (+22 lines — NonAnthropicModelId + AnyModelId + ModelTokenEntry update)
decisions:
  - D-1 honored: V4 engine completamente separado de V3 — cero shared helpers, cero imports cross-package
  - D-13 honored: clon mecanico (similarity ~95% donde la logica es paralela) — 121 lineas compartidas / 14 lineas exclusivas v3 / 43 lineas exclusivas v4
  - D-14 honored: sub-loop NO se invoca en processSystemEvent (timer events) — el engine wrapper solo propaga systemEvent al agent que ya respeta esto
  - D-19 honored: mapping SandboxState <-> V4AgentInput interno al engine; namespace _v3: preservado en datosCapturados (DB compat)
  - D-20 honored: DebugTurn extendido con 4 campos opcionales (subLoopReason, kbHits, nuncaDecirMatches, threshold) — UI condicional, NO tab nueva
  - D-21 honored: retomas simuladas en sandbox via systemEvent propagation (mismo patron v3)
  - D-22 honored: KB real (Supabase prod, workspace Somnio) — engine wrapper propaga workspaceId al agent que internamente usa RPC match_knowledge_base
  - D-30 honored: gemini-2.5-flash-lite literal en debugTurn.tokens.models (B-2 swap at clone time); cero TODO comments
  - Regla 6 honored: cero edits a engine-v3.ts (git diff vacio); cero edits a sub-loop/ + somnio-v4-agent.ts (Plan 02 surface intacta); cero edits a v2/v3/recompra/pw-confirmation
metrics:
  commits: 3 (Task 1 = cd2f70f, Task 2 = 0a71cae, SUMMARY = pending)
  lines_added: 191 (engine-v4.ts) + 20 (route.ts) + 15 (sandbox/types.ts) + 22 (agents/types.ts) = 248
  files_created: 2 (engine-v4.ts + SUMMARY.md)
  files_modified: 3 (route.ts, sandbox/types.ts, agents/types.ts)
  clone_similarity_pct: ~95
  tsc_clean: true (0 errores en touched files; 2 baselines pre-existentes en domain/__tests__/conversations.test.ts)
  unit_tests_passing: 60/60 (somnio-v4 suite, sin regresiones)
---

# Phase somnio-sales-v4-runtime-wiring Plan 03: engine-v4 sandbox wrapper + route branch — Summary

Wave 2 sandbox wiring completo: `SomnioV4Engine` clonado mecanicamente de `SomnioV3Engine` (D-13), branch additivo en `/api/sandbox/process/route.ts` para enrutar `agentId === 'somnio-sales-v4'`, DebugTurn extendido con 4 campos opcionales para metadata del sub-loop (D-20), y B-2 fix aplicado at clone time (literal `claude-haiku-4-5` -> `gemini-2.5-flash-lite` en debugTurn.tokens.models). Plan 07 (Smoke A — sandbox) puede ahora testear v4 desde el dropdown de UI.

## engine-v4.ts vs engine-v3.ts diff stats

| Metric | Value |
|---|---|
| engine-v3.ts lines | 162 |
| engine-v4.ts lines | 191 |
| Net delta | +29 lines |
| Shared lines (clone) | ~121 |
| Lines exclusive to v3 | 14 (post-substitutions) |
| Lines exclusive to v4 | 43 (post-substitutions) |
| Clone similarity overlap | ~95% donde la logica es paralela |

Las 29 lineas netas adicionales en v4 vienen de:
- Header docstring extendido (~15 lineas) documentando D-19/D-20/D-21/D-22/D-30 + B-2 fix rationale.
- TODO Plan 06 comment block (~6 lineas) sobre surface efectivo de subLoopReason/kbHits/nuncaDecirMatches/threshold del V4AgentOutput al debugTurn.
- Comentario adicional sobre namespace `_v3:` preservado en cleanup de datosCapturados.
- Comentario de "El namespace `_v3:` se preserva para DB compat" en limpia de keys.

## Substituciones literales aplicadas (clone fidelity)

| De (engine-v3.ts) | A (engine-v4.ts) |
|---|---|
| `import { processMessage } from './somnio-v3-agent'` | `import { processMessage } from './somnio-v4-agent'` |
| `interface V3EngineInput` | `interface V4EngineInput` |
| `interface V3EngineOutput` | `interface V4EngineOutput` |
| `class SomnioV3Engine` | `class SomnioV4Engine` |
| `[SomnioV3Engine]` log prefix | `[SomnioV4Engine]` |
| `code: 'V3_ENGINE_ERROR'` | `code: 'V4_ENGINE_ERROR'` |
| `model: 'claude-haiku-4-5' as const` | `model: 'gemini-2.5-flash-lite' as const` (B-2 fix) |
| `[Error v3]` mensaje user-visible | `[Error v4]` mensaje user-visible |
| File header comment "v3 Engine - Minimal Sandbox Runner" | "v4 Engine - Minimal Sandbox Runner" + bloque diferencias |

## B-2 fix verification

Grep guard mantenido por Plan 05 phase-wide (`claude-haiku-4-5` cero matches en `src/lib/agents/somnio-v4/`):

```bash
$ grep -c "claude-haiku-4-5" src/lib/agents/somnio-v4/engine-v4.ts
0  # PASS
```

```bash
$ grep -q "gemini-2.5-flash-lite" src/lib/agents/somnio-v4/engine-v4.ts && echo "PASS"
PASS  # debugTurn.tokens.models[].model literal swap completo
```

Razon: El campo `debugTurn.tokens.models[].model` es display-only para el debug panel del sandbox UI (NO afecta runtime behavior — el modelo real se invoca en `comprehension.ts:84` via Plan 05). Si Plan 03 dejara el literal Haiku con un TODO comment, el grep guard de Plan 05 (`grep -rn "claude-haiku-4-5" src/lib/agents/somnio-v4/`) fallaria — Plan 05 no incluye `engine-v4.ts` en sus `files_modified`. Solucion: swap at clone time aqui.

## DebugTurn extension (D-20)

`src/lib/sandbox/types.ts` interface `DebugTurn` extendido con 4 campos opcionales (NO se creo interface nueva, NO se anadio tab nueva en UI):

```typescript
// V4 extensions (standalone: somnio-sales-v4-runtime-wiring / Plan 03 / D-20)
subLoopReason?: 'low_confidence' | 'crm_mutation' | 'cas_reject' | 'razonamiento_libre'
kbHits?: Array<{ topic: string; score: number }>
nuncaDecirMatches?: string[]
threshold?: number
```

**Surface efectivo deferred a Plan 06.** Hoy V4AgentOutput NO expone estos campos en top-level (solo emite via observability events `pipeline_decision:subloop_*`). El wrapper engine-v4.ts incluye un TODO comment explicando que cuando V4AgentOutput suba la metadata al top-level (Plan 06), el mapping aqui se cablea sin cambiar el shape de DebugTurn.

UI consumer (debug panel sandbox) renderiza condicional: si `debugTurn.subLoopReason` es undefined, no se muestra el bloque sub-loop debug. Cero impacto a v3 (que jamas setea estos campos).

## Mapeo SandboxState <-> V4AgentInput (D-19)

**Cero divergencia que requiera adaptacion inline.** Comparacion de los 2 shapes confirma paridad campo-a-campo (Plan 01 SUMMARY ya lo habia documentado para V3AgentInput vs V4AgentInput):

| Campo | V3 SandboxState input | V4AgentInput |
|---|---|---|
| `message: string` | ✓ | ✓ identico |
| `currentMode: string` | ✓ | ✓ identico |
| `intentsVistos: string[]` | ✓ | ✓ identico |
| `templatesEnviados: string[]` | ✓ | ✓ identico |
| `datosCapturados: Record<string, string>` | ✓ | ✓ identico |
| `packSeleccionado: string \| null` | ✓ | ✓ identico |
| `accionesEjecutadas?: AccionRegistrada[]` | ✓ | ✓ identico (D-26 padre — V4 usa el mismo first-class field) |
| `history: ...[]` | ✓ | ✓ identico |
| `turnNumber: number` | ✓ | ✓ identico |
| `workspaceId: string` | ✓ | ✓ identico |
| `systemEvent?: SystemEvent` | ✓ | ✓ identico |

**Output side (V4AgentOutput vs V3AgentOutput):** V4 agrega `requiresHuman?: boolean` (D-60 padre) que el wrapper engine-v4 ignora hoy — Plan 12 padre wirea esto a `session_state.requires_human` via webhook-processor + storage adapter. Cero impacto al sandbox flow.

Namespace `_v3:` preservado en cleanup de datosCapturados:
```typescript
delete newState.datosCapturados['_v3:accionesEjecutadas']
delete newState.datosCapturados['_v3:templatesMostrados']
```
Razon: estas keys legacy se reconstruyen automaticamente desde first-class fields (`accionesEjecutadas`, `templatesMostrados`) cuando v4 procesa state. Sessions productivas tras flip pueden tener estas keys staleras de la era v3 — la limpia las elimina pero el namespace `_v3:` sigue siendo el storage prefix para datos serializados (D-19 hace explicito que NO cambia a `_v4:`).

## Branch v4 en route.ts

Insercion ~20 lineas (lineas 127-146 nuevas) entre el branch `recompra-v1` (linea 113-125) y el bloque V1 default. Cero deletions, cero modificaciones a otras lineas:

```bash
$ git show HEAD --stat src/app/api/sandbox/process/route.ts
 src/app/api/sandbox/process/route.ts | 20 ++++++++++++++++++++
 1 file changed, 20 insertions(+)
```

Orden final de branches:

| Linea | Branch |
|---|---|
| 82 | `if (agentId === 'somnio-sales-v2')` |
| 97 | `if (agentId === 'somnio-sales-v3')` |
| 113 | `if (agentId === 'somnio-recompra-v1')` |
| **133** | **`if (agentId === 'somnio-sales-v4')`** ← NUEVO |
| ~150 | default V1 (UnifiedEngine) |

**Dynamic import (vs static al top como v3):**
- v3 hace `import { SomnioV3Engine } from '@/lib/agents/somnio-v3/engine-v3'` al top (linea 17). Patron establecido del codebase.
- v4 prefiere `await import('@/lib/agents/somnio-v4/engine-v4')` dentro del branch para:
  1. Evitar carga del agentRegistry.register(somnioV4Config) en cada request del sandbox endpoint cuando agentId !== 'somnio-sales-v4' (cold-start tax).
  2. Permitir que tests del endpoint sin agentId='somnio-sales-v4' no carguen v4 module.
  3. Consistente con webhook-processor que tambien hara dynamic import de v4 en Plan 04 (mismo patron godentist-fb-ig anti-cold-lambda race).

## Verification gates (todos PASS)

| # | Gate | Resultado |
|---|---|---|
| 1 | `test -f src/lib/agents/somnio-v4/engine-v4.ts` | PASS |
| 2 | `grep -q "export class SomnioV4Engine" engine-v4.ts` | PASS |
| 3 | `grep -c "claude-haiku-4-5" engine-v4.ts` returns `0` | PASS (B-2 fix verified) |
| 4 | `grep -q "gemini-2.5-flash-lite" engine-v4.ts` | PASS |
| 5 | `grep -q "agentId === 'somnio-sales-v4'" route.ts` | PASS |
| 6 | engine routes to v4 agent (`from './somnio-v4-agent'`) | PASS |
| 7 | `grep -c "from '\.\./somnio-v3" engine-v4.ts` returns `0` | PASS (no imports from v3) |
| 8 | `git diff src/lib/agents/somnio-v3/engine-v3.ts` empty | PASS (Regla 6) |
| 9 | `git diff sub-loop/ + somnio-v4-agent.ts` empty | PASS (Plan 02 surface intacta) |
| 10 | `npx tsc --noEmit` errors en touched files | PASS (0 errors; 2 baselines pre-existentes en domain/__tests__/conversations.test.ts no relacionados) |
| 11 | route.ts diff additive only (no deletions) | PASS (`20 insertions(+), 0 deletions`) |
| Bonus | `grep -c "V3_ENGINE_ERROR" engine-v4.ts` returns `0` | PASS |
| Bonus | `grep -c "SomnioV3Engine" engine-v4.ts` returns `0` | PASS |
| Bonus | 60/60 somnio-v4 tests pass post-changes | PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Extender ClaudeModel union para acomodar gemini-2.5-flash-lite literal**

- **Found during:** Task 1 — al agregar `model: 'gemini-2.5-flash-lite' as const` al ModelTokenEntry, TypeScript rechaza con `error TS2322: Type '"gemini-2.5-flash-lite"' is not assignable to type 'ClaudeModelId'`.
- **Issue:** `ModelTokenEntry.model` en `src/lib/agents/types.ts:479` declarado como `ClaudeModel` (alias de `ClaudeModelId = 'claude-haiku-4-5' | 'claude-sonnet-4-5'`). Sin extender, engine-v4.ts no compila.
- **Fix:** Agregado a `src/lib/agents/types.ts`:
  - Type alias `NonAnthropicModelId = 'gemini-2.5-flash-lite' | 'gpt-4o-mini'` (D-30 stack mixto definitivo).
  - Type alias `AnyModelId = ClaudeModel | NonAnthropicModelId`.
  - `ModelTokenEntry.model: AnyModelId` (cambio de `ClaudeModel` -> `AnyModelId`).
- **Files modified:** `src/lib/agents/types.ts` (+22 lineas: 2 type aliases + JSDoc + comment update en ModelTokenEntry).
- **Commit:** `cd2f70f` (Task 1 — incluido en mismo commit).
- **Impact assessment:** Cambio aditivo — `ClaudeModel ⊂ AnyModelId`. Cero impacto a consumidores existentes que pasan `ClaudeModelId`:
  - v3-production-runner.ts: pasa literal `'claude-haiku-4-5'` -> sigue valido (subset de AnyModelId).
  - godentist / recompra / pw-confirmation: idem.
  - sandbox/types.ts (DebugTurn.tokens via TokenInfo.models): mismo TokenInfo.models -> ModelTokenEntry[] -> sigue compatible.
  - Plan 05 (model swap): podra usar literales `'gemini-2.5-flash-lite'` y `'gpt-4o-mini'` directamente en ModelTokenEntry sin nuevos type errors.
- **Rationale:** Plan listed `files_modified` solo `engine-v4.ts` y `route.ts`. La extension de `agents/types.ts` no estaba en la lista pero es **bloqueante** (TS error). Aplicar Rule 3 es correcto — sin esto Task 1 no podia declarar done. NO viola Regla 6 (cambio aditivo, cero impacto a v3/godentist/recompra/pw-confirmation).
- **D-30 alignment:** El stack mixto definitivo (Gemini Flash-Lite + GPT-4o mini) es exactamente lo que NonAnthropicModelId enumera. El cambio anticipa Plan 05 y mantiene type safety en el repo.

**2. [Rule 3 — Tracking only] DebugTurn extension en `src/lib/sandbox/types.ts`**

- **Found during:** Task 1 — el plan especifica D-20 ("extender DebugTurn con campos opcionales") como parte del action list, NO como files_modified directo. El plan asume que DebugTurn ya soporta los campos o que se anaden inline.
- **Action:** Anadidos 4 campos opcionales (`subLoopReason`, `kbHits`, `nuncaDecirMatches`, `threshold`) a la interfaz `DebugTurn` con JSDoc y comment block referenciando Plan 03 / D-20.
- **Files modified:** `src/lib/sandbox/types.ts` (+15 lineas).
- **Commit:** `cd2f70f` (Task 1 — incluido).
- **Impact assessment:** Cero impacto a v3 / sandbox consumers existentes — todos los campos son opcionales. UI debug panel renderiza condicional. Las 4 keys son nuevas (cero collision con campos existentes).
- **Rationale:** El plan menciona `src/lib/sandbox/types.ts` en read_first y describe explicitamente que la extension va alli si DebugTurn no tenia los campos. NO es deviation real — es trabajo planificado dentro del Task 1.

### Auth gates

Ninguno. Plan 03 es 100% codigo + types — no tocan secretos ni env vars. Las env vars (GOOGLE_GENERATIVE_AI_API_KEY + OPENAI_API_KEY_SALESV4) ya quedaron confirmadas en Plan 01 Task 2.

## Threat Flags

Ninguno. Cero nueva surface de seguridad:
- engine-v4.ts es wrapper sandbox — usa los mismos adapters/agent que el padre standalone shipped.
- route.ts branch adicional reusa el mismo path de auth (`createClient` + `auth.getUser` + workspace_members check) que las branches v2/v3/recompra.
- types.ts changes son solo type aliases (cero runtime).

## Known Stubs

Ninguno hard. Existen 2 TODO comments planificados:

1. **`engine-v4.ts:78-83` (TODO Plan 06):** mapeo de `subLoopReason / kbHits / nuncaDecirMatches / threshold` desde V4AgentOutput al `debugTurn`. Hoy esos campos solo viven en observability events; cuando V4AgentOutput los suba al top-level (Plan 06), el mapping aqui se cablea sin re-shape de DebugTurn (los campos opcionales ya existen).

2. **DebugTurn surface display:** la UI debug panel (`/agentes/sandbox` componentes) podra eventualmente renderizar bloque dedicado si los 4 campos populados. Hoy renderiza condicional sin tab nueva (D-20 explicito: "extender, no crear tab nueva").

Ambos son deuda planificada, no stubs runtime — Plan 03 cierra completo el contract Wave 2.

## Proximo paso

**Plan 04 / Wave 3 (`04-PLAN.md` cuando exista):** branch `agentId === 'somnio-sales-v4'` en `src/lib/agents/production/webhook-processor.ts:740`. Patron paralelo a este Plan 03 (sandbox), pero para WhatsApp inbound productivo. Pre-warm + dispatch (mismo patron godentist-fb-ig anti-cold-lambda race). Plan 05 / Wave 3 (paralelo) cablea el modelo swap (Haiku -> Gemini Flash-Lite + GPT-4o mini) en los 3 calls activos (comprehension + sub-loop + nunca-decir).

## Self-Check

**Status: PASSED**

Verificaciones ejecutadas post-write:

| # | Check | Resultado |
|---|---|---|
| 1 | Files created — engine-v4.ts | FOUND (191 lines) |
| 2 | Files created — 03-SUMMARY.md | FOUND (este archivo) |
| 3 | Commits exist — cd2f70f (Task 1) | FOUND via `git log --oneline -3` |
| 4 | Commits exist — 0a71cae (Task 2) | FOUND |
| 5 | Gate 1: file exists | PASS |
| 6 | Gate 2: SomnioV4Engine class export | PASS |
| 7 | Gate 3: 0 claude-haiku-4-5 (B-2 fix) | PASS |
| 8 | Gate 4: gemini-2.5-flash-lite present | PASS |
| 9 | Gate 5: route.ts v4 branch | PASS |
| 10 | Gate 6: engine routes to v4 agent | PASS |
| 11 | Gate 7: 0 imports from somnio-v3 | PASS |
| 12 | Gate 8: engine-v3.ts intacto (Regla 6) | PASS |
| 13 | Gate 9: sub-loop + agent intactos | PASS |
| 14 | Gate 10: tsc 0 errores en touched files | PASS |
| 15 | Gate 11: route.ts additive only (20+/0-) | PASS |
| 16 | Bonus: V3_ENGINE_ERROR 0 matches | PASS |
| 17 | Bonus: SomnioV3Engine 0 references | PASS |
| 18 | Bonus: 60/60 somnio-v4 tests pass | PASS |
| 19 | Regla 6: git diff v3-production-runner / godentist / recompra / pw-confirmation | PASS (vacio) |
