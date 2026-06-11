---
phase: gemini-fallback-haiku
date: 2026-06-11
depth: deep
files_reviewed:
  - src/lib/agents/somnio-v4/llm-fallback/config.ts
  - src/lib/agents/somnio-v4/llm-fallback/saturation.ts
  - src/lib/agents/somnio-v4/llm-fallback/breaker.ts
  - src/lib/agents/somnio-v4/llm-fallback/observability.ts
  - src/lib/agents/somnio-v4/llm-fallback/index.ts
  - src/lib/agents/somnio-v4/sub-loop/generation-call.ts
  - src/lib/agents/somnio-v4/sub-loop/compliance-check.ts
  - src/lib/agents/somnio-v4/comprehension.ts
  - src/lib/agents/media/image-classifier.ts
  - src/lib/agents/somnio-v4/llm-fallback/__tests__/breaker.test.ts
  - src/lib/agents/somnio-v4/llm-fallback/__tests__/index.test.ts
  - src/lib/agents/somnio-v4/llm-fallback/__tests__/observability.test.ts
  - src/lib/agents/somnio-v4/llm-fallback/__tests__/saturation.test.ts
  - src/lib/agents/somnio-v4/sub-loop/__tests__/fallback-parity.test.ts
  - src/lib/agents/somnio-v4/__tests__/comprehension-fallback-parity.test.ts
  - src/lib/agents/media/__tests__/image-classifier-fallback.test.ts
status: issues-found
findings:
  critical: 0
  high: 1
  medium: 4
  low: 3
---

# Review: gemini-fallback-haiku (deep)

**Rango:** `1b04142c..8be04f6d` (base `d29f199e`), excluyendo commits interleaved de whatsapp-inbox-reliability / agent-varixcenter.

## Resumen

El módulo `llm-fallback` está bien construido en sus fundamentos: el breaker in-memory degrada correctamente en serverless (Map acotado a 4 keys fijas, cero timers que sobrevivan al request, cero crecimiento de estado), Pitfall #10 está honrado (0 imports reales de `claude-client.ts` — verificado por grep, solo comentarios LANDMINE), los parse errors NO disparan fallback (Pitfall #4 implementado y testeado), el abort de Gemini NO se filtra a la llamada Haiku (el closure `anthropic` no recibe el signal), la observability es sync push-only sin I/O (no puede tumbar el turno) y sin PII (solo `err.name` + metadatos), y la paridad de prompt/messages/schema entre branches es real en los 4 call-sites (system/messages factorizados y compartidos; `temperature: 0.3` presente en ambos branches de generation).

Los hallazgos se concentran en tres frentes: (1) un **falso negativo del predicado de saturación para errores de red** que, combinado con `maxRetries:0`, deja al path Gemini ESTRICTAMENTE peor que antes de la fase ante fallos de conexión (High — es la condición para la que existe el módulo); (2) el **branch Anthropic corre sin timeout ni maxRetries explícito** — latencia no acotada exactamente en el camino que se ejecuta durante un outage; (3) **drift de paridad en el schema saneado de comprehension** (describe de calibración perdido + sanitización por lista fija de campos frágil ante evolución del schema).

## Hallazgos

### H-01 (High) — Errores de red de Gemini NO disparan fallback, y la fase eliminó el retry del SDK que antes los cubría

**File:** `src/lib/agents/somnio-v4/llm-fallback/saturation.ts:24-35` (+ los 4 call-sites con `maxRetries: 0`)

**Descripción:** Cuando el fetch a Gemini falla a nivel de red (DNS, connection refused, ECONNRESET, TLS), `@ai-sdk/provider-utils` lo envuelve en un `APICallError` con `message: "Cannot connect to API: ..."`, `isRetryable: true` y `statusCode: undefined` (verificado en `node_modules/@ai-sdk/provider-utils/dist/index.js:494-514`). Ese shape NO matchea el predicado: no hay statusCode, el mensaje no contiene ningún patrón de `SATURATION_MSG`, y `isAbortError` es false → `callWithGeminiFallback` re-throwea SIN fallback (`index.ts:52-55`).

