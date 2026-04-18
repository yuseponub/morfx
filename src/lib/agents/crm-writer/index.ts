/**
 * CRM Writer Agent — Module Entry Point
 * Phase 44 Plan 05.
 *
 * Propose flow: generateText with the writer tool registry. Every tool.execute
 * returns a ProposedAction (plus bookkeeping shapes for errors / resource_not_found).
 * We collect every tool result whose shape is { status: 'proposed' } and surface
 * them to the caller — the caller picks an action_id and invokes confirm() in
 * a SECOND HTTP request to actually execute the mutation.
 *
 * Confirm flow: delegates to the two-step lifecycle. Idempotent by construction
 * (optimistic UPDATE on crm_bot_actions.status='proposed').
 *
 * Self-registers the agent config in the global agentRegistry on import.
 */

import { generateText, stepCountIs, type ModelMessage } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { agentRegistry } from '../registry'
import { createModuleLogger } from '@/lib/audit/logger'
import { crmWriterConfig, CRM_WRITER_AGENT_ID } from './config'
import { buildWriterSystemPrompt } from './system-prompt'
import { createWriterTools } from './tools'
import { confirmAction as twoStepConfirm } from './two-step'
import type {
  WriterContext,
  WriterProposeInput,
  WriterProposeOutput,
  ProposedAction,
  ConfirmResult,
} from './types'

const logger = createModuleLogger('crm-writer')

// Self-register in the agent registry.
agentRegistry.register(crmWriterConfig)

// CONTEXT D-03 decision: both CRM bots use Claude Sonnet 4.5.
const MODEL_ID = 'claude-sonnet-4-5-20250929'

/**
 * propose — single turn of the writer agent.
 *
 * Runs generateText with the tool registry capped at stepCountIs(5). Every
 * tool call that succeeds inserts a row in crm_bot_actions with
 * status='proposed' and returns {status:'proposed', action_id, preview, expires_at}.
 *
 * The caller extracts action_id(s) from `proposedActions[]` and calls
 * confirm(ctx, actionId) to execute the mutation via the domain layer.
 */
export async function propose(input: WriterProposeInput): Promise<WriterProposeOutput> {
  const systemPrompt = buildWriterSystemPrompt(input.workspaceId)
  const tools = createWriterTools({
    workspaceId: input.workspaceId,
    invoker: input.invoker,
  })
  const messages = input.messages as ModelMessage[]

  const result = await generateText({
    model: anthropic(MODEL_ID),
    system: systemPrompt,
    messages,
    tools,
    stopWhen: stepCountIs(5),
    temperature: 0.2,
  })

  const proposedActions: ProposedAction[] = []
  for (const step of result.steps) {
    for (const tr of step.toolResults) {
      const output = tr.output as unknown
      if (
        output &&
        typeof output === 'object' &&
        'status' in output &&
        (output as { status: string }).status === 'proposed'
      ) {
        proposedActions.push(output as ProposedAction)
      }
    }
  }

  logger.info(
    {
      workspaceId: input.workspaceId,
      invoker: input.invoker,
      steps: result.steps.length,
      proposedCount: proposedActions.length,
    },
    'writer propose turn complete',
  )

  return {
    text: result.text,
    proposedActions,
    steps: result.steps.length,
    agentId: 'crm-writer',
  }
}

/**
 * confirm — execute a previously proposed action by id.
 *
 * Idempotent: the second caller on the same action_id gets
 * { status: 'already_executed', output } without re-mutating.
 *
 * Returns one of: executed | already_executed | expired | not_found | failed.
 */
export async function confirm(ctx: WriterContext, actionId: string): Promise<ConfirmResult> {
  return twoStepConfirm(ctx, actionId)
}

export { CRM_WRITER_AGENT_ID, crmWriterConfig }
export type { WriterProposeInput, WriterProposeOutput, ProposedAction, ConfirmResult } from './types'
