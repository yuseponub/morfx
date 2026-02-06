/**
 * Interruption Handler Component
 * Phase 14: Agente Ventas Somnio - Plan 04
 *
 * Detects and manages sequence interruptions from customer messages.
 * Stores pending messages in session state for later resumption.
 */

import type { SessionManager } from '../session-manager'
import type { TemplateContentType } from '../types'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('interruption-handler')

// ============================================================================
// Types
// ============================================================================

/**
 * A message that was pending when interrupted.
 * Stored in session state for later resumption.
 */
export interface PendingMessage {
  /** Unique identifier for this message */
  id: string
  /** Message content after variable substitution */
  content: string
  /** Type of content (texto, template, imagen) */
  contentType: TemplateContentType
  /** Delay before sending (seconds) */
  delaySeconds: number
  /** Original intent that triggered this message */
  originalIntent: string
  /** Position in the original sequence (1-based) */
  sequencePosition: number
}

/**
 * State tracking for interruptions.
 * Stored in session_state.datos_capturados with special key.
 */
export interface InterruptionState {
  /** Messages that were not sent due to interruption */
  pendingMessages: PendingMessage[]
  /** When the interruption occurred */
  interruptedAt: string | null
  /** ID of the sequence that was interrupted */
  originalSequenceId: string | null
}

/**
 * Result from interruption detection.
 */
export interface InterruptionResult {
  /** Whether an interruption was detected */
  wasInterrupted: boolean
  /** Number of pending messages from interrupted sequence */
  pendingCount: number
  /** The pending messages (for merging with new response) */
  pendingMessages: PendingMessage[]
  /** Whether pending messages should be appended to new response */
  shouldAppendPending: boolean
}

// ============================================================================
// Constants
// ============================================================================

/** Special key in datos_capturados for storing pending messages */
const PENDING_MESSAGES_KEY = '__pending_messages'
/** Special key for interruption timestamp */
const INTERRUPTED_AT_KEY = '__interrupted_at'
/** Special key for original sequence ID */
const SEQUENCE_ID_KEY = '__sequence_id'

/**
 * Intents that are complementary and should have pending messages appended.
 * Non-conflicting intents where additional info is helpful.
 */
const COMPLEMENTARY_INTENTS = new Set([
  'precio',
  'pago',
  'envio',
  'garantia',
  'ingredientes',
  'funciona',
  'hola',
  'hola+precio',
  'hola+envio',
  'hola+pago',
])

/**
 * Intents that conflict with pending messages and should NOT append.
 * Intents where user is changing topic or escalating.
 */
const CONFLICTING_INTENTS = new Set([
  'asesor',
  'queja',
  'cancelar',
  'no_gracias',
])

// ============================================================================
// Interruption Handler Class
// ============================================================================

/**
 * Handles interruption detection and pending message management.
 *
 * When a customer sends a message while we're in the middle of sending
 * a sequence of messages, we need to:
 * 1. Detect the interruption
 * 2. Save pending (unsent) messages
 * 3. Process the new customer message
 * 4. Optionally append pending messages if they're complementary
 */
export class InterruptionHandler {
  constructor(private sessionManager: SessionManager) {}

  /**
   * Detect if there was an interruption for this session.
   *
   * Checks session state for pending messages and determines if they
   * should be appended to the new response.
   *
   * @param sessionId - Session to check
   * @param newIntent - The intent detected from new customer message
   * @returns InterruptionResult with pending messages and append decision
   */
  async detectInterruption(
    sessionId: string,
    newIntent: string
  ): Promise<InterruptionResult> {
    const pendingMessages = await this.getPendingMessages(sessionId)

    if (pendingMessages.length === 0) {
      return {
        wasInterrupted: false,
        pendingCount: 0,
        pendingMessages: [],
        shouldAppendPending: false,
      }
    }

    // Determine if we should append pending messages
    const shouldAppend = this.shouldAppendPending(newIntent, pendingMessages)

    logger.info(
      {
        sessionId,
        pendingCount: pendingMessages.length,
        newIntent,
        shouldAppend,
      },
      'Interruption detected'
    )

    return {
      wasInterrupted: true,
      pendingCount: pendingMessages.length,
      pendingMessages,
      shouldAppendPending: shouldAppend,
    }
  }

