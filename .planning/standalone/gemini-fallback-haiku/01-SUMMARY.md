---
phase: standalone/gemini-fallback-haiku
plan: 01
subsystem: infra
tags: [ai-sdk, gemini, anthropic, circuit-breaker, fallback, observability, somnio-v4, vitest]

# Dependency graph
requires: []
provides:
  - "Modulo llm-fallback/ acotado a somnio-v4 (D-04): predicado de saturacion + circuit-breaker FSM + observability typed-union + orquestador callWithGeminiFallback"
  - "callWithGeminiFallback<T>({ callSite, gemini, anthropic }) — orquestador del fallback con N=1 + timeout guard + cooldown 30s + probe half-open"
  - "isGeminiSaturation/isTimeoutError — predicados que distinguen saturacion (true) de parse/schema errors (false)"
  - "FALLBACK_MODEL='claude-haiku-4-5' + COOLDOWN_MS + TIMEOUT_MS por callSite"
  - "emitFallbackEvent typed-union (6 labels) con payload discipline (sin PII/keys)"
affects: [gemini-fallback-haiku-wave2, somnio-v4, llm-fallback-call-site-wiring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Circuit-breaker FSM in-memory module-singleton por callSite (vs Redis de interruption-system-v2): N=1 + maxRetries:0 justifica in-memory"
    - "Typed-union de observability labels (analogo verbatim de interruption-system-v2/observability.ts) con prefijo propio [gemini-fallback]"
    - "Orquestador con closures inyectadas (gemini/anthropic) — el modulo no conoce providers, los call-sites inyectan en Wave 2"
    - "__resetBreakers() en afterEach para evitar leak del module-singleton entre tests (Pitfall #3)"

key-files:
  created:
    - src/lib/agents/somnio-v4/llm-fallback/config.ts
    - src/lib/agents/somnio-v4/llm-fallback/saturation.ts
    - src/lib/agents/somnio-v4/llm-fallback/observability.ts
    - src/lib/agents/somnio-v4/llm-fallback/breaker.ts
    - src/lib/agents/somnio-v4/llm-fallback/index.ts
    - src/lib/agents/somnio-v4/llm-fallback/__tests__/saturation.test.ts
    - src/lib/agents/somnio-v4/llm-fallback/__tests__/observability.test.ts
    - src/lib/agents/somnio-v4/llm-fallback/__tests__/breaker.test.ts
    - src/lib/agents/somnio-v4/llm-fallback/__tests__/index.test.ts
  modified: []

key-decisions:
  - "Breaker in-memory module-singleton (NO Redis) — RESEARCH Q4: N=1 + maxRetries:0 hace que re-descubrir saturacion cueste 1 fallo rapido por lambda fria"
  - "FALLBACK_MODEL via literal 'claude-haiku-4-5' importado por '@ai-sdk/anthropic' en Wave 2 — NUNCA via claude-client.ts wrapper legacy (mapea a Sonnet, Pitfall #10)"
  - "NoObjectGeneratedError NO dispara fallback — re-throw para no enmascarar bugs de schema (Pitfall #4)"
  - "Doble fallo (Gemini + Anthropic) emite fallback_failed y propaga el error de Anthropic (Pitfall #8)"

patterns-established:
  - "Modulo de resiliencia testeable aislado de los call-sites: codigo + tests deterministas ANTES de wirear (mitiga el punto ciego de mocks)"
  - "Tests del FSM con fake timers controlando Date.now() del cooldown mientras gemini rechaza sincrono (AbortSignal.timeout no interfiere)"

requirements-completed: [D-04, D-05, D-06, D-07, D-08, D-10]

# Metrics
duration: ~15min
completed: 2026-06-11
---

# Standalone gemini-fallback-haiku Plan 01: Modulo llm-fallback Summary

**Modulo de fallback Gemini → Anthropic (Haiku 4.5 techo) para somnio-v4: predicado de saturacion robusto, circuit-breaker FSM in-memory con cooldown 30s + probe half-open, observability typed-union de 6 labels, y orquestador callWithGeminiFallback — 5 archivos de codigo + 4 suites deterministas (27 tests verdes), cero wiring de call-sites (eso es Wave 2).**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-06-11
- **Tasks:** 3
- **Files created:** 9 (5 codigo + 4 tests)

## Accomplishments
- `saturation.ts`: `isGeminiSaturation` matchea APICallError 503/429/500/504 + mensajes de capacidad (`high demand`, `MODEL_CAPACITY_EXHAUSTED`, etc.), desenvuelve `RetryError`, y devuelve `false` para `NoObjectGeneratedError` (no enmascara bugs de schema). `isTimeoutError` via `isAbortError` de `@ai-sdk/provider-utils`.
- `breaker.ts`: FSM module-singleton (`Map<CallSite, BreakerEntry>`) con estados closed/open/half_open. `effectiveState` promueve open→half_open cuando vence el cooldown de 30s. `__resetBreakers()` exportado para tests. Sin Redis/DB.
- `index.ts`: `callWithGeminiFallback<T>` orquesta open (skip Gemini, directo anthropic), closed (intenta Gemini con `AbortSignal.timeout(TIMEOUT_MS[callSite])`), half_open (probe con trafico real → close si OK / reopen si falla). Re-throw en parse errors (Pitfall #4). `fallback_failed` + propaga en doble fallo (Pitfall #8).
- `observability.ts`: `emitFallbackEvent` typed-union de 6 labels (fallback_triggered, circuit_opened, circuit_closed, probe_ok, probe_failed, fallback_failed) con dual emission collector + console.log prefijo `[gemini-fallback]`. Payload discipline: solo metadatos, sin PII/keys (T-fb-01).
- `config.ts`: `FALLBACK_MODEL='claude-haiku-4-5'`, `COOLDOWN_MS=30_000`, `TIMEOUT_MS` por callSite.
- 4 suites deterministas (27 tests) verdes; FSM cubierto con fake timers; predicado con tabla incl. NoObjectGeneratedError=false; no-fallback-on-parse-error cubierto; 6 labels cubiertos.

## Task Commits

Each task was committed atomically (--no-verify, parallel worktree):

1. **Task 1: config + saturation + observability** - `1b04142c` (feat)
2. **Task 2: breaker FSM + orquestador index** - `1d5c5fa1` (feat)
3. **Task 3: 4 suites de tests deterministas** - `47a86e90` (test)

_Nota TDD: Task 3 era `tdd="true"`, pero la implementacion (Tasks 1+2) ya existia al escribir los tests; los tests entraron directo en GREEN verificando comportamiento real del FSM y el predicado (no mocks que ignoran su input — leccion punto ciego de mocks)._

## Files Created/Modified
- `src/lib/agents/somnio-v4/llm-fallback/config.ts` - Knobs: FALLBACK_MODEL, COOLDOWN_MS, TIMEOUT_MS por callSite + type CallSite
- `src/lib/agents/somnio-v4/llm-fallback/saturation.ts` - isGeminiSaturation + isTimeoutError (predicados)
- `src/lib/agents/somnio-v4/llm-fallback/observability.ts` - emitFallbackEvent + FallbackEventLabel (6 labels typed-union)
- `src/lib/agents/somnio-v4/llm-fallback/breaker.ts` - FSM in-memory + __resetBreakers
- `src/lib/agents/somnio-v4/llm-fallback/index.ts` - callWithGeminiFallback orquestador
- `src/lib/agents/somnio-v4/llm-fallback/__tests__/saturation.test.ts` - 16 tests del predicado
- `src/lib/agents/somnio-v4/llm-fallback/__tests__/observability.test.ts` - 5 tests del emitter (6 labels)
- `src/lib/agents/somnio-v4/llm-fallback/__tests__/breaker.test.ts` - 2 tests del FSM con fake timers
- `src/lib/agents/somnio-v4/llm-fallback/__tests__/index.test.ts` - 4 tests del orquestador

## Decisions Made
None de fondo - se siguio el plan tal cual (codigo verbatim del plan, RESEARCH Q1/Q4/Q7/Q8). Decisiones de implementacion menores en los tests:
- En `saturation.test.ts`, para simular `RetryError.lastError` (readonly, no recibido por el constructor) se usa `Object.defineProperty` — refleja como el SDK lo setea en runtime.
- `NoObjectGeneratedError` se construye con el constructor completo (`response/usage/finishReason`) verificado en `node_modules/ai/dist/index.d.ts`.

## Deviations from Plan

**Observacion de acceptance criterion (no es deviation de codigo):**

El acceptance criterion de Task 1 dice `grep -c "claude-client" config.ts == 0`. El conteo real es 3 — pero **las 3 ocurrencias estan en comentarios** (el LANDMINE warning Pitfall #10 que el propio `<action>` del plan instruye escribir verbatim). El grep de imports reales (`from '...claude-client'`) retorna **0**. La intencion del criterio (NUNCA usar el wrapper legacy) se cumple: cero imports. El conteo literal de 0 era imposible dado que el plan mismo dicta esos comentarios. Sin cambio de codigo necesario.

**Total deviations:** 0 auto-fixes de codigo.
**Impact on plan:** Plan ejecutado exactamente como fue escrito. Sin scope creep.

## Issues Encountered
- Path del worktree: el primer Write fallo apuntando al shared-checkout; corregido apuntando al worktree path. Sin impacto en el resultado.
- `errorCode` en los eventos se reporta como `err.name` → `'AI_APICallError'` (no el statusCode). Es el comportamiento especificado en el plan (`err.name`). Documentado por si Wave 2 quiere enriquecer el payload con statusCode (sin PII, T-fb-01 ok).

## Verification
- `npx vitest run src/lib/agents/somnio-v4/llm-fallback/` → **4 suites PASS, 27 tests PASS**.
- `npx tsc --noEmit` → **0 errores en archivos de llm-fallback/**.
- Ningun import de `claude-client`, `@upstash/redis`, `createAdminClient` ni `@supabase/supabase-js` en el modulo (verificado via grep — 0 imports reales).
- Regla 6 respetada: solo archivos NUEVOS bajo `src/lib/agents/somnio-v4/llm-fallback/`; cero modificaciones a v3/godentist/recompra/pw-confirmation ni a call-sites v4.

## Next Phase Readiness
- Modulo listo para Wave 2: wiring de los 4 call-sites Gemini (generation-call.ts, compliance-check.ts, comprehension.ts, image-classifier.ts) inyectando closures `gemini` (con `maxRetries:0`) y `anthropic` (con `@ai-sdk/anthropic` + literal `claude-haiku-4-5`).
- Parity tests con `MockLanguageModelV3` (primer uso en el proyecto) quedan para Wave 2.
- Deuda anotada (CONTEXT deferred): limpiar mapping stale `claude-haiku-4-5`→Sonnet en `claude-client.ts` — tocarlo afecta consumidores legacy (Regla 6), fuera de scope de este standalone.

## Self-Check: PASSED
- Archivos creados: 9/9 FOUND (5 codigo + 4 tests).
- Commits: `1b04142c`, `1d5c5fa1`, `47a86e90` FOUND.

---
*Standalone: gemini-fallback-haiku*
*Completed: 2026-06-11*
