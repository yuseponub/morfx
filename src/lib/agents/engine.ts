/**
 * Agent Engine
 * Phase 13: Agent Engine Core - Plan 05
 *
 * Main engine for processing customer messages.
 * Coordinates Intent Detector, Orchestrator, Session Manager,
 * Token Budget, and Action DSL tool execution.
 *
 * Flow:
 * 1. Load session (with version for optimistic locking)
 * 2. Check token budget
 * 3. Get conversation history
 * 4. Detect intent (fast, with Haiku)
 * 5. Record user turn
 * 6. Emit agent/customer.message event (for timer cancellation)
 * 7. Route based on confidence (handoff/clarify/proceed)
 * 8. Orchestrate response (with Sonnet, tools available)
 * 9. Execute tools if requested
 * 10. Update session state with version check
 * 11. Emit mode transition events (collecting_data.started, promos.offered)
 * 12. Record assistant turn
 * 13. Return response
 */

import { agentRegistry } from './registry'
import { SessionManager } from './session-manager'
import type { CreateSessionParams, AgentSessionWithState } from './session-manager'
import { ClaudeClient } from './claude-client'
import { TokenBudgetManager } from './token-budget'
import { IntentDetector } from './intent-detector'
import { Orchestrator } from './orchestrator'
import {
  VersionConflictError,
  BudgetExceededError,
  AgentNotFoundError,
} from './errors'
import type {
  AgentResponse,
  ClaudeMessage,
  IntentResult,
  SessionState,
  ToolCallRecord,
} from './types'
import { executeToolFromAgent } from '@/lib/tools/executor'
import type { ToolExecutionResult } from '@/lib/tools/types'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('agent-engine')

// ============================================================================
// Constants
// ============================================================================

/** Maximum retries for version conflicts */
const MAX_VERSION_CONFLICT_RETRIES = 3

/** Estimated tokens per Claude call (for budget pre-check) */
const ESTIMATED_TOKENS_PER_CALL = 2000

// ============================================================================
// Input/Output Types
// ============================================================================

/**
 * Input for processing a message through the agent engine
 */
export interface ProcessMessageInput {
  /** Session ID for the conversation */
  sessionId: string
  /** Conversation ID (for event correlation) */
  conversationId: string
  /** Contact ID (for data lookups) */
  contactId: string
  /** Customer message content */
  messageContent: string
  /** Workspace ID for isolation */
  workspaceId: string
}

/**
 * Tool execution result formatted for agent response
 */
export interface ToolExecutionResultFormatted {
  name: string
  success: boolean
  data?: unknown
  error?: {
    code: string
    message: string
    retryable: boolean
  }
}

/**
 * Tool call record for turn storage
 */
export interface TurnToolCall {
  name: string
  input: Record<string, unknown>
  result: unknown
  success: boolean
}

// ============================================================================
// Agent Engine Class
// ============================================================================

/**
 * Agent Engine - Main entry point for message processing.
 *
 * Coordinates all agent components:
 * - SessionManager: Session CRUD with optimistic locking
 * - ClaudeClient: Claude API wrapper
 * - TokenBudgetManager: Token usage tracking
 * - IntentDetector: Message classification
 * - Orchestrator: Action decision and tool selection
 *
 * Usage:
 * ```typescript
 * const engine = new AgentEngine()
 *
 * const response = await engine.processMessage({
 *   sessionId: 'session-uuid',
 *   conversationId: 'conversation-uuid',
 *   contactId: 'contact-uuid',
 *   messageContent: 'Hola, cuanto cuesta?',
 *   workspaceId: 'workspace-uuid',
 * })
 * ```
 */
export class AgentEngine {
  private sessionManager: SessionManager
  private claudeClient: ClaudeClient
  private tokenBudget: TokenBudgetManager
  private intentDetector: IntentDetector
  private orchestrator: Orchestrator

  constructor(options?: {
    sessionManager?: SessionManager
    claudeClient?: ClaudeClient
    tokenBudget?: TokenBudgetManager
    intentDetector?: IntentDetector
    orchestrator?: Orchestrator
  }) {
    this.sessionManager = options?.sessionManager ?? new SessionManager()
    this.claudeClient = options?.claudeClient ?? new ClaudeClient()
    this.tokenBudget = options?.tokenBudget ?? new TokenBudgetManager()
    this.intentDetector = options?.intentDetector ?? new IntentDetector(this.claudeClient)
    this.orchestrator = options?.orchestrator ?? new Orchestrator(this.claudeClient)
  }

