/**
 * Ingest Manager Component
 * Phase 15.5: Somnio Ingest System - Plan 02
 *
 * Coordinates classification, extraction, and silent accumulation during
 * collecting_data mode. Implements the "silence on data, respond on question"
 * behavior with proper timer management.
 *
 * Key behaviors from CONTEXT.md:
 * - 'datos': Extract data, accumulate silently, NO response
 * - 'pregunta': Return action='respond' for normal flow
 * - 'mixto': Extract data AND return action='respond'
 * - 'irrelevante': Ignore silently, no timer effect
 *
 * Timer logic:
 * - Timer starts on FIRST data message with 6 min duration
 * - Timer uses 10 min duration when no data was received
 * - Timer does NOT restart on additional data messages
 * - Timer cancelled when all 8 fields complete
 *
 * @example
 * const manager = new IngestManager()
 * const result = await manager.handleMessage(sessionId, 'Jose de Bogota', ingestState, existingData, history)
 * // result.action === 'silent' (no response)
 * // result.extractedData contains { nombre: 'Jose', ciudad: 'Bogota' }
 * // result.shouldEmitTimerStart === true (first data)
 */

import { MessageClassifier } from './message-classifier'
import type { MessageClassification, ClassificationResult } from './message-classifier'
import { DataExtractor, hasCriticalData, mergeExtractedData } from './data-extractor'
import type { ExtractedData, ExtractionResult } from './data-extractor'
import type { ClaudeMessage } from '@/lib/agents/types'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('ingest-manager')

// ============================================================================
// Types
// ============================================================================

/**
 * State of the ingest process for a session.
 * Tracks when ingest started, when first data was received, and what fields have been collected.
 */
export interface IngestState {
  /** Whether ingest is currently active */
  active: boolean
  /** When ingest mode started (ISO string) */
  startedAt: string | null
  /** When first data message was received (ISO string) - determines timer type */
  firstDataAt: string | null
  /** List of fields that have been collected */
  fieldsCollected: string[]
}

/**
 * Result from IngestManager.handleMessage().
 */
export interface IngestResult {
  /**
   * What action to take:
   * - 'silent': No response, just accumulate data
   * - 'respond': Generate and send a response (question or mixto)
   * - 'complete': All data collected, transition to ofrecer_promos
   */
  action: 'silent' | 'respond' | 'complete'

  /** The classification from MessageClassifier */
  classification: ClassificationResult

  /** Extracted data if classification was 'datos' or 'mixto' */
  extractedData?: ExtractionResult

  /** Whether to emit ingest.started event to start timer */
  shouldEmitTimerStart?: boolean

  /** Whether to emit ingest.completed event to cancel timer */
  shouldEmitTimerComplete?: boolean

  /** Timer duration: '6m' for partial data, '10m' for no data */
  timerDuration?: '6m' | '10m'

  /** Merged data (existing + new) for convenience */
  mergedData?: Record<string, string>
}

/**
 * Input for handleMessage.
 */
export interface HandleMessageInput {
  /** Session ID */
  sessionId: string
  /** The customer message to process */
  message: string
  /** Current ingest state */
  ingestState: IngestState
  /** Already collected data */
  existingData: Record<string, string>
  /** Conversation history for context */
  conversationHistory: ClaudeMessage[]
}

// ============================================================================
// IngestManager Class
// ============================================================================

/**
 * Ingest Manager component.
 *
 * Coordinates the silent data accumulation workflow during collecting_data mode.
 * Uses MessageClassifier to determine message type, then routes accordingly.
 */
export class IngestManager {
  private classifier: MessageClassifier
  private dataExtractor: DataExtractor

  constructor(classifier?: MessageClassifier, dataExtractor?: DataExtractor) {
    this.classifier = classifier ?? new MessageClassifier()
    this.dataExtractor = dataExtractor ?? new DataExtractor()
  }

  /**
   * Handle a message during ingest/collecting_data mode.
   *
   * @param input - The message and context to process
   * @returns IngestResult with action, classification, and optional data
   */
  async handleMessage(input: HandleMessageInput): Promise<IngestResult> {
    const { sessionId, message, ingestState, existingData, conversationHistory } = input

    logger.debug(
      {
        sessionId,
        messageLength: message.length,
        hasFirstData: !!ingestState.firstDataAt,
        fieldsCount: Object.keys(existingData).length,
      },
      'IngestManager handling message'
    )

    // Step 1: Classify the message
    const classification = await this.classifier.classify(message)

    logger.info(
      {
        sessionId,
        classification: classification.classification,
        confidence: classification.confidence,
      },
      'Message classified for ingest'
    )

    // Step 2: Route based on classification
    switch (classification.classification) {
      case 'datos':
        return this.handleDatos(input, classification)

      case 'pregunta':
        return this.handlePregunta(classification)

      case 'mixto':
        return this.handleMixto(input, classification)

      case 'irrelevante':
        return this.handleIrrelevante(classification)
    }
  }

