/**
 * Somnio Sales Agent v2 — Comprehension Layer (Capa 1)
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

  // Build conversation messages: history + current message
  const messages: Anthropic.MessageParam[] = [
    // Include last 6 turns of history for context
    ...history.slice(-6).map(h => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    })),
    { role: 'user', content: message },
  ]

  const response = await anthropic.messages.parse({
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

  if (!response.parsed_output) {
    throw new Error('[Comprehension] Failed to parse structured output from Claude')
  }

  const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0)

  return {
    analysis: response.parsed_output,
    tokensUsed,
  }
}
