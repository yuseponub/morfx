---
phase: 42.1-observabilidad-bots-produccion
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/observability/index.ts
  - src/lib/observability/flag.ts
  - src/lib/observability/context.ts
  - src/lib/observability/types.ts
  - src/lib/observability/collector.ts
  - src/lib/observability/pricing.ts
autonomous: true

must_haves:
  truths:
    - "Existe modulo src/lib/observability/ con API publica exportada desde index.ts"
    - "isObservabilityEnabled() retorna false por default (feature flag OFF)"
    - "runWithCollector(collector, fn) propaga collector via AsyncLocalStorage"
    - "getCollector() retorna null cuando no hay contexto activo (no-op path)"
    - "ObservabilityCollector.record*() son metodos sincronos (push a arrays en memoria)"
    - "Tipos compilables y paralelos (NO importan de src/lib/sandbox)"
  artifacts:
    - path: "src/lib/observability/context.ts"
      provides: "AsyncLocalStorage singleton + runWithCollector/getCollector"
      contains: "AsyncLocalStorage"
    - path: "src/lib/observability/collector.ts"
      provides: "ObservabilityCollector class (sin flush aun — solo record en memoria)"
      contains: "class ObservabilityCollector"
    - path: "src/lib/observability/flag.ts"
      provides: "isObservabilityEnabled() feature flag check"
    - path: "src/lib/observability/types.ts"
      provides: "Tipos ProdObservabilityTurn, ObservabilityEvent, ObservabilityQuery, ObservabilityAiCall"
    - path: "src/lib/observability/pricing.ts"
      provides: "Tabla de precios por modelo Anthropic + estimateCost()"
  key_links:
    - from: "src/lib/observability/context.ts"
      to: "src/lib/observability/collector.ts"
      via: "AsyncLocalStorage<ObservabilityCollector>"
      pattern: "AsyncLocalStorage<ObservabilityCollector>"
---

<objective>
Construir el core del modulo `src/lib/observability/`: feature flag, AsyncLocalStorage context, tipos, collector class (solo record en memoria, flush viene en Plan 07), y tabla de pricing. NO instrumenta nada todavia — Plans 03/04 construiran los wrappers de fetch sobre este core.

Purpose: Core no-op cuando flag OFF (REGLA 6 compliance); tipos paralelos al sandbox (Decision A); base para interceptors de Wave 2.
Output: Modulo importable desde cualquier parte del repo, con API estable.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/42.1-observabilidad-bots-produccion/42.1-CONTEXT.md
@.planning/phases/42.1-observabilidad-bots-produccion/42.1-RESEARCH.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Crear feature flag, tipos y context (AsyncLocalStorage)</name>
  <files>
src/lib/observability/flag.ts
src/lib/observability/types.ts
src/lib/observability/context.ts
  </files>
  <action>
1. `src/lib/observability/flag.ts`:
   - Exportar `isObservabilityEnabled(): boolean` que LEE `process.env.OBSERVABILITY_ENABLED === 'true'` en CADA call (no cachear — ver Pitfall 5 del research).
   - Default: OFF. La variable de entorno no debe existir en produccion hasta Plan 11.
   - Exportar tambien `export const OBSERVABILITY_FLAG_NAME = 'OBSERVABILITY_ENABLED' as const`.

2. `src/lib/observability/types.ts` — Tipos PARALELOS al sandbox (no importar de `src/lib/sandbox/*`):
   - `AgentId = 'somnio-v3' | 'godentist' | 'somnio-recompra' | 'somnio-v2'`
   - `TriggerKind = 'user_message' | 'timer' | 'system_event'`
   - `EventCategory = 'classifier' | 'intent' | 'mode_transition' | 'template_selection' | 'no_repetition' | 'guard' | 'block_composition' | 'pre_send_check' | 'timer_signal' | 'handoff' | 'tool_call' | 'session_lifecycle' | 'error' | 'media_gate' | 'ofi_inter' | 'retake' | 'char_delay' | 'disambiguation' | 'silence_timer' | 'interruption_handling' | 'pending_pool'`
   - `ObservabilityEvent { sequence, recordedAt, category, label?, payload, durationMs? }`
   - `ObservabilityQuery { sequence, recordedAt, tableName, operation, filters, columns, requestBody, durationMs, statusCode, rowCount?, error? }`
   - `ObservabilityAiCall { sequence, recordedAt, purpose, promptHash, systemPrompt, model, temperature?, maxTokens?, provider, messages, responseContent?, inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens, costUsd, durationMs, statusCode, error? }`
   - `ObservabilityCollectorInit { conversationId, workspaceId, agentId, turnStartedAt, triggerMessageId?, triggerKind, currentMode?, newMode? }`

