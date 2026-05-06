---
plan: 05
phase: somnio-sales-v4-runtime-wiring
wave: 3
depends_on: [01, 02]
files_modified:
  - src/lib/agents/somnio-v4/comprehension.ts
  - src/lib/agents/somnio-v4/sub-loop/index.ts
  - src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts
  - src/lib/agents/somnio-v4/__tests__/comprehension-gemini.test.ts
addresses_decisions: [D-4, D-5, D-10, D-11, D-12, D-25, D-26, D-30]
addresses_research_pitfalls: [H-2, H-3]
autonomous: true
estimated_tasks: 3
must_haves:
  truths:
    - "comprehension.ts ya NO usa @anthropic-ai/sdk directo — migrado a generateText({ model: google('gemini-2.5-flash-lite'), output: Output.object({ schema: MessageAnalysisSchema }) }) (D-30, alineado con research-scripts/test-comprehension.ts)"
    - "sub-loop/index.ts ya NO usa anthropic('claude-haiku-4-5-20251001') — usa createOpenAI({ apiKey: process.env.OPENAI_API_KEY_SALESV4 })('gpt-4o-mini') (D-30)"
    - "sub-loop/nunca-decir-check.ts ya NO usa anthropic('claude-haiku-4-5-20251001') — usa google('gemini-2.5-flash-lite') (D-30)"
    - "Cero matches de 'claude-haiku-4-5' en src/lib/agents/somnio-v4/ (verificable con grep — engine-v4.ts ya hizo swap at clone time en Plan 03 B-2)"
    - "Cero edits a comprehension.ts/sub-loop de somnio-v3, godentist, godentist-fb-ig, somnio-recompra, somnio-pw-confirmation (Regla 6)"
    - "MessageAnalysisSchema (comprehension-schema.ts) NO se modifica — Gemini lo acepta as-is (RESEARCH §H-3)"
    - "Plan 12.1 calibration values funcionan en Gemini sin recalibrar (D-12 — verificado en RESEARCH 5/5 match)"
    - "comprehension.ts accede al output parsed via `result.output` (canonical path establecido por research-scripts/test-comprehension.ts) — sin triple-fallback ni `as any`"
    - "npx tsc --noEmit sin errores nuevos en somnio-v4/"
  artifacts:
    - path: "src/lib/agents/somnio-v4/comprehension.ts"
      provides: "Comprehension layer migrada a Gemini Flash-Lite via AI SDK v6"
      contains: "google('gemini-2.5-flash-lite')"
    - path: "src/lib/agents/somnio-v4/sub-loop/index.ts"
      provides: "Sub-loop con GPT-4o mini (tools + Output.object combinados)"
      contains: "createOpenAI"
    - path: "src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts"
      provides: "NUNCA-decir check con Gemini Flash-Lite"
      contains: "google('gemini-2.5-flash-lite')"
  key_links:
    - from: "comprehension.ts comprehend()"
      to: "Google AI API via @ai-sdk/google"
      via: "GOOGLE_GENERATIVE_AI_API_KEY env var (default lookup)"
      pattern: "google\\('gemini-2.5-flash-lite'\\)"
    - from: "sub-loop/index.ts runSubLoop()"
      to: "OpenAI API via @ai-sdk/openai con key custom"
      via: "createOpenAI({ apiKey: process.env.OPENAI_API_KEY_SALESV4 })"
      pattern: "OPENAI_API_KEY_SALESV4"
---

<objective>
Wave 3 — Modelo swap stack mixto en los 3 lugares activos de v4 (D-30 lockeado por jose 2026-05-06).

**Plan paralelizable con Plan 04 en Wave 3:**
- Plan 04 modifica SÓLO `webhook-processor.ts`
- Plan 05 (este) modifica SÓLO `comprehension.ts`, `sub-loop/index.ts`, `sub-loop/nunca-decir-check.ts`
- Cero overlap → executors paralelos

**Mapping definitivo por call (D-30):**

| Archivo | De (HOY) | A (Plan 05) | Razón |
|---|---|---|---|
| `comprehension.ts:84` | Anthropic SDK directo + `claude-haiku-4-5-20251001` + `output_config: { format: zodOutputFormat(...) }` | `generateText({ model: google('gemini-2.5-flash-lite'), ..., output: Output.object({ schema: MessageAnalysisSchema }) })` | Single-shot sin tools. Anthropic via AI SDK rechaza schema con `min`/`max`. Gemini lo acepta. ~14x más barato. |
| `sub-loop/index.ts:54` | `anthropic('claude-haiku-4-5-20251001')` (AI SDK v6) | `createOpenAI({ apiKey: process.env.OPENAI_API_KEY_SALESV4 })('gpt-4o-mini')` | Sub-loop necesita tools (kb_search, crm_*) + Output.object combinados. Gemini API NO soporta esa combinación. GPT-4o mini sí. |
| `sub-loop/nunca-decir-check.ts:34` | `anthropic('claude-haiku-4-5-20251001')` | `google('gemini-2.5-flash-lite')` | Schema simple boolean+string, sin tools. Más barato. |

**Tareas:**

