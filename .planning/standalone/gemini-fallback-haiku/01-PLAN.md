---
phase: standalone
slug: gemini-fallback-haiku
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/somnio-v4/llm-fallback/config.ts
  - src/lib/agents/somnio-v4/llm-fallback/saturation.ts
  - src/lib/agents/somnio-v4/llm-fallback/observability.ts
  - src/lib/agents/somnio-v4/llm-fallback/breaker.ts
  - src/lib/agents/somnio-v4/llm-fallback/index.ts
  - src/lib/agents/somnio-v4/llm-fallback/__tests__/saturation.test.ts
  - src/lib/agents/somnio-v4/llm-fallback/__tests__/observability.test.ts
  - src/lib/agents/somnio-v4/llm-fallback/__tests__/breaker.test.ts
  - src/lib/agents/somnio-v4/llm-fallback/__tests__/index.test.ts
autonomous: true
requirements: [D-04, D-05, D-06, D-07, D-08, D-10]
user_setup: []

must_haves:
  truths:
    - "El predicado isGeminiSaturation matchea APICallError 503/429/500/504 + mensajes high demand/MODEL_CAPACITY_EXHAUSTED, y devuelve false para NoObjectGeneratedError (no enmascara bugs de schema)"
    - "El circuit-breaker abre tras el primer fallo de saturacion, salta Gemini durante 30s (cooldown), y la primera llamada tras el cooldown hace probe half-open con trafico real"
    - "callWithGeminiFallback intenta Gemini con maxRetries:0 + AbortSignal.timeout, hace fallback a anthropic() solo en saturacion/timeout, y re-throwea cualquier otro error (parse/schema)"
    - "Cada transicion del switch emite un evento pipeline_decision typed-union (6 labels) sin filtrar PII ni API keys"
  artifacts:
    - path: "src/lib/agents/somnio-v4/llm-fallback/index.ts"
      provides: "callWithGeminiFallback<T> orquestador del fallback"
      exports: ["callWithGeminiFallback", "CallSite"]
    - path: "src/lib/agents/somnio-v4/llm-fallback/saturation.ts"
      provides: "isGeminiSaturation predicado + isTimeoutError"
      exports: ["isGeminiSaturation", "isTimeoutError"]
    - path: "src/lib/agents/somnio-v4/llm-fallback/breaker.ts"
      provides: "FSM in-memory module-singleton por callSite + __resetBreakers"
      exports: ["__resetBreakers"]
    - path: "src/lib/agents/somnio-v4/llm-fallback/observability.ts"
      provides: "emitFallbackEvent typed-union (6 labels)"
      exports: ["emitFallbackEvent", "FallbackEventLabel"]
    - path: "src/lib/agents/somnio-v4/llm-fallback/config.ts"
      provides: "FALLBACK_MODEL + COOLDOWN_MS + TIMEOUT_MS por callSite"
      exports: ["FALLBACK_MODEL", "COOLDOWN_MS", "TIMEOUT_MS"]
  key_links:
    - from: "src/lib/agents/somnio-v4/llm-fallback/index.ts"
      to: "src/lib/agents/somnio-v4/llm-fallback/saturation.ts"
      via: "import isGeminiSaturation/isTimeoutError para decidir fallback"
      pattern: "isGeminiSaturation"
    - from: "src/lib/agents/somnio-v4/llm-fallback/index.ts"
      to: "src/lib/agents/somnio-v4/llm-fallback/observability.ts"
      via: "emitFallbackEvent en cada transicion"
      pattern: "emitFallbackEvent"
---

<objective>
Construir el modulo `llm-fallback/` acotado a v4 (D-04): predicado de saturacion robusto, circuit-breaker FSM in-memory, observability typed-union, y el orquestador `callWithGeminiFallback`. Cero wiring de call-sites en este plan — solo el modulo + sus tests deterministas.

