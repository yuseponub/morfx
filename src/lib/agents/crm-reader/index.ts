/**
 * CRM Reader Agent — Module Entry Point
 * Phase 44 Plan 04.
 *
 * Read-only AI agent. Exposed as internal API to other agents (tool providers).
 * Self-registers in agentRegistry on module import.
 *
 * No HTTP route yet — Plan 07 wires this into /api/v1/crm-bots/reader.
 */

import { generateText, stepCountIs, type ModelMessage } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { agentRegistry } from '../registry'
import { createModuleLogger } from '@/lib/audit/logger'
import { crmReaderConfig, CRM_READER_AGENT_ID } from './config'
import { buildReaderSystemPrompt } from './system-prompt'
import { createReaderTools } from './tools'
import type { ReaderInput, ReaderOutput } from './types'

const logger = createModuleLogger('crm-reader')

// Self-register on module import so consumers only need to `import '@/lib/agents/crm-reader'`.
agentRegistry.register(crmReaderConfig)

/**
 * Model id for the reader.
 * CONTEXT D-03: Claude Sonnet 4.5. Pinned to the full dated id so provider
 * routing is deterministic (see src/lib/observability/pricing.ts for the list
 * of accepted aliases).
 */
const MODEL_ID = 'claude-sonnet-4-5-20250929'

/** Tool-call loop cap (Pitfall 6 / T-44-04-05 mitigation). */
const MAX_STEPS = 5

export async function processReaderMessage(input: ReaderInput): Promise<ReaderOutput> {
  const systemPrompt = buildReaderSystemPrompt(input.workspaceId)
  const tools = createReaderTools({
    workspaceId: input.workspaceId,
    invoker: input.invoker,
  })

  // ReaderMessage is a structural subtype of ModelMessage (role + content strings).
  // Cast is safe — the input boundary is validated upstream by the HTTP route (Plan 07).
  const messages = input.messages as unknown as ModelMessage[]

  const result = await generateText({
    model: anthropic(MODEL_ID),
    system: systemPrompt,
    messages,
    tools,
    stopWhen: stepCountIs(MAX_STEPS),
    temperature: 0,
    abortSignal: input.abortSignal,
  })

  // Flatten every tool call across all steps into a simple serialisable record.
  // toolResults are keyed by toolCallId (see ai/dist/index.d.ts StepResult).
  const toolCalls: ReaderOutput['toolCalls'] = (result.steps ?? []).flatMap((step) => {
    const resultsById = new Map(
      (step.toolResults ?? []).map((tr) => [tr.toolCallId, tr.output] as const),
    )
    return (step.toolCalls ?? []).map((tc) => ({
      name: tc.toolName,
      input: tc.input,
      output: resultsById.get(tc.toolCallId) ?? null,
    }))
  })

  logger.info(
    {
      workspaceId: input.workspaceId,
      invoker: input.invoker,
      steps: result.steps?.length ?? 0,
      toolCallCount: toolCalls.length,
      finishReason: result.finishReason,
    },
    'reader turn complete',
  )

  return {
    text: result.text,
    toolCalls,
    steps: result.steps?.length ?? 0,
    agentId: 'crm-reader',
  }
}

export { CRM_READER_AGENT_ID, crmReaderConfig }
export type { ReaderInput, ReaderOutput } from './types'