1. **comprehension.ts:** refactor más invasivo (cambio de SDK fundamental, no solo modelo). De `@anthropic-ai/sdk` directo (`anthropic.messages.create({ model, system, messages, output_config })`) a `@ai-sdk/google` via AI SDK v6 (`generateText({ model: google(...), system, messages, output: Output.object(...) })`). Mantener:
   - Mismo `MessageAnalysisSchema` (no editar comprehension-schema.ts — Gemini lo acepta)
   - Mismo `buildSystemPrompt(existingData, recentBotMessages)` (Plan 12.1 few-shot intacto — D-25)
   - Mismo `parseAnalysis` resilient parsing (preserva fallback a 'otro' por intent fuera de enum — D-69)
   - Mismo `runWithPurpose('comprehension', ...)` wrapper (observability)
   - Mismo `getCollector()?.recordEvent('pipeline_decision', 'comprehension_completed', ...)` con todos los campos (D-68)
   - Mismo `tokensUsed` cálculo (input + output) — la API v6 expone `result.usage.totalTokens` o equivalente; verificar shape exacto en docs `@ai-sdk/google`

2. **sub-loop/index.ts:** cambio menor — sólo el `model:` del `generateText` call. Mantener:
   - Mismo `LoopOutcomeSchema` (post-Plan 02 flat shape)
   - Mismo `validateLoopOutcomeInvariants` post-hoc check (Plan 02 Task 2)
   - Mismo `tools` (kb_search, crm_*)
   - Mismo `toolChoice: 'auto'` (W-06 — D-62)
   - Mismo `stopWhen: stepCountIs(4)` (D-09)
   - Mismo `runWithPurpose('subloop', ...)` wrapper

3. **sub-loop/nunca-decir-check.ts:** cambio mínimo — sólo el `model:` del `generateText` call. Mantener:
   - Mismo `CheckSchema` (boolean + optional string)
   - Mismo early-return cuando `nuncaDecirRules.length === 0`
   - Mismo `runWithPurpose('subloop_nunca_decir', ...)` wrapper

4. **Test E2E ligero:** crear `src/lib/agents/somnio-v4/__tests__/comprehension-gemini.test.ts` con 1 test gated por env var que confirme un call real comprehension contra Gemini. Replicar el patrón de Plan 02 Task 3 (`describe.skipIf`).

**D-12: Re-calibración NO necesaria** — RESEARCH 5/5 match con Plan 12.1 confidence values en Gemini. Ahorra 1-2h.

**D-11: Sin fallback** — si Gemini falla en comprehension/nunca-decir o GPT-4o mini falla en sub-loop, el agent escala naturally vía `requiresHuman=true` (D-57 / D-60). Cero complejidad de fallback runtime.

**Anti-pattern crítico (RESEARCH "stay raw" + Pitfall 4):** EL ANTI-PATTERN que Plan 12.1 padre lockeó era "NO migrar comprehension a AI SDK v6 generateText". Pero RESEARCH H-2/H-3 demuestran que Anthropic via AI SDK rechaza el `MessageAnalysisSchema` (por `min`/`max`) — lo que justificaba mantener Anthropic SDK directo. Tras swap a Gemini, ese anti-pattern YA NO APLICA: Gemini via AI SDK acepta el schema sin problema. Plan 05 invierte la decisión arquitectónica del Plan 12.1 padre POR un swap de provider — documentado en SUMMARY.md.

**Regla 6 invariante:** cero edits a comprehension/sub-loop de OTROS agentes:
```bash
git diff src/lib/agents/somnio-v3/ src/lib/agents/godentist/ src/lib/agents/godentist-fb-ig/ src/lib/agents/somnio-recompra/ src/lib/agents/somnio-pw-confirmation/
# expect: empty
```

**W-4 fix iter 1 — canonical AI SDK v6 access path:**

`research-scripts/test-comprehension.ts` (líneas 35-41) establece el patrón canónico:

```typescript
const result: any = await generateText({
  model,
  system: SYSTEM_PROMPT,
  prompt: `Mensaje del cliente: "${msg}"`,
  output: Output.object({ schema: MessageAnalysisSchema }),  // ← `output:` (NO `experimental_output:`)
})
return {
  ok: true,
  output: result.output,                                       // ← `result.output` directo
  // ...
}
```

`comprehension.ts` debe usar el MISMO patrón: pasar `output: Output.object({ schema: MessageAnalysisSchema })` (no `experimental_output:`) y leer `result.output`. Sin triple-fallback (`?? text`) ni `as any` cast — el tipo se infiere correctamente del schema. La RESEARCH ya validó este patrón 5/5 match con Plan 12.1 calibration. Si AI SDK v6 cambiara el tipo del result en una versión futura, fallará en compile-time y será un fix dirigido — preferible al silent fallback que oculta drift.

Output: v4 corre con stack mixto. Plan 07 (Smoke A) verifica que los 5 mensajes de overconfidence + sub-loop trigger funcionan extremos a extremos con providers reales.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/standalone/somnio-sales-v4-runtime-wiring/CONTEXT.md
@.planning/standalone/somnio-sales-v4-runtime-wiring/RESEARCH.md
@.planning/standalone/somnio-sales-v4-runtime-wiring/research-scripts/test-comprehension.ts
@.planning/standalone/somnio-sales-v4-runtime-wiring/research-scripts/test-final.ts
@.planning/standalone/somnio-sales-v4-runtime-wiring/research-scripts/test-loopoutcome-flat-norecord.ts
@src/lib/agents/somnio-v4/comprehension.ts
@src/lib/agents/somnio-v4/sub-loop/index.ts
@src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts
@src/lib/agents/somnio-v4/comprehension-schema.ts
@src/lib/agents/somnio-v4/comprehension-prompt.ts
</context>