Purpose: Aislar la logica de resilencia en un modulo testeable con cobertura determinista ANTES de tocar los 4 call-sites (Wave 2). El "punto ciego de mocks" (LEARNINGS consolidacion) se mitiga aqui con tests que asertan el comportamiento real del FSM y del predicado, no mocks que ignoran su input.
Output: 5 archivos de codigo + 4 suites de tests verdes en `src/lib/agents/somnio-v4/llm-fallback/`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/gemini-fallback-haiku/CONTEXT.md
@.planning/standalone/gemini-fallback-haiku/RESEARCH.md
@.planning/standalone/gemini-fallback-haiku/PATTERNS.md

<interfaces>
<!-- Exports verificados en node_modules — el executor NO necesita re-descubrirlos. -->

De `ai` (6.0.86): `APICallError`, `RetryError`, `NoObjectGeneratedError`, `generateText`, `generateObject`, `Output`, `GenerateTextResult`. (Confirmado en node_modules/ai/dist/index.d.ts.)
De `@ai-sdk/provider-utils`: `isAbortError(error: unknown): error is Error` (reconoce 'AbortError' | 'ResponseAborted' | 'TimeoutError'). NO se re-exporta desde `ai` — importar directo de `@ai-sdk/provider-utils`.
De `ai/test`: `MockLanguageModelV3` (constructor `{ doGenerate }`). Primer uso en el proyecto.

`APICallError` shape (de @ai-sdk/provider): `{ statusCode?: number, message: string, responseBody?: string, isRetryable: boolean, url }`. Static `APICallError.isInstance(err)`.
`RetryError` shape: `{ reason: 'maxRetriesExceeded'|'errorNotRetryable'|'abort', lastError, errors[] }`. Static `RetryError.isInstance(err)`.

Patron observability analogo VERBATIM: `src/lib/agents/interruption-system-v2/observability.ts` (leido — dual emission `getCollector()?.recordEvent('pipeline_decision', label, payload)` + `console.log`).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: config.ts + saturation.ts + observability.ts (predicado, knobs, emitter)</name>
  <read_first>
    - src/lib/agents/interruption-system-v2/observability.ts (analogo EXACTO del emitter typed-union — copiar estructura, cambiar prefijo)
    - .planning/standalone/gemini-fallback-haiku/RESEARCH.md Q1 (predicado isGeminiSaturation verbatim) + Q7 (labels)
    - .planning/standalone/gemini-fallback-haiku/PATTERNS.md secciones config.ts / saturation.ts / observability.ts
  </read_first>
  <action>
Crear los 3 archivos.

**`src/lib/agents/somnio-v4/llm-fallback/config.ts`** (knobs constantes — D-02/D-06/D-07):
```typescript
export type CallSite = 'generation' | 'compliance' | 'comprehension' | 'vision'

// D-02/D-03 — techo absoluto Haiku 4.5. NUNCA Sonnet/Opus. claude-3-5-haiku RETIRADO
// en la API directa (RESEARCH Q3) → los 4 call-sites caen al MISMO modelo.
// CRITICO: importar `anthropic` de '@ai-sdk/anthropic' con este literal — NUNCA via
// claude-client.ts (linea 29 mapea claude-haiku-4-5 → Sonnet, LANDMINE Pitfall #10).
export const FALLBACK_MODEL = 'claude-haiku-4-5' as const

export const COOLDOWN_MS = 30_000 // D-07 — cooldown tras abrir el circuito

// D-06 — timeout ~2-3x P95 por call-site. Defaults sensatos (v4 DORMANT en prod →
// poca data real; ajustar con observability post-deploy). RESEARCH Q5.
export const TIMEOUT_MS: Record<CallSite, number> = {
  generation: 20_000,
  comprehension: 10_000,
  compliance: 10_000,
  vision: 15_000,
}
```

