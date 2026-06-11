# Standalone: gemini-fallback-haiku — Pattern Map

**Mapeado:** 2026-06-11
**Archivos analizados:** 9 (5 nuevos + 4 modificados)
**Análogos encontrados:** 9 / 9

---

## File Classification

| Archivo nuevo / modificado | Rol | Data Flow | Análogo más cercano | Calidad |
|---------------------------|-----|-----------|---------------------|---------|
| `src/lib/agents/somnio-v4/llm-fallback/index.ts` | utility (orchestrator) | request-response | `src/lib/agents/interruption-system-v2/checkpoints.ts` | role-match |
| `src/lib/agents/somnio-v4/llm-fallback/breaker.ts` | utility (FSM state) | event-driven | `src/lib/agents/interruption-system-v2/redis-client.ts` | role-match (módulo singleton in-memory) |
| `src/lib/agents/somnio-v4/llm-fallback/saturation.ts` | utility (predicate) | request-response | `src/lib/agents/interruption-system-v2/observability.ts` | partial |
| `src/lib/agents/somnio-v4/llm-fallback/observability.ts` | utility (emitter) | event-driven | `src/lib/agents/interruption-system-v2/observability.ts` | exact |
| `src/lib/agents/somnio-v4/llm-fallback/config.ts` | config | — | `src/lib/agents/interruption-system-v2/lock.ts` (constantes LOCK_TTL_S / HEARTBEAT_MS) | role-match |
| `src/lib/agents/somnio-v4/sub-loop/generation-call.ts` | service (LLM call) | request-response | sí mismo (modificación) + `src/lib/agents/somnio-pw-confirmation/comprehension.ts` | exact |
| `src/lib/agents/somnio-v4/sub-loop/compliance-check.ts` | service (LLM call) | request-response | sí mismo (modificación) + `src/lib/agents/somnio-pw-confirmation/comprehension.ts` | exact |
| `src/lib/agents/somnio-v4/comprehension.ts` | service (LLM call) | request-response | sí mismo (modificación) + `src/lib/agents/somnio-pw-confirmation/comprehension.ts` | exact |
| `src/lib/agents/media/image-classifier.ts` | service (LLM call + I/O) | request-response + file-I/O | sí mismo (modificación) | exact |
| `src/lib/agents/somnio-v4/llm-fallback/__tests__/breaker.test.ts` | test | — | `src/lib/agents/interruption-system-v2/__tests__/lock.test.ts` (fake timers) | exact |
| `src/lib/agents/somnio-v4/llm-fallback/__tests__/observability.test.ts` | test | — | `src/lib/agents/interruption-system-v2/__tests__/observability.test.ts` | exact |
| `src/lib/agents/somnio-v4/llm-fallback/__tests__/saturation.test.ts` | test | — | `src/lib/agents/interruption-system-v2/__tests__/observability.test.ts` (table-driven) | role-match |
| `src/lib/agents/somnio-v4/llm-fallback/__tests__/parity.test.ts` | test | — | `src/lib/agents/somnio-pw-confirmation/__tests__/` (vi.mock de LLM) | role-match |

---

## Pattern Assignments

---

### `src/lib/agents/somnio-v4/llm-fallback/observability.ts` (utility, event-driven)

**Análogo EXACTO:** `src/lib/agents/interruption-system-v2/observability.ts`

Copiar el archivo completo y adaptar: reemplazar `LockEventLabel` → `FallbackEventLabel`, los 11 labels → los 6 labels D-10, el prefijo `[interruption-v2]` → `[gemini-fallback]`.

**Patrón de imports** (líneas 1-3 del análogo):
```typescript
import { getCollector } from '@/lib/observability'
```

**Patrón typed-union de labels** (líneas 37-62 del análogo):
```typescript
export type LockEventLabel =
  | 'lock_acquired'
  | 'lock_acquire_failed_follower'
  // ...11 labels total, cada una documentada con su payload shape en comentario
```
Adaptar a:
```typescript
export type FallbackEventLabel =
  | 'fallback_triggered'   // { callSite, provider:'anthropic', model, errorCode, errorKind, latencyMs }
  | 'circuit_opened'       // { callSite, errorCode, gemini_latency_ms }
  | 'circuit_closed'       // { callSite, probe_latency_ms }
  | 'probe_ok'             // { callSite, gemini_latency_ms }
  | 'probe_failed'         // { callSite, errorCode }
  | 'fallback_failed'      // { callSite, gemini_error, anthropic_error }
```

