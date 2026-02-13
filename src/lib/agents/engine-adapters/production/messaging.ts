/**
 * Production Messaging Adapter
 * Phase 16.1: Engine Unification - Plan 03
 * Updated: Hotfix — Send directly via 360dialog API
 *
 * Sends agent responses directly via the WhatsApp 360dialog API,
 * bypassing the tool executor system. Records messages in the DB.
 *
 * Previous approach used MessageSequencer → executeToolFromAgent →
 * whatsapp.message.send handler, but tool registration/validation
 * issues caused messagesSent: 0 in production.
 */

import type { MessagingAdapter } from '../../engine/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTextMessage } from '@/lib/whatsapp/api'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('production-messaging-adapter')

/**
 * Sleep for a specified number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Get WhatsApp API key from workspace settings, fallback to env var.
 */
async function getWhatsAppApiKey(
  workspaceId: string
): Promise<string | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('workspaces')
    .select('settings')
    .eq('id', workspaceId)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settings = data?.settings as any
  return settings?.whatsapp_api_key || process.env.WHATSAPP_API_KEY || null
}

export class ProductionMessagingAdapter implements MessagingAdapter {
  constructor(
    _sessionManager: unknown, // kept for interface compat
    private conversationId: string,
    private workspaceId: string,
    private phoneNumber?: string,
    private responseSpeed: number = 1.0
  ) {}

  /**
   * Send response messages directly via WhatsApp 360dialog API.
   * Iterates templates, applies delays, sends each message, and records in DB.
   */
  async send(params: {
    sessionId: string
    conversationId: string
    messages: string[]
    templates?: unknown[]
    intent?: string
    workspaceId: string
    contactId?: string
    phoneNumber?: string
  }): Promise<{ messagesSent: number }> {
    const templates = params.templates as Array<{
      id: string
      content: string
      contentType: 'texto' | 'template' | 'imagen'
      delaySeconds: number
    }> | undefined

    // If no templates, nothing to send
    if (!templates || templates.length === 0) {
      logger.info({ sessionId: params.sessionId }, 'No templates to send')
      return { messagesSent: 0 }
    }

    const phone = params.phoneNumber ?? this.phoneNumber
    if (!phone) {
      logger.warn({ sessionId: params.sessionId }, 'No phone number for message sending')
      return { messagesSent: 0 }
    }

    const wsId = params.workspaceId || this.workspaceId
    const convId = params.conversationId || this.conversationId

    // Get API key once for all messages
    const apiKey = await getWhatsAppApiKey(wsId)
    if (!apiKey) {
      logger.error({ workspaceId: wsId }, 'WhatsApp API key not configured')
      return { messagesSent: 0 }
    }

    const supabase = createAdminClient()
    let sentCount = 0

    for (let i = 0; i < templates.length; i++) {
      const template = templates[i]

      // Apply delay (skip for first message, skip if instantaneous)
      if (i > 0 && template.delaySeconds > 0 && this.responseSpeed > 0) {
        await sleep(template.delaySeconds * this.responseSpeed * 1000)
      }

      try {
        // Send directly via 360dialog API
        const response = await sendTextMessage(apiKey, phone, template.content)
        const wamid = response.messages?.[0]?.id

        // Record message in DB
        const { error: insertError } = await supabase
          .from('messages')
          .insert({
            conversation_id: convId,
            workspace_id: wsId,
            wamid,
            direction: 'outbound',
            type: 'text',
            content: { body: template.content } as unknown as Record<string, unknown>,
            status: 'sent',
            timestamp: new Date().toISOString(),
          })

        if (insertError) {
          logger.warn(
            { error: insertError, wamid },
            'Message sent but DB insert failed'
          )
        }

        sentCount++

        logger.debug(
          { wamid, position: i + 1, total: templates.length },
          'WhatsApp message sent'
        )
      } catch (sendError) {
        const errMsg = sendError instanceof Error ? sendError.message : String(sendError)
        logger.error(
          { error: errMsg, phone, position: i + 1 },
          'Failed to send WhatsApp message via 360dialog'
        )
        // Continue with next message even if this one failed
      }
    }

    // Update conversation last_message_at
    if (sentCount > 0) {
      const lastTemplate = templates[templates.length - 1]
      const preview = lastTemplate.content.length > 100
        ? lastTemplate.content.slice(0, 100) + '...'
        : lastTemplate.content

      await supabase
        .from('conversations')
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: preview,
        })
        .eq('id', convId)
    }

    logger.info(
      { sentCount, totalTemplates: templates.length, phone },
      'Message sending complete'
    )

    return { messagesSent: sentCount }
  }
}