<interfaces>
<!-- comprehension.ts CURRENT (Anthropic SDK directo) -->
```typescript
// src/lib/agents/somnio-v4/comprehension.ts:25-33, 41-46, 82-94 (KEY LINES)
import type Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { createInstrumentedAnthropic } from '@/lib/observability/anthropic-instrumented'

let client: Anthropic | null = null
function getClient(): Anthropic {
  if (!client) {
    client = createInstrumentedAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return client
}

const response = await runWithPurpose('comprehension', () =>
  anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: [{ type: 'text', text: buildSystemPrompt(...), cache_control: { type: 'ephemeral' } }],
    messages,
    output_config: { format: zodOutputFormat(MessageAnalysisSchema) },
  })
)
```

<!-- comprehension.ts TARGET (AI SDK v6 + Gemini, alineado con research-scripts/test-comprehension.ts) -->
```typescript
import { generateText, Output } from 'ai'
import { google } from '@ai-sdk/google'
// (NO más import de @anthropic-ai/sdk ni createInstrumentedAnthropic)

const result = await runWithPurpose('comprehension', () =>
  generateText({
    model: google('gemini-2.5-flash-lite'),
    system: buildSystemPrompt(existingData, recentBotMessages),
    messages,
    output: Output.object({ schema: MessageAnalysisSchema }),  // canonical (NO experimental_output)
  })
)

// Canonical access path validado por research-scripts/test-comprehension.ts:
// `result.output` es la instancia parseada del schema. Sin triple-fallback, sin `as any`.
const analysis = parseAnalysis(JSON.stringify(result.output))
const tokensUsed = (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0)
```

<!-- sub-loop/index.ts CURRENT (Anthropic Haiku) -->
```typescript
// src/lib/agents/somnio-v4/sub-loop/index.ts:1-7, 53
import { generateText, Output, stepCountIs } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'

const { output } = await runWithPurpose('subloop', () =>
  generateText({
    model: anthropic('claude-haiku-4-5-20251001'),
    // ...
  })
)
```

<!-- sub-loop/index.ts TARGET (OpenAI GPT-4o mini con key custom) -->
```typescript
import { generateText, Output, stepCountIs } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
// (NO más import de @ai-sdk/anthropic en este archivo)

// Lazy singleton — env var leída una vez, instancia reutilizada (latency-friendly cold-start)
let openaiClient: ReturnType<typeof createOpenAI> | null = null
function getOpenAI() {
  if (!openaiClient) {
    openaiClient = createOpenAI({ apiKey: process.env.OPENAI_API_KEY_SALESV4 })
  }
  return openaiClient
}

const { output } = await runWithPurpose('subloop', () =>
  generateText({
    model: getOpenAI()('gpt-4o-mini'),
    // ...rest unchanged
  })
)
```

<!-- sub-loop/nunca-decir-check.ts CURRENT (Anthropic Haiku) → TARGET (Gemini) -->
```typescript
// src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts:1-2, 34
import { generateText, Output } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'

// REPLACE WITH:
import { generateText, Output } from 'ai'
import { google } from '@ai-sdk/google'

// Y al inicio del generateText call:
model: google('gemini-2.5-flash-lite'),
```
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Migrar comprehension.ts a Gemini Flash-Lite vía AI SDK v6 (D-30) — canonical access path (W-4)</name>
  <files>src/lib/agents/somnio-v4/comprehension.ts, src/lib/agents/somnio-v4/__tests__/comprehension-gemini.test.ts</files>
  <read_first>
    - **.planning/standalone/somnio-sales-v4-runtime-wiring/research-scripts/test-comprehension.ts (W-4 anchor — establece el patrón canónico `output: Output.object(...)` + `result.output`. ESTE ES EL PATRÓN A REPLICAR; NO inventar fallbacks.)**
    - src/lib/agents/somnio-v4/comprehension.ts (entire file — 164 líneas)
    - src/lib/agents/somnio-v4/comprehension-schema.ts (MessageAnalysisSchema — NO modificar)
    - src/lib/agents/somnio-v4/comprehension-prompt.ts (buildSystemPrompt — NO modificar; D-25 Plan 12.1 lockeado)
    - .planning/standalone/somnio-sales-v4-runtime-wiring/RESEARCH.md (§MessageAnalysisSchema results — Gemini 5/5 match)
    - .planning/standalone/somnio-sales-v4-runtime-wiring/CONTEXT.md (D-30, D-12, D-25)
  </read_first>
  <action>
**A) Reescribir `comprehension.ts`** (cambio fundamental: SDK directo → AI SDK v6).

