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
import type { SandboxState } from '@/lib/sandbox/types'
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
  debugTurn: {
    turnNumber: number
    intent: {
      intent: string
      confidence: number
      reasoning?: string
      timestamp: string
    }
    tokens: { tokensUsed: number }
  }
  error?: { code: string; message: string }
  timerSignal?: unknown
  silenceDetected?: boolean
}

export class SomnioV2Engine {
  private agent = new SomnioV2Agent()

  async processMessage(input: V2EngineInput): Promise<V2EngineOutput> {
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

      return {
        success: output.success,
        messages: output.messages,
        newState: {
          currentMode: output.newMode ?? input.state.currentMode,
          intentsVistos: output.intentsVistos,
          templatesEnviados: output.templatesEnviados,
          datosCapturados: output.datosCapturados,
          packSeleccionado: output.packSeleccionado as PackSelection | null,
        },
        debugTurn: {
          turnNumber: input.turnNumber,
          intent: output.intentInfo,
          tokens: { tokensUsed: output.totalTokens },
        },
        silenceDetected: output.silenceDetected,
      }
    } catch (error) {
      console.error('[SomnioV2Engine] Error:', error)
      return {
        success: false,
        messages: [],
        newState: input.state,
        debugTurn: {
          turnNumber: input.turnNumber,
          intent: {
            intent: 'error',
            confidence: 0,
            reasoning: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString(),
          },
          tokens: { tokensUsed: 0 },
        },
        error: {
          code: 'V2_ENGINE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      }
    }
  }
}
