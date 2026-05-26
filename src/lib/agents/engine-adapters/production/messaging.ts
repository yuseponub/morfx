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
    protected conversationId: string,
    protected workspaceId: string,
    protected phoneNumber?: string,
    protected responseSpeed: number = 1.0
  ) {}

  /**
   * Check if a new inbound message arrived after the trigger message.
   * Uses the existing idx_messages_conversation index on (conversation_id, timestamp DESC).
   * This is a lightweight count query (head: true) — no row data fetched.
   *
   * Standalone: debounce-interruption-system-v2 (Plan 04 Task 4.2):
   * Visibility relaxed from `private` to `protected` so V4MessagingAdapter
   * subclass can fall back to this Phase 31 behavior when lock infrastructure
   * is missing (fail-open path).
   */
  protected async hasNewInboundMessage(
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
   * Per-template abort check — extracted from the send() loop so subclasses
   * (V4MessagingAdapter) can swap the Phase 31 DB query for a Redis-based
   * checkpoint without duplicating the rest of the send loop.
   *
   * Default behavior (this class): Phase 31 hasNewInboundMessage DB query.
   * V4MessagingAdapter overrides this with checkpoint('ckpt_7_pre_template').
   *
   * Standalone: debounce-interruption-system-v2 (Plan 04 Task 4.2 + D-08
   * Open Question 2 option-a).
   */
  protected async shouldAbortBeforeTemplate(
    params: { conversationId: string; triggerTimestamp?: string; sentCount: number },
    _opts: { templateIndex: number; channel: ChannelType; recipientIdentifier: string }
  ): Promise<{ abort: false } | { abort: true; reason: string }> {
    if (params.triggerTimestamp) {
      const hasNew = await this.hasNewInboundMessage(params.conversationId, params.triggerTimestamp)
      if (hasNew) return { abort: true, reason: 'phase31_new_inbound' }
    }
    return { abort: false }
  }

  /**
   * Hook invoked after the first successful template send (sentCount 0 → 1).
   *
   * Default behavior (this class): no-op. V4MessagingAdapter overrides this
   * to call removeOwnEntry (D-16 LREM-self) + flip has_sent_anything in the
   * lock value (D-15 REVISION W7 keepTtl SUPPORTED branch).
   *
   * Standalone: debounce-interruption-system-v2 (Plan 04 Task 4.2 + D-16).
   */
  protected async onFirstSendCompleted(
    _opts: { channel: ChannelType; identifier: string }
  ): Promise<void> {
    // No-op for the parent class.
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
      // For FB/IG: first template gets fixed 2s delay (ManyChat adds its own latency),
      // subsequent templates keep normal character-based delay
      if (this.responseSpeed > 0) {
        if (channel !== 'whatsapp' && i === 0) {
          await sleep(2000)
        } else {
          const delayMs = calculateCharDelay(template.content.length) * this.responseSpeed
          await sleep(delayMs)
        }
      }

      // Pre-send abort check — extracted to protected method so subclasses
      // (V4MessagingAdapter) can swap Phase 31 DB query for Redis checkpoint.
      // Standalone: debounce-interruption-system-v2 (Plan 04 Task 4.2 + D-08).
      const abortDecision = await this.shouldAbortBeforeTemplate(
        { conversationId: convId, triggerTimestamp: params.triggerTimestamp, sentCount },
        { templateIndex: i, channel, recipientIdentifier: recipientId }
      )
      logger.debug(
        { conversationId: convId, afterTimestamp: params.triggerTimestamp, abort: abortDecision.abort, templateIndex: i },
        'Pre-send check'
      )
      if (abortDecision.abort) {
        logger.info(
          { conversationId: convId, interruptedAtIndex: i, sentCount, totalTemplates: templates.length, reason: abortDecision.reason },
          'Send sequence interrupted'
        )
        return { messagesSent: sentCount, interrupted: true, interruptedAtIndex: i }
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
          const wasFirstSend = sentCount === 0
          sentCount++
          logger.debug(
            { messageId: result.data?.messageId, position: i + 1, total: templates.length, contentType: template.contentType },
            `Message sent via domain (${channel})`
          )
          // D-16 hook: when sentCount transitions 0 → 1, give subclasses a chance
          // to do post-first-send work (V4MessagingAdapter uses this for LREM-self
          // + flip has_sent_anything in the lock value via keepTtl SUPPORTED branch).
          // Default parent behavior: no-op.
          // Standalone: debounce-interruption-system-v2 (Plan 04 Task 4.2 + D-16).
          if (wasFirstSend) {
            try {
              await this.onFirstSendCompleted({ channel, identifier: recipientId })
            } catch (hookError) {
              logger.warn(
                { error: hookError instanceof Error ? hookError.message : String(hookError) },
                'onFirstSendCompleted hook threw (fail-open)'
              )
            }
          }
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
