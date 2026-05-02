/**
 * Somnio Sales Agent v4 — Comprehension Layer (Capa 2)
 *
 * Single Claude call with structured output.
 * Extracts intent, data fields, classification, and negations.
 *
 * Uses claude-haiku-4-5 for cost efficiency (~$0.001/call).
 * Prompt caching via cache_control on the system prompt.
 *
 * Standalone: somnio-sales-v4
 * Cloned mecánicamente desde somnio-v3/comprehension.ts (D-24).
 *
 * EXTENSIÓN v4 (D-68):
 *   Observability emit incluye agent='somnio-sales-v4' + intent_confidence +
 *   intent_confidence_reasoning. threshold + scaledToSubLoop quedan en null —
 *   los completa el orquestador en Plan 07 (lee platform_config.somnio_v4_low_confidence_threshold).
 *
 * Anti-patterns (RESEARCH "stay raw" + Pitfall 4):
 *   - NO migrar a AI SDK v6 generateText — preserva @anthropic-ai/sdk con zodOutputFormat.
 *   - NO skip parseAnalysis sanitization fallback — Haiku ocasionalmente emite intents
 *     fuera del enum; v4 mapea a 'otro' (D-69 sumidero por construcción).
 *   - temperature=0 preservada (default Anthropic).
 */

import type Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { createInstrumentedAnthropic } from '@/lib/observability/anthropic-instrumented'
import { runWithPurpose, getCollector } from '@/lib/observability'
import { MessageAnalysisSchema, type MessageAnalysis } from './comprehension-schema'
import { buildSystemPrompt } from './comprehension-prompt'
import { V4_INTENTS } from './constants'

const V4_INTENTS_SET = new Set<string>(V4_INTENTS)

// ============================================================================
// Client Singleton
// ============================================================================

let client: Anthropic | null = null

function getClient(): Anthropic {
  if (!client) {
    client = createInstrumentedAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return client
}

// ============================================================================
// Comprehension Function
// ============================================================================

export interface ComprehensionResult {
  analysis: MessageAnalysis
  tokensUsed: number
}

/**
 * Analyze a customer message using Claude structured output.
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
  const anthropic = getClient()

  const messages: Anthropic.MessageParam[] = [
    ...history.slice(-6).map(h => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    })),
    { role: 'user', content: message },
  ]

  const response = await runWithPurpose('comprehension', () =>
    anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: [{
        type: 'text',
        text: buildSystemPrompt(existingData, recentBotMessages),
        cache_control: { type: 'ephemeral' },
      }],
      messages,
      output_config: { format: zodOutputFormat(MessageAnalysisSchema) },
    })
  )

  const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0)

  const textBlock = response.content.find(b => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('[Comprehension-v4] No text content in Claude response')
  }

  const analysis = parseAnalysis(textBlock.text)

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
    fieldsExtracted: Object.keys(analysis.extracted_fields).filter(k => analysis.extracted_fields[k as keyof typeof analysis.extracted_fields] !== null),
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
    throw new Error(`[Comprehension-v4] Invalid JSON from Claude: ${rawText.slice(0, 200)}`)
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
