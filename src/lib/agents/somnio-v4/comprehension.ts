/**
 * Somnio Sales Agent v4 — Comprehension Layer (Capa 2)
 *
 * Single LLM call con structured output via AI SDK v6.
 * Extracts intent, data fields, classification, and negations.
 *
 * **Modelo real (post-Plan 05, D-30):** `google('gemini-2.5-flash')` (~$0.0001/call;
 * migrado desde Haiku 4.5). RESEARCH 5/5 match con Plan 12.1 calibration —
 * D-12 NO necesaria (re-calibración no requerida).
 *
 * Standalone: somnio-sales-v4-runtime-wiring / Plan 05.
 *
 * EXTENSIÓN v4 (D-68):
 *   Observability emit incluye agent='somnio-sales-v4' + intent_confidence +
 *   intent_confidence_reasoning. threshold + scaledToSubLoop quedan en null —
 *   los completa el orquestador en Plan 07 (lee platform_config.somnio_v4_low_confidence_threshold).
 *
 * Anti-patterns (post-RESEARCH H-2 + H-3):
 *   - NO Anthropic SDK directo (RESEARCH H-2: AI SDK + Anthropic rechaza min/max en number).
 *     El "stay raw" del Plan 12.1 padre asumía que Anthropic SDK directo era la única vía
 *     portable; eso era cierto SOLO mientras el provider era Anthropic. Cambio a Gemini
 *     permite migrar a AI SDK v6 (Pitfall 4 inverted).
 *   - NO mock provider — runtime real Gemini API (env var GOOGLE_GENERATIVE_AI_API_KEY).
 *   - NO modificar comprehension-schema.ts ni comprehension-prompt.ts (D-25 lockea Plan 12.1).
 *   - NO recalibrar few-shot (D-12 — Plan 12.1 funciona en Gemini sin ajuste).
 *   - NO triple-fallback (W-4): el patrón canónico es `output: Output.object(...)`
 *     + `result.output` directo, validado por research-scripts/test-comprehension.ts.
 *     No defensive chaining sobre fields del result (ej. exp-output / parsed / text).
 *     Si AI SDK cambia la API, fallará en compile/runtime de forma dirigida y se
 *     arregla puntualmente.
 *   - NO type-assertion cast defensivo en `result.output` (el tipo se infiere del schema).
 *   - NO skip parseAnalysis sanitization fallback — Gemini ocasionalmente puede emitir
 *     intents fuera del enum; v4 mapea a 'otro' (D-69 sumidero por construcción).
 *   - temperature=0 preservada (default Gemini para JSON-schema output).
 */

import { generateText, Output } from 'ai'
import { google } from '@ai-sdk/google'
import { runWithPurpose, getCollector } from '@/lib/observability'
import { MessageAnalysisSchema, type MessageAnalysis } from './comprehension-schema'
import { buildSystemPrompt } from './comprehension-prompt'
import { V4_INTENTS } from './constants'

const V4_INTENTS_SET = new Set<string>(V4_INTENTS)

// ============================================================================
// Comprehension Function
// ============================================================================

export interface ComprehensionResult {
  analysis: MessageAnalysis
  tokensUsed: number
}

