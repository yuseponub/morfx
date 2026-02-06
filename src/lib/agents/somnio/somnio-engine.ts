/**
 * Somnio Engine
 * Phase 14: Agente Ventas Somnio - Plan 06
 *
 * Main entry point for processing Somnio sales agent messages.
 * Coordinates all Somnio-specific components:
 * - SomnioOrchestrator for flow logic
 * - MessageSequencer for delayed message sending
 * - OrderCreator for contact/order creation on compra_confirmada
 *
 * Flow:
 * 1. Get or create session for conversation
 * 2. Detect intent (via base IntentDetector)
 * 3. Orchestrate response (via SomnioOrchestrator)
 * 4. Check shouldCreateOrder flag -> invoke OrderCreator
 * 5. Send messages via MessageSequencer
 * 6. Update session state
 * 7. Return comprehensive result
 */

import { AgentEngine, type ProcessMessageInput } from '../engine'
import { SessionManager, type AgentSessionWithState } from '../session-manager'
import { IntentDetector } from '../intent-detector'
import { ClaudeClient } from '../claude-client'
import { agentRegistry } from '../registry'
import type { PackSelection } from '../types'
import { SomnioOrchestrator, type SomnioOrchestratorResult } from './somnio-orchestrator'
import { MessageSequencer, type MessageSequence, type MessageToSend } from './message-sequencer'
import { OrderCreator, type ContactData, type OrderCreationResult } from './order-creator'
import { somnioAgentConfig } from './config'
import { mergeExtractedData } from './data-extractor'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('somnio-engine')

// ============================================================================
// Types
// ============================================================================

/**
 * Input for SomnioEngine.processMessage()
 */
export interface SomnioProcessMessageInput {
  /** Conversation ID (for session lookup) */
  conversationId: string
  /** Contact ID */
  contactId: string
  /** Customer message content */
  messageContent: string
  /** Workspace ID for isolation */
  workspaceId: string
  /** Phone number for message sending */
  phoneNumber?: string
}

/**
 * Result from SomnioEngine.processMessage()
 */
export interface SomnioEngineResult {
  success: boolean
  /** Response text or templates to send */
  response?: string
  /** Number of messages sent */
  messagesSent?: number
  /** Whether an order was created */
  orderCreated?: boolean
  /** Created order ID */
  orderId?: string
  /** Contact ID (new or existing) */
  contactId?: string
  /** New session mode after processing */
  newMode?: string
  /** Total tokens used */
  tokensUsed?: number
  /** Session ID */
  sessionId?: string
  /** Error details if failed */
  error?: {
    code: string
    message: string
    retryable: boolean
  }
}

// ============================================================================
// SomnioEngine Class
// ============================================================================

/**
 * Somnio Sales Agent Engine.
 *
 * Extends AgentEngine with Somnio-specific orchestration and order creation.
 */
export class SomnioEngine {
  private sessionManager: SessionManager
  private claudeClient: ClaudeClient
  private intentDetector: IntentDetector
  private orchestrator: SomnioOrchestrator
  private messageSequencer: MessageSequencer
  private orderCreator: OrderCreator
  private workspaceId: string

  constructor(
    workspaceId: string,
    options?: {
      sessionManager?: SessionManager
      claudeClient?: ClaudeClient
      orchestrator?: SomnioOrchestrator
      messageSequencer?: MessageSequencer
    }
  ) {
    this.workspaceId = workspaceId
    this.sessionManager = options?.sessionManager ?? new SessionManager()
    this.claudeClient = options?.claudeClient ?? new ClaudeClient()
    this.intentDetector = new IntentDetector(this.claudeClient)
    this.orchestrator = options?.orchestrator ?? new SomnioOrchestrator(this.claudeClient)
    this.messageSequencer = options?.messageSequencer ?? new MessageSequencer(this.sessionManager)
    this.orderCreator = new OrderCreator(workspaceId)
  }

