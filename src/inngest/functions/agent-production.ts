/**
 * Agent Production Workflows
 * Phase 16: WhatsApp Agent Integration - Plan 02
 * Updated: Phase 32 - Media Processing (Plan 03)
 *
 * Inngest function for processing incoming WhatsApp messages through
 * the UnifiedEngine in production. Provides:
 * - Async processing (webhook returns 200 immediately)
 * - Concurrency control per conversation (prevents duplicate responses)
 * - Automatic retries on transient failures
 * - Media gate: routes non-text messages (audio, image, video, sticker, reaction)
 *   through transcription/vision/mapping before agent processing
 *
 * Flow: webhook -> Inngest event -> media-gate -> process-message / handoff / ignore
 */

import { inngest } from '../client'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('agent-production')

/**
 * WhatsApp Agent Message Processor
 *
 * Triggered by 'agent/whatsapp.message_received' event emitted from
 * the webhook handler after a message (text or media) is stored in DB.
 *
 * Concurrency limit of 1 per conversation prevents race conditions
 * when multiple messages arrive in quick succession -- each message
 * is processed sequentially for the same conversation.
 *
 * Phase 32 media gate flow:
 * 1. media-gate step: classify message type -> passthrough / handoff / notify_host / ignore
 * 2a. passthrough: process-message step (existing agent pipeline with transformed text)
 * 2b. handoff: execute-media-handoff + cancel-silence-timer (bypass engine)
 * 2c. notify_host: create notification task via domain layer (bot stays active)
 * 2d. ignore: return immediately
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
    const { conversationId, contactId, messageContent, workspaceId, phone, messageId, messageTimestamp } = event.data

    logger.info(
      { conversationId, phone, messageId, workspaceId, messageType: event.data.messageType ?? 'text' },
      'Processing WhatsApp message with agent'
    )

    // ================================================================
    // Step 1: Media Gate (Phase 32)
    // Routes message by type: text passes through unchanged, audio gets
    // transcribed, image/video trigger handoff, sticker gets interpreted,
    // reaction gets mapped. This runs BEFORE the agent engine.
    // ================================================================
    const gateResult = await step.run('media-gate', async () => {
      const { processMediaGate } = await import('@/lib/agents/media')
      return processMediaGate({
        messageType: event.data.messageType ?? 'text',
        messageContent: event.data.messageContent,
        mediaUrl: event.data.mediaUrl ?? null,
        mediaMimeType: event.data.mediaMimeType ?? null,
        workspaceId: event.data.workspaceId,
        conversationId: event.data.conversationId,
        phone: event.data.phone,
      })
    })

    // ================================================================
    // Step 2: Branch based on media gate result
    // ================================================================

    // --- IGNORE: silently drop (unrecognized stickers, unmapped reactions) ---
    if (gateResult.action === 'ignore') {
      logger.info(
        { conversationId, messageType: event.data.messageType },
        'Media gate: ignoring message'
      )
      return { success: true, ignored: true, mediaType: event.data.messageType }
    }

    // --- NOTIFY HOST: create task, bot stays active (negative reactions) ---
    if (gateResult.action === 'notify_host') {
      await step.run('notify-host-media', async () => {
        const { createAdminClient } = await import('@/lib/supabase/admin')
        const supabase = createAdminClient()
        const { createTask } = await import('@/lib/domain/tasks')

        // Fetch contact info for the notification description
        const { data: conv } = await supabase
          .from('conversations')
          .select('contact_id, profile_name, phone')
          .eq('id', conversationId)
          .single()

        const contactName = conv?.profile_name ?? conv?.phone ?? phone

        // Use domain layer for task creation (Rule 3: no raw inserts)
        await createTask(
          { workspaceId, source: 'inngest' },
          {
            title: `Notificacion: ${gateResult.reason}`,
            description: `Conversacion con ${contactName}. El bot sigue activo.`,
            priority: 'medium',
            status: 'pending',
            conversationId,
            contactId: conv?.contact_id ?? undefined,
          }
        )
      })

      logger.info(
        { conversationId, reason: gateResult.reason, messageType: event.data.messageType },
        'Media gate: host notified'
      )
      return { success: true, mediaType: event.data.messageType }
    }

    // --- HANDOFF: image/video/failed transcription -> hand off to human ---
    if (gateResult.action === 'handoff') {
      await step.run('execute-media-handoff', async () => {
        const { getWorkspaceAgentConfig } = await import('@/lib/agents/production/agent-config')
        const { executeHandoff } = await import('@/lib/agents/production/handoff-handler')
        const config = await getWorkspaceAgentConfig(workspaceId)
        await executeHandoff(conversationId, workspaceId, {
          handoffMessage: config?.handoff_message ?? 'Regalame 1 min, ya te comunico con un asesor',
        })
      })

      // Cancel any active silence timer.
      // WHY: For media handoff the UnifiedEngine is NOT invoked, so the engine's
      // natural agent/customer.message emission (step 6) never fires. Without this,
      // a stale retake message would fire after the human agent takes over.
      await step.run('cancel-silence-timer', async () => {
        const { inngest: inngestClient } = await import('@/inngest/client')
        const { createAdminClient } = await import('@/lib/supabase/admin')
        const supabase = createAdminClient()

        const { data: session } = await supabase
          .from('agent_sessions')
          .select('id')
          .eq('conversation_id', conversationId)
          .eq('workspace_id', workspaceId)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (session) {
          await (inngestClient.send as any)({
            name: 'agent/customer.message',
            data: {
              sessionId: session.id,
              conversationId,
              messageId: event.data.messageId,
              content: gateResult.reason,
            },
          })
        }
      })

      logger.info(
        { conversationId, reason: gateResult.reason, messageType: event.data.messageType },
        'Media gate: handoff executed'
      )
      return { success: true, newMode: 'handoff', mediaType: event.data.messageType }
    }

    // --- PASSTHROUGH: text / transcribed audio / recognized sticker / mapped reaction ---
    // gateResult.action === 'passthrough' — continue with existing agent pipeline
    const result = await step.run('process-message', async () => {
      // Dynamic import to avoid circular dependencies and reduce cold start
      const { processMessageWithAgent } = await import(
        '@/lib/agents/production/webhook-processor'
      )

      return processMessageWithAgent({
        conversationId,
        contactId,
        messageContent: gateResult.text,  // May be original text or transcribed audio
        workspaceId,
        phone,
        messageTimestamp,  // Phase 31: for pre-send check
      })
    })

    // Write error message to conversation for visibility (same as inline path)
    if (!result.success && result.error) {
      await step.run('write-error-message', async () => {
        const { createAdminClient } = await import('@/lib/supabase/admin')
        const supabase = createAdminClient()
        await supabase.from('messages').insert({
          conversation_id: conversationId,
          workspace_id: workspaceId,
          direction: 'outbound',
          type: 'text',
          content: { body: `[ERROR AGENTE] ${result.error?.code}: ${result.error?.message?.substring(0, 500)}` },
          timestamp: new Date().toISOString(),
        })
      })
    }

    logger.info(
      {
        conversationId,
        messageId,
        success: result.success,
        newMode: result.newMode,
        messagesSent: result.messagesSent,
        mediaType: event.data.messageType,
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