/**
 * Analyze a customer message using Gemini 2.5 Flash structured output.
 *
 * @param message - Current customer message
 * @param history - Conversation history (last N turns)
 * @param existingData - Already captured customer data (for context)
 * @param recentBotMessages - Last 3 bot messages for short-reply disambiguation
 * @returns Structured analysis (with intent_confidence — D-10) + token count
 */
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

  // Diagnostic wrap (Plan 07 debug iter 3): el error AI_NoOutputGeneratedError
  // puede ser arrojado dentro del await generateText (no en result.output access).
  // Capturamos el error con todas sus props para identificar la causa real
  // (finishReason, candidates, raw text, safetyRatings, etc.).
  let result: Awaited<ReturnType<typeof generateText>>
  try {
    result = await runWithPurpose('comprehension', () =>
      generateText({
        model: google('gemini-2.5-flash'),
        system: buildSystemPrompt(existingData, recentBotMessages),
        messages,
        output: Output.object({ schema: MessageAnalysisSchema }),
        providerOptions: {
          google: {
            safetySettings: [
              { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            ],
          },
        },
      })
    )
  } catch (genErr) {
    // Extract diagnostic info from AI SDK error
    const e = genErr as Record<string, unknown>
    const errName = (e?.name as string) ?? 'Error'
    const errMsg = (e?.message as string) ?? String(genErr)
    const cause = e?.cause ? JSON.stringify(e.cause).slice(0, 300) : 'no-cause'
    // AI SDK errors often carry .text, .finishReason, .response, .responseBody
    const text = (e?.text as string) ?? (e?.responseBody as string) ?? 'no-text'
    const finishReason = (e?.finishReason as string) ?? 'no-finishReason'
    // safetyRatings live on candidates — peek at response if present
    const responseStr = e?.response
      ? JSON.stringify(e.response).slice(0, 500)
      : 'no-response'
    throw new Error(
      `[Comprehension-v4 generateText] ${errName}: ${errMsg} | ` +
      `finishReason="${finishReason}" | text="${(text as string).slice(0, 200)}" | ` +
      `cause="${cause}" | response="${responseStr}"`
    )
  }

  // Canonical access path — validado por research-scripts/test-comprehension.ts (W-4):
  // `result.output` es la instancia parseada del schema (typed por z.infer<MessageAnalysisSchema>).
  // Defensive: si por algún path raro generateText resolvió sin throw pero result.output
  // sigue ausente, capturamos también aquí.
  let parsedOutput: MessageAnalysis
  try {
    parsedOutput = result.output as MessageAnalysis
  } catch (outputErr) {
    const finishReason = result.finishReason ?? 'unknown'
    const rawText = (result.text ?? '').slice(0, 200)
    const errMsg = outputErr instanceof Error ? outputErr.message : String(outputErr)
    throw new Error(
      `[Comprehension-v4] No output generated. finishReason="${finishReason}" text="${rawText}" inner="${errMsg}"`,
    )
  }
  const analysis = parseAnalysis(JSON.stringify(parsedOutput))

  const tokensUsed =
    (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0)

  // D-68: observability completa de comprehension.
  // threshold + scaledToSubLoop son null aquí — los rellena el orquestador (Plan 07)
  // tras leer platform_config.somnio_v4_low_confidence_threshold (D-11).
  getCollector()?.recordEvent('pipeline_decision', 'comprehension_completed', {
    agent: 'somnio-sales-v4',
    intent: analysis.intent.primary,
    secondary: analysis.intent.secondary,
    confidence: analysis.intent.confidence, // legacy 0-100
    intent_confidence: analysis.intent.intent_confidence, // NEW 0..1 (D-10)
    intent_confidence_reasoning: analysis.intent.intent_confidence_reasoning ?? null, // NEW (D-68)
    threshold: null,        // Plan 07 lo agrega tras lookup de platform_config
    scaledToSubLoop: null,  // Plan 07 decide
    category: analysis.classification.category,
    sentiment: analysis.classification.sentiment,
    fieldsExtracted: Object.keys(analysis.extracted_fields).filter(
      k => analysis.extracted_fields[k as keyof typeof analysis.extracted_fields] !== null
    ),
    tokensUsed,
  })

  return { analysis, tokensUsed }
}

// ============================================================================
// Resilient Parsing
// ============================================================================

function parseAnalysis(rawText: string): MessageAnalysis {
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(rawText)
  } catch {
    throw new Error(`[Comprehension-v4] Invalid JSON from Gemini: ${rawText.slice(0, 200)}`)
  }

  // 1. Try strict parse
  const strict = MessageAnalysisSchema.safeParse(raw)
  if (strict.success) return strict.data

  // 2. Sanitize known failure: intent values outside enum (map to 'otro' — D-69 sumidero)
  const intent = raw.intent as Record<string, unknown> | undefined
  if (intent) {
    if (typeof intent.primary === 'string' && !V4_INTENTS_SET.has(intent.primary)) {
      console.warn(`[Comprehension-v4] Unknown intent.primary="${intent.primary}", falling back to "otro"`)
      intent.primary = 'otro'
    }
    if (typeof intent.secondary === 'string' && intent.secondary !== 'ninguno' && !V4_INTENTS_SET.has(intent.secondary)) {
      console.warn(`[Comprehension-v4] Unknown intent.secondary="${intent.secondary}", falling back to "ninguno"`)
      intent.secondary = 'ninguno'
    }
  }

  // 3. Re-parse after sanitization
  const sanitized = MessageAnalysisSchema.safeParse(raw)
  if (sanitized.success) return sanitized.data

  // 4. Still fails — throw with details
  const issues = sanitized.error.issues.slice(0, 5).map(i =>
    `- ${i.path.join('.')}: ${i.message}`
  ).join('\n')
  throw new Error(`[Comprehension-v4] Failed to parse after sanitization:\n${issues}`)
}
