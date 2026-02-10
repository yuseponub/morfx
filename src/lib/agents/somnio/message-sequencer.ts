/**
 * Message Sequencer Component
 * Phase 14: Agente Ventas Somnio - Plan 04
 *
 * Handles delayed message sending with interruption detection and abort capability.
 * Sends multiple messages per response with configurable delays between them.
 */

import type { SessionManager } from '../session-manager'
import type { ProcessedTemplate } from './template-manager'
import {
  InterruptionHandler,
  type PendingMessage,
} from './interruption-handler'
import { executeToolFromAgent } from '@/lib/tools/executor'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('message-sequencer')

// ============================================================================
// Types
// ============================================================================

/**
 * A message ready to be sent as part of a sequence.
 */
export interface MessageToSend {
  /** Unique identifier for this message */
  id: string
  /** Message content after variable substitution */
  content: string
  /** Type of content (texto, template, imagen) */
  contentType: 'texto' | 'template' | 'imagen'
  /** Delay before sending this message (seconds) */
  delaySeconds: number
  /** Optional metadata for tracking */
  metadata?: {
    /** Intent that triggered this message */
    intent: string
    /** Template ID if from template */
    templateId?: string
    /** Position in sequence (1-based) */
    sequencePosition: number
  }
}

/**
 * Status of a message sequence.
 */
export type SequenceStatus =
  | 'pending'      // Not started
  | 'sending'      // In progress
  | 'completed'    // All messages sent
  | 'aborted'      // Manually stopped
  | 'interrupted'  // Customer message received during sequence

/**
 * A sequence of messages to send.
 */
export interface MessageSequence {
  /** Unique identifier for this sequence */
  id: string
  /** Session this sequence belongs to */
  sessionId: string
  /** Conversation to send messages to */
  conversationId: string
  /** Messages in this sequence (ordered) */
  messages: MessageToSend[]
  /** Current status */
  status: SequenceStatus
  /** Number of messages successfully sent */
  sentCount: number
  /** When sequence started */
  startedAt: string | null
  /** When sequence completed (or aborted/interrupted) */
  completedAt: string | null
}

/**
 * Result from executing a sequence.
 */
