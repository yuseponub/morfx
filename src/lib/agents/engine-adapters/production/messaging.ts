/**
 * Production Messaging Adapter
 * Phase 16.1: Engine Unification - Plan 03
 * Phase 18: Migrated to domain layer for message sending
 * Phase 29: Character-based typing delays (replaces fixed delaySeconds)
 *
 * Sends agent responses via the domain message layer (which calls 360dialog
 * API + stores in DB). The adapter handles sequencing with character-based
 * delays that simulate human typing speed — short messages get brief pauses
 * (~2s), longer messages ramp up to a 12s cap. The actual send + DB goes
 * through domain.
 */

import type { MessagingAdapter } from '../../engine/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTextMessage as domainSendTextMessage, sendMediaMessage as domainSendMediaMessage } from '@/lib/domain/messages'
import type { DomainContext } from '@/lib/domain/types'
import type { ChannelType } from '@/lib/channels/types'
import { createModuleLogger } from '@/lib/audit/logger'
import { calculateCharDelay } from '@/lib/agents/somnio/char-delay'

const logger = createModuleLogger('production-messaging-adapter')

/**
 * Sleep for a specified number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Get channel credentials from workspace settings.
 * For WhatsApp: returns 360dialog API key
 * For Facebook/Instagram: returns ManyChat API key
 */
async function getChannelCredentials(
  workspaceId: string,
  channel: ChannelType
): Promise<{ apiKey: string | null; channel: ChannelType }> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('workspaces')
    .select('settings')
    .eq('id', workspaceId)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settings = data?.settings as any

  if (channel === 'facebook' || channel === 'instagram') {
    return {
      apiKey: settings?.manychat_api_key || null,
      channel,
    }
  }

  // Default: WhatsApp via 360dialog
  return {
    apiKey: settings?.whatsapp_api_key || process.env.WHATSAPP_API_KEY || null,
    channel: 'whatsapp',
  }
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
   * Check if a new inbound message arrived after the trigger message.
   * Uses the existing idx_messages_conversation index on (conversation_id, timestamp DESC).
   * This is a lightweight count query (head: true) — no row data fetched.
   */
  private async hasNewInboundMessage(
    conversationId: string,
    afterTimestamp: string
  ): Promise<boolean> {
    const supabase = createAdminClient()
    const { count } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('direction', 'inbound')
      .gt('timestamp', afterTimestamp)
    return (count ?? 0) > 0
  }

  /**
   * Send response messages via domain layer.
   * Iterates templates, applies delays, sends each message through domain.
   * Phase 31: Before each template, checks for new inbound messages (pre-send check).
   * If a new message arrived, the sequence is interrupted and remaining templates are NOT sent.
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
    triggerTimestamp?: string
  }): Promise<{ messagesSent: number; interrupted?: boolean; interruptedAtIndex?: number }> {
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

    // Lookup conversation channel to route to correct API
    const supabase = createAdminClient()
    const { data: conv } = await supabase
      .from('conversations')
      .select('channel, external_subscriber_id')
      .eq('id', convId)
      .single()
    const channel: ChannelType = (conv?.channel as ChannelType) || 'whatsapp'

    // Get credentials for this channel
    const creds = await getChannelCredentials(wsId, channel)
    if (!creds.apiKey) {
      logger.error({ workspaceId: wsId, channel }, 'Channel API key not configured')
      return { messagesSent: 0 }
    }
    const apiKey = creds.apiKey

    // For FB/IG, use external_subscriber_id instead of phone
    const recipientId = (channel !== 'whatsapp' && conv?.external_subscriber_id)
      ? conv.external_subscriber_id
      : phone

    const ctx: DomainContext = { workspaceId: wsId, source: 'adapter' }
    let sentCount = 0

    for (let i = 0; i < templates.length; i++) {
      const template = templates[i]

      // Apply character-based delay (human-like typing simulation)
      // Skip entirely if responseSpeed is 0 (instantaneo preset)
      if (this.responseSpeed > 0) {
        const delayMs = calculateCharDelay(template.content.length) * this.responseSpeed
        await sleep(delayMs)
      }

      // Phase 31: Pre-send check — query DB for new inbound messages after trigger
      // Runs AFTER delay (customer has time to type during delay) and BEFORE send
      if (params.triggerTimestamp) {
        const hasNew = await this.hasNewInboundMessage(convId, params.triggerTimestamp)
        logger.debug(
          { conversationId: convId, afterTimestamp: params.triggerTimestamp, hasNew, templateIndex: i },
          'Pre-send check'
        )
        if (hasNew) {
          logger.info(
            { conversationId: convId, interruptedAtIndex: i, sentCount, totalTemplates: templates.length },
            'Send sequence interrupted by new inbound message'
          )
          return { messagesSent: sentCount, interrupted: true, interruptedAtIndex: i }
        }
      }

      try {
        // Send via domain (handles API call + DB storage + conversation update)
        let result
        if (template.contentType === 'imagen') {
          // Format: "URL" or "URL|caption"
          const pipeIdx = template.content.indexOf('|')
          const mediaUrl = pipeIdx > 0 ? template.content.slice(0, pipeIdx) : template.content
          const caption = pipeIdx > 0 ? template.content.slice(pipeIdx + 1) : undefined
          result = await domainSendMediaMessage(ctx, {
            conversationId: convId,
            contactPhone: recipientId,
            mediaUrl,
            mediaType: 'image',
            caption,
            apiKey,
            channel,
          })
        } else {
          result = await domainSendTextMessage(ctx, {
            conversationId: convId,
            contactPhone: recipientId,
            messageBody: template.content,
            apiKey,
            channel,
          })
        }

        if (result.success) {
          sentCount++
          logger.debug(
            { messageId: result.data?.messageId, position: i + 1, total: templates.length, contentType: template.contentType },
            `Message sent via domain (${channel})`
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
          `Failed to send message via domain (${channel})`
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
