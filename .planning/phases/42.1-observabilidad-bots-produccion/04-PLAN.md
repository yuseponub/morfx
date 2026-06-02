---
phase: 42.1-observabilidad-bots-produccion
plan: 04
type: execute
wave: 2
depends_on: [02]
files_modified:
  - src/lib/observability/prompt-version.ts
  - src/lib/observability/anthropic-instrumented.ts
  - src/lib/observability/fetch-wrapper.ts
  - src/lib/observability/collector.ts
autonomous: true

must_haves:
  truths:
    - "hashPrompt(systemPrompt, model, params) retorna SHA-256 hex estable independiente de orden de keys"
    - "createInstrumentedAnthropic() es el unico punto donde se construye new Anthropic() en el repo (excepto el helper mismo)"
    - "El fetch wrapper en modo 'anthropic' captura: messages enviados, response content, tokens (input/output/cache), modelo, duracion, status"
    - "Los aiCalls guardan systemPrompt y promptHash en memoria; la dedup contra agent_prompt_versions sucede en flush (Plan 07)"
    - "El wrapper NO rompe streaming responses de Anthropic (detecta Content-Type y pasa por fast-path sin intentar .json())"
  artifacts:
    - path: "src/lib/observability/prompt-version.ts"
      provides: "hashPrompt + resolvePromptVersions (upsert logic)"
      contains: "createHash\\('sha256'\\)"
    - path: "src/lib/observability/anthropic-instrumented.ts"
      provides: "createInstrumentedAnthropic factory"
      contains: "new Anthropic"
    - path: "src/lib/observability/fetch-wrapper.ts"
      provides: "Rama 'anthropic' completa con recordAiCall real"
  key_links:
    - from: "src/lib/observability/anthropic-instrumented.ts"
      to: "src/lib/observability/fetch-wrapper.ts"
      via: "new Anthropic({ fetch: makeObservableFetch(fetch, 'anthropic') })"
      pattern: "makeObservableFetch\\(fetch, 'anthropic'\\)"
---

<objective>
Completar el interceptor de llamadas a Claude: hashing de prompts, factory unico `createInstrumentedAnthropic`, y completar la rama `anthropic` del fetch wrapper para que extraiga request body (messages, system prompt, params) y response body (content, tokens, stop_reason).

