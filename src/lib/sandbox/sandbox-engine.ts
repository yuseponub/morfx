/**
 * Sandbox Engine
 * Phase 15: Agent Sandbox
 *
 * In-memory engine wrapper that uses Somnio components without
 * writing to the real database. Simulates full agent flow.
 */

import { ClaudeClient } from '@/lib/agents/claude-client'
import { IntentDetector } from '@/lib/agents/intent-detector'
import { SomnioOrchestrator } from '@/lib/agents/somnio/somnio-orchestrator'
import { somnioAgentConfig } from '@/lib/agents/somnio/config'
import { agentRegistry } from '@/lib/agents/registry'
import { mergeExtractedData } from '@/lib/agents/somnio/data-extractor'
import type { SandboxState, SandboxEngineResult, DebugTurn, ToolExecution, IntentInfo } from './types'

/**
 * SandboxEngine: Processes messages using Somnio agent components
 * but stores all state in memory (no database writes).
 *
 * Key differences from real SomnioEngine:
 * - No SessionManager (state passed in/out)
 * - No MessageSequencer (returns messages array, caller handles delays)
 * - No OrderCreator (returns shouldCreateOrder flag, never creates real orders)
 */
export class SandboxEngine {
  private claudeClient: ClaudeClient
  private intentDetector: IntentDetector
  private orchestrator: SomnioOrchestrator

  constructor() {
    this.claudeClient = new ClaudeClient()
    this.intentDetector = new IntentDetector(this.claudeClient)
    this.orchestrator = new SomnioOrchestrator(this.claudeClient)
  }

  /**
   * Get initial state for a new sandbox session.
   */
  getInitialState(): SandboxState {
    return {
      currentMode: somnioAgentConfig.initialState,
      intentsVistos: [],
      templatesEnviados: [],
      datosCapturados: {},
      packSeleccionado: null,
    }
  }

  /**
   * Process a customer message through the Somnio agent.
   *
   * @param message - Customer message content
   * @param currentState - Current sandbox state
   * @param history - Conversation history
   * @param turnNumber - Current turn number (for debug tracking)
   */
  async processMessage(
    message: string,
    currentState: SandboxState,
    history: { role: 'user' | 'assistant'; content: string }[],
    turnNumber: number
  ): Promise<SandboxEngineResult> {
    const tools: ToolExecution[] = []
    let totalTokens = 0

    try {
      const agentConfig = agentRegistry.get(somnioAgentConfig.id)

      // 1. Detect intent
      const { intent, action, tokensUsed: intentTokens } = await this.intentDetector.detect(
        message,
        history,
        {
          systemPrompt: agentConfig.intentDetector.systemPrompt,
          model: agentConfig.intentDetector.model,
          thresholds: agentConfig.confidenceThresholds,
        }
      )
      totalTokens += intentTokens

      const intentInfo: IntentInfo = {
        intent: intent.intent,
        confidence: intent.confidence,
        alternatives: intent.alternatives,
        reasoning: intent.reasoning,
        timestamp: new Date().toISOString(),
      }

      // 2. Update intents_vistos
      const newIntentsVistos = [...currentState.intentsVistos]
      if (!newIntentsVistos.includes(intent.intent)) {
        newIntentsVistos.push(intent.intent)
      }

      // 3. Handle handoff
      if (action === 'handoff') {
        const handoffState: SandboxState = {
          ...currentState,
          currentMode: 'handoff',
          intentsVistos: newIntentsVistos,
        }

        const debugTurn: DebugTurn = {
          turnNumber,
          intent: intentInfo,
          tools: [],
          tokens: { turnNumber, tokensUsed: totalTokens, timestamp: new Date().toISOString() },
          stateAfter: handoffState,
        }

        return {
          success: true,
          messages: ['Voy a transferirte con un asesor humano para atenderte mejor. Un momento por favor.'],
          debugTurn,
          newState: handoffState,
        }
      }

      // 4. Build mock session for orchestrator
      const mockSession = {
        id: 'sandbox-session',
        agent_id: somnioAgentConfig.id,
        conversation_id: 'sandbox-conversation',
        contact_id: 'sandbox-contact',
        workspace_id: 'sandbox-workspace',
        version: 1,
        status: 'active' as const,
        current_mode: currentState.currentMode,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
        state: {
          session_id: 'sandbox-session',
          intents_vistos: newIntentsVistos.map((i, idx) => ({
            intent: i,
            orden: idx + 1,
            timestamp: new Date().toISOString(),
          })),
          templates_enviados: currentState.templatesEnviados,
          datos_capturados: currentState.datosCapturados,
          pack_seleccionado: currentState.packSeleccionado,
          proactive_started_at: null,
          first_data_at: null,
          min_data_at: null,
          ofrecer_promos_at: null,
          updated_at: new Date().toISOString(),
        },
      }

      // 5. Orchestrate response
      const orchestratorResult = await this.orchestrator.orchestrate(
        intent,
        mockSession,
        message,
        history
      )
      totalTokens += orchestratorResult.tokensUsed ?? 0

      // 6. Build new state
      const newState: SandboxState = {
        currentMode: orchestratorResult.nextMode ?? currentState.currentMode,
        intentsVistos: newIntentsVistos,
        templatesEnviados: orchestratorResult.stateUpdates?.templatesSent
          ? [...currentState.templatesEnviados, ...orchestratorResult.stateUpdates.templatesSent]
          : currentState.templatesEnviados,
        datosCapturados: orchestratorResult.stateUpdates?.datosCapturados
          ? mergeExtractedData(currentState.datosCapturados, orchestratorResult.stateUpdates.datosCapturados)
          : currentState.datosCapturados,
        packSeleccionado: orchestratorResult.stateUpdates?.packSeleccionado ?? currentState.packSeleccionado,
      }

      // 7. Extract response messages
      const messages: string[] = []
      if (orchestratorResult.response) {
        messages.push(orchestratorResult.response)
      }
      if (orchestratorResult.templates) {
        for (const template of orchestratorResult.templates) {
          messages.push(template.content)
        }
      }

      // If shouldCreateOrder is true, add a note (no real order creation)
      if (orchestratorResult.shouldCreateOrder) {
        messages.push('[SANDBOX: Order would be created here with pack: ' + newState.packSeleccionado + ']')
      }

      const debugTurn: DebugTurn = {
        turnNumber,
        intent: intentInfo,
        tools, // Tool executions would be populated if we had tool calls
        tokens: { turnNumber, tokensUsed: totalTokens, timestamp: new Date().toISOString() },
        stateAfter: newState,
      }

      return {
        success: true,
        messages: messages.length > 0 ? messages : ['[No response generated]'],
        debugTurn,
        newState,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      return {
        success: false,
        messages: [],
        debugTurn: {
          turnNumber,
          tools,
          tokens: { turnNumber, tokensUsed: totalTokens, timestamp: new Date().toISOString() },
          stateAfter: currentState,
        },
        newState: currentState,
        error: { code: 'SANDBOX_ERROR', message: errorMessage },
      }
    }
  }
}
