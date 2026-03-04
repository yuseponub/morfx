/**
 * Somnio v2 Engine - Minimal Sandbox Runner
 *
 * Thin engine for sandbox-only v2 agent testing.
 * Does NOT reuse UnifiedEngine (that's tightly coupled to SomnioAgent v1).
 *
 * Handles bidirectional mapping: SandboxState ↔ AgentState
 * via _v2: prefixed keys in datosCapturados.
 */

import { SomnioV2Agent } from './somnio-v2-agent'
import type { SandboxState, DebugTurn } from '@/lib/sandbox/types'
import type { PackSelection } from '@/lib/agents/types'

export interface V2EngineInput {
  message: string
  state: SandboxState
  history: { role: 'user' | 'assistant'; content: string }[]
  turnNumber: number
  workspaceId: string
}

export interface V2EngineOutput {
  success: boolean
  messages: string[]
  newState: SandboxState
  debugTurn: DebugTurn
  error?: { code: string; message: string }
  timerSignal?: unknown
  silenceDetected?: boolean
}

export class SomnioV2Engine {
  private agent = new SomnioV2Agent()

  async processMessage(input: V2EngineInput): Promise<V2EngineOutput> {
    const timestamp = new Date().toISOString()

    try {
      const output = await this.agent.processMessage({
        message: input.message,
        currentMode: input.state.currentMode,
        intentsVistos: input.state.intentsVistos ?? [],
        templatesEnviados: input.state.templatesEnviados ?? [],
        datosCapturados: input.state.datosCapturados ?? {},
        packSeleccionado: input.state.packSeleccionado ?? null,
        history: input.history,
        turnNumber: input.turnNumber,
        workspaceId: input.workspaceId,
      })

      const newState: SandboxState = {
        currentMode: output.newMode ?? input.state.currentMode,
        intentsVistos: output.intentsVistos,
        templatesEnviados: output.templatesEnviados,
        datosCapturados: output.datosCapturados,
        packSeleccionado: output.packSeleccionado as PackSelection | null,
      }

      return {
        success: output.success,
        messages: output.messages,
        newState,
        debugTurn: {
          turnNumber: input.turnNumber,
          intent: {
            intent: output.intentInfo.intent,
            confidence: output.intentInfo.confidence,
            reasoning: output.intentInfo.reasoning,
            timestamp: output.intentInfo.timestamp,
          },
          tools: [],
          tokens: {
            turnNumber: input.turnNumber,
            tokensUsed: output.totalTokens,
            models: [{
              model: 'claude-haiku-4-5' as const,
              inputTokens: Math.round(output.totalTokens * 0.7),
              outputTokens: Math.round(output.totalTokens * 0.3),
            }],
            timestamp,
          },
          stateAfter: newState,
          // V2 classification for debug panel (Classify tab)
          // Uses the DECISION action (Capa 3), not Claude's category (Capa 1)
          classification: output.decisionInfo ? {
            category: output.decisionInfo.action === 'silence' ? 'SILENCIOSO'
              : output.decisionInfo.action === 'handoff' ? 'HANDOFF'
              : 'RESPONDIBLE',
            reason: output.decisionInfo.reason,
            rulesChecked: { rule1: false, rule1_5: false, rule2: false, rule3: false },
          } : undefined,
          // V2 orchestration info for Pipeline tab
          orchestration: output.decisionInfo ? {
            nextMode: output.newMode ?? input.state.currentMode,
            previousMode: input.state.currentMode,
            modeChanged: !!output.newMode && output.newMode !== input.state.currentMode,
            shouldCreateOrder: output.decisionInfo.action === 'create_order',
            templatesCount: output.messages.length,
          } : undefined,
        },
        silenceDetected: output.silenceDetected,
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      console.error('[SomnioV2Engine] Error:', error)

      return {
        success: true,
        messages: [`[Error v2] ${errorMsg}`],
        newState: input.state,
        debugTurn: {
          turnNumber: input.turnNumber,
          intent: {
            intent: 'error',
            confidence: 0,
            reasoning: errorMsg,
            timestamp,
          },
          tools: [],
          tokens: {
            turnNumber: input.turnNumber,
            tokensUsed: 0,
            models: [],
            timestamp,
          },
          stateAfter: input.state,
        },
        error: {
          code: 'V2_ENGINE_ERROR',
          message: errorMsg,
        },
      }
    }
  }
}