  /**
   * Determine if pending messages should be appended to new response.
   *
   * Logic:
   * - If new intent is conflicting (asesor, queja, etc.) -> don't append
   * - If new intent is same as pending's original intent -> don't append (duplicate)
   * - If new intent is complementary -> append
   * - Default: append (assume it's helpful additional info)
   */
  private shouldAppendPending(
    newIntent: string,
    pendingMessages: PendingMessage[]
  ): boolean {
    // Never append for conflicting intents
    if (CONFLICTING_INTENTS.has(newIntent)) {
      return false
    }

    // Check if same intent - avoid duplicate content
    const originalIntent = pendingMessages[0]?.originalIntent
    if (originalIntent === newIntent) {
      return false
    }

    // Complementary intents always append
    if (COMPLEMENTARY_INTENTS.has(newIntent)) {
      return true
    }

    // Default: append unless there's a reason not to
    return true
  }

  /**
   * Save pending messages to session state.
   *
   * Called when a sequence is interrupted - stores remaining messages
   * for potential later sending.
   *
   * @param sessionId - Session to save to
   * @param pending - Messages that weren't sent
   * @param sequenceId - ID of the interrupted sequence
   */
  async savePendingMessages(
    sessionId: string,
    pending: PendingMessage[],
    sequenceId: string
  ): Promise<void> {
    if (pending.length === 0) {
      return
    }

    const state = await this.sessionManager.getState(sessionId)
    const now = new Date().toISOString()

    // Store in datos_capturados with special keys
    await this.sessionManager.updateState(sessionId, {
      datos_capturados: {
        ...state.datos_capturados,
        [PENDING_MESSAGES_KEY]: JSON.stringify(pending),
        [INTERRUPTED_AT_KEY]: now,
        [SEQUENCE_ID_KEY]: sequenceId,
      },
    })

    logger.info(
      {
        sessionId,
        sequenceId,
        pendingCount: pending.length,
      },
      'Saved pending messages'
    )
  }

  /**
   * Get pending messages from session state.
   *
   * @param sessionId - Session to read from
   * @returns Array of pending messages (empty if none)
   */
  async getPendingMessages(sessionId: string): Promise<PendingMessage[]> {
    const state = await this.sessionManager.getState(sessionId)
    const pendingJson = state.datos_capturados[PENDING_MESSAGES_KEY]

    if (!pendingJson) {
      return []
    }

    try {
      return JSON.parse(pendingJson) as PendingMessage[]
    } catch (error) {
      logger.error(
        { sessionId, error },
        'Failed to parse pending messages'
      )
      return []
    }
  }

  /**
   * Clear pending messages from session state.
   *
   * Called after pending messages have been successfully sent or
   * when they should be discarded.
   *
   * @param sessionId - Session to clear
   */
  async clearPendingMessages(sessionId: string): Promise<void> {
    const state = await this.sessionManager.getState(sessionId)

    // Create new datos_capturados without the special keys
    const newDatos = { ...state.datos_capturados }
    delete newDatos[PENDING_MESSAGES_KEY]
    delete newDatos[INTERRUPTED_AT_KEY]
    delete newDatos[SEQUENCE_ID_KEY]

    await this.sessionManager.updateState(sessionId, {
      datos_capturados: newDatos,
    })

    logger.debug({ sessionId }, 'Cleared pending messages')
  }

  /**
   * Mark that an interruption occurred.
   *
   * Updates session state with interruption timestamp.
   * Used for tracking and analytics.
   *
   * @param sessionId - Session where interruption occurred
   * @param timestamp - When the interruption was detected
   */
  async markInterruption(
    sessionId: string,
    timestamp: Date
  ): Promise<void> {
    const state = await this.sessionManager.getState(sessionId)

    await this.sessionManager.updateState(sessionId, {
      datos_capturados: {
        ...state.datos_capturados,
        [INTERRUPTED_AT_KEY]: timestamp.toISOString(),
      },
    })
  }

  /**
   * Get the timestamp when interruption occurred.
   *
   * @param sessionId - Session to check
   * @returns ISO timestamp string or null if no interruption
   */
  async getInterruptionTime(sessionId: string): Promise<string | null> {
    const state = await this.sessionManager.getState(sessionId)
    return state.datos_capturados[INTERRUPTED_AT_KEY] ?? null
  }
}