Mantener intactos:
- Header comments (actualizar el "Uses claude-haiku-4-5" → "Uses gemini-2.5-flash-lite (D-30)" + nota de Plan 05 swap)
- `MessageAnalysisSchema` import desde `./comprehension-schema` (NO editar el schema)
- `buildSystemPrompt(...)` import desde `./comprehension-prompt` (NO editar el prompt — D-25 lockea Plan 12.1)
- `V4_INTENTS` set para sanitization
- `parseAnalysis(rawText: string): MessageAnalysis` resilient parsing exactamente igual (D-69 sumidero a 'otro')
- `getCollector()?.recordEvent('pipeline_decision', 'comprehension_completed', ...)` con TODOS los campos actuales (D-68): agent, intent, secondary, confidence (legacy 0-100), intent_confidence (0..1), intent_confidence_reasoning, threshold (null), scaledToSubLoop (null), category, sentiment, fieldsExtracted, tokensUsed
- Export shape: `comprehend(message, history, existingData, recentBotMessages)` retorna `Promise<{ analysis, tokensUsed }>` (mismo)
- `runWithPurpose('comprehension', ...)` wrapper (observability)

Cambios específicos:

```typescript
/**
 * Somnio Sales Agent v4 — Comprehension Layer (Capa 2)
 *
 * Single LLM call con structured output via AI SDK v6.
 * Extracts intent, data fields, classification, and negations.
 *
 * **Stack mixto post-Plan 05 (D-30):** Gemini 2.5 Flash-Lite (~$0.0001/call,
 * ~14x más barato que Haiku 4.5). RESEARCH 5/5 match con Plan 12.1 calibration —
 * D-12 NO necesaria (re-calibración no requerida).
 *
 * Standalone: somnio-sales-v4-runtime-wiring / Plan 05.
 *
 * Anti-patterns:
 * - NO Anthropic SDK directo (RESEARCH H-2: AI SDK + Anthropic rechaza min/max en number)
 * - NO mock provider — runtime real Gemini API (env var GOOGLE_GENERATIVE_AI_API_KEY)
 * - NO modificar comprehension-schema.ts ni comprehension-prompt.ts
 * - NO recalibrar few-shot (D-12 — Plan 12.1 funciona en Gemini sin ajuste)
 * - NO triple-fallback `experimental_output ?? output ?? text` (W-4) — el patrón canónico
 *   `output: Output.object(...)` + `result.output` está validado por
 *   research-scripts/test-comprehension.ts. Si AI SDK cambia la API, fallará en
 *   compile/runtime de forma dirigida y se arregla puntualmente.
 *
 * Pitfall 4 inverted (post-RESEARCH): el "stay raw" del Plan 12.1 padre asumía
 * que Anthropic SDK directo era la única vía portable; eso era cierto SOLO
 * mientras el provider era Anthropic. Cambio a Gemini permite migrar a AI SDK v6.
 */

import { generateText, Output } from 'ai'
import { google } from '@ai-sdk/google'
import { runWithPurpose, getCollector } from '@/lib/observability'
import { MessageAnalysisSchema, type MessageAnalysis } from './comprehension-schema'
import { buildSystemPrompt } from './comprehension-prompt'
import { V4_INTENTS } from './constants'

const V4_INTENTS_SET = new Set<string>(V4_INTENTS)

export interface ComprehensionResult {
  analysis: MessageAnalysis
  tokensUsed: number
}

export async function comprehend(
  message: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  existingData: Record<string, string>,
  recentBotMessages: string[] = [],
): Promise<ComprehensionResult> {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    ...history.slice(-6).map(h => ({
      role: h.role,
      content: h.content,
    })),
    { role: 'user', content: message },
  ]

  const result = await runWithPurpose('comprehension', () =>
    generateText({
      model: google('gemini-2.5-flash-lite'),
      system: buildSystemPrompt(existingData, recentBotMessages),
      messages,
      output: Output.object({ schema: MessageAnalysisSchema }),
    })
  )

  // Canonical access path — validado por research-scripts/test-comprehension.ts (W-4):
  // `result.output` es la instancia parseada del schema (typed por z.infer).
  // Sin fallbacks defensivos: si AI SDK cambia el shape en upgrade, fallará dirigido.
  const analysis = parseAnalysis(JSON.stringify(result.output))

  const tokensUsed = (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0)

  // D-68: observability completa de comprehension.
  getCollector()?.recordEvent('pipeline_decision', 'comprehension_completed', {
    agent: 'somnio-sales-v4',
    intent: analysis.intent.primary,
    secondary: analysis.intent.secondary,
    confidence: analysis.intent.confidence,
    intent_confidence: analysis.intent.intent_confidence,
    intent_confidence_reasoning: analysis.intent.intent_confidence_reasoning ?? null,
    threshold: null,
    scaledToSubLoop: null,
    category: analysis.classification.category,
    sentiment: analysis.classification.sentiment,
    fieldsExtracted: Object.keys(analysis.extracted_fields).filter(
      k => analysis.extracted_fields[k as keyof typeof analysis.extracted_fields] !== null
    ),
    tokensUsed,
  })

  return { analysis, tokensUsed }
}

function parseAnalysis(rawText: string): MessageAnalysis {
  // EXACTAMENTE el mismo código que la versión actual de comprehension.ts líneas 130-164:
  // 1. Try strict parse
  // 2. Sanitize known failure: intent values outside enum (map to 'otro' — D-69)
  // 3. Re-parse after sanitization
  // 4. Still fails — throw with details
  // (Copiar verbatim — la lógica de fallback es robusta y se mantiene para errores de Gemini)
}
```