**Patrón de emisión dual** (líneas 77-86 del análogo — copiar verbatim, solo cambiar prefijo):
```typescript
export function emitLockEvent(
  label: LockEventLabel,
  payload: Record<string, unknown>,
): void {
  const collector = getCollector()
  if (collector) {
    collector.recordEvent('pipeline_decision', label, payload)
  }
  console.log(`[interruption-v2] ${label}`, payload)
}
```

---

### `src/lib/agents/somnio-v4/llm-fallback/breaker.ts` (utility, FSM state)

**Análogo:** `src/lib/agents/interruption-system-v2/redis-client.ts`

El análogo enseña el patrón de módulo-singleton in-memory con `let _client: Redis | null = null` (línea 19). Aquí se reemplaza por un `Map<CallSite, Breaker>`.

**Patrón singleton in-memory** (análogo líneas 19-40):
```typescript
let _client: Redis | null = null

export function getRedisClient(): Redis {
  if (_client) return _client
  // ...inicialización
  _client = new Redis({ url, token })
  return _client
}
```
Adaptar a:
```typescript
export type BreakerState = 'closed' | 'open' | 'half_open'

interface BreakerEntry {
  state: BreakerState
  openedAt: number   // Date.now() cuando se abrió
}

// Module singleton — persiste entre invocaciones en la misma instancia Vercel
// (Fluid Compute reusa instancias). No hay estado de negocio aquí — información
// transitoria de 30s. Q4 del RESEARCH: no usar Redis.
const breakers = new Map<CallSite, BreakerEntry>()

/** Reset helper obligatorio para tests — evita que el estado del módulo leakee
 *  entre tests de vitest (Pitfall #3 del RESEARCH). Llamar en afterEach. */
export function __resetBreakers(): void {
  breakers.clear()
}
```

**FSM transitions** (derivado del diagrama del RESEARCH):
- `closed` → fallo saturación → `open` + `openedAt = Date.now()` + emite `circuit_opened`
- `open` + dentro de 30s → skip Gemini, `anthropic()` directo + emite `fallback_triggered{ reason: 'circuit_open' }`
- `open` + cooldown vencido → primera llamada entra como `half_open` (probe):
  - OK → `closed` + emite `circuit_closed` + `probe_ok`
  - falla → re-`open` (resetea `openedAt`) + emite `probe_failed` + `fallback_triggered{ reason: 'probe_failed' }`

---

### `src/lib/agents/somnio-v4/llm-fallback/saturation.ts` (utility, predicate)

**Sin análogo directo** (primero en el codebase). Construir con los patrones del RESEARCH:

**Patrón de imports** (de las clases de error del SDK):
```typescript
import { APICallError, RetryError } from 'ai'
// isAbortError viene de '@ai-sdk/provider-utils' pero también disponible como
// import from 'ai' (re-exportado). Verificar en node_modules antes de ejecutar.
```

**Predicado robusto** (RESEARCH Q1 — verificado en node_modules/ai/dist/index.js:2592-2645):
```typescript
const SATURATION_MSG = /high demand|overloaded|MODEL_CAPACITY_EXHAUSTED|capacity available|RESOURCE_EXHAUSTED|UNAVAILABLE/i

function unwrap(err: unknown): unknown {
  if (RetryError.isInstance(err)) return err.lastError ?? err
  return err
}

export function isGeminiSaturation(err: unknown): boolean {
  const e = unwrap(err)
  if (APICallError.isInstance(e)) {
    if (e.statusCode === 503 || e.statusCode === 429 || e.statusCode === 500 || e.statusCode === 504) return true
    if (typeof e.message === 'string' && SATURATION_MSG.test(e.message)) return true
    if (typeof e.responseBody === 'string' && SATURATION_MSG.test(e.responseBody)) return true
  }
  // fallback por message (cubre Pitfall #5 — comprehension re-envuelve el error)
  const msg = err instanceof Error ? err.message : String(err)
  return SATURATION_MSG.test(msg)
}
```

**CRÍTICO — Pitfall #2:** con `maxRetries: 0` el SDK NO arroja `RetryError` — arroja `APICallError` crudo (verificado en `node_modules/ai/dist/index.js:2604`). El `unwrap` de `RetryError` es defensa para paths con maxRetries > 0 que aún puedan existir.