  // ============================================================================
  // Main Entry Point
  // ============================================================================

  /**
   * Process a customer message.
   *
   * This is the main entry point. Handles the full flow:
   * intent detection -> orchestration -> tool execution -> response
   *
   * @param input Message and context
   * @returns Agent response with optional tool results
   * @throws BudgetExceededError if token budget is exceeded
   * @throws AgentNotFoundError if agent is not registered
   */
  async processMessage(input: ProcessMessageInput): Promise<AgentResponse> {
    return this.processMessageWithRetry(input, 0)
  }

  /**
   * Process message with retry logic for version conflicts.
   */
  private async processMessageWithRetry(
    input: ProcessMessageInput,
    retryCount: number
  ): Promise<AgentResponse> {
    logger.info(
      {
        sessionId: input.sessionId,
        messageLength: input.messageContent.length,
        retryCount,
      },
      'Processing message'
    )

    try {
      // 1. Load session with current version
      const session = await this.sessionManager.getSession(input.sessionId)
      const agentConfig = agentRegistry.get(session.agent_id)
      const previousMode = session.current_mode

      // 2. Check token budget
      const budgetCheck = await this.tokenBudget.checkBudget(
        input.sessionId,
        ESTIMATED_TOKENS_PER_CALL * 2 // Intent + Orchestrator
      )
      if (!budgetCheck.allowed) {
        throw new BudgetExceededError(
          input.sessionId,
          budgetCheck.used,
          budgetCheck.used + budgetCheck.remaining,
          ESTIMATED_TOKENS_PER_CALL * 2
        )
      }

      // 3. Get conversation history
      const history = await this.buildConversationHistory(input.sessionId)
      const turnNumber = history.length + 1

      // 4. Detect intent
      const { intent, action, tokensUsed: intentTokens } = await this.intentDetector.detect(
        input.messageContent,
        history,
        {
          systemPrompt: agentConfig.intentDetector.systemPrompt,
          model: agentConfig.intentDetector.model,
          thresholds: agentConfig.confidenceThresholds,
        }
      )

      // 5. Record user turn
      await this.sessionManager.addTurn({
        sessionId: input.sessionId,
        turnNumber,
        role: 'user',
        content: input.messageContent,
        intentDetected: intent.intent,
        confidence: intent.confidence,
        tokensUsed: intentTokens,
      })

      // 6. Emit agent/customer.message event for timer cancellation
      await this.emitCustomerMessageEvent(input, session)

      // 7. Update intents_vistos
      await this.sessionManager.addIntentSeen(input.sessionId, intent.intent)

      // 8. Handle handoff action
      if (action === 'handoff') {
        const response = await this.handleHandoff(session, intent)
        await this.recordAssistantTurn(input.sessionId, turnNumber + 1, response, [])
        return response
      }

      // 9. Handle clarify action
      if (action === 'clarify') {
        const response = await this.handleClarification(session, intent)
        await this.recordAssistantTurn(input.sessionId, turnNumber + 1, response, [])
        return response
      }

      // 10. Orchestrate response
      const { result: orchestratorResult, tokensUsed: orchestratorTokens } =
        await this.orchestrator.orchestrate(
          {
            intent,
            action,
            message: input.messageContent,
            history,
            sessionState: session.state,
            currentMode: session.current_mode,
          },
          {
            systemPrompt: agentConfig.orchestrator.systemPrompt,
            model: agentConfig.orchestrator.model,
            tools: agentConfig.tools,
          }
        )

      // 11. Execute tools if requested
      let toolResults: ToolExecutionResultFormatted[] = []
      let toolCalls: TurnToolCall[] = []
      if (orchestratorResult.action === 'execute_tool' && orchestratorResult.toolCalls) {
        const execution = await this.executeTools(
          orchestratorResult.toolCalls,
          input.workspaceId,
          input.sessionId
        )
        toolResults = execution.results
        toolCalls = execution.calls
      }

      // 12. Update session state with version check
      const newMode = orchestratorResult.nextMode ?? session.current_mode
      const newState = this.computeNewState(session.state, intent, toolResults)
      try {
        await this.sessionManager.updateSessionWithVersion(
          input.sessionId,
          session.version,
          {
            currentMode: newMode,
            lastActivityAt: new Date().toISOString(),
          }
        )
        if (Object.keys(newState).length > 0) {
          await this.sessionManager.updateState(input.sessionId, newState)
        }
      } catch (error) {
        if (error instanceof VersionConflictError) {
          if (retryCount < MAX_VERSION_CONFLICT_RETRIES) {
            logger.warn(
              { sessionId: input.sessionId, retryCount },
              'Version conflict, retrying'
            )
            return this.processMessageWithRetry(input, retryCount + 1)
          }
          throw error
        }
        throw error
      }

      // 13. Emit mode transition events for timer workflows
      await this.emitModeTransitionEvent(input, previousMode, newMode)

      // 14. Record assistant turn
      const toolCallRecords: ToolCallRecord[] = toolCalls.map((tc) => ({
        name: tc.name,
        input: tc.input,
        result: tc.success
          ? { success: true, data: tc.result }
          : { success: false, error: { code: 'EXECUTION_ERROR', message: String(tc.result) } },
      }))

      await this.sessionManager.addTurn({
        sessionId: input.sessionId,
        turnNumber: turnNumber + 1,
        role: 'assistant',
        content: orchestratorResult.response ?? '',
        toolsCalled: toolCallRecords,
        tokensUsed: orchestratorTokens,
      })

      logger.info(
        {
          sessionId: input.sessionId,
          intent: intent.intent,
          action: orchestratorResult.action,
          toolCallCount: toolCalls.length,
          totalTokens: intentTokens + orchestratorTokens,
        },
        'Message processed successfully'
      )

      return {
        response: orchestratorResult.response,
        toolResults: toolCallRecords,
        sessionUpdated: true,
        newMode: orchestratorResult.nextMode,
        tokensUsed: intentTokens + orchestratorTokens,
      }
    } catch (error) {
      if (error instanceof VersionConflictError && retryCount < MAX_VERSION_CONFLICT_RETRIES) {
        logger.warn({ sessionId: input.sessionId, retryCount }, 'Version conflict, retrying')
        return this.processMessageWithRetry(input, retryCount + 1)
      }
      throw error
    }
  }