**W-4 anchor: research-scripts/test-comprehension.ts (líneas 35-41) usa:**
- Property name: `output:` (NO `experimental_output:`)
- Result access: `result.output` (sin fallback chain)

Replicar EXACTAMENTE ese patrón. Si TypeScript se queja del tipo de `result.output`, declarar el tipo explícito (`const result: { output: MessageAnalysis; usage?: { inputTokens?: number; outputTokens?: number } } = ...`) en vez de `as any`. Si AI SDK exporta tipo `GenerateTextResult<...>`, importarlo y usarlo.

**Caching:** El cache_control de Anthropic NO existe en Gemini (caching es implícito en Google AI). Eliminar el `cache_control: { type: 'ephemeral' }` literal — Gemini ignora ese campo. Si hay opción explícita en `@ai-sdk/google` para context caching, dejarlo TODO para Plan futuro (RESEARCH §D-28: caching marginal beneficio para v4 prompts cortos).

**B) Crear test E2E gated por env var:**

`src/lib/agents/somnio-v4/__tests__/comprehension-gemini.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { comprehend } from '../comprehension'

/**
 * Plan 05 Task 1 — Smoke E2E real Gemini sobre comprehension.
 * Replica los 5 mensajes de RESEARCH §MessageAnalysisSchema 5/5 match.
 * Skipea sin GOOGLE_GENERATIVE_AI_API_KEY.
 */
describe.skipIf(!process.env.GOOGLE_GENERATIVE_AI_API_KEY)(
  'comprehend E2E (Gemini Flash-Lite)',
  () => {
    it('classifies "hola" as saludo with high confidence', async () => {
      const { analysis } = await comprehend('hola', [], {}, [])
      expect(analysis.intent.primary).toBe('saludo')
      expect(analysis.intent.intent_confidence).toBeGreaterThanOrEqual(0.85)
    }, 30000)

    it('classifies "qué tan adictivo es vs zolpidem?" with low confidence (sub-loop trigger)', async () => {
      const { analysis } = await comprehend('qué tan adictivo es vs zolpidem?', [], {}, [])
      // RESEARCH expected: 0.30 (sub-loop dispara <0.70)
      expect(analysis.intent.intent_confidence).toBeLessThanOrEqual(0.50)
    }, 30000)

    it('classifies "lo quiero comprar" with high confidence', async () => {
      const { analysis } = await comprehend('lo quiero comprar', [], {}, [])
      expect(analysis.intent.primary).toBe('quiero_comprar')
      expect(analysis.intent.intent_confidence).toBeGreaterThanOrEqual(0.85)
    }, 30000)
  }
)
```

**Ejecutar:**
```bash
# Sin env var (skip path):
npx vitest run src/lib/agents/somnio-v4/__tests__/comprehension-gemini.test.ts
# expect: skipped o passed según env

# Con env var:
GOOGLE_GENERATIVE_AI_API_KEY=$(grep GOOGLE_GENERATIVE_AI_API_KEY .env.local | cut -d= -f2) \
  npx vitest run src/lib/agents/somnio-v4/__tests__/comprehension-gemini.test.ts
# expect: 3/3 pass
```

**Type check + grep verifications:**

