/**
 * Production Messaging Adapter
 * Phase 16.1: Engine Unification - Plan 03
 * Phase 18: Migrated to domain layer for message sending
 *
 * Sends agent responses via the domain message layer (which calls 360dialog
 * API + stores in DB). The adapter handles sequencing (delays between
 * messages) — that's adapter-specific. The actual send + DB goes through domain.
 */

import type { MessagingAdapter } from '../../engine/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTextMessage as domainSendTextMessage } from '@/lib/domain/messages'
import type { DomainContext } from '@/lib/domain/types'
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
   * Send response messages via domain layer.
   * Iterates templates, applies delays, sends each message through domain.
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

    const ctx: DomainContext = { workspaceId: wsId, source: 'adapter' }
    let sentCount = 0

    for (let i = 0; i < templates.length; i++) {
      const template = templates[i]

      // Apply delay (skip for first message, skip if instantaneous)
      if (i > 0 && template.delaySeconds > 0 && this.responseSpeed > 0) {
        await sleep(template.delaySeconds * this.responseSpeed * 1000)
      }

      try {
        // Send via domain (handles API call + DB storage + conversation update)
        const result = await domainSendTextMessage(ctx, {
          conversationId: convId,
          contactPhone: phone,
          messageBody: template.content,
          apiKey,
        })

        if (result.success) {
          sentCount++
          logger.debug(
            { messageId: result.data?.messageId, position: i + 1, total: templates.length },
            'WhatsApp message sent via domain'
          )
        } else {
          logger.warn(
            { error: result.error, position: i + 1 },
            'Domain sendTextMessage returned error'
          )
        }
      } catch (sendError) {
        const errMsg = sendError instanceof Error ? sendError.message : String(sendError)
        logger.error(
          { error: errMsg, phone, position: i + 1 },
          'Failed to send WhatsApp message via domain'
        )
        // Continue with next message even if this one failed
      }
    }

    logger.info(
      { sentCount, totalTemplates: templates.length, phone },
      'Message sending complete'
    )

    return { messagesSent: sentCount }
  }
}