Purpose: Captura completa de IA calls con deduplicacion de prompts (Decision #7 del context, Pattern 5 + Pitfall 4 del research). Prepara la dedup; la persistencia real sucede en flush (Plan 07).
Output: Factory unica para construir Anthropic clients + wrapper capturando cada call.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/42.1-observabilidad-bots-produccion/42.1-RESEARCH.md
@.planning/phases/42.1-observabilidad-bots-produccion/42.1-02-SUMMARY.md
@.planning/phases/42.1-observabilidad-bots-produccion/42.1-03-SUMMARY.md
@src/lib/observability/fetch-wrapper.ts
@src/lib/observability/collector.ts
@src/lib/observability/types.ts
@src/lib/observability/pricing.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: prompt-version.ts + anthropic-instrumented.ts</name>
  <files>
src/lib/observability/prompt-version.ts
src/lib/observability/anthropic-instrumented.ts
  </files>
  <action>
1. `src/lib/observability/prompt-version.ts`:

```typescript
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Hash estable de un prompt + configuracion. Normaliza whitespace y
 * usa orden de keys fijo (p, m, t, x) para evitar duplicados por key order.
 * Ver Pitfall 4 del research.
 */
export function hashPrompt(
  systemPrompt: string,
  model: string,
  params: { temperature?: number; maxTokens?: number },
): string {
  const normalized = JSON.stringify({
    p: systemPrompt.trim().replace(/\s+/g, ' '),
    m: model,
    t: params.temperature ?? null,
    x: params.maxTokens ?? null,
  })
  return createHash('sha256').update(normalized).digest('hex')
}

/**
 * Upsert batch de prompt versions via INSERT ... ON CONFLICT DO UPDATE
 * que devuelve el id tanto en insert como en conflict.
 * Recibe un Map<promptHash, {systemPrompt, model, temperature, maxTokens, provider}>.
 * Retorna Map<promptHash, id>.
 * USA createRawAdminClient (el caller pasa el cliente).
 */
export async function resolvePromptVersions(
  supabase: SupabaseClient,
  prompts: Map<string, { systemPrompt: string; model: string; temperature?: number; maxTokens?: number; provider: string }>,
): Promise<Map<string, string>> {
  if (prompts.size === 0) return new Map()

  const rows = Array.from(prompts.entries()).map(([hash, p]) => ({
    prompt_hash: hash,
    system_prompt: p.systemPrompt,
    model: p.model,
    temperature: p.temperature ?? null,
    max_tokens: p.maxTokens ?? null,
    provider: p.provider,
  }))

  // Supabase upsert con onConflict + ignoreDuplicates:false para devolver ids
  const { data, error } = await supabase
    .from('agent_prompt_versions')
    .upsert(rows, { onConflict: 'prompt_hash', ignoreDuplicates: false })
    .select('id, prompt_hash')

  if (error) throw error

  const result = new Map<string, string>()
  for (const row of data ?? []) result.set(row.prompt_hash, row.id)
  return result
}
```

NOTA: si el driver de supabase-js no devuelve rows en upsert conflict con ignoreDuplicates:false de forma confiable, usar como fallback un SELECT posterior por prompt_hash IN (...) y hacer merge. Esto se valida en Plan 07 cuando se wire al flush real.

2. `src/lib/observability/anthropic-instrumented.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { makeObservableFetch } from './fetch-wrapper'

interface CreateInstrumentedAnthropicOpts {
  apiKey?: string
  baseURL?: string
}

/**
 * UNICO punto de construccion de clientes Anthropic en el repo.
 * Inyecta el fetch wrapper. Cuando feature flag OFF, el wrapper hace fast-path.
 *
 * Plan 05/06 migran las 10 call sites actuales para usar este helper.
 */
export function createInstrumentedAnthropic(opts: CreateInstrumentedAnthropicOpts = {}): Anthropic {
  return new Anthropic({
    apiKey: opts.apiKey ?? process.env.ANTHROPIC_API_KEY,
    baseURL: opts.baseURL,
    fetch: makeObservableFetch(fetch, 'anthropic') as unknown as typeof fetch,
  })
}
```

Nota sobre typing: el SDK de Anthropic puede tener su propio tipo de fetch. Si hay conflicto, casteo explicito `as unknown as ...` es aceptable — es la frontera del modulo.
  </action>
  <verify>
- `npx tsc --noEmit` pasa
- hashPrompt es determinista: llamarla dos veces con el mismo input → mismo hash
- hashPrompt con keys invertidas en params retorna mismo hash (gracias al orden fijo p/m/t/x)
  </verify>
  <done>
Hasher + factory listos. Todavia nadie usa createInstrumentedAnthropic — eso viene en Plan 05/06.
  </done>
</task>

<task type="auto">
  <name>Task 2: Completar rama 'anthropic' del fetch wrapper + recordAiCall real</name>
  <files>
src/lib/observability/fetch-wrapper.ts
src/lib/observability/collector.ts
  </files>
  <action>
1. Modificar `src/lib/observability/fetch-wrapper.ts`:

Reemplazar el stub `// TODO(plan-04)` con la captura real. Cuando `kind === 'anthropic'`:

- Extraer request body: `init?.body` normalmente es un string JSON (el SDK usa fetch con body serializado). Parsearlo: `requestBodyParsed = JSON.parse(body as string)`. De ahi extraer: `system` (puede ser string o array de bloques — normalizar a string concatenando text de bloques tipo `text`), `messages` (array), `model`, `temperature`, `max_tokens`, `metadata?`.
- Detectar streaming: si `requestBodyParsed.stream === true` O response header `content-type` incluye `text/event-stream`, NO podemos leer el body como JSON. Fast-path: llamar `collector.recordEvent('ai_call_streaming', 'Streaming Anthropic call — not fully captured', { model: requestBodyParsed?.model, purpose: derivePurposeFromUrl(url) }, durationMs)` y retornar el response sin modificar. (Nota operativa: los agentes de produccion NO usan streaming — verificado con grep en el research.)
- Non-streaming: `const cloned = response.clone(); const responseBody = await cloned.json().catch(() => null)`.
- Extraer: `content = responseBody?.content` (array de bloques), `usage = responseBody?.usage` con `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `stop_reason`.
- Derivar `purpose` con heuristica: hoy solo podemos inferirlo del call site. Usar un helper `derivePurposeFromUrl(url)` que siempre retorna 'unknown' por default — Plan 05/06 añadira una forma de pasar `purpose` via context (opcion: header custom en el request body, por ejemplo `metadata.user_id = 'purpose:comprehension'` si el SDK lo permite; o mejor, vars en AsyncLocalStorage aparte). **DECISION EN ESTE PLAN:** agregar un segundo AsyncLocalStorage `purposeAls` opcional que los call sites setean antes de la llamada, y el wrapper lo lee.

Implementar `purposeAls` en `src/lib/observability/context.ts` (agregar al archivo existente):

```typescript
const purposeAls = new AsyncLocalStorage<string>()
export function runWithPurpose<T>(purpose: string, fn: () => Promise<T>): Promise<T> {
  return purposeAls.run(purpose, fn)
}
export function getCurrentPurpose(): string | null {
  return purposeAls.getStore() ?? null
}
```

Re-exportar desde `index.ts`.

Luego en el wrapper anthropic, llamar `const purpose = getCurrentPurpose() ?? 'unknown'`.

- Llamar `collector.recordAiCall({ purpose, systemPrompt: normalizedSystem, model, temperature, maxTokens: max_tokens, provider: 'anthropic', messages: requestBodyParsed.messages, responseContent: content, inputTokens: usage?.input_tokens ?? 0, outputTokens: usage?.output_tokens ?? 0, cacheCreationInputTokens: usage?.cache_creation_input_tokens ?? 0, cacheReadInputTokens: usage?.cache_read_input_tokens ?? 0, durationMs, statusCode: response.status, error: response.ok ? undefined : `HTTP ${response.status}` })`.

- Manejar errores HTTP (response.status >= 400): leer cuerpo de error y pasarlo como `error: JSON.stringify(responseBody?.error ?? responseBody)`.

2. Modificar `src/lib/observability/collector.ts` → `recordAiCall`:

- Calcular `promptHash = hashPrompt(systemPrompt, model, { temperature, maxTokens })` usando import de `./prompt-version`.
- Calcular `costUsd = estimateCost({ model, inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens })` usando import de `./pricing`.
- Push al array `this.aiCalls` con `sequence: this.sequence++`, `recordedAt: new Date()`, y todos los campos calculados.

3. Verificar que `collector.ts` ahora tiene imports funcionales de `./prompt-version` y `./pricing` sin ciclos.
  </action>
  <verify>
- `npx tsc --noEmit` pasa
- Smoke mental trace: llamar anthropic mock que retorna body con usage → collector.aiCalls crece con un row correcto + cost>0
- Streaming responses NO rompen el wrapper (fast-path)
- Con feature flag OFF / sin collector en ALS: el wrapper no toca nada
  </verify>
  <done>
Anthropic fetch wrapper completo. Cualquier llamada a Claude via cliente construido con createInstrumentedAnthropic, dentro de runWithCollector, es capturada con full detail.
  </done>
</task>

</tasks>

<verification>
- Build pasa
- Tipos de Anthropic SDK compatibles con fetch override (si casteo explicito es necesario, documentarlo en comentario)
- purposeAls registrado en index.ts y reexportado
- No hay ciclos de import (collector ↔ prompt-version ↔ fetch-wrapper)
</verification>

<success_criteria>
Los 2 interceptors (Supabase via Plan 03, Anthropic via este plan) estan listos. Wave 3 puede empezar a inyectar en los pipelines de los 3 bots.
</success_criteria>

<output>
Crear `.planning/phases/42.1-observabilidad-bots-produccion/42.1-04-SUMMARY.md` con: API de createInstrumentedAnthropic, shape de ObservabilityAiCall real, decision sobre purposeAls.
</output>
