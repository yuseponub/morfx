# Research: gemini-fallback-haiku

**Investigado:** 2026-06-11
**Dominio:** Resilencia de provider LLM (AI SDK v6) — fallback Gemini → Anthropic (Haiku 4.5) con circuit-breaker
**Confianza:** ALTA (versiones verificadas en node_modules; error shapes leídos del .d.ts/.js local; modelos+pricing Anthropic vía docs oficiales; pitfall min/max confirmado por issues vercel/ai)

---

## Summary

El sistema de fallback es viable con cero dependencias nuevas: `ai@6.0.86`, `@ai-sdk/anthropic@3.0.44` y `@ai-sdk/google@3.0.67` ya están instalados, y el codebase **ya usa `anthropic('claude-haiku-4-5')` con structured output** en producción (`somnio-pw-confirmation/comprehension.ts`). `ANTHROPIC_API_KEY` ya está en uso.

**Hallazgo decisivo sobre D-02 (tiering):** el tiering por costo se **colapsa a un solo modelo**. `claude-3-5-haiku` está **RETIRADO en la API de primera-parte de Anthropic** (solo vive en Bedrock/Vertex, docs oficiales). El único Haiku disponible vía `@ai-sdk/anthropic` directo es **`claude-haiku-4-5` ($1/$5 MTok, con visión, 200k ctx)**. Por tanto los 4 call-sites caen al MISMO modelo `claude-haiku-4-5`. Esto SIMPLIFICA el plan y honra D-02 (techo Haiku 4.5, nunca Sonnet/Opus) y D-03 (visión con Haiku-con-visión — Haiku 4.5 SÍ tiene visión).