  /**
   * Handle 'datos' classification: Extract and accumulate silently.
   */
  private async handleDatos(
    input: HandleMessageInput,
    classification: ClassificationResult
  ): Promise<IngestResult> {
    const { sessionId, message, ingestState, existingData, conversationHistory } = input

    // Extract data from message
    const extractedData = await this.dataExtractor.extract(
      message,
      existingData,
      conversationHistory
    )

    // Merge extracted data with existing
    const mergedData = mergeExtractedData(existingData, extractedData.normalized)

    // Determine if we should start timer (first data)
    const isFirstData = !ingestState.firstDataAt
    const shouldEmitTimerStart = isFirstData

    // Check if all 8 fields are now complete
    const isComplete = hasCriticalData(mergedData)

    logger.info(
      {
        sessionId,
        extractedFields: Object.keys(extractedData.normalized),
        isFirstData,
        isComplete,
        totalFields: Object.keys(mergedData).length,
      },
      'Datos processed for ingest'
    )

    if (isComplete) {
      // All fields complete - emit completion event
      return {
        action: 'complete',
        classification,
        extractedData,
        mergedData,
        shouldEmitTimerComplete: true,
      }
    }

    // Silent accumulation
    return {
      action: 'silent',
      classification,
      extractedData,
      mergedData,
      shouldEmitTimerStart,
      timerDuration: '6m', // Partial data = 6 min timeout
    }
  }

  /**
   * Handle 'pregunta' classification: Let caller generate response.
   */
  private handlePregunta(classification: ClassificationResult): IngestResult {
    logger.debug({ classification: classification.classification }, 'Pregunta - respond to customer')

    return {
      action: 'respond',
      classification,
    }
  }

  /**
   * Handle 'mixto' classification: Extract data AND let caller respond.
   */
  private async handleMixto(
    input: HandleMessageInput,
    classification: ClassificationResult
  ): Promise<IngestResult> {
    const { sessionId, message, ingestState, existingData, conversationHistory } = input

    // Extract data from message
    const extractedData = await this.dataExtractor.extract(
      message,
      existingData,
      conversationHistory
    )

    // Merge extracted data with existing
    const mergedData = mergeExtractedData(existingData, extractedData.normalized)

    // Determine if we should start timer (first data)
    const isFirstData = !ingestState.firstDataAt && Object.keys(extractedData.normalized).length > 0
    const shouldEmitTimerStart = isFirstData

    // Check if all 8 fields are now complete
    const isComplete = hasCriticalData(mergedData)

    logger.info(
      {
        sessionId,
        extractedFields: Object.keys(extractedData.normalized),
        isFirstData,
        isComplete,
      },
      'Mixto processed - extracting and responding'
    )

    if (isComplete) {
      // All fields complete - still respond (for the question part), but signal completion
      return {
        action: 'respond', // Respond to the question part
        classification,
        extractedData,
        mergedData,
        shouldEmitTimerComplete: true,
      }
    }

    // Extract AND respond (for the question part)
    return {
      action: 'respond',
      classification,
      extractedData,
      mergedData,
      shouldEmitTimerStart,
      timerDuration: '6m',
    }
  }

  /**
   * Handle 'irrelevante' classification: Ignore silently, no timer effect.
   */
  private handleIrrelevante(classification: ClassificationResult): IngestResult {
    logger.debug({ classification: classification.classification }, 'Irrelevante - ignoring silently')

    return {
      action: 'silent',
      classification,
      // No timer signals - irrelevante doesn't affect timer state
    }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create default/empty ingest state.
 */
export function createEmptyIngestState(): IngestState {
  return {
    active: false,
    startedAt: null,
    firstDataAt: null,
    fieldsCollected: [],
  }
}

/**
 * Create active ingest state when entering collecting_data mode.
 */
export function createActiveIngestState(): IngestState {
  return {
    active: true,
    startedAt: new Date().toISOString(),
    firstDataAt: null,
    fieldsCollected: [],
  }
}

/**
 * Update ingest state after processing a message.
 *
 * @param currentState - Current ingest state
 * @param result - Result from handleMessage
 * @returns Updated ingest state
 */
export function updateIngestState(
  currentState: IngestState,
  result: IngestResult
): IngestState {
  // If no data was extracted, return unchanged state
  if (!result.extractedData) {
    return currentState
  }

  const extractedFields = Object.keys(result.extractedData.normalized)
  const newFields = extractedFields.filter(
    (f) => !currentState.fieldsCollected.includes(f)
  )

  // Calculate new firstDataAt (only set if this is first data)
  const firstDataAt = currentState.firstDataAt
    ?? (extractedFields.length > 0 ? new Date().toISOString() : null)

  return {
    ...currentState,
    firstDataAt,
    fieldsCollected: [...currentState.fieldsCollected, ...newFields],
    // Mark as inactive if complete
    active: result.action !== 'complete',
  }
}

/**
 * Calculate timer duration based on ingest state.
 * From CONTEXT.md:
 * - 6 min if customer sent partial data
 * - 10 min if no data was received
 *
 * @param hasReceivedData - Whether any data has been received
 * @returns Timer duration in milliseconds
 */
export function calculateTimerDuration(hasReceivedData: boolean): number {
  return hasReceivedData ? 360000 : 600000 // 6 min or 10 min in ms
}