  // ============================================================================
  // Inngest Event Emission
  // ============================================================================

  /**
   * Emit agent/customer.message event when user turn is recorded.
   * This allows timer workflows to cancel pending timeouts.
   */
  private async emitCustomerMessageEvent(
    input: ProcessMessageInput,
    session: AgentSessionWithState
  ): Promise<void> {
    try {
      // Dynamic import to avoid circular dependency
      // inngest/client.ts will be created in Plan 13-06
      const { inngest } = await import('@/inngest/client')

      await inngest.send({
        name: 'agent/customer.message',
        data: {
          sessionId: input.sessionId,
          conversationId: input.conversationId,
          contactId: input.contactId,
          workspaceId: session.workspace_id,
          messageContent: input.messageContent,
        },
      })

      logger.debug({ sessionId: input.sessionId }, 'Emitted agent/customer.message event')
    } catch (error) {
      // Non-critical - log but don't fail message processing
      // This will fail until Plan 13-06 creates the inngest client
      logger.warn({ error, sessionId: input.sessionId }, 'Failed to emit customer.message event')
    }
  }

  /**
   * Emit mode transition events when session mode changes.
   * Triggers timer workflows for collecting_data and ofrecer_promos modes.
   */
  private async emitModeTransitionEvent(
    input: ProcessMessageInput,
    previousMode: string,
    newMode: string
  ): Promise<void> {
    // Only emit if mode actually changed
    if (previousMode === newMode) return

    try {
      // Dynamic import to avoid circular dependency
      const { inngest } = await import('@/inngest/client')

      // Emit collecting_data.started when transitioning TO collecting_data
      if (newMode === 'collecting_data' && previousMode !== 'collecting_data') {
        await inngest.send({
          name: 'agent/collecting_data.started',
          data: {
            sessionId: input.sessionId,
            conversationId: input.conversationId,
            workspaceId: input.workspaceId,
          },
        })
        logger.info({ sessionId: input.sessionId }, 'Emitted agent/collecting_data.started event')
      }

      // Emit promos.offered when transitioning TO ofrecer_promos
      if (newMode === 'ofrecer_promos' && previousMode !== 'ofrecer_promos') {
        await inngest.send({
          name: 'agent/promos.offered',
          data: {
            sessionId: input.sessionId,
            conversationId: input.conversationId,
            workspaceId: input.workspaceId,
            packOptions: ['1x', '2x', '3x'], // Default pack options
          },
        })
        logger.info({ sessionId: input.sessionId }, 'Emitted agent/promos.offered event')
      }
    } catch (error) {
      // Non-critical - log but don't fail message processing
      logger.warn({ error, sessionId: input.sessionId, newMode }, 'Failed to emit mode transition event')
    }
  }

