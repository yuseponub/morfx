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

import { generateText, Output, jsonSchema } from 'ai'
import { google } from '@ai-sdk/google'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { runWithPurpose, getCollector } from '@/lib/observability'
import { MessageAnalysisSchema, type MessageAnalysis } from './comprehension-schema'
import { buildSystemPrompt } from './comprehension-prompt'
import { V4_INTENTS } from './constants'
import { callWithGeminiFallback } from './llm-fallback'
import { stripNumericConstraints } from './sanitize-schema'

const V4_INTENTS_SET = new Set<string>(V4_INTENTS)

// ============================================================================
// Schema saneado para el branch Anthropic (Pitfall #1 — gemini-fallback-haiku)
// ============================================================================
//
// Pitfall #1 (RESEARCH): Anthropic via AI SDK devuelve 400 si el JSON Schema lleva
// minimum/maximum/exclusiveMinimum (issues vercel/ai #14342, #13355). MessageAnalysisSchema
// usa z.number().min(0).max(1) en intent_confidence/secondary_confidence → el branch
// Anthropic DEBE usar un schema sin esos bounds. El rango 0..1 se valida en post-parse
// (clampConfidence en parseAnalysis, que re-parsea contra MessageAnalysisSchema con min/max).
// Gemini ignora los keywords → su branch usa MessageAnalysisSchema intacto (D-25 lockea
// comprehension-schema.ts; este schema saneado vive LOCAL en comprehension.ts sin tocarlo).
// M-03 (gemini-fallback-haiku review): el `.describe(...)` ES parte del prompt en structured
// output → DEBE conservar la guía de calibración completa del schema original, solo quitando
// .min(0).max(1) (los describes son legales para Anthropic; solo minimum/maximum/exclusiveMinimum
// rompen con 400). Sin los anchors de calibración, el branch Haiku auto-reporta confidence sin
// referencia → drift sistemático de intent_confidence vs Gemini, que alimenta el gate de
// low-confidence (sub-loop/handoff). Texto copiado verbatim de comprehension-schema.ts:49-66.
//
// Este Zod typed se mantiene para inferencia de tipos y para los tests de paridad (que
// introspeccionan su JSON Schema). El schema REAL enviado a Anthropic se deriva
// ESTRUCTURALMENTE de MessageAnalysisSchema (M-04, abajo) para que ningún campo futuro con
// bounds rompa el branch en silencio.
export const MessageAnalysisSchemaSanitized = MessageAnalysisSchema.extend({
  intent: MessageAnalysisSchema.shape.intent.extend({
    intent_confidence: z.number().describe(
      '0..1 self-reported confidence en la clasificación PRIMARIA. ' +
      '0.85+ = universal-claro (e.g., "cuanto cuesta"), ' +
      '0.50-0.70 = context-dependent (e.g., "ok"), ' +
      '<0.40 = sumidero / fallback / razonamiento_libre. ' +
      'Reflect ambiguity at this turn IN ISOLATION (D-74) — do NOT use prior conversation phase to resolve.'
    ),
    secondary_confidence: z.number().nullable().describe(
      '0..1 self-reported confidence en la clasificacion SECUNDARIA. ' +
      'null si secondary === "ninguno". Misma calibracion template-fit que intent_confidence: ' +
      '0.85+ = la respuesta automatica del secondary CUBRE la pregunta; ' +
      '0.20-0.40 = NO CUBRE (caso especifico/sustancia/condicion); 0.45-0.65 = ambiguo.'
    ),
  }),
})

