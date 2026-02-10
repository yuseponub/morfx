/**
 * Webhook Processor
 * Phase 16: WhatsApp Agent Integration - Plan 02
 * Updated: Phase 16.1 - Plan 05 (Engine Unification)
 *
 * Routes incoming WhatsApp messages through UnifiedEngine with production
 * adapters for agent processing. Called from the Inngest function (async, queued).
 *
 * Responsibilities:
 * - Check if agent is enabled for the conversation
 * - Auto-create contact if conversation has no linked contact
 * - Broadcast typing indicator via Supabase Realtime
 * - Process message through UnifiedEngine (with production adapters)
 * - Mark outbound messages as sent_by_agent=true
 * - Trigger handoff if engine signals it
 *
 * External interface (ProcessMessageInput, SomnioEngineResult) is unchanged.
 * Internal engine was swapped from SomnioEngine to UnifiedEngine in Plan 05.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createModuleLogger } from '@/lib/audit/logger'
import { isAgentEnabledForConversation, getWorkspaceAgentConfig } from './agent-config'
import type { SomnioEngineResult } from '../somnio/somnio-engine'
import type { EngineOutput } from '../engine/types'

const logger = createModuleLogger('webhook-processor')

// ============================================================================
// Types
// ============================================================================

export interface ProcessMessageInput {
  conversationId: string
  contactId: string | null
  messageContent: string
  workspaceId: string
  phone: string
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Process an incoming WhatsApp message through the production agent.
 *
 * @param input - Message data from the Inngest event
 * @returns SomnioEngineResult (success/failure and response details)
 */