```bash
npx tsc --noEmit 2>&1 | grep -E "somnio-v4/comprehension" | head -10
# expect: 0

grep -c "@anthropic-ai/sdk" src/lib/agents/somnio-v4/comprehension.ts
# expect: 0

grep -c "claude-haiku-4-5" src/lib/agents/somnio-v4/comprehension.ts
# expect: 0

grep -q "google('gemini-2.5-flash-lite')" src/lib/agents/somnio-v4/comprehension.ts
# expect: match

# W-4 canonical path:
grep -q "output: Output.object" src/lib/agents/somnio-v4/comprehension.ts
# expect: match (NO experimental_output)

grep -c "experimental_output" src/lib/agents/somnio-v4/comprehension.ts
# expect: 0 (no usar el namespace experimental)

# W-4 anti-fallback:
grep -E "experimental_output \?\? output \?\? text|result as any" src/lib/agents/somnio-v4/comprehension.ts
# expect: 0 matches (no triple-fallback, no `as any` defensive cast)
```
  </action>
  <verify>
    <automated>grep -q "google('gemini-2.5-flash-lite')" src/lib/agents/somnio-v4/comprehension.ts && grep -q "from '@ai-sdk/google'" src/lib/agents/somnio-v4/comprehension.ts && ! grep -q "@anthropic-ai/sdk" src/lib/agents/somnio-v4/comprehension.ts && ! grep -q "claude-haiku-4-5" src/lib/agents/somnio-v4/comprehension.ts && grep -q "output: Output.object" src/lib/agents/somnio-v4/comprehension.ts && ! grep -q "experimental_output" src/lib/agents/somnio-v4/comprehension.ts && grep -q "MessageAnalysisSchema" src/lib/agents/somnio-v4/comprehension.ts && grep -q "buildSystemPrompt" src/lib/agents/somnio-v4/comprehension.ts && grep -q "parseAnalysis" src/lib/agents/somnio-v4/comprehension.ts && [ -z "$(git diff src/lib/agents/somnio-v4/comprehension-schema.ts)" ] && [ -z "$(git diff src/lib/agents/somnio-v4/comprehension-prompt.ts)" ] && test -f src/lib/agents/somnio-v4/__tests__/comprehension-gemini.test.ts && npx tsc --noEmit 2>&1 | grep -E "somnio-v4/comprehension\.ts" | head -1 | wc -l | grep -q "^0$"</automated>
  </verify>
  <acceptance_criteria>
    - `comprehension.ts` importa de `@ai-sdk/google` (NO `@anthropic-ai/sdk`)
    - `comprehension.ts` usa `google('gemini-2.5-flash-lite')`
    - `comprehension.ts` NO contiene literal `'claude-haiku-4-5'`
    - `comprehension.ts` NO contiene `createInstrumentedAnthropic` ni `zodOutputFormat`
    - **`comprehension.ts` usa `output: Output.object({ schema: MessageAnalysisSchema })` (canonical, NO `experimental_output:`) — alineado con research-scripts/test-comprehension.ts (W-4)**
    - **`comprehension.ts` accede al output parsed via `result.output` (sin triple-fallback `?? output ?? text`, sin `as any`)**
    - `MessageAnalysisSchema` y `buildSystemPrompt` siguen importados (no se modifican esos archivos)
    - `comprehension-schema.ts` git diff vacío (Regla 6 — D-25 Plan 12.1 lockeado)
    - `comprehension-prompt.ts` git diff vacío
    - `parseAnalysis` resilient parsing preservado (D-69)
    - Observability event `pipeline_decision:comprehension_completed` con campos D-68 emitido
    - Test `comprehension-gemini.test.ts` creado con `describe.skipIf(!process.env.GOOGLE_GENERATIVE_AI_API_KEY)`
    - `npx tsc --noEmit` no introduce errores
  </acceptance_criteria>
  <done>Comprehension migrado a Gemini Flash-Lite + smoke E2E gated. Canonical access path `result.output` aplicado (W-4 fix).</done>
</task>

<task type="auto">
  <name>Task 2: Migrar sub-loop/index.ts a GPT-4o mini con OPENAI_API_KEY_SALESV4 (D-30)</name>
  <files>src/lib/agents/somnio-v4/sub-loop/index.ts</files>
  <read_first>
    - src/lib/agents/somnio-v4/sub-loop/index.ts (post-Plan 02 — incluye validateLoopOutcomeInvariants)
    - .planning/standalone/somnio-sales-v4-runtime-wiring/research-scripts/test-loopoutcome-flat-norecord.ts (working OpenAI pattern)
    - .planning/standalone/somnio-sales-v4-runtime-wiring/CONTEXT.md (D-30 — sub-loop usa GPT-4o mini con key custom)
    - .planning/standalone/somnio-sales-v4-runtime-wiring/RESEARCH.md (§Hallazgos H-1: schema flat funciona en GPT-4o mini)
  </read_first>
  <action>
**Cambios mínimos en `src/lib/agents/somnio-v4/sub-loop/index.ts`:**

1. **Import swap:**
```typescript
// REMOVE:
import { anthropic } from '@ai-sdk/anthropic'

// ADD:
import { createOpenAI } from '@ai-sdk/openai'
```

2. **Lazy singleton para OpenAI client (anti cold-start tax):**

Agregar después de imports, antes de `export type ...`:

```typescript
/**
 * Lazy singleton — OpenAI con key custom OPENAI_API_KEY_SALESV4 (D-30).
 *
 * El sufijo `_SALESV4` aísla esta key de la antigua OPENAI_API_KEY (KB sync,
 * scopes restringidos). En runtime, leer la env var en cada turn sería costo
 * marginal pero la creamos lazy para evitar leer en boot si el sub-loop
 * nunca se invoca en un cold lambda.
 */
let openaiClient: ReturnType<typeof createOpenAI> | null = null
function getOpenAI() {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY_SALESV4
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY_SALESV4 not set — required for sub-loop (D-30)')
    }
    openaiClient = createOpenAI({ apiKey })
  }
  return openaiClient
}
```

3. **Cambio del `model:` en el `generateText` call (línea 54):**

```typescript
// REMOVE:
model: anthropic('claude-haiku-4-5-20251001'),

// ADD:
model: getOpenAI()('gpt-4o-mini'),
```

NADA más en sub-loop/index.ts cambia. Mantener:
- `import { generateText, Output, stepCountIs } from 'ai'`
- `import { LoopOutcomeSchema, validateLoopOutcomeInvariants, type LoopOutcome, type SubLoopReason } from './output-schema'` (post-Plan 02)
- `tools` (kb_search, crm_*) — same
- `toolChoice: 'auto'` — same (W-06 / D-62)
- `stopWhen: stepCountIs(4)` — same (D-09)
- `output: Output.object({ schema: LoopOutcomeSchema })` — same (Plan 02 schema flat)
- `validateLoopOutcomeInvariants` post-hoc check — same (Plan 02 Task 2)
- `checkNuncaDecir` invocation en outcome=canonical — same
- `getCollector()?.recordEvent(...)` — same
- `runWithPurpose('subloop', ...)` wrapper — same