3. `src/lib/observability/context.ts`:
   - `import { AsyncLocalStorage } from 'node:async_hooks'`
   - Singleton modulo-level: `const als = new AsyncLocalStorage<ObservabilityCollector>()`
   - `export async function runWithCollector<T>(collector, fn): Promise<T>` → `return als.run(collector, fn)`
   - `export function getCollector(): ObservabilityCollector | null` → `return als.getStore() ?? null`
   - Import de collector debe ser `import type` para evitar ciclo con collector.ts.
  </action>
  <verify>
`npx tsc --noEmit src/lib/observability/{flag,types,context}.ts` compila sin errores. Verificacion manual: flag.ts no cachea el valor del env var.
  </verify>
  <done>
Los 3 archivos existen, compilan, exportan la API descrita, y no importan nada de src/lib/sandbox.
  </done>
</task>

<task type="auto">
  <name>Task 2: Crear pricing table + ObservabilityCollector class + barrel index</name>
  <files>
src/lib/observability/pricing.ts
src/lib/observability/collector.ts
src/lib/observability/index.ts
  </files>
  <action>
1. `src/lib/observability/pricing.ts`:
   - Tabla por modelo Anthropic con precios input/output/cache_creation/cache_read por MTok (millon de tokens). Incluir: `claude-haiku-4-5-20251001`, `claude-sonnet-4-5-20250929` (verificar IDs exactos en uso en el repo via grep si necesario). Fallback para modelos desconocidos: costo 0 + warning log.
   - Estructura: `const PRICING: Record<string, { inputPerMTok, outputPerMTok, cacheCreationPerMTok, cacheReadPerMTok }>`.
   - Funcion: `estimateCost({ model, inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens }): number` retorna USD.
   - Comentario TODO al tope: "VERIFICAR precios contra https://www.anthropic.com/pricing antes de activar en produccion (Plan 11). Review quarterly."
   - IMPORTANTE: los precios publicos actuales (confidence MEDIUM) son aproximadamente Haiku $1/$5 por MTok input/output, Sonnet $3/$15. Cache creation = 1.25x input, cache read = 0.1x input. Documentar en comentario que estos valores deben re-verificarse.

2. `src/lib/observability/collector.ts`:
   - `export class ObservabilityCollector`
   - Constructor toma `ObservabilityCollectorInit` y guarda campos
   - Propiedades: `events: ObservabilityEvent[] = []`, `queries: ObservabilityQuery[] = []`, `aiCalls: ObservabilityAiCall[] = []`, `sequence = 0`, `error: { name, message, stack } | null = null`
   - Metodos SINCRONOS (push a array, nunca await):
     - `recordEvent(category, label, payload, durationMs?)`
     - `recordQuery(parsed, durationMs, statusCode, rowCount?, error?)` — recibe salida del parser de URL postgrest
     - `recordAiCall({ purpose, systemPrompt, model, temperature, maxTokens, messages, responseContent, inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens, durationMs, statusCode, error? })` — calcula promptHash via `hashPrompt` (import de './prompt-version' que sera creado en Plan 04) — por ahora usar un stub que retorna ''; Plan 04 lo completa.
     - `recordError(errorInfo)` — setea `this.error` (solo el primer error fatal del turno)
   - Cada record incrementa `this.sequence++` para orden global del timeline.
   - `flush()` declarado como `async flush(): Promise<void>` con cuerpo vacio `// implemented in Plan 07`. Marcarlo con `// TODO(plan-07)`.
   - Getters: `get totalTokens()` suma de aiCalls, `get totalCostUsd()` suma de costUsd.

3. `src/lib/observability/index.ts` (barrel):
   - Re-exportar: `runWithCollector`, `getCollector` (de context), `isObservabilityEnabled` (de flag), `ObservabilityCollector` (de collector), todos los tipos (de types), `estimateCost` (de pricing).
  </action>
  <verify>
`npx tsc --noEmit` sobre src/lib/observability/** sin errores. Importar desde un archivo test scratch: `import { ObservabilityCollector, runWithCollector, getCollector, isObservabilityEnabled } from '@/lib/observability'` debe resolver.
  </verify>
  <done>
Core modulo completo. Collector puede instanciarse, recibir records sincronos en memoria, y NO rompe nada en el resto del repo (nadie lo usa todavia).
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` pasa en todo el repo (el modulo nuevo no rompe el build)
- `grep -r "from '@/lib/sandbox" src/lib/observability/` retorna 0 matches
- `grep -r "OBSERVABILITY_ENABLED" src/lib/observability/` solo matchea en flag.ts
- Import smoke test desde un scratch file funciona
</verification>

<success_criteria>
Modulo de observabilidad core existe, compila, tiene API publica estable, feature flag default OFF. Wave 2 (interceptors) puede construirse sobre esto.
</success_criteria>

<output>
Crear `.planning/phases/42.1-observabilidad-bots-produccion/42.1-02-SUMMARY.md` con: arbol de archivos creados, API publica exportada, decisiones de tipos.
</output>
