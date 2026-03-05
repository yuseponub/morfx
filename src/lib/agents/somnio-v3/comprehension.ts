/**
 * Somnio Sales Agent v3 — Comprehension Layer (Capa 2)
 *
 * Single Claude call with structured output.
 * Extracts intent, data fields, classification, and negations.
 *
 * Uses claude-haiku-4-5 for cost efficiency (~$0.001/call).
 * Prompt caching via cache_control on the system prompt.
 */

import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { MessageAnalysisSchema, type MessageAnalysis } from './comprehension-schema'
import { buildSystemPrompt } from './comprehension-prompt'
import { V3_INTENTS } from './constants'

const V3_INTENTS_SET = new Set<string>(V3_INTENTS)

// ============================================================================
// Client Singleton
// ============================================================================

let client: Anthropic | null = null

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
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
 * @returns Structured analysis + token count
 */
export async function comprehend(
  message: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  existingData: Record<string, string>,
): Promise<ComprehensionResult> {
  const anthropic = getClient()

  const messages: Anthropic.MessageParam[] = [
    ...history.slice(-6).map(h => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    })),
    { role: 'user', content: message },
  ]

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: [{
      type: 'text',
      text: buildSystemPrompt(existingData),
      cache_control: { type: 'ephemeral' },
    }],
    messages,
    output_config: { format: zodOutputFormat(MessageAnalysisSchema) },
  })

  const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0)

  const textBlock = response.content.find(b => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('[Comprehension-v3] No text content in Claude response')
  }

  const analysis = parseAnalysis(textBlock.text)

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
    throw new Error(`[Comprehension-v3] Invalid JSON from Claude: ${rawText.slice(0, 200)}`)
  }

  // 1. Try strict parse
  const strict = MessageAnalysisSchema.safeParse(raw)
  if (strict.success) return strict.data

  // 2. Sanitize known failure: intent values outside enum
  const intent = raw.intent as Record<string, unknown> | undefined
  if (intent) {
    if (typeof intent.primary === 'string' && !V3_INTENTS_SET.has(intent.primary)) {
      console.warn(`[Comprehension-v3] Unknown intent.primary="${intent.primary}", falling back to "otro"`)
      intent.primary = 'otro'
    }
    if (typeof intent.secondary === 'string' && intent.secondary !== 'ninguno' && !V3_INTENTS_SET.has(intent.secondary)) {
      console.warn(`[Comprehension-v3] Unknown intent.secondary="${intent.secondary}", falling back to "ninguno"`)
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
  throw new Error(`[Comprehension-v3] Failed to parse after sanitization:\n${issues}`)
}