**CRÍTICO — Pitfall #5:** `comprehension.ts` re-envuelve el error en un `new Error("[Comprehension-v4 generateText] ...")` (líneas 115-120 del archivo). El closure `gemini` del call-site comprehension debe hacer el `generateText` limpio (sin try/catch inner) para que el error llege sin envolver al helper. El re-throw diagnóstico se preserva solo para errores NO-saturación.

---

### `src/lib/agents/somnio-v4/llm-fallback/config.ts` (config)

**Análogo:** constantes en `src/lib/agents/interruption-system-v2/lock.ts` (LOCK_TTL_S, HEARTBEAT_MS exportadas como constantes del módulo).

**Patrón de constantes** (lock.ts líneas ~1-10, estilo):
```typescript
export const LOCK_TTL_S = 45
export const HEARTBEAT_MS = 5_000
```
Adaptar a:
```typescript
export type CallSite = 'generation' | 'compliance' | 'comprehension' | 'vision'

export const FALLBACK_MODEL = 'claude-haiku-4-5'   // D-02/D-03 — techo absoluto Haiku 4.5

export const COOLDOWN_MS = 30_000    // D-07: cooldown tras abrir el circuito

// D-06: timeout ~2-3× P95 por call-site. Ajustar con data de observability post-deploy.
export const TIMEOUT_MS: Record<CallSite, number> = {
  generation:    20_000,   // redacción RAG larga
  comprehension: 10_000,   // clasificación corta
  compliance:    10_000,   // check binario corto
  vision:        15_000,   // fetch base64 + multimodal
}
```

---

### `src/lib/agents/somnio-v4/llm-fallback/index.ts` (utility orchestrator, request-response)

**Análogo:** `src/lib/agents/interruption-system-v2/checkpoints.ts` (único punto que orquesta la lógica de decisión del lock system, similar a cómo este helper orquesta la decisión de provider).

**Shape de la función principal** (del RESEARCH Q8 — Architecture):
```typescript
export async function callWithGeminiFallback<T>(args: {
  callSite: CallSite
  gemini: (signal: AbortSignal) => Promise<T>   // llamada Gemini con maxRetries:0
  anthropic: () => Promise<T>                    // llamada Anthropic (schema saneado si aplica)
}): Promise<T>
```