  /**
   * Process a customer message through the Somnio sales agent.
   *
   * @param input - Message and context
   * @returns Comprehensive result with response, order info, etc.
   */
  async processMessage(input: SomnioProcessMessageInput): Promise<SomnioEngineResult> {
    logger.info(
      {
        conversationId: input.conversationId,
        messageLength: input.messageContent.length,
        workspaceId: input.workspaceId,
      },
      'Processing Somnio message'
    )

    try {
      // 1. Get or create session
      const session = await this.getOrCreateSession(
        input.conversationId,
        input.contactId
      )

      const agentConfig = agentRegistry.get(somnioAgentConfig.id)
      let totalTokens = 0

      // 2. Build conversation history
      const history = await this.buildConversationHistory(session.id)

      // 3. Detect intent
      const { intent, action, tokensUsed: intentTokens } = await this.intentDetector.detect(
        input.messageContent,
        history,
        {
          systemPrompt: agentConfig.intentDetector.systemPrompt,
          model: agentConfig.intentDetector.model,
          thresholds: agentConfig.confidenceThresholds,
        }
      )
      totalTokens += intentTokens

      logger.debug(
        {
          intent: intent.intent,
          confidence: intent.confidence,
          action,
        },
        'Intent detected'
      )

      // 4. Record user turn
      const turnNumber = history.length + 1
      await this.sessionManager.addTurn({
        sessionId: session.id,
        turnNumber,
        role: 'user',
        content: input.messageContent,
        intentDetected: intent.intent,
        confidence: intent.confidence,
        tokensUsed: intentTokens,
      })

      // 5. Update intents_vistos
      await this.sessionManager.addIntentSeen(session.id, intent.intent)

      // 6. Handle handoff
      if (action === 'handoff') {
        return this.handleHandoff(session.id)
      }

      // 7. Orchestrate response
      const orchestratorResult = await this.orchestrator.orchestrate(
        intent,
        session,
        input.messageContent,
        history
      )
      totalTokens += orchestratorResult.tokensUsed ?? 0

      // 8. Handle blocked transition (clarification)
      if (orchestratorResult.action === 'clarify' && orchestratorResult.response) {
        await this.sessionManager.addTurn({
          sessionId: session.id,
          turnNumber: turnNumber + 1,
          role: 'assistant',
          content: orchestratorResult.response,
          tokensUsed: orchestratorResult.tokensUsed ?? 0,
        })

        return {
          success: true,
          response: orchestratorResult.response,
          sessionId: session.id,
          tokensUsed: totalTokens,
        }
      }

      // 9. Apply state updates from orchestrator
      await this.applyStateUpdates(session.id, orchestratorResult, session)

      // 10. Update session mode if changed
      if (orchestratorResult.nextMode) {
        await this.sessionManager.updateSessionWithVersion(
          session.id,
          session.version,
          {
            currentMode: orchestratorResult.nextMode,
            lastActivityAt: new Date().toISOString(),
          }
        )
      }

      // 11. CRITICAL: Check shouldCreateOrder flag and invoke OrderCreator
      let orderResult: OrderCreationResult | undefined
      if (orchestratorResult.shouldCreateOrder) {
        const updatedState = await this.sessionManager.getState(session.id)
        const datosCapturados = updatedState.datos_capturados
        const packSeleccionado = updatedState.pack_seleccionado

        if (packSeleccionado && this.hasRequiredContactData(datosCapturados)) {
          logger.info(
            { pack: packSeleccionado, sessionId: session.id },
            'Creating order via OrderCreator'
          )

          // Convert Record<string, string> to ContactData
          const contactData: ContactData = {
            nombre: datosCapturados.nombre,
            apellido: datosCapturados.apellido,
            telefono: datosCapturados.telefono,
            direccion: datosCapturados.direccion,
            ciudad: datosCapturados.ciudad,
            departamento: datosCapturados.departamento,
            barrio: datosCapturados.barrio,
            correo: datosCapturados.correo,
            indicaciones_extra: datosCapturados.indicaciones_extra,
          }

          orderResult = await this.orderCreator.createContactAndOrder(
            contactData,
            packSeleccionado,
            session.id
          )

          if (orderResult.success) {
            logger.info(
              {
                orderId: orderResult.orderId,
                contactId: orderResult.contactId,
                isNewContact: orderResult.isNewContact,
              },
              'Order created successfully'
            )
          } else {
            logger.error(
              { error: orderResult.error },
              'Order creation failed'
            )
          }
        } else {
          logger.warn(
            { pack: packSeleccionado, hasData: this.hasRequiredContactData(datosCapturados) },
            'Cannot create order - missing pack or contact data'
          )
        }
      }

      // 12. Send messages via MessageSequencer
      let messagesSent = 0
      if (orchestratorResult.templates && orchestratorResult.templates.length > 0) {
        const sequence = this.messageSequencer.buildSequence(
          session.id,
          input.conversationId,
          orchestratorResult.templates,
          orchestratorResult.intent
        )

        // Merge with any pending messages from previous interruptions
        const mergedMessages = await this.messageSequencer.mergeWithPending(
          sequence.messages,
          session.id
        )
        sequence.messages = mergedMessages

        const sequenceResult = await this.messageSequencer.executeSequence(
          sequence,
          input.workspaceId,
          input.phoneNumber ?? input.contactId
        )

        messagesSent = sequenceResult.messagesSent
      }

      // 13. Record assistant turn
      const responseText = orchestratorResult.templates
        ?.map((t) => t.content)
        .join('\n') ?? ''

      await this.sessionManager.addTurn({
        sessionId: session.id,
        turnNumber: turnNumber + 1,
        role: 'assistant',
        content: responseText,
        tokensUsed: orchestratorResult.tokensUsed ?? 0,
      })

      logger.info(
        {
          sessionId: session.id,
          intent: orchestratorResult.intent,
          messagesSent,
          orderCreated: orderResult?.success ?? false,
          tokensUsed: totalTokens,
        },
        'Somnio message processed successfully'
      )

      return {
        success: true,
        response: responseText,
        messagesSent,
        orderCreated: orderResult?.success ?? false,
        orderId: orderResult?.orderId,
        contactId: orderResult?.contactId,
        newMode: orchestratorResult.nextMode,
        tokensUsed: totalTokens,
        sessionId: session.id,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error({ error: errorMessage, input }, 'Somnio message processing failed')

      return {
        success: false,
        error: {
          code: 'PROCESSING_ERROR',
          message: errorMessage,
          retryable: true,
        },
      }
    }
  }

  /**
   * Get or create session for a conversation.
   */
  async getOrCreateSession(
    conversationId: string,
    contactId: string
  ): Promise<AgentSessionWithState> {
    // Try to find existing active session
    const existing = await this.sessionManager.getSessionByConversation(
      conversationId,
      somnioAgentConfig.id
    )

    if (existing) {
      return existing
    }

    // Create new session
    return this.sessionManager.createSession({
      agentId: somnioAgentConfig.id,
      conversationId,
      contactId,
      workspaceId: this.workspaceId,
      initialMode: somnioAgentConfig.initialState,
    })
  }

  /**
   * Build conversation history from turns.
   */
  private async buildConversationHistory(sessionId: string) {
    const turns = await this.sessionManager.getTurns(sessionId)

    return turns
      .filter((turn) => turn.role !== 'system')
      .map((turn) => ({
        role: turn.role as 'user' | 'assistant',
        content: turn.content,
      }))
  }

  /**
   * Handle handoff to human agent.
   */
  private async handleHandoff(sessionId: string): Promise<SomnioEngineResult> {
    const session = await this.sessionManager.getSession(sessionId)
    await this.sessionManager.handoffSession(sessionId, session.version)

    const response = 'Voy a transferirte con un asesor humano para atenderte mejor. Un momento por favor.'

    return {
      success: true,
      response,
      newMode: 'handoff',
      sessionId,
      tokensUsed: 0,
    }
  }

  /**
   * Apply state updates from orchestrator result.
   */
  private async applyStateUpdates(
    sessionId: string,
    result: SomnioOrchestratorResult,
    currentSession: AgentSessionWithState
  ): Promise<void> {
    if (!result.stateUpdates) return

    const updates: Record<string, unknown> = {}

    // Update captured data
    if (result.stateUpdates.datosCapturados) {
      const currentData = currentSession.state.datos_capturados
      updates.datos_capturados = mergeExtractedData(
        currentData,
        result.stateUpdates.datosCapturados
      )
    }

    // Update templates sent
    if (result.stateUpdates.templatesSent) {
      updates.templates_enviados = [
        ...currentSession.state.templates_enviados,
        ...result.stateUpdates.templatesSent,
      ]
    }

    // Update pack selection
    if (result.stateUpdates.packSeleccionado) {
      updates.pack_seleccionado = result.stateUpdates.packSeleccionado
    }

    if (Object.keys(updates).length > 0) {
      await this.sessionManager.updateState(sessionId, updates as any)
    }
  }

  /**
   * Check if captured data has required fields for order creation.
   */
  private hasRequiredContactData(data: Record<string, string>): boolean {
    const required = ['nombre', 'telefono', 'direccion', 'ciudad', 'departamento']
    return required.every((field) => {
      const value = data[field]
      return value && value.trim().length > 0 && value !== 'N/A'
    })
  }

  /**
   * Get the OrderCreator instance (for testing).
   */
  getOrderCreator(): OrderCreator {
    return this.orderCreator
  }

  /**
   * Get the SomnioOrchestrator instance (for testing).
   */
  getOrchestrator(): SomnioOrchestrator {
    return this.orchestrator
  }

  /**
   * Get the MessageSequencer instance (for testing).
   */
  getMessageSequencer(): MessageSequencer {
    return this.messageSequencer
  }
}