Esto es peor que el estado pre-fase: antes, `maxRetries` default=2 hacía que el SDK reintentara estos errores retryables (un blip de red se recuperaba solo); ahora con `maxRetries: 0` no hay retry NI fallback → el turno falla duro. Es una regresión para la clase de error operacionalmente más cercana a la saturación (outage de la API de Gemini que no responde HTTP). El test `saturation.test.ts:89-91` solo cubre `new Error('ECONNRESET')` pelado — un shape que el SDK nunca arroja; el shape real (`APICallError` "Cannot connect to API") no está cubierto.

**Fix sugerido:**
```ts
if (APICallError.isInstance(e)) {
  if (e.statusCode === 503 || e.statusCode === 429 || e.statusCode === 500 || e.statusCode === 504) return true
  // Network-level failure: provider-utils envuelve fetch errors con statusCode undefined
  // + isRetryable=true + message "Cannot connect to API" (handleFetchError).
  if (e.statusCode == null && e.isRetryable === true) return true
  ...
}
```
+ test con `new APICallError({ message: 'Cannot connect to API: fetch failed', statusCode: undefined, isRetryable: true, ... })` → `true`.

### M-01 (Medium) — Branch Anthropic sin timeout guard ni maxRetries explícito (los 4 call-sites)

**Files:** `generation-call.ts:93-104`, `compliance-check.ts:223-232`, `comprehension.ts:137-146`, `image-classifier.ts:171-177`; contrato en `llm-fallback/index.ts:24`

**Descripción:** El closure `anthropic` no recibe AbortSignal (la firma `anthropic: () => Promise<T>` no lo contempla) y no setea `maxRetries`, heredando el default del SDK (=2, con backoff exponencial). El peor camino — Gemini saturado + Haiku lento/degradado (529 overloaded es plausible: un outage de Gemini empuja tráfico a Anthropic globalmente) — queda con latencia NO acotada: hasta 3 intentos con backoff sin ningún timeout. Contradice el requisito central del standalone ("súper responsivo", D-05/D-06: el cliente no paga latencia acumulada) y en generation puede colgar el turno mucho más allá de los 20s presupuestados. Ningún PLAN/SUMMARY decide esto explícitamente (no es deviation sancionada).

**Fix sugerido:** cambiar el contrato a `anthropic: (signal: AbortSignal) => Promise<T>` y que el helper pase `AbortSignal.timeout(TIMEOUT_MS[callSite])` fresco (NO el de Gemini, para no heredar un signal ya vencido); en los 4 closures agregar `abortSignal: signal` + `maxRetries: 0` (o `1` si se quiere un retry de cortesía en el último recurso — decisión explícita).

### M-02 (Medium) — `fallback_failed` NO se emite cuando Haiku falla con el circuito abierto

**File:** `src/lib/agents/somnio-v4/llm-fallback/index.ts:30-35`

**Descripción:** En el path `state === 'open'` se hace `return anthropic()` sin try/catch. Si Haiku falla ahí, el error propaga sin emitir `fallback_failed` — a diferencia del path post-saturación (líneas 72-81) que sí lo emite. Durante un outage sostenido, la MAYORÍA de las llamadas van por el path circuit_open (cooldown 30s), así que el evento que existe precisamente para auditar doble fallo subreporta justo cuando más importa. El contrato D-10 (`fallback_failed` = doble fallo) queda inconsistente entre paths.

**Fix sugerido:**
```ts
if (state === 'open') {
  emitFallbackEvent('fallback_triggered', { ... })
  try {
    return await anthropic()
  } catch (anthropicErr) {
    emitFallbackEvent('fallback_failed', {
      callSite, gemini_error: 'circuit_open',
      anthropic_error: anthropicErr instanceof Error ? anthropicErr.name : String(anthropicErr),
    })
    throw anthropicErr
  }
}
```
(Nota: requiere `return await` en vez de `return` para que el catch capture.)

### M-03 (Medium) — Schema saneado de comprehension pierde el describe de calibración → drift de confidence en el branch Haiku

**File:** `src/lib/agents/somnio-v4/comprehension.ts:60-65` vs `comprehension-schema.ts:49-67`