// M-04 (gemini-fallback-haiku review): JSON Schema enviado a Anthropic, derivado
// ESTRUCTURALMENTE del Zod typed (no por lista fija de campos). Se recorre el JSON Schema
// completo y se eliminan minimum/maximum/exclusiveMinimum/exclusiveMaximum/multipleOf en
// CUALQUIER nivel (stripNumericConstraints). Cualquier campo numérico futuro con bounds en
// MessageAnalysisSchema queda cubierto automáticamente → nunca un 400 silencioso en el branch
// Anthropic. Se parte de MessageAnalysisSchemaSanitized para preservar los describes M-03.
const ANTHROPIC_COMPREHENSION_JSON_SCHEMA = jsonSchema<MessageAnalysis>(
  stripNumericConstraints(z.toJSONSchema(MessageAnalysisSchemaSanitized)) as Record<string, unknown>,
)

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
  //
  // EXTENSIÓN gemini-fallback-haiku (Plan 03): fallback Gemini → Haiku 4.5 ante
  // saturación (D-01/D-02/D-05/D-06/D-09). El closure `gemini` hace el generateText
  // LIMPIO (sin try/catch interno) para que un error de saturación llegue como
  // APICallError crudo al helper (Pitfall #5 — el re-throw diagnóstico de abajo
  // destruiría la instancia APICallError si envolviera el generateText). El branch
  // Anthropic usa el schema saneado (sin min/max — Pitfall #1) y SIN
  // providerOptions.google (Pitfall #7). v4-only: comprehend es invocada SOLO por
  // somnio-v4-agent.ts → aislamiento Regla 6 automático.
  let result: Awaited<ReturnType<typeof generateText>>
  try {
    result = await callWithGeminiFallback({
      callSite: 'comprehension',
      gemini: (signal) =>
        runWithPurpose('comprehension', () =>
          generateText({
            model: google('gemini-2.5-flash'),
            maxRetries: 0,        // D-05 — saturación detectada al primer fallo
            abortSignal: signal,  // D-06 — timeout guard del helper
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
        ),
      anthropic: (signal) =>
        runWithPurpose('comprehension', () =>
          generateText({
            model: anthropic('claude-haiku-4-5'), // D-02 — techo absoluto Haiku 4.5
            maxRetries: 0,        // M-01 — N=1 también en el último recurso
            abortSignal: signal,  // M-01 — timeout guard fresco del helper (no el de Gemini)
            system: buildSystemPrompt(existingData, recentBotMessages),
            messages,
            // M-04: JSON Schema saneado ESTRUCTURALMENTE (sin min/max en ningún nivel — Pitfall #1).
            output: Output.object({ schema: ANTHROPIC_COMPREHENSION_JSON_SCHEMA }),
            // SIN providerOptions.google — Pitfall #7 (safetySettings es google-only)
          })
        ),
    })
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
    secondary_confidence: analysis.intent.secondary_confidence ?? null,
    secondary_confidence_reasoning: analysis.intent.secondary_confidence_reasoning ?? null,
    secondary_query: analysis.intent.secondary_query ?? null,
  })

  return { analysis, tokensUsed }
}

// ============================================================================
// Resilient Parsing
// ============================================================================

/**
 * Clamp defensivo 0..1 de intent_confidence/secondary_confidence (Pitfall #1 — T-fb-05).
 *
 * El branch Anthropic usa MessageAnalysisSchemaSanitized (sin min/max) → puede devolver
 * valores fuera de 0..1. Antes del strict parse contra MessageAnalysisSchema (que SÍ tiene
 * min(0).max(1)), clampamos esos campos para que un valor improbable fuera de rango (el
 * modelo auto-reporta confidence) no haga fallar el strict parse. Muta `raw` in-place y lo
 * retorna. Exportado para test determinista (comprehension-fallback-parity.test.ts).
 */
export function clampConfidence(raw: Record<string, unknown>): Record<string, unknown> {
  const intentObj = raw.intent as Record<string, unknown> | undefined
  if (intentObj && typeof intentObj.intent_confidence === 'number') {
    intentObj.intent_confidence = Math.max(0, Math.min(1, intentObj.intent_confidence as number))
  }
  if (intentObj && typeof intentObj.secondary_confidence === 'number') {
    intentObj.secondary_confidence = Math.max(0, Math.min(1, intentObj.secondary_confidence as number))
  }
  return raw
}

function parseAnalysis(rawText: string): MessageAnalysis {
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(rawText)
  } catch {
    throw new Error(`[Comprehension-v4] Invalid JSON from Gemini: ${rawText.slice(0, 200)}`)
  }

  // 0. Branch Anthropic usó schema saneado (sin min/max) → clamp 0..1 defensivo (Pitfall #1).
  clampConfidence(raw)

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
