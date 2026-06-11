---
phase: standalone/gemini-fallback-haiku
plan: 02
subsystem: somnio-v4-subloop
tags: [ai-sdk, gemini, anthropic, fallback, somnio-v4, sub-loop, vitest, rag-generative]

# Dependency graph
requires:
  - "Plan 01 — modulo llm-fallback/ (callWithGeminiFallback<T>({ callSite, gemini, anthropic }) + CallSite + __resetBreakers)"
provides:
  - "generation-call.ts con fallback Gemini→Haiku 4.5 (callSite 'generation') — N=1 + timeout guard + circuit-breaker"
  - "compliance-check.ts con fallback Gemini→Haiku 4.5 (callSite 'compliance') — early-return preservado + system prompt factorizado y compartido entre branches"
  - "Suite de paridad fallback-parity.test.ts — asserta D-09 (mismo shape Gemini/Anthropic) via GenerationOutputSchema/ComplianceCheckSchema.parse"
affects: [somnio-v4, llm-fallback-call-site-wiring, gemini-fallback-haiku-wave2]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wiring de call-site LLM con callWithGeminiFallback: 2 closures (gemini con maxRetries:0+abortSignal+safetySettings, anthropic con @ai-sdk/anthropic literal claude-haiku-4-5 SIN providerOptions.google)"
    - "Factorizacion de system prompt + messages a const local compartida entre ambos branches → paridad D-09 garantizada estructuralmente (no por copy-paste)"
    - "Parity test helper-direct: testear via callWithGeminiFallback con closures puras + *.Schema.parse(result.output) en vez de mockear inline-provider-construction (mas estable que vi.mock de @ai-sdk/*)"

key-files:
  created:
    - src/lib/agents/somnio-v4/sub-loop/__tests__/fallback-parity.test.ts
  modified:
    - src/lib/agents/somnio-v4/sub-loop/generation-call.ts
    - src/lib/agents/somnio-v4/sub-loop/compliance-check.ts

key-decisions:
  - "Test strategy = helper-direct (la 'mas simple y robusta' del plan): closures gemini/anthropic puras + Schema.parse asserta paridad de shape sin acoplarse a la construccion inline de google()/anthropic() dentro de runGenerationCall/checkCompliance"
  - "system prompt + user message de compliance-check factorizados a const (systemPrompt/userMessages) — evita duplicar ~150 lineas y garantiza D-09 (mismo prompt en ambos branches)"
  - "messages de generation factorizado a const compartida (mismo motivo)"

patterns-established:
  - "MockLanguageModelV3 (ai/test) anotado como disponible para smoke E2E mas profundo — primer uso en el proyecto pendiente; el helper-direct cubre la paridad de shape de este plan"

requirements-completed: [D-01, D-02, D-05, D-06, D-09]

# Metrics
duration: ~12min
completed: 2026-06-11
---

# Standalone gemini-fallback-haiku Plan 02: Wiring sub-loop (generation + compliance) Summary

**Los 2 call-sites del sub-loop RAG-generative (generation-call.ts callSite 'generation' + compliance-check.ts callSite 'compliance') ahora intentan Gemini con maxRetries:0 + AbortSignal.timeout y caen a Haiku 4.5 via @ai-sdk/anthropic ante saturacion — transparente al resto del pipeline (mismo Zod schema en ambos branches, firmas publicas intactas), validado por una suite de paridad de 4 tests verde + 82 tests existentes del sub-loop sin regresion.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-06-11
- **Tasks:** 3
- **Files created:** 1 (test) / modified: 2