export async function processMessageWithAgent(
  input: ProcessMessageInput
): Promise<SomnioEngineResult> {
  const { conversationId, messageContent, workspaceId, phone } = input
  let { contactId } = input

  logger.info(
    { conversationId, phone, workspaceId, hasContact: !!contactId },
    'Starting agent processing for WhatsApp message'
  )

  // 1. Check if agent is enabled for this conversation
  const agentEnabled = await isAgentEnabledForConversation(
    conversationId,
    workspaceId,
    'conversational'
  )

  if (!agentEnabled) {
    logger.info(
      { conversationId, workspaceId },
      'Agent not enabled for this conversation, skipping'
    )
    return { success: true }
  }

  const supabase = createAdminClient()

  // 2. Get conversation details and verify contact
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('id, contact_id, phone, profile_name')
    .eq('id', conversationId)
    .single()

  if (convError || !conversation) {
    logger.error(
      { conversationId, error: convError },
      'Failed to fetch conversation'
    )
    return {
      success: false,
      error: {
        code: 'CONVERSATION_NOT_FOUND',
        message: `Conversation ${conversationId} not found`,
        retryable: false,
      },
    }
  }

  // 3. Auto-create contact if conversation has no linked contact
  contactId = conversation.contact_id
  if (!contactId) {
    logger.info(
      { conversationId, phone },
      'No contact linked, auto-creating'
    )
    contactId = await autoCreateContact(
      workspaceId,
      phone,
      conversation.profile_name ?? undefined
    )

    if (contactId) {
      // Link contact to conversation
      await supabase
        .from('conversations')
        .update({ contact_id: contactId })
        .eq('id', conversationId)
    }
  }

  if (!contactId) {
    logger.error(
      { conversationId, phone },
      'Failed to create or find contact'
    )
    return {
      success: false,
      error: {
        code: 'CONTACT_CREATION_FAILED',
        message: 'Could not create contact for conversation',
        retryable: true,
      },
    }
  }

  // 4. Record timestamp before processing (for sent_by_agent marking)
  const processingStartedAt = new Date().toISOString()

  // 5. Broadcast typing indicator START
  try {
    const channel = supabase.channel(`conversation:${conversationId}`)
    await channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { isTyping: true, source: 'agent' },
    })
    supabase.removeChannel(channel)
  } catch (typingError) {
    // Non-blocking: typing indicator is a nice-to-have
    logger.warn({ error: typingError }, 'Failed to broadcast typing start')
  }

  // 6. Process message through UnifiedEngine (with production adapters)
  let result: SomnioEngineResult
  try {
    // Import barrel to trigger agent self-registration
    await import('../somnio')

    // Dynamic imports for UnifiedEngine and production adapter factory
    const { UnifiedEngine } = await import('../engine/unified-engine')
    const { createProductionAdapters } = await import('../engine-adapters/production')

    const adapters = createProductionAdapters({
      workspaceId,
      conversationId,
      phoneNumber: phone,
    })

    const engine = new UnifiedEngine(adapters, { workspaceId })

    const engineOutput: EngineOutput = await engine.processMessage({
      sessionId: '', // Production: storage adapter uses getOrCreateSession via conversationId
      conversationId,
      contactId: contactId!,
      message: messageContent,
      workspaceId,
      history: [], // Production: storage adapter reads history from DB
      phoneNumber: phone,
    })

    // Map EngineOutput to SomnioEngineResult for backward compatibility
    result = {
      success: engineOutput.success,
      response: engineOutput.response,
      messagesSent: engineOutput.messagesSent,
      orderCreated: engineOutput.orderCreated,
      orderId: engineOutput.orderId,
      contactId: engineOutput.contactId,
      newMode: engineOutput.newMode,
      tokensUsed: engineOutput.tokensUsed,
      sessionId: engineOutput.sessionId,
      error: engineOutput.error ? {
        code: engineOutput.error.code,
        message: engineOutput.error.message,
        retryable: engineOutput.error.retryable ?? true,
      } : undefined,
    } as SomnioEngineResult
  } catch (engineError) {
    const errorMessage = engineError instanceof Error ? engineError.message : 'Unknown engine error'
    logger.error({ error: errorMessage, conversationId }, 'UnifiedEngine processing failed')
    result = {
      success: false,
      error: {
        code: 'ENGINE_ERROR',
        message: errorMessage,
        retryable: true,
      },
    }
  } finally {
    // 7. Broadcast typing indicator STOP (always, even on error)
    try {
      const channel = supabase.channel(`conversation:${conversationId}`)
      await channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { isTyping: false, source: 'agent' },
      })
      supabase.removeChannel(channel)
    } catch (typingError) {
      logger.warn({ error: typingError }, 'Failed to broadcast typing stop')
    }
  }

  // 8. Mark recent outbound messages as sent_by_agent
  if (result.success) {
    try {
      const { error: markError } = await supabase
        .from('messages')
        .update({ sent_by_agent: true })
        .eq('conversation_id', conversationId)
        .eq('direction', 'outbound')
        .gte('timestamp', processingStartedAt)

      if (markError) {
        // Non-critical: log but don't fail
        logger.warn(
          { error: markError, conversationId },
          'Failed to mark messages as sent_by_agent'
        )
      }
    } catch (markError) {
      logger.warn(
        { error: markError, conversationId },
        'Failed to mark messages as sent_by_agent'
      )
    }
  }

  // 9. Check agent still enabled BEFORE considering the result final
  //    (handles toggle-off during processing)
  if (result.success && result.newMode === 'handoff') {
    const stillEnabled = await isAgentEnabledForConversation(
      conversationId,
      workspaceId,
      'conversational'
    )

    if (stillEnabled) {
      // Execute handoff workflow
      try {
        const config = await getWorkspaceAgentConfig(workspaceId)
        const { executeHandoff } = await import('./handoff-handler')
        await executeHandoff(conversationId, workspaceId, {
          handoffMessage: config?.handoff_message ?? 'Regalame 1 min, ya te comunico con un asesor',
        })
      } catch (handoffError) {
        logger.error(
          { error: handoffError, conversationId },
          'Handoff execution failed'
        )
      }
    }
  }

  logger.info(
    {
      conversationId,
      success: result.success,
      newMode: result.newMode,
      messagesSent: result.messagesSent,
      tokensUsed: result.tokensUsed,
    },
    'Agent processing complete'
  )

  return result
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Auto-create a minimal contact for a conversation.
 * Uses phone as the primary identifier and WhatsApp profile name if available.
 * Handles 23505 race condition (another request created contact simultaneously).
 *
 * @returns Contact ID or null if creation failed
 */
async function autoCreateContact(
  workspaceId: string,
  phone: string,
  profileName?: string
): Promise<string | null> {
  const supabase = createAdminClient()

  // Build contact name from profile name or phone
  const name = profileName || phone

  try {
    const { data, error } = await supabase
      .from('contacts')
      .insert({
        workspace_id: workspaceId,
        name,
        phone,
      })
      .select('id')
      .single()

    if (error) {
      // 23505 = unique constraint violation (race condition - contact already exists)
      if (error.code === '23505') {
        logger.info({ phone, workspaceId }, 'Contact already exists (race condition), looking up')
        const { data: existing } = await supabase
          .from('contacts')
          .select('id')
          .eq('workspace_id', workspaceId)
          .eq('phone', phone)
          .single()

        return existing?.id ?? null
      }

      logger.error({ error, phone }, 'Failed to create contact')
      return null
    }

    logger.info(
      { contactId: data.id, name, phone },
      'Auto-created contact for conversation'
    )
    return data.id
  } catch (error) {
    logger.error({ error, phone }, 'Unexpected error creating contact')
    return null
  }
}
