/**
 * Agent Production Workflows
 * Phase 16: WhatsApp Agent Integration - Plan 02
 *
 * Inngest function for processing incoming WhatsApp messages through
 * the SomnioEngine in production. Provides:
 * - Async processing (webhook returns 200 immediately)
 * - Concurrency control per conversation (prevents duplicate responses)
 * - Automatic retries on transient failures
 *
 * Flow: webhook -> Inngest event -> this function -> processMessageWithAgent
 */

import { inngest } from '../client'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('agent-production')

/**
 * WhatsApp Agent Message Processor
 *
 * Triggered by 'agent/whatsapp.message_received' event emitted from
 * the webhook handler after a text message is stored in DB.
 *
 * Concurrency limit of 1 per conversation prevents race conditions
 * when multiple messages arrive in quick succession — each message
 * is processed sequentially for the same conversation.
 */
export const whatsappAgentProcessor = inngest.createFunction(
  {
    id: 'whatsapp-agent-processor',
    name: 'WhatsApp Agent Message Processor',
    retries: 2,
    concurrency: [
      {
        key: 'event.data.conversationId',
        limit: 1,
      },
    ],
  },
  { event: 'agent/whatsapp.message_received' },
  async ({ event, step }) => {
    const { conversationId, contactId, messageContent, workspaceId, phone, messageId } = event.data

    logger.info(
      { conversationId, phone, messageId, workspaceId },
      'Processing WhatsApp message with agent'
    )

    const result = await step.run('process-message', async () => {
      // Dynamic import to avoid circular dependencies and reduce cold start
      const { processMessageWithAgent } = await import(
        '@/lib/agents/production/webhook-processor'
      )

      return processMessageWithAgent({
        conversationId,
        contactId,
        messageContent,
        workspaceId,
        phone,
      })
    })

    logger.info(
      {
        conversationId,
        messageId,
        success: result.success,
        newMode: result.newMode,
        messagesSent: result.messagesSent,
      },
      'Agent processing complete'
    )

    return result
  }
)

/**
 * All agent production functions for export.
 */
export const agentProductionFunctions = [whatsappAgentProcessor]