**Verificaciones grep:**

```bash
grep -c "@ai-sdk/anthropic" src/lib/agents/somnio-v4/sub-loop/index.ts
# expect: 0

grep -c "claude-haiku-4-5" src/lib/agents/somnio-v4/sub-loop/index.ts
# expect: 0

grep -q "createOpenAI" src/lib/agents/somnio-v4/sub-loop/index.ts
grep -q "OPENAI_API_KEY_SALESV4" src/lib/agents/somnio-v4/sub-loop/index.ts
grep -q "gpt-4o-mini" src/lib/agents/somnio-v4/sub-loop/index.ts
# expect all matches

# validateLoopOutcomeInvariants sigue presente:
grep -q "validateLoopOutcomeInvariants" src/lib/agents/somnio-v4/sub-loop/index.ts
# expect: match
```

**Type check:**
```bash
npx tsc --noEmit 2>&1 | grep -E "sub-loop/index" | head -10
# expect: 0
```

**Anti-regression — checkNuncaDecir importado (no se renombra):**
```bash
grep -q "import { checkNuncaDecir } from './nunca-decir-check'" src/lib/agents/somnio-v4/sub-loop/index.ts
# expect: match
```
  </action>
  <verify>
    <automated>grep -q "createOpenAI" src/lib/agents/somnio-v4/sub-loop/index.ts && grep -q "OPENAI_API_KEY_SALESV4" src/lib/agents/somnio-v4/sub-loop/index.ts && grep -q "getOpenAI()('gpt-4o-mini')" src/lib/agents/somnio-v4/sub-loop/index.ts && ! grep -q "@ai-sdk/anthropic" src/lib/agents/somnio-v4/sub-loop/index.ts && ! grep -q "claude-haiku-4-5" src/lib/agents/somnio-v4/sub-loop/index.ts && grep -q "validateLoopOutcomeInvariants" src/lib/agents/somnio-v4/sub-loop/index.ts && grep -q "stopWhen: stepCountIs(4)" src/lib/agents/somnio-v4/sub-loop/index.ts && npx tsc --noEmit 2>&1 | grep -E "sub-loop/index" | head -1 | wc -l | grep -q "^0$"</automated>
  </verify>
  <acceptance_criteria>
    - `sub-loop/index.ts` importa `createOpenAI` de `@ai-sdk/openai`
    - `sub-loop/index.ts` usa `getOpenAI()('gpt-4o-mini')` en model:
    - `sub-loop/index.ts` referencia `process.env.OPENAI_API_KEY_SALESV4`
    - `sub-loop/index.ts` NO importa de `@ai-sdk/anthropic`
    - `sub-loop/index.ts` NO contiene literal `'claude-haiku-4-5'`
    - `validateLoopOutcomeInvariants` sigue invocado post-generateText (Plan 02 Task 2 preservado)
    - `stopWhen: stepCountIs(4)` preservado (D-09)
    - `toolChoice: 'auto'` preservado (W-06 / D-62)
    - `output: Output.object({ schema: LoopOutcomeSchema })` preservado
    - `npx tsc --noEmit` no introduce errores
  </acceptance_criteria>
  <done>Sub-loop con GPT-4o mini (key custom).</done>
</task>

<task type="auto">
  <name>Task 3: Migrar sub-loop/nunca-decir-check.ts a Gemini Flash-Lite (D-30)</name>
  <files>src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts</files>
  <read_first>
    - src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts (54 líneas)
    - .planning/standalone/somnio-sales-v4-runtime-wiring/research-scripts/test-final.ts (Gemini check working)
    - .planning/standalone/somnio-sales-v4-runtime-wiring/CONTEXT.md (D-30)
    - .planning/standalone/somnio-sales-v4-runtime-wiring/RESEARCH.md (§CheckSchema results — Gemini 2/2 match)
  </read_first>
  <action>
**Cambios mínimos en `src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts`:**

1. **Import swap:**
```typescript
// REMOVE:
import { anthropic } from '@ai-sdk/anthropic'

// ADD:
import { google } from '@ai-sdk/google'
```

2. **Cambio del `model:` (línea 34):**

```typescript
// REMOVE:
model: anthropic('claude-haiku-4-5-20251001'),

// ADD:
model: google('gemini-2.5-flash-lite'),
```

NADA más cambia. Mantener:
- `import { generateText, Output } from 'ai'`
- `import { z } from 'zod'`
- `CheckSchema` (boolean + optional string)
- Early-return cuando `nuncaDecirRules.length === 0`
- `runWithPurpose('subloop_nunca_decir', ...)` wrapper
- System prompt + user message con la lista de rules
- Return shape `{ ok: boolean; violation?: string }`

**Header comment update:**
Agregar nota:
```typescript
/**
 * D-51: post-gen check Gemini Flash-Lite que valida si `candidateText` viola alguna regla "NUNCA decir".
 * D-30: migrado de Haiku a Gemini Flash-Lite (Plan 05 — schema simple sin tools, Gemini ~4x más barato).
 * D-50: solo se invoca en outcomes 'canonical' del sub-loop (verbatim del KB).
 * Latencia ~150ms-500ms (toma sólo si hay rules; early-return si vacío).
 * ...
 */
```