**Hallazgo decisivo sobre D-09 (paridad):** Anthropic vía AI SDK **rechaza con 400** schemas Zod que contengan `minimum`/`maximum`/`exclusiveMinimum` (issues vercel/ai #14342 y #13355). El schema de **comprehension** (`comprehension-schema.ts`) usa `z.number().min(0).max(1)` en `intent_confidence`/`secondary_confidence` → el branch Anthropic DEBE usar un **schema saneado** (sin min/max) y validar el rango en post-parse. Generation usa `z.number()` pelado (OK); compliance/visión usan booleans/enums (OK). Esto es el Pitfall #1.

**Hallazgo decisivo sobre D-05 (detección N=1):** con `maxRetries: 0` el AI SDK **NO arroja `AI_RetryError`** — arroja el error subyacente **`APICallError` crudo** (verificado en `node_modules/ai/dist/index.js:2604` — branch `if (maxRetries === 0) throw error`). El predicado `isGeminiSaturation` debe matchear `APICallError` (statusCode 503/429 + mensaje "high demand"/"overloaded"/`MODEL_CAPACITY_EXHAUSTED`), NO `RetryError`. (El `AI_RetryError` que vio GATE-W2 era con `maxRetries` default=2.)

**Primary recommendation:** Helper `callWithGeminiFallback({ callSite, gemini, anthropic })` por call-site, con breaker **in-memory module-singleton por callSite** (no Redis), `maxRetries:0` + `AbortSignal.timeout(2-3×P95)` en la llamada Gemini, predicado de saturación robusto, y eventos `pipeline_decision` typed-union. Cero cambios en `core/`. Sin feature flag (v4 DORMANT en prod = gating natural; sandbox quiere el fallback ya).

---

<user_constraints>
## User Constraints (de CONTEXT.md)

### Decisiones lockeadas (D-01..D-10)
- **D-01** — 4 call-sites Gemini de v4 entran: `generation-call.ts`, `compliance-check.ts`, `comprehension.ts`, `image-classifier.ts`. `tooling-call.ts` (GPT-4.1-mini) FUERA.
- **D-02** — Fallback POR NIVELES por función. Techo absoluto **Haiku 4.5 — NUNCA Sonnet/Opus**. Generation → `claude-haiku-4-5`; funciones simples → candidato más barato que conserve ~99% eficacia. (Research: el tiering colapsa a `claude-haiku-4-5` para los 4 — ver Q3.)
- **D-03** — Visión → Haiku-con-visión. Fail-safe handoff actual queda como ÚLTIMO recurso.
- **D-04** — Módulo acotado a v4, NO shared. Cambios al mecanismo del turno → solo `core/`; wiring → en los call-sites.
- **D-05** — N=1, `maxRetries: 0`.
- **D-06** — Timeout guard informado por P95 (~2-3× P95).
- **D-07** — Cooldown 30 segundos.
- **D-08** — Probe half-open con tráfico real.
- **D-09** — Mismo prompt, mismo shape. `safetySettings BLOCK_NONE` es Gemini-only.
- **D-10** — Eventos `pipeline_decision` typed-union.

### Claude's Discretion (informado por research — recomendaciones abajo)
- Estado del breaker → **in-memory module-singleton por callSite** (Q4).
- Política de errores → solo saturación + timeout/abort disparan fallback; `NoObjectGeneratedError`/parse NO (Pitfall #4).
- Doble fallo → propaga el error path actual de cada call-site (visión = fail-safe handoff D-07).
- Knobs → constantes en módulo (timeouts/cooldown/modelo); `platform_config` innecesario (Q5).
- Feature flag → innecesario (v4 DORMANT en prod).
- Predicado de saturación → ver Q1.

### Deferred (FUERA DE SCOPE)
- `v4-smoke-stability`; generalizar a shared; limpiar mapping stale `claude-haiku-4-5`→Sonnet en `claude-client.ts`.
</user_constraints>

---

## Standard Stack (verificado en node_modules)

| Paquete | Versión instalada | Uso |
|---------|-------------------|-----|
| `ai` | **6.0.86** | `generateText`, `Output.object`, `generateObject`, error classes (`RetryError`, `NoObjectGeneratedError`), `ai/test` (`MockLanguageModelV3`) |
| `@ai-sdk/google` | 3.0.67 | provider Gemini actual |
| `@ai-sdk/anthropic` | **3.0.44** | provider fallback (ya usado en codebase) |
| `@ai-sdk/provider` | (transitiva) | `APICallError` (clase del error de saturación) |
| `@upstash/redis` | 1.38.0 | NO necesario para el breaker (recomendación in-memory) |
| `zod` | 4.3.6 | schemas |

**Sin deps nuevas.** `ANTHROPIC_API_KEY` ya en uso (`crm-reader`, `crm-writer`, `somnio-pw-confirmation`, `builder`, etc.).

---

## Findings por pregunta

### Q1 — AI SDK v6: error/retry/timeout surface + predicado de saturación

**Error classes (leídas de `node_modules`):**
- `APICallError` (de `@ai-sdk/provider`, `index.d.ts:~400`): `url`, `statusCode?: number`, `responseHeaders?`, `responseBody?: string`, `isRetryable: boolean`, `data?: unknown`, `message`. Static `APICallError.isInstance(err)`.
- `RetryError` (de `ai`): `reason: 'maxRetriesExceeded' | 'errorNotRetryable' | 'abort'`, `lastError`, `errors[]`. Static `RetryError.isInstance(err)`.
- `NoObjectGeneratedError` (de `ai`) — ya usado en `safe-output.ts`.

**maxRetries: 0 cambia el error que ves (CRÍTICO).** En `node_modules/ai/dist/index.js:2592-2645` (`_retryWithExponentialBackoff`):
```js
catch (error) {
  if (isAbortError(error)) throw error;       // abort → se propaga el AbortError/TimeoutError crudo
  if (maxRetries === 0) throw error;          // ← con maxRetries:0 se arroja el APICallError CRUDO
  ...
}
```
→ Con `maxRetries: 0`, el predicado debe matchear **`APICallError` crudo**, NO `AI_RetryError`. (GATE-W2 documentó `AI_RetryError` porque corría con `maxRetries` default = 2 → reintenta 3 veces → envuelve en `RetryError`.)

**Status del error de saturación de Gemini** (`discuss.ai.google.dev/t/124640`, verificado):
- **503** con mensaje literal **"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later"**.
- A veces **429** con `MODEL_CAPACITY_EXHAUSTED` ("No capacity available for model …").
- El provider Google parsea el body a `{ error: { code, message, status } }` y construye `APICallError` con `statusCode = response.status` y `message = data.error.message` (`@ai-sdk/google/dist/index.js:43-57` `googleFailedResponseHandler`).

**Predicado recomendado `isGeminiSaturation(err)`** (robusto, defensivo por si AI SDK envuelve):
```ts
import { APICallError, RetryError } from 'ai'  // RetryError sólo por defensa si algún path deja maxRetries>0

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
  // fallback por message en caso de wrappers (Comprehension diagnostic re-throw, ver Pitfall #5)
  const msg = err instanceof Error ? err.message : String(err)
  return SATURATION_MSG.test(msg)
}
```
[VERIFIED: node_modules/ai, @ai-sdk/google, @ai-sdk/provider] [CITED: discuss.ai.google.dev/t/124640]

**Timeout / abort.** `generateText`/`generateObject` aceptan `abortSignal`. Usar `AbortSignal.timeout(ms)` (Node 18+, runtime Vercel Node OK). Al abortar, el SDK arroja un error con `name === 'TimeoutError'` (de `AbortSignal.timeout`) o `'AbortError'`; `isAbortError(err)` (provider-utils) reconoce `'AbortError' | 'ResponseAborted' | 'TimeoutError'`. El predicado de **timeout** debe ser `isAbortError(err)` → tratar como saturación-equivalente (dispara fallback + abre breaker). [VERIFIED: provider-utils/dist/index.js:459-461]

**Combinar dos señales de timeout.** `AbortSignal.timeout(ms)` para el cuelgue total; el `maxRetries:0` garantiza que un 503 inmediato no espera. Pitfall #6: el abort NO cancela el billing del request Gemini ya en vuelo de forma garantizada — aceptable (costo bajo, evento poco frecuente).

---

### Q2 — `@ai-sdk/anthropic` parity (Output.object + visión + temperatura)

- **Structured output funciona con Anthropic en este codebase HOY.** `somnio-pw-confirmation/comprehension.ts:87` usa `generateObject({ model: anthropic('claude-haiku-4-5'), schema: MessageAnalysisSchema, schemaName, schemaDescription, maxOutputTokens: 512, temperature: 0.1 })` en producción. [VERIFIED: src/lib/agents/somnio-pw-confirmation/comprehension.ts:86-97]
- **`Output.object` vs `generateObject`:** los call-sites Gemini usan `generateText({ output: Output.object({ schema }) })`. `Output.object` también funciona con Anthropic, PERO el path probado/estable en el codebase para Anthropic es `generateObject`. Recomendación: el branch Anthropic puede reusar `Output.object` (mismo `safeAccessOutput`) — pero **si surge fricción, caer a `generateObject` + `result.object`**. La paridad de SHAPE (D-09) se mantiene porque ambos validan contra el mismo Zod (saneado para comprehension).
- **GOTCHA min/max (= Pitfall #1):** Anthropic rechaza `minimum`/`maximum`/`exclusiveMinimum` en el JSON Schema de structured output (a diferencia de Gemini que los ignora). Zod 4 `z.number().int()` emite bounds de safe-integer que también rompen. → schema saneado para el branch Anthropic. [CITED: github.com/vercel/ai/issues/14342, /issues/13355]
- **Visión:** Anthropic acepta image parts vía AI SDK con el MISMO shape que ya usa `image-classifier.ts`: `content: [{ type: 'image', image: <base64|url|Buffer>, mediaType }, { type: 'text', text }]`. AI SDK normaliza el part al formato de cada provider — no hay que cambiar el shape del mensaje, solo el `model`. [ASSUMED: shape AI SDK image part es provider-agnóstico — verificar en smoke real con Haiku 4.5]
- **Temperatura:** generation usa `temperature: 0.3` (D-10), comprehension `0` (default JSON), pw-confirmation `0.1`. Anthropic acepta `temperature` 0..1 (mismo rango efectivo que usamos). Sin reescalado necesario.

---

### Q3 — Modelos Anthropic por tier + visión + pricing (D-02/D-03)

**Tabla de modelos (docs oficiales platform.claude.com, 2026-06):**

| Modelo | API ID (alias) | ID pinned | Visión | Input $/MTok | Output $/MTok | Estado |
|--------|----------------|-----------|--------|--------------|---------------|--------|
| **Claude Haiku 4.5** | `claude-haiku-4-5` | `claude-haiku-4-5-20251001` | **SÍ** | $1 | $5 | Disponible (200k ctx) |
| Claude Haiku 3.5 | `claude-3-5-haiku` | `claude-3-5-haiku-20241022` | sí (desde feb-2025) | $0.80 | $4 | **RETIRADO en API 1ª-parte** (solo Bedrock/Vertex) |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | — | sí | $3 | $15 | (TECHO PROHIBIDO por D-02) |

[CITED: platform.claude.com/docs/en/about-claude/models/overview] [CITED: platform.claude.com/docs/en/about-claude/pricing]

**Conclusión de tiering (D-02):** como `claude-3-5-haiku` está **retirado en la API directa**, el tiering "modelo más barato por función" **colapsa a `claude-haiku-4-5` para los 4 call-sites**. No hay un Haiku más barato disponible vía `@ai-sdk/anthropic`. (Usar Bedrock/Vertex para acceder a 3.5 Haiku sería infra nueva + cuenta nueva = fuera de scope y no vale la pena por ~20% de ahorro en llamadas de fallback poco frecuentes.)

**Mapping final recomendado (el plan lo fija):**

| Call-site | Modelo fallback | Razón |
|-----------|-----------------|-------|
| generation-call | `claude-haiku-4-5` | redacción RAG, la más exigente |
| compliance-check | `claude-haiku-4-5` | único Haiku en API; check binario |
| comprehension (v4) | `claude-haiku-4-5` | + **schema saneado** (Pitfall #1) |
| image-classifier | `claude-haiku-4-5` | visión confirmada en Haiku 4.5 (D-03) |

**LANDMINE confirmado:** `src/lib/agents/claude-client.ts:29` mapea `'claude-haiku-4-5' → 'claude-sonnet-4-20250514'` (comentario stale). El fallback **NO debe usar ese wrapper** — debe importar `anthropic` de `@ai-sdk/anthropic` y pasar el literal `'claude-haiku-4-5'` directo (como ya hace `somnio-pw-confirmation`). [VERIFIED: src/lib/agents/claude-client.ts:28-31]

---

### Q4 — Estado del breaker: in-memory vs Redis (Claude's discretion)

**Recomendación: in-memory module-level singleton, una entrada por callSite.** Razones:
1. **N=1 + maxRetries:0** → el costo de "re-descubrir" la saturación en una lambda fría es **UN fallo rápido** (un 503 inmediato, sin esperar retries). Redis ahorraría ese único fallo a cambio de **latencia de red en CADA llamada** (un GET extra por turno) — mal trade.
2. **Vercel Fluid Compute** reusa instancias → el breaker in-memory persiste entre invocaciones de la misma instancia, amortizando aún más.
3. El breaker es **información transitoria de 30s**, no estado de negocio. No requiere consistencia cross-lambda fuerte. Cada lambda gestiona su propia ventana de cooldown — aceptable y más simple.
4. **D-04** acota el módulo a v4 y pide mantenerlo simple; Redis (Upstash) añade infra+latencia sin beneficio dado N=1.

**Shape del breaker (por callSite):**
```ts
type BreakerState = 'closed' | 'open' | 'half_open'
interface Breaker { state: BreakerState; openedAt: number }
const breakers = new Map<CallSite, Breaker>()  // module singleton
```
- `closed`: intenta Gemini. Fallo saturación → `open`, `openedAt = now`, emite `circuit_opened`.
- `open` (dentro de 30s): salta Gemini, va directo a fallback, emite `fallback_triggered{ reason: 'circuit_open' }`.
- `open` y vencido cooldown → primera llamada entra como `half_open` (probe con tráfico real, D-08): intenta Gemini; OK → `closed` + `circuit_closed` + `probe_ok`; falla → re-`open` (resetea `openedAt`) + `fallback_triggered{ reason: 'probe_failed' }`.
- **Reset helper para tests:** `__resetBreakers()` exportado (Pitfall #3 — estado de módulo leakea entre tests).

**Concurrencia:** Node single-thread por instancia; sin race real dentro de una lambda. Múltiples llamadas concurrentes en `half_open` podrían enviar >1 probe — aceptable (sigue siendo barato y poco frecuente). Documentar como no-issue.

---

### Q5 — P95 latencias por call-site (D-06)

**Datos disponibles:** los 4 call-sites se envuelven con `runWithPurpose('<purpose>', ...)` y `generation-call`/`compliance-check` ya capturan `latencyMs = performance.now() - t0`. Los eventos `pipeline_decision` (`comprehension_completed`, etc.) van a `agent_observability_events`. Hay purpose labels `subloop_generation`, `subloop_compliance`, `comprehension`. [VERIFIED: generation-call.ts:54,81; compliance-check.ts:80,214; comprehension.ts:84,145]

**Pero v4 está DORMANT en prod** → hay poca data real de prod. El sandbox sí genera latencias.

**Recomendación: NO bloquear la fase en P95 perfecto.** Usar defaults sensatos con knob (constante editable):
| Call-site | Timeout default propuesto | Base |
|-----------|---------------------------|------|
| generation | **20000 ms** | redacción larga; ~2-3× P95 esperado 6-9s |
| comprehension | **10000 ms** | clasificación corta |
| compliance | **10000 ms** | check binario corto |
| vision | **15000 ms** | fetch base64 + multimodal |

Opcional (no-bloqueante): script `research-scripts/measure-callsite-p95.ts` que consulte `agent_observability_events` filtrando por `purpose`/label y compute P95 de `latencyMs`/`durationMs` — para afinar los defaults post-deploy. El plan puede dejarlos como constantes en el módulo del helper y ajustar con un PR pequeño si la telemetría lo pide.

---

### Q6 — Safety parity Anthropic (D-09 / Pitfall 6)

`safetySettings BLOCK_NONE` es **Gemini-only** (`providerOptions.google`). En Gemini, sin esto, menciones de alcohol/embarazo/anticoagulantes → bloqueo silencioso → `NoObjectGeneratedError` con `finishReason='SAFETY'`. [VERIFIED: generation-call.ts:65-78]

**Anthropic NO tiene `safetySettings` configurables** y **no bloquea por categorías de daño** del modo Gemini. Para contenido médico-adyacente fáctico (info de producto), Claude Haiku 4.5 **no refuses ni degrada** en structured output en la práctica (Claude responde a consultas médicas informativas normalmente; el prompt ya enmarca el rol como atención al cliente con material del KB). 

**Mitigación:** **ninguna acción especial requerida** en el branch Anthropic más allá de **NO enviar `providerOptions.google`** (Pitfall #7 — enviar safetySettings de google a Anthropic es un error de provider). Si en smoke real Haiku rehúsa algún caso médico (improbable), mitigar a nivel de prompt (system ya existe). [ASSUMED: Haiku 4.5 no rehúsa el contenido médico-informativo del KB Somnio — verificar en smoke con casos alcohol/embarazo/anticoagulante]

---

### Q7 — Observability events (D-10)

Seguir el patrón typed-union + dual emission de `interruption-system-v2/observability.ts`: tipo union de labels + `emitFallbackEvent(label, payload)` que hace `getCollector()?.recordEvent('pipeline_decision', label, payload)` + `console.log('[gemini-fallback] ...')`. [VERIFIED: interruption-system-v2/observability.ts:77-86]

**Labels propuestos (typed-union):**
```ts
export type FallbackEventLabel =
  | 'fallback_triggered'   // { callSite, provider:'anthropic', model, errorCode, errorKind:'saturation'|'timeout'|'probe_failed'|'circuit_open', latencyMs }
  | 'circuit_opened'       // { callSite, errorCode, gemini_latency_ms }
  | 'circuit_closed'       // { callSite, probe_latency_ms }
  | 'probe_ok'             // { callSite, gemini_latency_ms }
  | 'probe_failed'         // { callSite, errorCode }
  | 'fallback_failed'      // { callSite, gemini_error, anthropic_error } — doble fallo (Q8 / Pitfall #8)
```
Objetivo (CONTEXT D-10): auditar la **frecuencia REAL de saturación de Gemini** en prod/sandbox. `console.log` greppable + filas `pipeline_decision` en `agent_observability_events`.

---

### Q8 — Wiring architecture

**Consumidores de los call-sites (verificado por grep) — confirma sandbox+prod comparten:**
- `runGenerationCall` ← `sub-loop/index.ts`, `compliance-check.ts`, `somnio-v4-agent.ts`, `core/checkpoint-gate.ts`, tests integración.
- `comprehend` (v4) ← **solo** `somnio-v4/somnio-v4-agent.ts:32` (otros agentes tienen su propia `comprehension` → aislamiento Regla 6 automático).
- `classifyImage` ← `media/index.ts`, `media-gate.ts`.
- `checkCompliance` ← `sub-loop/index.ts`, `core/checkpoint-gate.ts`.

Sandbox (`somnio-v4/engine-v4.ts`) y prod (`engine/v4-production-runner.ts`) **comparten el core** (`core/turn-orchestrator.ts`) que invoca estos call-sites → el fallback aplica a AMBOS sin trabajo extra. [VERIFIED: grep + CLAUDE.md INTERRUPTION-PARITY]

**Helper shape recomendado** (módulo nuevo `src/lib/agents/somnio-v4/llm-fallback/`):
```ts
// callWithGeminiFallback.ts
export type CallSite = 'generation' | 'compliance' | 'comprehension' | 'vision'

export async function callWithGeminiFallback<T>(args: {
  callSite: CallSite
  gemini: (signal: AbortSignal) => Promise<T>      // construye + ejecuta la llamada Gemini (con maxRetries:0)
  anthropic: () => Promise<T>                        // construye + ejecuta la llamada Anthropic (schema saneado si aplica)
}): Promise<T>
```
- El helper aplica: lectura del breaker → si `open` salta a `anthropic()`; si `closed`/`half_open` intenta `gemini(AbortSignal.timeout(TIMEOUT[callSite]))`; catch `isGeminiSaturation || isAbortError` → abre breaker + emite eventos + `anthropic()`; otros errores (parse/schema) → **re-throw** (NO fallback, Pitfall #4).
- Cada call-site refactoriza su `generateText({ model: google(...), ... })` para pasar `gemini`/`anthropic` closures. La firma pública de cada call-site (`runGenerationCall`, `comprehend`, `checkCompliance`, `classifyImage`) **NO cambia** → consumidores intactos → cero cambios en `core/` (D-04, INTERRUPTION-PARITY).
- **`maxRetries: 0`** se setea en el closure `gemini` (no global).

**Regla 6 / threading asserts:** como NO se agregan campos a `TurnCoreInput` ni se toca `core/`, la "lección punto ciego de mocks" (asserts de threading por campo nuevo en la frontera del core) **no aplica** aquí — pero si el plan decidiera threadear algo nuevo al core, debe añadir el assert. Confirmar en plan-check que `git diff` toca SOLO los 4 call-sites + módulo nuevo + tests (v3/godentist/recompra/pw-confirmation byte-identical).

---

### Q9 — Tests (deterministas, sin LLM real)

**Helper de mock disponible:** `ai/test` exporta **`MockLanguageModelV3`** (constructor con `doGenerate` que puede ser función, resultado, o `Error` para simular fallo). [VERIFIED: node_modules/ai/dist/test/index.d.ts:133]

**Patrón existente a seguir:**
- `somnio-v4/__tests__/comprehension-gemini.test.ts` — E2E real con `describe.skipIf(!process.env.GOOGLE_GENERATIVE_AI_API_KEY)` (no corre en CI sin secret). [VERIFIED]
- `somnio-pw-confirmation` tests mockean `generateObject` (vi.mock).

**Tests propuestos (unit, deterministas):**
1. **Breaker FSM con fake timers:** `vi.useFakeTimers()` → fallo abre breaker → 2ª llamada salta a anthropic → `vi.advanceTimersByTime(30_000)` → 3ª llamada hace probe Gemini → OK cierra / falla re-abre. Reset entre tests con `__resetBreakers()` (Pitfall #3).
2. **Predicado `isGeminiSaturation`:** tabla de casos — `APICallError` 503/429/500/504, mensaje "high demand", `MODEL_CAPACITY_EXHAUSTED`, `RetryError`-wrapped, AbortError, vs `NoObjectGeneratedError` (debe ser FALSE), error de red genérico.
3. **Contract parity:** mockear ambos providers con `MockLanguageModelV3` devolviendo el MISMO objeto → assert que `safeAccessOutput`/`result.object` produce el mismo Zod-validado shape desde ambos. Incluir el caso **schema saneado de comprehension** (sin min/max) valida rango 0..1 en post-parse.
4. **Fallback trigger:** `gemini` closure arroja `APICallError(503,"high demand")` → assert que se llama `anthropic` closure y se emite `fallback_triggered`.
5. **No-fallback en parse error:** `gemini` arroja `NoObjectGeneratedError` → assert que **re-throws** y NO llama anthropic (Pitfall #4).
6. **Doble fallo:** ambos closures fallan → assert error path original + `fallback_failed` event.
7. **Regla 6 no-regresión:** correr la suite canónica v4 (358 passed | 7 skipped, comando en LEARNINGS de consolidación) + `git diff --stat` asserta solo paths permitidos.
8. **Observability:** mock collector, assert los 6 labels y payloads (estilo `interruption-system-v2/__tests__/observability`).

**Reset helper obligatorio** para que el breaker module-singleton no leakee entre tests (`afterEach(__resetBreakers)`).

---

### Q10 — (Pitfalls — ver sección dedicada abajo)

---

## Architecture Patterns

### Diagrama de flujo (por call-site)

```
call-site (runGenerationCall / comprehend / checkCompliance / classifyImage)
   │  construye closures gemini(signal) + anthropic()
   ▼
callWithGeminiFallback({ callSite, gemini, anthropic })
   │
   ├─ breaker[callSite].state == 'open' (dentro de 30s)? ──SÍ──► anthropic()  [fallback_triggered: circuit_open]
   │
   ├─ 'open' y cooldown vencido ► half_open (probe)
   │
   └─ 'closed' | 'half_open':
        try gemini(AbortSignal.timeout(TIMEOUT[callSite]), maxRetries:0)
          ├─ OK ──► (si half_open: close + circuit_closed + probe_ok) ► return Gemini result
          └─ catch err:
               ├─ isGeminiSaturation(err) || isAbortError(err) ─► open breaker + [circuit_opened/probe_failed]
               │                                                   ► anthropic()  [fallback_triggered]
               │        └─ anthropic() falla ─► [fallback_failed] ► throw (vision: fail-safe handoff D-07)
               └─ otro error (parse/schema/NoObjectGenerated) ─► THROW (NO fallback — Pitfall #4)
```

### Estructura de archivos propuesta
```
src/lib/agents/somnio-v4/llm-fallback/
├── index.ts                  # callWithGeminiFallback + tipos
├── breaker.ts                # FSM in-memory + __resetBreakers()
├── saturation.ts             # isGeminiSaturation + isTimeout
├── observability.ts          # typed-union FallbackEventLabel + emitFallbackEvent
├── config.ts                 # TIMEOUT_MS por callSite + COOLDOWN_MS + FALLBACK_MODEL
└── __tests__/                # breaker, saturation, parity, observability
```
Los 4 call-sites importan `callWithGeminiFallback` y envuelven su llamada. `comprehension` además exporta/usa un schema saneado para el branch Anthropic.

---

## Don't Hand-Roll

| Problema | NO construir | Usar | Por qué |
|----------|--------------|------|---------|
| Detección de error retryable | parsing manual de strings de error | `APICallError.isInstance` + `statusCode` | el SDK ya estructura `statusCode`/`isRetryable` |
| Timeout | `Promise.race` con setTimeout manual | `AbortSignal.timeout(ms)` + `abortSignal` | el SDK cancela el fetch real; menos leaks |
| Mock de LLM en tests | fake objects ad-hoc | `MockLanguageModelV3` de `ai/test` | shape correcto del provider V3 |
| Singleton lazy | re-instanciar | patrón Proxy/module-let de `redis-client.ts` | ya validado en el codebase |
| Structured output Anthropic | SDK Anthropic crudo | `generateObject`/`Output.object` (con schema saneado) | ya probado en `somnio-pw-confirmation` |

---

## Pitfalls (numerados, accionables)

**Pitfall #1 — Anthropic rechaza `min`/`max`/`int` en schema de structured output.**
`comprehension-schema.ts` usa `z.number().min(0).max(1)` en `intent_confidence`/`secondary_confidence`. Anthropic devuelve **400** si el JSON Schema lleva `minimum`/`maximum`/`exclusiveMinimum` (issues vercel/ai #14342, #13355); Zod4 `.int()` también. → El branch Anthropic de comprehension DEBE usar un **schema saneado** (mismo shape, sin `.min/.max/.int`) y validar el rango 0..1 en post-parse (el código ya tiene `parseAnalysis` resiliente — extender ahí). Gemini NO tiene este problema (ignora los keywords). Generation usa `z.number()` pelado → OK. Compliance/visión booleans/enums → OK.

**Pitfall #2 — `maxRetries:0` NO arroja `AI_RetryError`.** Arroja el `APICallError` crudo. Un predicado que sólo matchee `RetryError` (como sugería el brief) **nunca dispararía** el fallback. Matchear `APICallError` + statusCode + message.

**Pitfall #3 — El breaker module-singleton leakea estado entre tests de vitest.** Exportar `__resetBreakers()` y llamarlo en `afterEach`. Sin esto, un test que abre el circuito contamina el siguiente.

**Pitfall #4 — Enmascarar bugs de schema como saturación.** Si `gemini()` arroja `NoObjectGeneratedError`/parse error (bug de schema, no saturación), NO hacer fallback — eso esconde el bug y desperdicia una llamada Anthropic que fallará igual. El predicado de fallback es **solo saturación (APICallError 5xx/429+msg) + timeout/abort**. Parse/schema/validation → re-throw al path original.

**Pitfall #5 — `comprehension.ts` ya re-envuelve el error de generateText** en un `new Error("[Comprehension-v4 generateText] ...")` con todas las props (líneas 102-120). Eso **destruye la instancia `APICallError`** → `APICallError.isInstance` daría false dentro del helper. → El wrapping de fallback debe ir **alrededor del `generateText`** (antes del re-throw diagnóstico), o el predicado debe matchear por `message` también (el regex incluye "high demand"). Recomendación: el closure `gemini` para comprehension hace el `generateText` "limpio"; el diagnostic re-throw se preserva solo para errores NO-saturación.

**Pitfall #6 — Abort no garantiza cancelar el billing de Gemini en vuelo.** Aceptable (evento poco frecuente, costo ~$0.0001). No intentar "cancelar el cargo".

**Pitfall #7 — `providerOptions.google.safetySettings` NO debe enviarse a Anthropic.** Es google-only; el branch Anthropic lo omite. Enviarlo a Anthropic causaría warning/ignore o error. Construir el `anthropic()` closure SIN `providerOptions.google`.

**Pitfall #8 — Doble fallo (Gemini + Anthropic).** Propagar el error path original de cada call-site: visión → `FAIL_SAFE` handoff (D-07); comprehension → su error actual; generation/compliance → su throw. Emitir `fallback_failed` para observabilidad. NUNCA un tercer provider (techo Haiku 4.5).

**Pitfall #9 — Regla 6.** El diff debe tocar SOLO: los 4 call-sites + módulo `llm-fallback/` + tests. v3/godentist/recompra/pw-confirmation byte-identical. `comprehend` lo importa solo `somnio-v4-agent.ts` (otros agentes tienen su propia comprehension) — pero verificar que el cambio en `comprehension.ts` (v4) no afecta a nadie más vía grep.

**Pitfall #10 — `claude-client.ts:29` mapea `claude-haiku-4-5`→Sonnet.** NO usar ese wrapper. Importar `anthropic` de `@ai-sdk/anthropic` directo con el literal `'claude-haiku-4-5'`.

**Pitfall #11 — `image-classifier.ts` usa `rawResult.experimental_output`** (no `result.output` ni `safeAccessOutput`). El branch Anthropic debe producir el mismo acceso, o normalizar ambos a `safeAccessOutput`. Verificar que `experimental_output` existe igual con Anthropic (o migrar a `safeAccessOutput` para paridad — recomendado).

---

## Validation Architecture

> `nyquist_validation`: incluir (config no lo desactiva explícitamente).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest |
| Quick run | `npx vitest run src/lib/agents/somnio-v4/llm-fallback/` |
| Full suite (no-regresión v4) | suite canónica v4 (358 passed \| 7 skipped — comando en `somnio-v4-consolidation/LEARNINGS.md`) |
| E2E real (opt-in) | `describe.skipIf(!process.env.ANTHROPIC_API_KEY)` + `!process.env.GOOGLE_GENERATIVE_AI_API_KEY` |

### Phase Requirements → Test Map
| Behavior | Test Type | Comando | Existe? |
|----------|-----------|---------|---------|
| Predicado saturación robusto (D-05) | unit | `vitest run .../saturation.test.ts` | ❌ Wave 0 |
| Breaker FSM 30s cooldown + probe (D-07/D-08) | unit (fake timers) | `vitest run .../breaker.test.ts` | ❌ Wave 0 |
| Paridad de shape Gemini↔Anthropic (D-09) | unit (MockLanguageModelV3) | `vitest run .../parity.test.ts` | ❌ Wave 0 |
| Schema saneado comprehension (Pitfall #1) | unit | `vitest run .../parity.test.ts` | ❌ Wave 0 |
| No-fallback en parse error (Pitfall #4) | unit | `vitest run .../index.test.ts` | ❌ Wave 0 |
| Eventos pipeline_decision (D-10) | unit (mock collector) | `vitest run .../observability.test.ts` | ❌ Wave 0 |
| No-regresión Regla 6 | suite + `git diff --stat` | suite canónica v4 | ✅ existe |
| Fallback real end-to-end | E2E opt-in (smoke con saturación inyectada via mock provider) | manual | ❌ Wave 0 |

### Sampling Rate
- **Por commit:** `npx vitest run src/lib/agents/somnio-v4/llm-fallback/`
- **Por merge:** suite canónica v4 completa (gate Regla 6).
- **Pre-flip RAG:** smoke v4 sandbox con saturación simulada (inyectar `MockLanguageModelV3` que arroja 503) → confirmar que el cliente recibe respuesta Haiku sin handoff.

### Wave 0 Gaps
- [ ] `llm-fallback/__tests__/saturation.test.ts`
- [ ] `llm-fallback/__tests__/breaker.test.ts` (+ `__resetBreakers`)
- [ ] `llm-fallback/__tests__/parity.test.ts` (MockLanguageModelV3)
- [ ] `llm-fallback/__tests__/observability.test.ts`
- [ ] schema saneado de comprehension para el branch Anthropic

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `ai` | core | ✓ | 6.0.86 | — |
| `@ai-sdk/anthropic` | branch fallback | ✓ | 3.0.44 | — |
| `@ai-sdk/google` | branch primario | ✓ | 3.0.67 | — |
| `ANTHROPIC_API_KEY` | branch fallback | ✓ (ya en uso) | — | — |
| `GOOGLE_GENERATIVE_AI_API_KEY` | branch primario | ✓ (ya en uso) | — | — |
| Upstash Redis | breaker (NO usado) | ✓ existe | 1.38.0 | in-memory (recomendado) |

**Sin dependencias faltantes ni bloqueantes.**

---

## Assumptions Log

| # | Claim | Sección | Risk si está mal |
|---|-------|---------|------------------|
| A1 | El shape de image part de AI SDK (`{type:'image', image, mediaType}`) es provider-agnóstico y funciona con Haiku 4.5 | Q2 | Visión fallback falla → smoke lo detecta; mitigación: ajustar part shape |
| A2 | Haiku 4.5 no rehúsa contenido médico-informativo del KB Somnio (alcohol/embarazo/anticoagulantes) | Q6 | Respuesta degradada en fallback → smoke con esos casos lo detecta |
| A3 | `Output.object` funciona con Anthropic igual que con Google (sino, caer a `generateObject`) | Q2 | Fricción menor; `generateObject` ya probado en codebase |

---

## Open Questions

1. **¿`Output.object` o `generateObject` para el branch Anthropic?** — Recomendación: intentar `Output.object` (reusa `safeAccessOutput`); si hay fricción, `generateObject`+`result.object`. El plan elige; ambos preservan D-09. El codebase ya prueba `generateObject` con Anthropic.
2. **P95 reales** — v4 DORMANT en prod → poca data. Usar defaults (Q5) + script opcional para afinar. No bloqueante.
3. **`image-classifier.ts` `experimental_output`** — ¿migrar a `safeAccessOutput` para paridad, o mantener `experimental_output` y verificar que Anthropic lo expone igual? Recomendación: migrar a `safeAccessOutput` (consistencia con los otros 3 call-sites). El plan decide.
4. **Probe concurrente en half_open** — múltiples requests concurrentes tras cooldown podrían lanzar >1 probe Gemini. Aceptable (barato/raro); documentar como no-issue o añadir flag `probing` simple.

---

## Sources

### Primary (HIGH)
- node_modules locales: `ai@6.0.86` (`dist/index.js:2592-2645` retry logic, `dist/test/index.d.ts` MockLanguageModelV3), `@ai-sdk/google@3.0.67` (`dist/index.js:43-57` error handler), `@ai-sdk/provider` (`APICallError`), `@ai-sdk/provider-utils` (`isAbortError`)
- platform.claude.com/docs/en/about-claude/models/overview — model IDs, visión, context
- platform.claude.com/docs/en/about-claude/pricing — pricing, Haiku 3.5 RETIRADO
- Código del repo: `generation-call.ts`, `compliance-check.ts`, `comprehension.ts`, `image-classifier.ts`, `safe-output.ts`, `comprehension-schema.ts`, `claude-client.ts:29`, `somnio-pw-confirmation/comprehension.ts`, `interruption-system-v2/{redis-client,observability}.ts`, `observability/context.ts`
- `.planning/standalone/somnio-v4-consolidation/GATE-W2.md` — evidencia saturación

### Secondary (MEDIUM)
- github.com/vercel/ai/issues/14342, /issues/13355 — Anthropic 400 en min/max/int
- discuss.ai.google.dev/t/handling-429-503-errors-from-the-gemini-api/124640 — status 503/429 "high demand"

---

## Metadata
**Confianza:** Stack ALTA · Modelos/pricing ALTA (docs oficiales) · Error shapes ALTA (node_modules) · Visión Anthropic MEDIA (A1) · Safety parity MEDIA (A2)
**Research date:** 2026-06-11 · **Valid until:** ~2026-07-11 (modelos/pricing pueden cambiar; verificar IDs antes de ejecutar)
