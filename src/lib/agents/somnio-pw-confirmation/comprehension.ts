/**
 * Somnio Sales v3 PW-Confirmation Agent — Comprehension Layer
 *
 * Single Claude Haiku call per turn via AI SDK v6 `generateObject`.
 * Returns a structured `MessageAnalysis` (intent + confidence + datos_extraidos + notas).
 *
 * Architecture (D-25): state-machine pure agent — no AI SDK loop, no tool-calls,
 * just ONE comprehension call per customer turn. The state machine consumes
 * `MessageAnalysis.intent` to drive transitions.
 *
 * Model: 'claude-haiku-4-5' (literal, same as somnio-recompra and somnio-v3).
 * maxOutputTokens: 512 (same as recompra/v3).
 * temperature: 0.1 (deterministic — we want consistent intent classification).
 *
 * Degradation policy: if `generateObject` throws (timeout, network, schema mismatch
 * after retries), return `{intent: 'fallback', confidence: 0, notas: 'Comprehension error: ...'}`
 * and let the state machine route to fallback / handoff. NEVER throws to the caller —
 * comprehension errors should be observable but not block the agent loop.
 *
 * Consumed by Plan 11 (engine-pw-confirmation.ts) — `processMessage()` flow.
 * Tested by Plan 12 — mocks `generateObject` to assert intent classification logic.
 *
 * Telemetry (when observability collector is in scope via `runWithCollector`):
 * emits `comprehension:result` event with {intent, confidence, durationMs, fallback}.
 */

import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { getCollector } from '@/lib/observability'
import { createModuleLogger } from '@/lib/audit/logger'
import {
  MessageAnalysisSchema,
  type MessageAnalysis,
} from './comprehension-schema'
import { buildPwConfirmationPrompt } from './comprehension-prompt'

const log = createModuleLogger('somnio-pw-confirmation-comprehension')

// ============================================================================
// Types
// ============================================================================

export interface AnalyzeMessageInput {
  /** Current customer message (the one we're classifying). */
  message: string

  /**
   * Current state machine state. Shape `unknown` because Plan 06 (state.ts)
   * defines the full type later; the prompt builder reads `phase` defensively.
   */
  state: unknown

  /**
   * Conversation history (last N turns from `messages` table).
   * Builder slices to the last 6 turns inside `buildPwConfirmationPrompt`.
   */
  history: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>

  /**
   * `_v3:crm_context` value preloaded by Plan 09 Inngest function (D-05 BLOQUEANTE).
   * When present the prompt section 6 includes the rich payload (active_order,
   * shipping fields). When undefined/empty the prompt explicitly tells the LLM
   * to ask the customer to confirm order_id / nombre.
   */
  crmContext?: string
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Analyze a customer message in post-purchase context.
 *
 * Single Haiku call via AI SDK v6 generateObject + Zod schema validation.
 * Never throws — returns `{intent: 'fallback', confidence: 0}` on any error.
 */
export async function analyzeMessage(
  input: AnalyzeMessageInput,
): Promise<MessageAnalysis> {
  const { message, state, history, crmContext } = input

  const systemPrompt = buildPwConfirmationPrompt({ state, history, crmContext })
  const startedAt = Date.now()

  try {
    const result = await generateObject({
      model: anthropic('claude-haiku-4-5'),
      schema: MessageAnalysisSchema,
      schemaName: 'MessageAnalysis',
      schemaDescription:
        'Intent classification + shipping data extraction for post-purchase customer message.',
      system: systemPrompt,
      prompt: message,
      maxOutputTokens: 512,
      temperature: 0.1,
    })

    const durationMs = Date.now() - startedAt
    const analysis = result.object

    // Telemetry — best-effort, never blocks return.
    try {
      getCollector()?.recordEvent('comprehension', 'result', {
        agent: 'somnio-sales-v3-pw-confirmation',
        intent: analysis.intent,
        confidence: analysis.confidence,
        hasDatosExtraidos:
          analysis.datos_extraidos != null &&
          Object.values(analysis.datos_extraidos).some(v => v != null),
        durationMs,
        fallback: false,
      })
    } catch {
      // swallow — observability never blocks agent flow (REGLA 6)
    }

    return analysis
  } catch (err) {
    const durationMs = Date.now() - startedAt
    const errorMsg = err instanceof Error ? err.message : String(err)

    log.error(
      {
        event: 'comprehension_error',
        error: errorMsg,
        durationMs,
        messagePreview: message.slice(0, 200),
      },
      '[somnio-pw-confirmation] comprehension call failed — returning fallback',
    )

    try {
      getCollector()?.recordEvent('comprehension', 'result', {
        agent: 'somnio-sales-v3-pw-confirmation',
        intent: 'fallback',
        confidence: 0,
        hasDatosExtraidos: false,
        durationMs,
        fallback: true,
        error: errorMsg.slice(0, 500),
      })
    } catch {
      // swallow — observability never blocks agent flow (REGLA 6)
    }

    return {
      intent: 'fallback',
      confidence: 0,
      datos_extraidos: null,
      notas: `Comprehension error: ${errorMsg.slice(0, 300)}`,
    }
  }
}