**Flujo de decisión** (del diagrama RESEARCH):
1. Leer estado del breaker para `args.callSite`
2. Si `open` y dentro de cooldown → `anthropic()` + emitir `fallback_triggered{ reason: 'circuit_open' }`
3. Si `open` y cooldown vencido → marcar `half_open`, intentar `gemini(AbortSignal.timeout(TIMEOUT_MS[callSite]))`
4. Si `closed` o `half_open`: intentar `gemini`
   - OK + era `half_open` → `closed` + `circuit_closed` + `probe_ok` → return
   - catch `isGeminiSaturation || isAbortError` → abrir breaker + emitir eventos + `anthropic()`
   - catch otro error (parse/schema/`NoObjectGeneratedError`) → **re-throw** (Pitfall #4 — NO fallback)

**LANDMINE crítico (CONTEXT `code_context`):** el fallback NUNCA usa `src/lib/agents/claude-client.ts` porque `claude-client.ts:29` mapea `'claude-haiku-4-5'` → `'claude-sonnet-4-20250514'`. El closure `anthropic` en cada call-site importa directamente:
```typescript
import { anthropic } from '@ai-sdk/anthropic'
// ...
model: anthropic('claude-haiku-4-5')  // literal, NO a través de claude-client.ts
```
Patrón ya probado en `somnio-pw-confirmation/comprehension.ts:88`.

---

### `src/lib/agents/somnio-v4/sub-loop/generation-call.ts` (MODIFICACIÓN)

**Estado actual:** importa `google` de `@ai-sdk/google`, envuelve con `runWithPurpose`, usa `Output.object + safeAccessOutput`, `providerOptions.google.safetySettings BLOCK_NONE`, `maxRetries` default. Ver archivo completo en `src/lib/agents/somnio-v4/sub-loop/generation-call.ts`.

**Patrón de imports actual** (líneas 18-22):
```typescript
import { generateText, Output } from 'ai'
import { google } from '@ai-sdk/google'
import { z } from 'zod'
import { runWithPurpose } from '@/lib/observability'
import { safeAccessOutput } from './safe-output'
```
Agregar:
```typescript
import { anthropic } from '@ai-sdk/anthropic'
import { callWithGeminiFallback } from './llm-fallback'
```

**Patrón de refactor del call** (líneas 49-83): envolver la llamada `generateText` con `callWithGeminiFallback`:
```typescript
const rawResult = await callWithGeminiFallback({
  callSite: 'generation',
  gemini: (signal) => runWithPurpose('subloop_generation', () =>
    generateText({
      model: google('gemini-2.5-flash'),
      maxRetries: 0,           // D-05 — N=1
      abortSignal: signal,     // D-06 timeout guard
      // ... resto de los args (system, messages, temperature, output, providerOptions.google)
    })
  ),
  anthropic: () => runWithPurpose('subloop_generation', () =>
    generateText({
      model: anthropic('claude-haiku-4-5'),
      // MISMO prompt, MISMO schema — D-09
      // SIN providerOptions.google — Pitfall #7
    })
  ),
})
```
La firma pública `runGenerationCall(args)` NO cambia — consumidores intactos.

---

### `src/lib/agents/somnio-v4/sub-loop/compliance-check.ts` (MODIFICACIÓN)

**Estado actual:** patrón idéntico a generation-call. Ver archivo completo. El schema `ComplianceCheckSchema` usa booleans/strings — OK con Anthropic (Pitfall #1 no aplica aquí).

**Patrón de refactor:** idéntico a generation-call. El closure `anthropic` omite `providerOptions.google.safetySettings`. La `output` en la llamada Anthropic usa el mismo `Output.object({ schema: ComplianceCheckSchema })`.

Nota: en compliance-check, la llamada a `generateText` está dentro de un bloque que devuelve `{ output }` desestructurado (línea 89: `const { output } = await runWithPurpose(...)`). El refactor debe preservar ese patrón — ambos closures deben devolver `GenerateTextResult` completo para que `safeAccessOutput` / desestructuración sea uniforme.

---

### `src/lib/agents/somnio-v4/comprehension.ts` (MODIFICACIÓN)

**Estado actual:** ver archivo completo. Usa `Output.object + result.output` (no `safeAccessOutput`). El schema `MessageAnalysisSchema` tiene `z.number().min(0).max(1)` en `intent_confidence` y `secondary_confidence` (líneas 49 y 61 de `comprehension-schema.ts`) — Pitfall #1 activo.

**Schema saneado para el closure Anthropic:**
```typescript
// SOLO para el branch Anthropic — schema sin min/max (Pitfall #1 Anthropic rechaza 400).
// El schema de Gemini (MessageAnalysisSchema) queda intacto.
import { MessageAnalysisSchema } from './comprehension-schema'

const MessageAnalysisSchemaSanitized = MessageAnalysisSchema.extend({
  intent: MessageAnalysisSchema.shape.intent.extend({
    intent_confidence: z.number().describe('0..1 self-reported confidence'),
    secondary_confidence: z.number().nullable().describe('0..1 o null'),
  }),
})
```
Post-parse: validar que `intent_confidence` y `secondary_confidence` están en rango 0..1 dentro del `parseAnalysis` existente (ya tiene sanitización resiliente en líneas 169-203).

**CRÍTICO — Pitfall #5:** el try/catch diagnóstico (líneas 82-120) debe estar FUERA del closure `gemini`. El closure `gemini` hace el `generateText` limpio; si el error es saturación, el helper intercepta. Solo si NO es saturación, el error llega al catch exterior y se re-envuelve con el diagnóstico.

```typescript
// Estructura correcta:
const result = await callWithGeminiFallback({
  callSite: 'comprehension',
  gemini: async (signal) =>
    runWithPurpose('comprehension', () =>
      generateText({
        model: google('gemini-2.5-flash'),
        maxRetries: 0,
        abortSignal: signal,
        // ... args, con providerOptions.google.safetySettings
      })
    ),
  anthropic: () =>
    runWithPurpose('comprehension', () =>
      generateText({
        model: anthropic('claude-haiku-4-5'),
        // SIN providerOptions.google
        // schema saneado para el Output.object
        output: Output.object({ schema: MessageAnalysisSchemaSanitized }),
      })
    ),
})
// El catch diagnóstico envuelve el callWithGeminiFallback completo
```

La firma pública `comprehend(message, history, existingData, recentBotMessages)` NO cambia.

---

### `src/lib/agents/media/image-classifier.ts` (MODIFICACIÓN)

**Estado actual:** ver archivo completo. Usa `rawResult.experimental_output` (línea 172) en lugar de `safeAccessOutput`. El schema `ClassificationSchema` usa enums/string — OK con Anthropic (Pitfall #1 no aplica). El fail-safe catch en línea 185-189 debe preservarse como ÚLTIMO recurso cuando ambos providers fallan (D-03, D-07).

**Pitfall #11 (RESEARCH):** `experimental_output` puede no ser equivalente en el branch Anthropic. Recomendación del RESEARCH: migrar a `safeAccessOutput(rawResult, ClassificationSchema)` para paridad. Esto también simplifica el branch Anthropic porque ambos paths usan el mismo accessor.

**Patrón de refactor:**
```typescript
import { anthropic } from '@ai-sdk/anthropic'
import { callWithGeminiFallback } from '../somnio-v4/llm-fallback'
// La ruta relativa llm-fallback está en somnio-v4/ pero image-classifier.ts está en media/
// Ajustar la ruta según la estructura real del import.

const rawResult = await callWithGeminiFallback({
  callSite: 'vision',
  gemini: (signal) =>
    generateText({
      model: google('gemini-2.5-flash'),
      maxRetries: 0,
      abortSignal: signal,
      messages: [...],   // content con image part + text part (provider-agnóstico)
      output: Output.object({ schema: ClassificationSchema }),
      providerOptions: { google: { safetySettings: [...] } },
    }),
  anthropic: () =>
    generateText({
      model: anthropic('claude-haiku-4-5'),
      messages: [...],   // MISMO content — AI SDK normaliza el image part por provider (A1)
      output: Output.object({ schema: ClassificationSchema }),
      // SIN providerOptions.google
    }),
})
// Reemplazar rawResult.experimental_output por safeAccessOutput(rawResult, ClassificationSchema)
```

La firma pública `classifyImage(imageUrl, mimeType, caption?)` NO cambia. El bloque `try/catch` externo (fail-safe D-07) sigue envolviendo todo, incluyendo el `callWithGeminiFallback`.

---

## Patrón compartido: Anthropic structured output (referencia canónica)

**Fuente:** `src/lib/agents/somnio-pw-confirmation/comprehension.ts` (ya en producción)

Este archivo es la referencia probada de `@ai-sdk/anthropic` con `generateObject` en el codebase. Los call-sites v4 usan `generateText + Output.object`, pero si surge fricción con `Output.object` en Anthropic (Assumption A3 del RESEARCH), caer a `generateObject`:

**Patrón anthropic generateObject** (líneas 27-30, 87-97):
```typescript
import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'

const result = await generateObject({
  model: anthropic('claude-haiku-4-5'),  // literal — NO claude-client.ts
  schema: MessageAnalysisSchema,
  schemaName: 'MessageAnalysis',
  schemaDescription: '...',
  system: systemPrompt,
  prompt: message,
  maxOutputTokens: 512,
  temperature: 0.1,
})
const analysis = result.object   // no safeAccessOutput — generateObject garantiza .object
```

**Confirmado en RESEARCH Q2:** este path está probado en producción. El path `Output.object + safeAccessOutput` es el que usan los call-sites v4 — intentarlo primero; si hay fricción, usar `generateObject + result.object`.

---

## Patrón compartido: AbortSignal.timeout (referencia canónica)

**Fuente:** `src/lib/agents/godentist/dentos-availability.ts:48`

```typescript
signal: AbortSignal.timeout(120_000), // 2 min timeout (robot scrapes multiple doctors)
```
y `src/lib/carriers/envia-api.ts:40`:
```typescript
signal: AbortSignal.timeout(10_000),
```
El mismo patrón aplica a los AI SDK calls: `abortSignal: AbortSignal.timeout(TIMEOUT_MS[callSite])`. Runtimes Vercel Node 18+ soportan `AbortSignal.timeout` (verificado en RESEARCH Q1).

---

## Patrón compartido: Test con fake timers

**Fuente:** `src/lib/agents/interruption-system-v2/__tests__/lock.test.ts` (líneas 258-286)

Patrón para `breaker.test.ts` — FSM con cooldown de 30s:
```typescript
describe('startHeartbeat — LOCK-02', () => {
  it('fires renewLockTTL every HEARTBEAT_MS; stop() clears the interval', async () => {
    vi.useFakeTimers()
    try {
      // ... setup
      await vi.advanceTimersByTimeAsync(HEARTBEAT_MS)
      expect(mockRedis.expire).toHaveBeenCalledTimes(1)
      // ...
    } finally {
      vi.useRealTimers()    // siempre restaurar en finally
    }
  })
})
```
Adaptar para breaker con `COOLDOWN_MS = 30_000`:
```typescript
vi.useFakeTimers()
try {
  // 1. Primer fallo → circuito abre
  // 2. Llamada dentro de cooldown → va directo a anthropic()
  // 3. vi.advanceTimersByTimeAsync(30_000) → cooldown vence
  // 4. Siguiente llamada → probe half_open
  // 5a. Probe OK → circuito cierra
  // 5b. Probe falla → circuito re-abre
} finally {
  vi.useRealTimers()
}
```
Llamar `__resetBreakers()` en `afterEach` para limpiar estado del módulo entre tests (Pitfall #3).

---

## Patrón compartido: Test de observability typed-union

**Fuente:** `src/lib/agents/interruption-system-v2/__tests__/observability.test.ts` — copiar estructura verbatim

Patrón clave (líneas 25-58):
```typescript
let collectorPresent = true
const recordEvent = vi.fn()

vi.mock('@/lib/observability', () => ({
  getCollector: () => (collectorPresent ? { recordEvent } : null),
}))

const ALL_LABELS: FallbackEventLabel[] = [
  'fallback_triggered', 'circuit_opened', 'circuit_closed',
  'probe_ok', 'probe_failed', 'fallback_failed',
]

beforeEach(() => {
  collectorPresent = true
  recordEvent.mockClear()
  consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
})
```
Tests a incluir (estilo observability.test.ts):
1. Todos los labels emiten a `collector.recordEvent('pipeline_decision', label, payload)`
2. Cuando `getCollector()` retorna null → `console.log` sí se llama, `recordEvent` NO
3. Label inválido → `@ts-expect-error` (LOCK-07 pattern)
4. Prefijo `[gemini-fallback]` en console.log (análogo a `[interruption-v2]`)

---

## Patrón compartido: LLM mock sin MockLanguageModelV3

El codebase actual no usa `MockLanguageModelV3` (no hay instancias en `/src`). El patrón establecido es `vi.mock('ai', ...)` o mockear el módulo de provider directamente. Para `parity.test.ts`, la recomendación del RESEARCH es usar `MockLanguageModelV3` de `ai/test` (verificado en `node_modules/ai/dist/test/index.d.ts:133`). Es el primer uso en el proyecto — documentar en LEARNINGS que el patrón existe.

```typescript
import { MockLanguageModelV3 } from 'ai/test'

const mockGeminiModel = new MockLanguageModelV3({
  doGenerate: vi.fn().mockResolvedValue({
    text: JSON.stringify({ responseText: 'Hola', responseConfidence: 0.9, ... }),
    // ...shape mínimo del GenerateTextResult
  }),
})
```

---

## Archivos sin análogo directo

| Archivo | Rol | Data Flow | Motivo |
|---------|-----|-----------|--------|
| `src/lib/agents/somnio-v4/llm-fallback/saturation.ts` | utility | — | Primer predicado de error de saturación LLM en el codebase |
| `src/lib/agents/somnio-v4/llm-fallback/__tests__/parity.test.ts` | test | — | Primer uso de `MockLanguageModelV3` en el proyecto |

Para estos, el planner debe usar los patrones del RESEARCH directamente (Q1 para saturation, Q9 para parity).

---

## Metadata

**Scope de búsqueda de análogos:**
- `src/lib/agents/interruption-system-v2/` — módulo de infraestructura con typed-union observability y singleton pattern
- `src/lib/agents/somnio-pw-confirmation/comprehension.ts` — única referencia de `anthropic('claude-haiku-4-5')` con structured output en producción
- `src/lib/agents/somnio-v4/sub-loop/` — los call-sites Gemini actuales
- `src/lib/agents/media/image-classifier.ts` — el 4to call-site
- `src/lib/agents/somnio-recompra/__tests__/crm-context-poll.test.ts` — patrón fake timers con `afterEach vi.useRealTimers()`
- `src/lib/agents/godentist/dentos-availability.ts` — patrón `AbortSignal.timeout`

**Archivos escaneados:** 14
**Fecha de extracción:** 2026-06-11