**Descripción:** `MessageAnalysisSchemaSanitized` reemplaza `intent_confidence`/`secondary_confidence` con `.describe('0..1 self-reported confidence')` / `.describe('0..1 o null')`. El original lleva la guía de calibración completa en el describe ("0.85+ = universal-claro, 0.50-0.70 = context-dependent, <0.40 = sumidero... D-74 do NOT use prior conversation phase") — y el describe del schema ES parte del prompt en structured output. El branch Haiku auto-reporta confidence SIN esos anchors → la distribución de `intent_confidence` puede desplazarse sistemáticamente vs Gemini, y ese valor alimenta el gate de low-confidence → sub-loop/handoff. Es exactamente el tipo de drift que D-09 ("mismo prompt, mismo shape") quería prevenir; solo se removieron los bounds, pero se removió también la semántica.

**Fix sugerido:** copiar el texto completo del describe original en los dos campos saneados (solo quitar `.min(0).max(1)`, no el `.describe(...)`).

### M-04 (Medium) — Sanitización por lista fija de campos: cualquier campo futuro con bounds rompe el branch Anthropic en silencio (+ assert débil en el test)

**Files:** `src/lib/agents/somnio-v4/comprehension.ts:60-65`; `src/lib/agents/somnio-v4/__tests__/comprehension-fallback-parity.test.ts:107-119`

**Descripción:** `MessageAnalysisSchemaSanitized` sanea exactamente 2 campos conocidos. El schema base evoluciona (ej.: `secondary_confidence` fue agregado por un standalone POSTERIOR a la creación del schema) — si mañana se agrega otro `z.number().min/.max/.int()` a `MessageAnalysisSchema`, el sanitized lo hereda con bounds → Anthropic responde 400 → el fallback de comprehension falla SIEMPRE, y el bug solo se descubre durante el siguiente outage de Gemini (la peor ventana posible). El guard de regresión que existe es débil: el test asserta `countMaxSanitized < countMaxOriginal` (línea 118), que seguiría pasando con un bound residual.

**Fix sugerido:** (a) endurecer el assert a `expect(countMaxSanitized).toBe(0)` + mismo check para `"minimum"` y `"exclusiveMinimum"` (hoy debería dar 0 — es gratis); (b) opcional, más robusto: derivar el sanitized recorriendo el JSON Schema y removiendo bounds genéricamente, en vez de lista fija de campos.

### L-01 (Low) — Phantom dependency: `@ai-sdk/provider-utils` importado sin estar declarado en package.json

**File:** `src/lib/agents/somnio-v4/llm-fallback/saturation.ts:10`

**Descripción:** `isAbortError` se importa de `@ai-sdk/provider-utils`, que es dependencia transitiva (no está en `package.json`; primer import directo en `src/`). Resuelve hoy por hoisting, pero un dedupe/upgrade de npm puede romper el build o resolver una versión con semántica distinta. Memoria del proyecto ya registra que sub-proyectos/deps rompen el build de Vercel de formas no obvias.

**Fix sugerido:** declarar `@ai-sdk/provider-utils` en `dependencies`, o re-implementar el predicado local (3 nombres: `AbortError | ResponseAborted | TimeoutError`) — es trivial y elimina la dependencia.

### L-02 (Low) — Half-open sin gate de probe único: estampida de probes concurrentes que en outage tipo "hang" cuesta TIMEOUT_MS completo por request

**File:** `src/lib/agents/somnio-v4/llm-fallback/breaker.ts:34-42` + `index.ts:38-41`

**Descripción:** `effectiveState` promueve a `half_open` por cómputo (no persiste la transición ni marca "probing"), así que TODAS las requests concurrentes tras vencer el cooldown prueban Gemini en paralelo hasta que la primera falla y re-abre. Con saturación fast-503 el costo es solo llamadas Gemini extra (documentado como aceptado en RESEARCH Q4/Open Q4 — no se re-reporta eso). El matiz NO documentado: en un outage tipo hang (timeout-class), cada request del paquete de probes paga el `TIMEOUT_MS` completo (20s en generation) antes de caer a Haiku, cada 30s por instancia.

**Fix sugerido (opcional):** flag `probing: boolean` en `BreakerEntry` — la primera request en half_open lo setea y las demás van directo a fallback; se limpia en close/reopen.