**`src/lib/agents/somnio-v4/llm-fallback/saturation.ts`** (predicado — RESEARCH Q1 verbatim, Pitfall #2/#5):
```typescript
import { APICallError, RetryError } from 'ai'
import { isAbortError } from '@ai-sdk/provider-utils'

const SATURATION_MSG =
  /high demand|overloaded|MODEL_CAPACITY_EXHAUSTED|capacity available|RESOURCE_EXHAUSTED|UNAVAILABLE/i

function unwrap(err: unknown): unknown {
  // Defensa: con maxRetries:0 el SDK arroja APICallError crudo (Pitfall #2), pero si
  // algun path dejara maxRetries>0, viene envuelto en RetryError → desenvolver.
  if (RetryError.isInstance(err)) return err.lastError ?? err
  return err
}

/** Solo saturacion del proveedor dispara fallback. Parse/schema (NoObjectGeneratedError)
 *  NO matchea aqui (Pitfall #4 — no enmascarar bugs de schema). */
export function isGeminiSaturation(err: unknown): boolean {
  const e = unwrap(err)
  if (APICallError.isInstance(e)) {
    if (e.statusCode === 503 || e.statusCode === 429 || e.statusCode === 500 || e.statusCode === 504) return true
    if (typeof e.message === 'string' && SATURATION_MSG.test(e.message)) return true
    if (typeof e.responseBody === 'string' && SATURATION_MSG.test(e.responseBody)) return true
  }
  // Fallback por message (cubre Pitfall #5 — comprehension re-envuelve el error en un
  // new Error con el message preservado; el regex matchea "high demand").
  const msg = err instanceof Error ? err.message : String(err)
  return SATURATION_MSG.test(msg)
}

/** Timeout/abort (AbortSignal.timeout vencido) = saturacion-equivalente → dispara fallback. */
export function isTimeoutError(err: unknown): boolean {
  return isAbortError(err)
}
```

**`src/lib/agents/somnio-v4/llm-fallback/observability.ts`** (typed-union 6 labels — D-10, copiar estructura del analogo, prefijo `[gemini-fallback]`):
```typescript
import { getCollector } from '@/lib/observability'

/** 6 labels typed-union (D-10). Pasar un string arbitrario es error de compilacion.
 *  Payload discipline (security_note): SOLO callSite/provider/model/errorCode/errorKind/
 *  latencyMs — NUNCA contenido de mensaje del usuario ni API keys. */
export type FallbackEventLabel =
  /** { callSite, provider:'anthropic', model, errorKind:'saturation'|'timeout'|'probe_failed'|'circuit_open', errorCode?, latencyMs? } */
  | 'fallback_triggered'
  /** { callSite, errorCode?, gemini_latency_ms? } */
  | 'circuit_opened'
  /** { callSite, probe_latency_ms? } */
  | 'circuit_closed'
  /** { callSite, gemini_latency_ms? } */
  | 'probe_ok'
  /** { callSite, errorCode? } */
  | 'probe_failed'
  /** { callSite, gemini_error, anthropic_error } — doble fallo (Pitfall #8) */
  | 'fallback_failed'

export function emitFallbackEvent(
  label: FallbackEventLabel,
  payload: Record<string, unknown>,
): void {
  const collector = getCollector()
  if (collector) {
    collector.recordEvent('pipeline_decision', label, payload)
  }
  console.log(`[gemini-fallback] ${label}`, payload)
}
```
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/llm-fallback/__tests__/saturation.test.ts src/lib/agents/somnio-v4/llm-fallback/__tests__/observability.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "FALLBACK_MODEL = 'claude-haiku-4-5'" src/lib/agents/somnio-v4/llm-fallback/config.ts` == 1
    - `grep -c "COOLDOWN_MS = 30_000" src/lib/agents/somnio-v4/llm-fallback/config.ts` == 1
    - `grep -c "claude-client" src/lib/agents/somnio-v4/llm-fallback/config.ts` == 0 (NUNCA el wrapper legacy — Pitfall #10)
    - `grep -E "503|429|500|504" src/lib/agents/somnio-v4/llm-fallback/saturation.ts` matchea (statusCodes presentes)
    - `grep -c "high demand|MODEL_CAPACITY_EXHAUSTED" src/lib/agents/somnio-v4/llm-fallback/saturation.ts` >= 1
    - `grep -c "isAbortError" src/lib/agents/somnio-v4/llm-fallback/saturation.ts` >= 1
    - `grep -oE "'(fallback_triggered|circuit_opened|circuit_closed|probe_ok|probe_failed|fallback_failed)'" src/lib/agents/somnio-v4/llm-fallback/observability.ts | sort -u | wc -l` == 6
    - `grep -c "\[gemini-fallback\]" src/lib/agents/somnio-v4/llm-fallback/observability.ts` >= 1
    - Tests verdes (las suites se crean en Task 3 — si aun no existen al correr este verify, crear primero los stubs minimos del test que ya validan los 3 archivos)
  </acceptance_criteria>
  <done>config.ts, saturation.ts y observability.ts existen con los exports especificados; predicado matchea saturacion y no NoObjectGeneratedError; emitter usa los 6 labels.</done>
</task>

<task type="auto">
  <name>Task 2: breaker.ts + index.ts (FSM in-memory + orquestador)</name>
  <read_first>
    - src/lib/agents/interruption-system-v2/redis-client.ts (analogo del module-singleton in-memory)
    - .planning/standalone/gemini-fallback-haiku/RESEARCH.md Q4 (shape del breaker) + Q8 (helper shape) + diagrama de flujo
    - .planning/standalone/gemini-fallback-haiku/PATTERNS.md secciones breaker.ts / index.ts
    - src/lib/agents/somnio-v4/llm-fallback/saturation.ts + config.ts + observability.ts (Task 1)
  </read_first>
  <action>
**`src/lib/agents/somnio-v4/llm-fallback/breaker.ts`** (FSM in-memory module-singleton, Q4):
```typescript
import type { CallSite } from './config'
import { COOLDOWN_MS } from './config'

export type BreakerState = 'closed' | 'open' | 'half_open'

interface BreakerEntry {
  state: BreakerState
  openedAt: number // Date.now() cuando se abrio
}

// Module singleton — persiste entre invocaciones en la misma instancia Vercel
// (Fluid Compute reusa instancias). Informacion transitoria de 30s, no estado de
// negocio. RESEARCH Q4: in-memory, NO Redis (N=1 + maxRetries:0 → re-descubrir = 1
// fallo rapido por lambda fria).
const breakers = new Map<CallSite, BreakerEntry>()

/** Reset helper OBLIGATORIO para tests — evita leak de estado del module-singleton
 *  entre tests de vitest (Pitfall #3). Llamar en afterEach. */
export function __resetBreakers(): void {
  breakers.clear()
}

/** Devuelve el estado efectivo: 'open' dentro de cooldown salta Gemini; 'open' con
 *  cooldown vencido se promueve a 'half_open' (probe con trafico real, D-08). */
export function effectiveState(callSite: CallSite, now = Date.now()): BreakerState {
  const b = breakers.get(callSite)
  if (!b) return 'closed'
  if (b.state === 'open') {
    if (now - b.openedAt >= COOLDOWN_MS) return 'half_open'
    return 'open'
  }
  return b.state
}

/** Abre/re-abre el circuito (primer fallo o probe fallido). Resetea openedAt. */
export function openBreaker(callSite: CallSite, now = Date.now()): void {
  breakers.set(callSite, { state: 'open', openedAt: now })
}

/** Cierra el circuito (probe OK). */
export function closeBreaker(callSite: CallSite): void {
  breakers.set(callSite, { state: 'closed', openedAt: 0 })
}
```

**`src/lib/agents/somnio-v4/llm-fallback/index.ts`** (orquestador — RESEARCH Q8 + diagrama):
```typescript
import { isGeminiSaturation, isTimeoutError } from './saturation'
import { emitFallbackEvent } from './observability'
import { effectiveState, openBreaker, closeBreaker } from './breaker'
import { FALLBACK_MODEL, TIMEOUT_MS, type CallSite } from './config'

export type { CallSite }
export { __resetBreakers } from './breaker'

export async function callWithGeminiFallback<T>(args: {
  callSite: CallSite
  gemini: (signal: AbortSignal) => Promise<T> // llamada Gemini con maxRetries:0 (lo setea el call-site)
  anthropic: () => Promise<T>                  // llamada Anthropic (schema saneado si aplica)
}): Promise<T> {
  const { callSite, gemini, anthropic } = args
  const state = effectiveState(callSite)

  // 1. Circuito abierto dentro de cooldown → salta Gemini, directo a fallback.
  if (state === 'open') {
    emitFallbackEvent('fallback_triggered', {
      callSite, provider: 'anthropic', model: FALLBACK_MODEL, errorKind: 'circuit_open',
    })
    return anthropic()
  }

  // 2. 'closed' o 'half_open' (probe) → intentar Gemini con timeout guard.
  const isProbe = state === 'half_open'
  const t0 = performance.now()
  try {
    const result = await gemini(AbortSignal.timeout(TIMEOUT_MS[callSite]))
    if (isProbe) {
      const probe_latency_ms = performance.now() - t0
      closeBreaker(callSite)
      emitFallbackEvent('probe_ok', { callSite, gemini_latency_ms: probe_latency_ms })
      emitFallbackEvent('circuit_closed', { callSite, probe_latency_ms })
    }
    return result
  } catch (err) {
    const isSaturation = isGeminiSaturation(err)
    const isTimeout = isTimeoutError(err)
    if (!isSaturation && !isTimeout) {
      // Pitfall #4 — parse/schema/NoObjectGenerated → re-throw, NO fallback.
      throw err
    }
    const gemini_latency_ms = performance.now() - t0
    const errorCode = err instanceof Error ? err.name : String(err)
    const errorKind = isProbe ? 'probe_failed' : isTimeout ? 'timeout' : 'saturation'

    if (isProbe) {
      openBreaker(callSite) // re-abre, resetea cooldown
      emitFallbackEvent('probe_failed', { callSite, errorCode })
    } else {
      openBreaker(callSite)
      emitFallbackEvent('circuit_opened', { callSite, errorCode, gemini_latency_ms })
    }
    emitFallbackEvent('fallback_triggered', {
      callSite, provider: 'anthropic', model: FALLBACK_MODEL, errorKind, errorCode, latencyMs: gemini_latency_ms,
    })

    // 3. Fallback a Anthropic. Doble fallo (Pitfall #8) → emite fallback_failed + propaga.
    try {
      return await anthropic()
    } catch (anthropicErr) {
      emitFallbackEvent('fallback_failed', {
        callSite,
        gemini_error: errorCode,
        anthropic_error: anthropicErr instanceof Error ? anthropicErr.name : String(anthropicErr),
      })
      throw anthropicErr
    }
  }
}
```

NOTA de seguridad (security_note): NUNCA agregar contenido del mensaje del usuario ni `ANTHROPIC_API_KEY` a los payloads de `emitFallbackEvent`. Solo metadatos (callSite, errorCode, latencyMs).
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/llm-fallback/__tests__/breaker.test.ts src/lib/agents/somnio-v4/llm-fallback/__tests__/index.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "export function __resetBreakers" src/lib/agents/somnio-v4/llm-fallback/breaker.ts` == 1
    - `grep -c "new Map<CallSite, BreakerEntry>" src/lib/agents/somnio-v4/llm-fallback/breaker.ts` == 1
    - `grep -c "@upstash/redis\|createAdminClient\|@supabase/supabase-js" src/lib/agents/somnio-v4/llm-fallback/breaker.ts` == 0 (in-memory, NO Redis/DB — Q4)
    - `grep -c "AbortSignal.timeout(TIMEOUT_MS\[callSite\])" src/lib/agents/somnio-v4/llm-fallback/index.ts` == 1 (D-06)
    - `grep -c "throw err" src/lib/agents/somnio-v4/llm-fallback/index.ts` >= 1 (re-throw en no-saturacion — Pitfall #4)
    - `grep -c "fallback_failed" src/lib/agents/somnio-v4/llm-fallback/index.ts` >= 1 (doble fallo — Pitfall #8)
    - `grep -c "export.*callWithGeminiFallback" src/lib/agents/somnio-v4/llm-fallback/index.ts` >= 1
    - `npx tsc --noEmit` no introduce errores nuevos en archivos de llm-fallback/
  </acceptance_criteria>
  <done>breaker FSM con __resetBreakers exportado; callWithGeminiFallback orquesta open/closed/half_open con re-throw en parse errors y fallback_failed en doble fallo.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: 4 suites de tests deterministas (saturation, observability, breaker FSM, index)</name>
  <read_first>
    - src/lib/agents/interruption-system-v2/__tests__/observability.test.ts (analogo del test de typed-union + mock collector)
    - src/lib/agents/interruption-system-v2/__tests__/lock.test.ts lineas 258-286 (patron fake timers)
    - .planning/standalone/gemini-fallback-haiku/RESEARCH.md Q9 (8 tests propuestos)
    - .planning/standalone/gemini-fallback-haiku/PATTERNS.md secciones "Test con fake timers" / "Test de observability typed-union" / "LLM mock"
  </read_first>
  <behavior>
    - saturation: APICallError(503/429/500/504) → true; message "high demand" → true; MODEL_CAPACITY_EXHAUSTED → true; RetryError-wrapped saturacion → true; AbortError/TimeoutError → isTimeoutError true; NoObjectGeneratedError → isGeminiSaturation FALSE; error de red generico → false
    - observability: los 6 labels emiten a collector.recordEvent('pipeline_decision', label, payload); getCollector()=null → solo console.log; prefijo [gemini-fallback]
    - breaker FSM (fake timers): primer fallo abre → 2a llamada (dentro de 30s) salta a anthropic() → advanceTimersByTime(30_000) → 3a llamada hace probe Gemini → OK cierra / falla re-abre; __resetBreakers en afterEach
    - index: gemini arroja APICallError(503,"high demand") → llama anthropic + emite fallback_triggered; gemini arroja NoObjectGeneratedError → re-throws + NO llama anthropic (Pitfall #4); ambos fallan → fallback_failed + propaga error de anthropic
  </behavior>
  <action>
Crear 4 suites en `src/lib/agents/somnio-v4/llm-fallback/__tests__/`. TODAS llaman `__resetBreakers()` en `afterEach` (Pitfall #3).

**`saturation.test.ts`** — table-driven (estilo observability.test.ts del analogo):
- Construir `APICallError` con `new APICallError({ message, url:'x', requestBodyValues:{}, statusCode, responseBody })` (verificar el constructor exacto en node_modules/@ai-sdk/provider antes de instanciar; si el constructor difiere, usar un objeto que pase `APICallError.isInstance` via prototype o un mock minimo con la shape).
- Casos `isGeminiSaturation`: 503→true, 429→true, 500→true, 504→true, message "This model is currently experiencing high demand"→true, "MODEL_CAPACITY_EXHAUSTED"→true, `RetryError` envolviendo un APICallError 503→true, `NoObjectGeneratedError`→**false**, `new Error('ECONNRESET')`→false.
- Casos `isTimeoutError`: error con `name='TimeoutError'`→true, `name='AbortError'`→true, `new Error('x')`→false.

**`observability.test.ts`** — copiar estructura verbatim del analogo (`vi.mock('@/lib/observability', () => ({ getCollector: () => collectorPresent ? { recordEvent } : null }))`):
- `ALL_LABELS: FallbackEventLabel[] = ['fallback_triggered','circuit_opened','circuit_closed','probe_ok','probe_failed','fallback_failed']`
- cada label → `recordEvent` llamado con `('pipeline_decision', label, payload)`
- `collectorPresent = false` → `recordEvent` NO llamado, `console.log` SI
- assert prefijo `[gemini-fallback]` en el `console.log` spy

**`breaker.test.ts`** — fake timers (patron lock.test.ts:258-286, `vi.useFakeTimers()` en try / `vi.useRealTimers()` en finally):
- via `callWithGeminiFallback` (test de integracion del FSM): mock `gemini` que arroja saturacion, `anthropic` que resuelve `{ok:true}`.
- 1a llamada: gemini falla → abre → resultado = anthropic. 2a llamada inmediata: gemini NO se invoca (assert `geminiSpy` 1 sola vez), resultado = anthropic. `vi.advanceTimersByTimeAsync(30_000)`. 3a llamada: gemini SE invoca (probe), si OK → resultado = gemini (assert `geminiSpy` 2 veces) y 4a llamada vuelve a invocar gemini (cerrado). Variante: probe falla → re-abre.

**`index.test.ts`** — comportamiento del orquestador:
- gemini closure arroja `APICallError(503,"high demand")` → `anthropicSpy` llamado 1 vez, resultado = anthropic, emite `fallback_triggered`.
- gemini closure arroja `NoObjectGeneratedError` → **re-throws** (expect rejects), `anthropicSpy` NUNCA llamado (Pitfall #4).
- gemini OK (closed) → `anthropicSpy` NUNCA llamado, resultado = gemini.
- ambos closures arrojan saturacion/error → expect rejects con el error de anthropic + `fallback_failed` emitido (mock del emitter o spy de console.log).

Usar `vi.fn()` para los closures gemini/anthropic (NO requiere MockLanguageModelV3 aqui — los closures son funciones puras; MockLanguageModelV3 se usa en parity tests de Wave 2).
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/llm-fallback/</automated>
  </verify>
  <acceptance_criteria>
    - `npx vitest run src/lib/agents/somnio-v4/llm-fallback/` → todas las suites PASS (4 archivos)
    - `grep -rc "__resetBreakers" src/lib/agents/somnio-v4/llm-fallback/__tests__/` → cada test file >= 1 (afterEach)
    - `grep -c "vi.useFakeTimers\|advanceTimersByTimeAsync" src/lib/agents/somnio-v4/llm-fallback/__tests__/breaker.test.ts` >= 1
    - index.test.ts contiene un caso que asserta `NoObjectGeneratedError` re-throws sin llamar anthropic: `grep -c "NoObjectGeneratedError" src/lib/agents/somnio-v4/llm-fallback/__tests__/index.test.ts` >= 1
    - observability.test.ts asserta los 6 labels: `grep -oE "'(fallback_triggered|circuit_opened|circuit_closed|probe_ok|probe_failed|fallback_failed)'" src/lib/agents/somnio-v4/llm-fallback/__tests__/observability.test.ts | sort -u | wc -l` == 6
  </acceptance_criteria>
  <done>Las 4 suites verdes; FSM cubierto con fake timers; predicado cubierto con tabla incl. NoObjectGeneratedError=false; no-fallback-on-parse-error cubierto; 6 labels cubiertos.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| LLM provider → observability collector | El errorCode/message del provider cruza al payload de eventos; riesgo de filtrar contenido sensible si el message del error incluyera datos del prompt |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-fb-01 | Information Disclosure | emitFallbackEvent payloads | mitigate | Payload discipline: SOLO callSite/provider/model/errorCode/errorKind/latencyMs. NUNCA message del usuario ni ANTHROPIC_API_KEY. Verificado por code review del payload en cada emisor (index.ts) |
| T-fb-02 | Denial of Service | breaker in-memory | accept | Breaker es informacion transitoria de 30s por lambda; un atacante no controla la saturacion de Gemini. N=1 limita el blast radius a 1 fallo rapido por lambda |
</threat_model>

<verification>
- `npx vitest run src/lib/agents/somnio-v4/llm-fallback/` verde (4 suites).
- `npx tsc --noEmit` no introduce errores nuevos en archivos del modulo.
- Ningun import de `claude-client`, `@upstash/redis`, `createAdminClient` ni `@supabase/supabase-js` en el modulo.
</verification>

<success_criteria>
- Modulo `llm-fallback/` completo (5 archivos de codigo) con los exports especificados.
- 4 suites deterministas verdes, todas con `__resetBreakers()` en afterEach.
- Predicado distingue saturacion (true) de parse errors (false).
- FSM open→cooldown→half_open→close/reopen verificado con fake timers.
- 6 labels typed-union emitidos con payload discipline.
</success_criteria>

<output>
After completion, create `.planning/standalone/gemini-fallback-haiku/01-SUMMARY.md`
</output>