  // ============================================================================
  // Session Management
  // ============================================================================

  /**
   * Create a new session for a conversation.
   */
  async createSession(params: CreateSessionParams): Promise<AgentSessionWithState> {
    // Verify agent exists
    if (!agentRegistry.has(params.agentId)) {
      throw new AgentNotFoundError(params.agentId)
    }

    return this.sessionManager.createSession(params)
  }

  /**
   * Get or create session for a conversation.
   * Returns existing active session or creates new one.
   */
  async getOrCreateSession(
    agentId: string,
    conversationId: string,
    contactId: string,
    workspaceId: string
  ): Promise<AgentSessionWithState> {
    // Try to find existing active session
    const existing = await this.sessionManager.getSessionByConversation(
      conversationId,
      agentId
    )

    if (existing) {
      return existing
    }

    // Create new session
    return this.createSession({
      agentId,
      conversationId,
      contactId,
      workspaceId,
    })
  }

  /**
   * Close a session.
   */
  async closeSession(sessionId: string): Promise<void> {
    const session = await this.sessionManager.getSession(sessionId)
    await this.sessionManager.closeSession(sessionId, session.version)
    logger.info({ sessionId }, 'Session closed')
  }

  /**
   * Hand off session to human agent.
   */
  async handoffSession(sessionId: string): Promise<void> {
    const session = await this.sessionManager.getSession(sessionId)
    await this.sessionManager.handoffSession(sessionId, session.version)
    logger.info({ sessionId }, 'Session handed off to human')
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Build conversation history from turns.
   */
  private async buildConversationHistory(sessionId: string): Promise<ClaudeMessage[]> {
    const turns = await this.sessionManager.getTurns(sessionId)

    return turns
      .filter((turn) => turn.role !== 'system')
      .map((turn) => ({
        role: turn.role as 'user' | 'assistant',
        content: turn.content,
      }))
  }

  /**
   * Execute tools via Action DSL.
   */
  private async executeTools(
    toolCalls: Array<{ name: string; input: Record<string, unknown> }>,
    workspaceId: string,
    sessionId: string
  ): Promise<{
    results: ToolExecutionResultFormatted[]
    calls: TurnToolCall[]
  }> {
    const results: ToolExecutionResultFormatted[] = []
    const calls: TurnToolCall[] = []

    for (const call of toolCalls) {
      try {
        const result: ToolExecutionResult = await executeToolFromAgent(
          call.name,
          call.input,
          workspaceId,
          sessionId,
          sessionId // agentSessionId = sessionId
        )

        const success = result.status === 'success' || result.status === 'dry_run'

        results.push({
          name: call.name,
          success,
          data: success ? result.outputs : undefined,
          error: !success && result.error
            ? {
                code: result.error.code ?? 'UNKNOWN',
                message: result.error.message ?? 'Unknown error',
                retryable: false,
              }
            : undefined,
        })

        calls.push({
          name: call.name,
          input: call.input,
          result: result.outputs,
          success,
        })

        logger.debug(
          { tool: call.name, success },
          'Tool executed'
        )
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        results.push({
          name: call.name,
          success: false,
          error: {
            code: 'EXECUTION_ERROR',
            message: errorMessage,
            retryable: false,
          },
        })
        calls.push({
          name: call.name,
          input: call.input,
          result: { error: errorMessage },
          success: false,
        })
        logger.error({ tool: call.name, error: errorMessage }, 'Tool execution failed')
      }
    }

    return { results, calls }
  }

  /**
   * Handle handoff to human agent.
   */
  private async handleHandoff(
    session: AgentSessionWithState,
    intent: IntentResult
  ): Promise<AgentResponse> {
    await this.sessionManager.handoffSession(session.id, session.version)

    return {
      response: 'Voy a transferirte con un asesor humano para atenderte mejor. Un momento por favor.',
      toolResults: [],
      sessionUpdated: true,
      tokensUsed: 0,
    }
  }

  /**
   * Handle clarification request.
   */
  private async handleClarification(
    session: AgentSessionWithState,
    intent: IntentResult
  ): Promise<AgentResponse> {
    let response: string

    if (intent.alternatives && intent.alternatives.length > 0) {
      const alt = intent.alternatives[0]
      response = `Disculpa, no estoy seguro si te refieres a ${intent.intent} o a ${alt.intent}. Podrias ser mas especifico?`
    } else {
      response = 'Disculpa, no entendi bien tu mensaje. Podrias explicarme con mas detalle?'
    }

    return {
      response,
      toolResults: [],
      sessionUpdated: false,
      tokensUsed: 0,
    }
  }

  /**
   * Compute new session state after processing.
   */
  private computeNewState(
    currentState: SessionState,
    intent: IntentResult,
    toolResults: ToolExecutionResultFormatted[]
  ): Partial<SessionState> {
    const updates: Partial<SessionState> = {}

    // Extract captured data from tool results
    const contactCreateResult = toolResults.find(
      (r) => r.name === 'crm.contact.create' && r.success
    )
    if (contactCreateResult?.data && typeof contactCreateResult.data === 'object') {
      const data = contactCreateResult.data as Record<string, unknown>
      const newData: Record<string, string> = {}
      if (data.name) newData.nombre = String(data.name)
      if (data.phone) newData.telefono = String(data.phone)
      if (data.city) newData.ciudad = String(data.city)
      if (data.address) newData.direccion = String(data.address)

      if (Object.keys(newData).length > 0) {
        updates.datos_capturados = {
          ...currentState.datos_capturados,
          ...newData,
        }
      }
    }

    // Extract from contact update result
    const contactUpdateResult = toolResults.find(
      (r) => r.name === 'crm.contact.update' && r.success
    )
    if (contactUpdateResult?.data && typeof contactUpdateResult.data === 'object') {
      const data = contactUpdateResult.data as Record<string, unknown>
      const newData: Record<string, string> = {}
      if (data.name) newData.nombre = String(data.name)
      if (data.phone) newData.telefono = String(data.phone)
      if (data.city) newData.ciudad = String(data.city)
      if (data.address) newData.direccion = String(data.address)

      if (Object.keys(newData).length > 0) {
        updates.datos_capturados = {
          ...currentState.datos_capturados,
          ...updates.datos_capturados,
          ...newData,
        }
      }
    }

    // Check for pack selection from intent
    if (intent.intent === 'seleccion_pack') {
      // The pack might be in the intent's reasoning or extracted from message
      // This would be enhanced with actual pack extraction logic
    }

    return updates
  }

  /**
   * Record an assistant turn.
   */
  private async recordAssistantTurn(
    sessionId: string,
    turnNumber: number,
    response: AgentResponse,
    toolCalls: TurnToolCall[]
  ): Promise<void> {
    const toolCallRecords: ToolCallRecord[] = toolCalls.map((tc) => ({
      name: tc.name,
      input: tc.input,
      result: tc.success
        ? { success: true, data: tc.result }
        : { success: false, error: { code: 'EXECUTION_ERROR', message: String(tc.result) } },
    }))

    await this.sessionManager.addTurn({
      sessionId,
      turnNumber,
      role: 'assistant',
      content: response.response ?? '',
      toolsCalled: toolCallRecords,
      tokensUsed: response.tokensUsed ?? 0,
    })
  }
}