**Type check:**

```bash
npx tsc --noEmit 2>&1 | grep -E "nunca-decir-check" | head -10
# expect: 0
```

**Verificaciones grep:**

```bash
grep -q "from '@ai-sdk/google'" src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts
grep -q "google('gemini-2.5-flash-lite')" src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts
# expect both matches

grep -c "@ai-sdk/anthropic" src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts
# expect: 0

grep -c "claude-haiku-4-5" src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts
# expect: 0
```

**Anti-regression checks (cero edits a otros agentes):**

```bash
git diff src/lib/agents/somnio-v3/ src/lib/agents/godentist/ src/lib/agents/godentist-fb-ig/ src/lib/agents/somnio-recompra/ src/lib/agents/somnio-pw-confirmation/
# expect: empty (Regla 6)
```

**Phase-wide grep — cero claude-haiku-4-5 en somnio-v4/:**

```bash
grep -rn "claude-haiku-4-5" src/lib/agents/somnio-v4/ | grep -v "__tests__\|TODO\|comment\|//"
# expect: 0 matches (excluyendo tests / TODOs / comentarios)
# Nota: engine-v4.ts ya hizo swap at clone time en Plan 03 (B-2 fix), así que este grep
# encuentra 0 matches en TODO el módulo somnio-v4/ post-Plan 05 sin necesitar añadir
# engine-v4.ts a files_modified de este plan.
```

Si quedan matches en archivos no listados como files_modified de Plan 05:
- Verificar si son comentarios (OK — clean-up futuro)
- Verificar si son archivos de test (OK)
- Verificar si son archivos productivos no contemplados → escalate como gap del plan
  </action>
  <verify>
    <automated>grep -q "google('gemini-2.5-flash-lite')" src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts && grep -q "from '@ai-sdk/google'" src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts && ! grep -q "@ai-sdk/anthropic" src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts && ! grep -q "claude-haiku-4-5" src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts && grep -q "CheckSchema" src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts && grep -q "runWithPurpose('subloop_nunca_decir'" src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts && [ -z "$(git diff src/lib/agents/somnio-v3/ src/lib/agents/godentist/ src/lib/agents/godentist-fb-ig/ src/lib/agents/somnio-recompra/ src/lib/agents/somnio-pw-confirmation/ 2>/dev/null)" ] && npx tsc --noEmit 2>&1 | grep -E "nunca-decir-check" | head -1 | wc -l | grep -q "^0$"</automated>
  </verify>
  <acceptance_criteria>
    - `nunca-decir-check.ts` importa de `@ai-sdk/google`
    - `nunca-decir-check.ts` usa `google('gemini-2.5-flash-lite')`
    - `nunca-decir-check.ts` NO importa de `@ai-sdk/anthropic`
    - `nunca-decir-check.ts` NO contiene literal `'claude-haiku-4-5'`
    - Early-return preservado (`if (args.nuncaDecirRules.length === 0)`)
    - Return shape preservado (`{ ok: boolean; violation?: string }`)
    - `git diff` de otros agentes vacío (Regla 6)
    - Phase-wide grep `claude-haiku-4-5` en `src/lib/agents/somnio-v4/` retorna 0 matches en código productivo (engine-v4.ts ya cubierto por Plan 03 B-2 swap-at-clone-time)
    - `npx tsc --noEmit` sin errores
  </acceptance_criteria>
  <done>NUNCA-decir check migrado a Gemini.</done>
</task>

</tasks>

<verification>
- 3 archivos productivos con stack mixto wireado (Gemini + GPT)
- Cero literal 'claude-haiku-4-5' en src/lib/agents/somnio-v4/ (productivo) — engine-v4.ts cubierto por Plan 03 B-2
- comprehension.ts usa canonical access path `result.output` (W-4 fix — sin triple-fallback, sin `as any`)
- comprehension-schema.ts y comprehension-prompt.ts intocados (D-25)
- Otros agentes (v3/godentist/recompra/pw-confirmation) sin cambios (Regla 6)
- Test E2E gated comprehension-gemini.test.ts agregado (3 tests)
- npx tsc --noEmit clean
</verification>

<success_criteria>
- Plan 06 (NoRepetitionFilter) puede arrancar sin riesgo de model conflicts
- Plan 07 Smoke A puede ejecutar sub-loop con GPT-4o mini real (env var en Vercel preview/prod garantizada por Plan 01 checkpoint)
- Plan 08 Smoke B puede operar v4 productivo con costos reducidos confirmados (~$23/mes a 100K turnos)
</success_criteria>

<output>
Crear `.planning/standalone/somnio-sales-v4-runtime-wiring/05-SUMMARY.md` con:
- Sintaxis usada para AI SDK v6 Output: `output: Output.object(...)` (canonical, NO experimental_output) — confirmar con grep
- Confirmación grep `claude-haiku-4-5` retorna 0 en `src/lib/agents/somnio-v4/`
- Outcome del smoke E2E gated (skip vs pass)
- Tokens IN/OUT comparison post-swap (si ejecutó test E2E)
- Cualquier desviación del plan (ej: shape de result no coincide con docs)
</output>
</output>
