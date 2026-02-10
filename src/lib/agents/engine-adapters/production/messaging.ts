/**
 * Production Messaging Adapter
 * Phase 16.1: Engine Unification - Plan 03
 *
 * Uses MessageSequencer for delayed message sending via WhatsApp.
 * Handles template-to-sequence conversion, pending message merging,
 * and actual WhatsApp delivery via 360dialog API.
 */

import type { MessagingAdapter } from '../../engine/types'
import { MessageSequencer } from '../../somnio/message-sequencer'
import type { SessionManager } from '../../session-manager'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('production-messaging-adapter')

export class ProductionMessagingAdapter implements MessagingAdapter {
  private messageSequencer: MessageSequencer

  constructor(
    sessionManager: SessionManager,
    private conversationId: string,
    private workspaceId: string,
    private phoneNumber?: string
  ) {
    this.messageSequencer = new MessageSequencer(sessionManager)
  }

  /**
   * Send response messages via MessageSequencer.
   * Builds sequences from templates, merges with pending messages,
   * and executes with delays via WhatsApp.
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
      return { messagesSent: 0 }
    }

    const phone = params.phoneNumber ?? this.phoneNumber
    const contactIdOrPhone = params.contactId ?? phone

    if (!contactIdOrPhone) {
      logger.warn({ sessionId: params.sessionId }, 'No phone number or contact ID for message sending')
      return { messagesSent: 0 }
    }

    try {
      // Build message sequence from templates
      const sequence = this.messageSequencer.buildSequence(
        params.sessionId,
        params.conversationId || this.conversationId,
        templates as never,
        params.intent ?? 'unknown'
      )

      // Merge with any pending messages from previous interruptions
      const mergedMessages = await this.messageSequencer.mergeWithPending(
        sequence.messages,
        params.sessionId
      )
      sequence.messages = mergedMessages

      // Execute sequence with delays and interruption checking
      const sequenceResult = await this.messageSequencer.executeSequence(
        sequence,
        params.workspaceId || this.workspaceId,
        contactIdOrPhone
      )

      return { messagesSent: sequenceResult.messagesSent }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error(
        { error: errorMessage, sessionId: params.sessionId },
        'Failed to send messages via MessageSequencer'
      )
      return { messagesSent: 0 }
    }
  }
}