export interface SequenceResult {
  /** ID of the sequence */
  sequenceId: string
  /** Number of messages successfully sent */
  messagesSent: number
  /** Number of messages aborted (not sent) */
  messagesAborted: number
  /** Final status */
  status: SequenceStatus
  /** Pending messages if interrupted */
  pendingMessages?: PendingMessage[]
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique sequence ID.
 */
function generateSequenceId(): string {
  return `seq-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
}

/**
 * Generate a unique message ID.
 */
function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
}

/**
 * Sleep for a specified number of milliseconds.
 * Used for delays between messages in non-Inngest context.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ============================================================================
// Message Sequencer Class
// ============================================================================

/**
 * Manages sending sequences of messages with delays and interruption handling.
 *
 * Features:
 * - Configurable delays between messages (0-5 seconds typical)
 * - Interruption detection based on session activity
 * - Pending message storage for interrupted sequences
 * - Merging of pending messages into new responses
 */
export class MessageSequencer {
  private interruptionHandler: InterruptionHandler

  /**
   * Create a MessageSequencer instance.
   *
   * @param sessionManager - For session state operations
   * @param interruptionHandler - Optional custom handler (created if not provided)
   */
  constructor(
    private sessionManager: SessionManager,
    interruptionHandler?: InterruptionHandler
  ) {
    this.interruptionHandler = interruptionHandler ?? new InterruptionHandler(sessionManager)
  }

  /**
   * Execute a message sequence with delays and interruption checking.
   *
   * For each message:
   * 1. Wait the configured delay
   * 2. Check for customer interruption
   * 3. If interrupted: save remaining messages, return early
   * 4. Send the message via whatsapp.message.send
   *
   * @param sequence - The sequence to execute
   * @param workspaceId - Workspace context for tool execution
   * @param phoneNumber - Customer phone number or contact ID
   * @param onInterruption - Optional callback when interruption detected
   * @returns SequenceResult with send counts and status
   */
  async executeSequence(
    sequence: MessageSequence,
    workspaceId: string,
    phoneNumber: string,
    onInterruption?: () => Promise<boolean>
  ): Promise<SequenceResult> {
    logger.info(
      {
        sequenceId: sequence.id,
        messageCount: sequence.messages.length,
        sessionId: sequence.sessionId,
      },
      'Starting message sequence'
    )

    sequence.status = 'sending'
    sequence.startedAt = new Date().toISOString()

    let sentCount = 0

    for (let i = 0; i < sequence.messages.length; i++) {
      const message = sequence.messages[i]

      // Wait delay before sending (skip delay for first message)
      if (message.delaySeconds > 0) {
        await sleep(message.delaySeconds * 1000)
      }

      // Check for interruption before sending (skip first message —
      // last_activity_at is always fresh from engine processing, causing false positives)
      const isInterrupted = i > 0
        ? await this.checkForInterruption(sequence.sessionId)
        : false

      if (isInterrupted) {
        // Call interruption callback if provided
        if (onInterruption) {
          const shouldContinue = await onInterruption()
          if (shouldContinue) {
            // Callback decided to continue anyway
            logger.debug({ sequenceId: sequence.id }, 'Interruption overridden by callback')
          } else {
            // Save remaining messages as pending
            const remaining = sequence.messages.slice(i)
            await this.savePendingFromSequence(
              sequence.sessionId,
              sequence.id,
              remaining,
              message.metadata?.intent ?? 'unknown'
            )

            sequence.status = 'interrupted'
            sequence.sentCount = sentCount
            sequence.completedAt = new Date().toISOString()

            logger.info(
              {
                sequenceId: sequence.id,
                sentCount,
                remainingCount: remaining.length,
              },
              'Sequence interrupted'
            )

            return {
              sequenceId: sequence.id,
              messagesSent: sentCount,
              messagesAborted: remaining.length,
              status: 'interrupted',
              pendingMessages: this.messagesToPending(remaining, message.metadata?.intent ?? 'unknown'),
            }
          }
        } else {
          // No callback - default to saving pending and stopping
          const remaining = sequence.messages.slice(i)
          await this.savePendingFromSequence(
            sequence.sessionId,
            sequence.id,
            remaining,
            message.metadata?.intent ?? 'unknown'
          )

          sequence.status = 'interrupted'
          sequence.sentCount = sentCount
          sequence.completedAt = new Date().toISOString()

          return {
            sequenceId: sequence.id,
            messagesSent: sentCount,
            messagesAborted: remaining.length,
            status: 'interrupted',
            pendingMessages: this.messagesToPending(remaining, message.metadata?.intent ?? 'unknown'),
          }
        }
      }

      // Send the message (wrapped in try/catch for defense-in-depth)
      let success = false
      try {
        success = await this.sendMessage(message, workspaceId, phoneNumber)
      } catch (sendError) {
        logger.error(
          {
            sequenceId: sequence.id,
            messageId: message.id,
            error: sendError,
          },
          'Unexpected error sending message in sequence'
        )
      }

      if (success) {
        sentCount++
        logger.debug(
          {
            sequenceId: sequence.id,
            messageId: message.id,
            position: i + 1,
            total: sequence.messages.length,
          },
          'Message sent'
        )
      } else {
        logger.warn(
          {
            sequenceId: sequence.id,
            messageId: message.id,
          },
          'Message send failed'
        )
        // Continue with next message even if this one failed
      }
    }

    sequence.status = 'completed'
    sequence.sentCount = sentCount
    sequence.completedAt = new Date().toISOString()

    logger.info(
      {
        sequenceId: sequence.id,
        sentCount,
        totalMessages: sequence.messages.length,
      },
      'Sequence completed'
    )

    return {
      sequenceId: sequence.id,
      messagesSent: sentCount,
      messagesAborted: 0,
      status: 'completed',
    }
  }

  /**
   * Send a single message via WhatsApp.
   *
   * @param message - Message to send
   * @param workspaceId - Workspace context
   * @param phoneNumber - Customer phone or contact ID
   * @returns True if sent successfully
   */
  async sendMessage(
    message: MessageToSend,
    workspaceId: string,
    phoneNumber: string
  ): Promise<boolean> {
    try {
      const result = await executeToolFromAgent(
        'whatsapp.message.send',
        {
          contactId: phoneNumber,
          message: message.content,
          // Could add contentType handling for images/templates in future
        },
        workspaceId,
        message.metadata?.templateId ?? message.id
      )

      return result.status === 'success'
    } catch (error) {
      logger.error(
        {
          messageId: message.id,
          error,
        },
        'Error sending message'
      )
      return false
    }
  }

  /**
   * Check if customer sent a message during sequence execution.
   *
   * Compares session's last_activity_at with current time.
   * If activity happened very recently (within last 2 seconds),
   * consider it an interruption.
   *
   * KNOWN LIMITATION (Bug #6): SessionManager.getSession() may return
   * cached session data in production environments. If the session was
   * recently updated by another process (e.g., webhook handler writing
   * a new customer message), the cached last_activity_at could be stale,
   * causing this check to miss an interruption. The message sequence
   * would then continue sending when it should have stopped.
   *
   * Mitigation: In the sandbox context this is a non-issue (no real DB
   * or caching). For production (Phase 16+), consider:
   * - Adding a cache-bypass option to SessionManager.getSession()
   * - Using a DB-level timestamp comparison (SELECT NOW() vs last_activity_at)
   * - Reducing the 2-second window if cache TTL is known
   *
   * @param sessionId - Session to check
   * @returns True if customer interrupted
   */
  async checkForInterruption(sessionId: string): Promise<boolean> {
    try {
      // NOTE: This may read cached data. See KNOWN LIMITATION above.
      const session = await this.sessionManager.getSession(sessionId)
      const lastActivity = new Date(session.last_activity_at)
      const now = new Date()

      // If last activity was within the last 2 seconds, it's likely
      // the customer just sent a message (interruption)
      const timeSinceActivity = now.getTime() - lastActivity.getTime()

      // Consider it an interruption if activity was in last 2 seconds
      // but not in the future (clock skew protection)
      if (timeSinceActivity >= 0 && timeSinceActivity < 2000) {
        return true
      }

      return false
    } catch (error) {
      // On error, assume no interruption (safer to continue)
      logger.warn({ sessionId, error }, 'Error checking for interruption')
      return false
    }
  }

  /**
   * Build a message sequence from processed templates.
   *
   * @param sessionId - Session ID
   * @param conversationId - Conversation ID
   * @param templates - Processed templates from TemplateManager
   * @param intent - Intent that triggered these templates
   * @returns MessageSequence ready for execution
   */
  buildSequence(
    sessionId: string,
    conversationId: string,
    templates: ProcessedTemplate[],
    intent: string
  ): MessageSequence {
    const messages: MessageToSend[] = templates.map((template, index) => ({
      id: generateMessageId(),
      content: template.content,
      contentType: template.contentType,
      delaySeconds: template.delaySeconds,
      metadata: {
        intent,
        templateId: template.id,
        sequencePosition: index + 1,
      },
    }))

    return {
      id: generateSequenceId(),
      sessionId,
      conversationId,
      messages,
      status: 'pending',
      sentCount: 0,
      startedAt: null,
      completedAt: null,
    }
  }

  /**
   * Merge new messages with pending messages from interrupted sequence.
   *
   * Order: New messages first, then pending (complementary info appended).
   *
   * @param newMessages - Messages from current response
   * @param sessionId - Session to check for pending
   * @returns Merged array of messages
   */
  async mergeWithPending(
    newMessages: MessageToSend[],
    sessionId: string
  ): Promise<MessageToSend[]> {
    const pending = await this.interruptionHandler.getPendingMessages(sessionId)

    if (pending.length === 0) {
      return newMessages
    }

    // Clear pending after retrieving
    await this.interruptionHandler.clearPendingMessages(sessionId)

    // Convert pending to MessageToSend format
    const pendingMessages: MessageToSend[] = pending.map(p => ({
      id: generateMessageId(),
      content: p.content,
      contentType: p.contentType,
      delaySeconds: p.delaySeconds,
      metadata: {
        intent: p.originalIntent,
        sequencePosition: p.sequencePosition,
      },
    }))

    // New messages first, then pending
    return [...newMessages, ...pendingMessages]
  }

  /**
   * Get the interruption handler for direct access if needed.
   */
  getInterruptionHandler(): InterruptionHandler {
    return this.interruptionHandler
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Save remaining sequence messages as pending.
   */
  private async savePendingFromSequence(
    sessionId: string,
    sequenceId: string,
    remaining: MessageToSend[],
    intent: string
  ): Promise<void> {
    const pending = this.messagesToPending(remaining, intent)
    await this.interruptionHandler.savePendingMessages(sessionId, pending, sequenceId)
  }

  /**
   * Convert MessageToSend array to PendingMessage array.
   */
  private messagesToPending(messages: MessageToSend[], intent: string): PendingMessage[] {
    return messages.map((msg, index) => ({
      id: msg.id,
      content: msg.content,
      contentType: msg.contentType,
      delaySeconds: msg.delaySeconds,
      originalIntent: msg.metadata?.intent ?? intent,
      sequencePosition: msg.metadata?.sequencePosition ?? index + 1,
    }))
  }
}
