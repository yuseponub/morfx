import { generateText, Output, stepCountIs } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { runWithPurpose, getCollector } from '@/lib/observability'
import { LoopOutcomeSchema, type LoopOutcome, type SubLoopReason } from './output-schema'
import { buildSubLoopTools, type SubLoopToolsContext } from './tools'
import { buildSubLoopPrompt } from './prompt'
import { checkNuncaDecir } from './nunca-decir-check'
import { SOMNIO_V4_AGENT_ID } from '../config'

export type { SubLoopReason } from './output-schema'

/**
 * Contexto que el caller del sub-loop debe pasar.
 *
 * - `workspaceId / conversationId / sessionId`: heredado de SubLoopToolsContext.
 * - `userMessage`: mensaje actual del cliente (último turn).
 * - `recentMessages`: últimos N turnos para contexto del modelo (recomendado 4-6).
 */
export interface SubLoopContext extends SubLoopToolsContext {
  userMessage: string
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>
}

/**
 * Entrypoint del sub-loop AI SDK v6 (D-01, D-09, D-62).
 *
 * - D-01: solo se invoca bajo triggers D-02. NO es el path por defecto.
 * - D-09: Haiku, 3-5 tools por reason, stopWhen=stepCountIs(4), latencia ~600ms-1.5s.
 * - D-62: output ESTRICTAMENTE LoopOutcome (template / canonical / no_match) — sin
 *         texto libre. ENFORCED por `Output.object({ schema: LoopOutcomeSchema })`,
 *         NO por toolChoice — see RESEARCH §Pattern 2 line 406. `toolChoice='required'`
 *         bloquearía el structured output final step (W-06).
 * - D-51: si outcome 'canonical', post-gen NUNCA-decir check (latencia +150ms).
 *         W-09: rules vienen de `output.nuncaDecirRules` que el LLM copió del
 *         hit de kb_search (que a su vez vienen del DB column nunca_decir vía RPC
 *         match_knowledge_base).
 *
 * Anti-patterns aplicados:
 * - NO `generateObject` (deprecated AI SDK v6) — usamos `generateText + Output.object()`.
 * - NO `toolChoice: 'required'` — bloquea el structured output final (W-06).
 * - NO `stopWhen` > 4 — D-09 scope acotado.
 * - NO imports desde `@/lib/agents/somnio-v3/*` (D-24).
 *
 * Standalone: somnio-sales-v4 / Plan 05 / Task 4.
 */
export async function runSubLoop(args: {
  reason: SubLoopReason
  ctx: SubLoopContext
}): Promise<LoopOutcome> {
  const tools = buildSubLoopTools(args.reason, args.ctx)

  const { output } = await runWithPurpose('subloop', () =>
    generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      system: buildSubLoopPrompt(args.reason),
      messages: [
        ...args.ctx.recentMessages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: args.ctx.userMessage },
      ],
      tools,
      // W-06 — D-62 enforced by Output.object() schema, not by toolChoice. See
      // RESEARCH §Pattern 2 line 406: 'required' would block the structured-output
      // final step. 'auto' lets the model search KB / call CRM tools and then emit
      // the LoopOutcome object as the last step.
      toolChoice: 'auto',
      // 1 KB search + 1 CRM call + 1 final → margen 4 (D-09 scope acotado).
      stopWhen: stepCountIs(4),
      output: Output.object({ schema: LoopOutcomeSchema }),
    })
  )

  // D-51: post-gen NUNCA-decir check solo en outcome 'canonical' (D-50 verbatim KB).
  if (output.status === 'canonical') {
    const rules = output.nuncaDecirRules ?? []
    const check = await checkNuncaDecir({
      candidateText: output.canonicalText,
      nuncaDecirRules: rules,
    })
    if (!check.ok) {
      // Forzar handoff humano (D-51 violation → D-57 no_match).
      const escalated: LoopOutcome = {
        status: 'no_match',
        responseTemplate: 'handoff_humano',
        requiresHuman: true,
        reason: `nunca_decir_violation: ${check.violation ?? 'unspecified'}`,
        knowledgeQueried: [output.sourceTopic],
      }
      getCollector()?.recordEvent(
        'pipeline_decision',
        'subloop_nunca_decir_violation',
        {
          agent: SOMNIO_V4_AGENT_ID,
          reason: args.reason,
          sourceTopic: output.sourceTopic,
          violation: check.violation ?? null,
        }
      )
      return escalated
    }
  }

  // Observability D-58 (familia D-2): outcome del sub-loop.
  getCollector()?.recordEvent('pipeline_decision', 'subloop_completed', {
    agent: SOMNIO_V4_AGENT_ID,
    reason: args.reason,
    outcome: output.status,
    sourceTopic: output.status === 'canonical' ? output.sourceTopic : null,
    requiresHuman: output.requiresHuman,
  })

  return output
}