### L-03 (Low) — T-fb-08 (04-SUMMARY) atribuye a `fetchAsBase64` una mitigación que no existe

**File:** `src/lib/agents/media/image-classifier.ts:100-105` (código pre-existente, no tocado por la fase)

**Descripción:** El 04-SUMMARY cierra T-fb-08 (DoS por imagen grande/fetch lento) afirmando que "fetchAsBase64 + el AbortSignal.timeout del orquestador acotan" — pero `fetchAsBase64` corre ANTES de `callWithGeminiFallback` y su `fetch` no lleva signal: el timeout del orquestador no lo cubre en absoluto. Un fetch colgado cuelga `classifyImage` hasta el timeout del runtime. El código es pre-existente (no se reporta como bug de la fase); lo que se reporta es que el threat-model de la fase lo da por mitigado incorrectamente.

**Fix sugerido:** `fetch(url, { signal: AbortSignal.timeout(10_000) })` en un follow-up, o corregir la nota T-fb-08.

## Notas

Verificaciones que PASARON (sin hallazgo):

- **Breaker en serverless:** estado acotado (Map con máximo 4 keys), sin timers vivos post-request (`AbortSignal.timeout` no retiene el event loop en Node y no requiere clearTimeout), sin races dañinas dentro de la instancia (single-thread; doble `openBreaker` concurrente solo duplica el evento `circuit_opened` — ruido menor de observability). Cada instancia aprende por separado: documentado y aceptable.
- **Pitfall #4 (parse errors no disparan fallback):** implementado en `index.ts:52-55`, testeado en `index.test.ts:68-85` y `saturation.test.ts:77-87`. Un output inválido de Gemini propaga por el path original sin tocar el breaker ni Anthropic.
- **Abort no se filtra a Haiku:** el closure `anthropic` no recibe el signal de Gemini — imposible que el timeout de Gemini aborte la llamada Haiku. El error de abort se clasifica vía `isAbortError` (TimeoutError/AbortError) y no como saturación.
- **Pitfall #10:** 0 imports reales de `claude-client.ts` en módulo y call-sites; `anthropic('claude-haiku-4-5')` literal de `@ai-sdk/anthropic` en los 4.
- **Doble fallo preserva semántica upstream:** generation → catch `emitRagError` en `sub-loop/index.ts:382-391` (handoff path intacto); comprehension → re-wrap diagnóstico `[Comprehension-v4 generateText]` idéntico al pre-fase; vision → fail-safe handoff D-07 (catch externo intacto, testeado); compliance → throw como pre-fase. El discriminador `interrupted_at_ckpt_` no colisiona con ningún error nuevo.
- **Observability fire-and-forget:** `recordEvent` es push sync a buffer con try/catch interno (collector.ts:153-171) — un fallo de insert no puede tumbar el turno. Payloads solo llevan `err.name` + metadatos — sin PII, sin contenido del usuario, sin API keys.
- **Paridad de contrato (CR-01 bug-class):** system/messages compartidos por factorización en compliance, mismos args en generation/comprehension/vision; `temperature: 0.3` en ambos branches de generation; los demás call-sites no setean temperature en NINGÚN branch (paridad por omisión — ambos providers default 1.0); vision pasa el mismo `visionContent` (image part + text) a ambos. `clampConfidence` cubre los 2 campos que el schema saneado dejó sin bounds y se aplica antes del strict parse (que re-impone min/max). El schema de generation (`z.number()` pelado) y compliance/vision (booleans/enums/strings) no necesitan saneo — verificado por grep en los schemas.
- **Paridad-test ciega a los closures reales:** `fallback-parity.test.ts` construye sus propios closures (no ejecuta los de `generation-call.ts`/`compliance-check.ts`) — un campo dropeado en el closure real no lo detectaría. Mitigado parcialmente porque la revisión manual de los closures no encontró campos dropeados (salvo M-01, que es deliberadamente la ausencia de maxRetries/signal), y el plan declaró el approach como decisión. Queda como contexto para H-01/M-01, no como hallazgo aparte.

---

_Reviewed: 2026-06-11_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