## Accomplishments
- `generation-call.ts`: `runGenerationCall` envuelve la llamada con `callWithGeminiFallback({ callSite: 'generation', gemini, anthropic })`. Branch gemini conserva el `runWithPurpose('subloop_generation', ...)` + `google('gemini-2.5-flash')` + safetySettings BLOCK_NONE x4, añade `maxRetries: 0` (D-05) + `abortSignal: signal` (D-06). Branch anthropic usa `anthropic('claude-haiku-4-5')` (D-02), MISMO system + messages + schema (D-09), SIN providerOptions.google (Pitfall #7). `safeAccessOutput(rawResult, GenerationOutputSchema)` posterior intacto.
- `compliance-check.ts`: `checkCompliance` envuelve con `callWithGeminiFallback({ callSite: 'compliance', ... })`. El early-return cuando ambos arrays estan vacios se PRESERVA (no toca LLM). El system prompt (~150 lineas) y el user message se factorizaron a `const systemPrompt` y `const userMessages` referenciados por ambos closures → paridad D-09 estructural. `const output = rawResult.output` reemplaza la desestructuracion `{ output }` previa; el resto de la funcion intacto.
- `fallback-parity.test.ts`: 4 tests via el helper. Generation: saturacion 503 → fallback Anthropic con `GenerationOutputSchema.parse(result.output)` sin lanzar + `fallback_triggered` emitido; happy path → anthropic NUNCA invocado. Compliance: idem con `ComplianceCheckSchema.parse`. `__resetBreakers()` en afterEach.

## Task Commits

Cada tarea committeada atomicamente (--no-verify, worktree paralelo):

1. **Task 1: wirear generation-call.ts (callSite generation)** - `6bf1be18` (feat)
2. **Task 2: wirear compliance-check.ts (callSite compliance)** - `93a182d4` (feat)
3. **Task 3: suite de paridad sub-loop** - `5a1cfe3a` (test)

_Nota TDD: Task 3 era `tdd="true"`, pero la implementacion (Tasks 1+2) ya estaba wireada al escribir los tests; los tests entraron directo en GREEN verificando paridad de shape real del orquestador (no mocks que ignoran su input)._

## Files Created/Modified
- `src/lib/agents/somnio-v4/sub-loop/generation-call.ts` - fallback Gemini→Haiku 4.5 en runGenerationCall (callSite 'generation')
- `src/lib/agents/somnio-v4/sub-loop/compliance-check.ts` - fallback Gemini→Haiku 4.5 en checkCompliance (callSite 'compliance'); early-return preservado; prompt factorizado
- `src/lib/agents/somnio-v4/sub-loop/__tests__/fallback-parity.test.ts` - 4 tests de paridad (saturacion→fallback shape valido + happy path)

## Decisions Made
- **Test strategy helper-direct** (recomendacion del plan): se testea via `callWithGeminiFallback` con closures `gemini` (arroja `APICallError` 503) y `anthropic` (resuelve el objeto del schema), asertando `*.Schema.parse(result.output)` sin lanzar. Cubre D-09 sin acoplarse a la construccion inline de providers. `MockLanguageModelV3` queda anotado para un smoke E2E mas profundo (primer uso en el proyecto, pendiente).
- **Factorizacion de prompt/messages a const compartida** en ambos archivos para garantizar paridad estructural (D-09) entre branches en vez de copy-paste.

## Deviations from Plan

**Observacion de acceptance criterion (no es deviation de codigo):**

- Task 1 criterio `grep -c "claude-client" generation-call.ts == 0` y `grep -A20 "anthropic: () =>" | grep -c "providerOptions" == 0`: el conteo literal es 1 en cada caso, pero **ambas ocurrencias estan en comentarios** (`// D-02 — via @ai-sdk/anthropic, NO claude-client.ts` y `// SIN providerOptions.google — Pitfall #7`) que el propio `<action>` del plan instruye escribir verbatim. La intencion del criterio se cumple: cero imports de claude-client (`grep "from '...claude-client'"` == 0) y cero keys `providerOptions:` reales en el closure anthropic (`grep -cE '^\s*providerOptions:'` == 1, solo en el closure gemini). Misma situacion que Plan 01 documento.

**Total deviations:** 0 auto-fixes de codigo. Plan ejecutado exactamente como fue escrito.

## Issues Encountered
- Path del worktree: los primeros Read/Edit/Write apuntaron al shared-checkout; corregido apuntando al worktree path (mismo patron que Plan 01). Sin impacto en el resultado.

## Verification
- `npx vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/fallback-parity.test.ts` → **4 tests PASS**.
- `npx vitest run src/lib/agents/somnio-v4/sub-loop/` → **8 suites PASS, 82 passed | 2 skipped** (sin regresion en tests existentes).
- `npx tsc --noEmit` → **0 errores totales** (0 en archivos modificados).
- Firmas publicas `runGenerationCall`/`checkCompliance` intactas (consumidores en sub-loop/index.ts + core/checkpoint-gate.ts + somnio-v4-agent.ts no requirieron cambios — tsc 0 errores lo confirma).
- Regla 6: solo archivos bajo `src/lib/agents/somnio-v4/sub-loop/`; cero modificaciones a v3/godentist/recompra/pw-confirmation. Branch anthropic sin providerOptions.google (Pitfall #7).

## Next Phase Readiness
- 2 de 4 call-sites wireados. Pendientes Wave 2 (planes paralelos): Plan 03 (comprehension, callSite 'comprehension') y Plan 04 (vision, callSite 'vision').
- v4 sigue DORMANT en prod — el fallback solo se ejercita cuando un workspace active `somnio-sales-v4`.
- Smoke E2E con MockLanguageModelV3 (mockeo a nivel de modulo de @ai-sdk/google + @ai-sdk/anthropic) queda como deuda opcional para validar la construccion inline de providers end-to-end.

## Self-Check: PASSED
- Archivos: `generation-call.ts`, `compliance-check.ts`, `fallback-parity.test.ts` FOUND.
- Commits: `6bf1be18`, `93a182d4`, `5a1cfe3a` FOUND.

---
*Standalone: gemini-fallback-haiku*
*Completed: 2026-06-11*
