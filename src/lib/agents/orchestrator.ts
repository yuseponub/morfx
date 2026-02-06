/**
 * Orchestrator
 * Phase 13: Agent Engine Core
 *
 * Decides what action to take based on intent, confidence, and session state.
 * Can request tool execution via Action DSL.
 *
 * Architecture decision from CONTEXT.md:
 * - Has overall view of the sales flow
 * - Receives intent + confidence + session state
 * - Decides which components to call based on intent
 * - Validates that the flow is correct (no skipping steps)
 * - Handles edge cases intelligently
 * - Decides handoff when confidence is very low
 */

import { ClaudeClient } from './claude-client'
import type {
  ClaudeMessage,
  ClaudeModel,
  ConfidenceAction,
  IntentResult,
  OrchestratorResult,
  SessionState,
} from './types'
import { AgentError } from './errors'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('orchestrator')

/**
 * Default system prompt for orchestration.
 * Can be overridden per agent in AgentConfig.
 */
export const DEFAULT_ORCHESTRATOR_PROMPT = `Eres el orquestador de un agente de ventas.

CONTEXTO:
- Recibes: intent detectado, confianza, estado de sesion
- Decides: que accion tomar basado en confianza y flujo

REGLAS DE CONFIANZA:
- >= 85%: PROCEDER con flujo normal
- 60-84%: RE-ANALIZAR con mas contexto antes de actuar
- 40-59%: CLARIFICAR pidiendo al cliente mas informacion
- < 40%: HANDOFF a humano (demasiado incierto)

FLUJO DE VENTA:
conversacion -> collecting_data -> ofrecer_promos -> resumen -> compra_confirmada

VALIDACIONES OBLIGATORIAS:
1. NO puedes saltar a "ofrecer_promos" sin datos minimos (nombre, telefono, ciudad, direccion)
2. NO puedes saltar a "resumen" sin haber ofrecido promos
3. NO puedes confirmar compra sin haber enviado resumen

DATOS MINIMOS vs OPCIONALES:
- MINIMOS (requeridos): nombre, telefono, ciudad, direccion
- OPCIONALES: apellido, barrio, departamento, correo

Si faltan solo opcionales, puedes proceder a ofrecer promos.

TEMPLATES ENVIADOS:
No repitas templates. Si ya enviaste un template, usa parafraseo o template de respaldo.

TOOLS DISPONIBLES:
Puedes llamar herramientas del sistema usando tool_use. Los nombres usan guiones bajos.

FORMATO DE RESPUESTA:
Si necesitas llamar tools, usa tool_use blocks.
Si solo respondes texto, responde un JSON:
{
  "action": "proceed" | "reanalyze" | "clarify" | "handoff",
  "response": "texto para el cliente",
  "nextMode": "nuevo modo si cambia"
}

Recuerda: Tu trabajo es ORQUESTAR, no generar la respuesta final.
Decide QUE hacer basado en el contexto completo.
`

/**
 * Orchestration input combining all context.
 */
export interface OrchestrationInput {
  intent: IntentResult
  action: ConfidenceAction
  message: string
  history: ClaudeMessage[]
  sessionState: SessionState
  currentMode: string
}

/**
 * Full orchestration result with metadata.
 */
export interface OrchestrationOutput {
  result: OrchestratorResult
  tokensUsed: number
  transitionValid: boolean
  validationError?: string
}

/**
 * Orchestrator component.
 *
 * Wraps ClaudeClient.orchestrate with:
 * - State transition validation
 * - Flow rule enforcement
 * - Action routing based on confidence
 */
export class Orchestrator {
  private claudeClient: ClaudeClient

  /** Valid state transitions (from CONTEXT.md) */
  private static readonly VALID_TRANSITIONS: Record<string, string[]> = {
    conversacion: ['conversacion', 'collecting_data'],
    collecting_data: ['collecting_data', 'ofrecer_promos'],
    ofrecer_promos: ['ofrecer_promos', 'resumen'],
    resumen: ['resumen', 'compra_confirmada'],
    compra_confirmada: ['compra_confirmada'],
  }

  /** Minimum required data fields */
  private static readonly REQUIRED_DATA_FIELDS = ['nombre', 'telefono', 'ciudad', 'direccion']

  constructor(claudeClient?: ClaudeClient) {
    this.claudeClient = claudeClient ?? new ClaudeClient()
  }

  /**
   * Orchestrate the agent response.
   *
   * @param input All context needed for orchestration
   * @param config Agent configuration (for custom prompt/model/tools)
   * @returns Orchestration result with action and optional tool calls
   */
  async orchestrate(
    input: OrchestrationInput,
    config?: {
      systemPrompt?: string
      model?: ClaudeModel
      tools?: string[]
    }
  ): Promise<OrchestrationOutput> {
    const systemPrompt = config?.systemPrompt ?? DEFAULT_ORCHESTRATOR_PROMPT
    const model = config?.model ?? 'claude-sonnet-4-5'
    const tools = config?.tools ?? []

    logger.debug(
      {
        intent: input.intent.intent,
        action: input.action,
        currentMode: input.currentMode,
        toolCount: tools.length,
      },
      'Starting orchestration'
    )

    // Handle low-confidence actions without calling Claude
    if (input.action === 'handoff') {
      logger.info({ confidence: input.intent.confidence }, 'Handoff triggered by low confidence')
      return {
        result: {
          action: 'handoff',
          response: 'Necesito transferirte con un asesor humano para ayudarte mejor.',
        },
        tokensUsed: 0,
        transitionValid: true,
      }
    }

    if (input.action === 'clarify') {
      logger.info({ confidence: input.intent.confidence }, 'Clarification needed')
      return {
        result: {
          action: 'clarify',
          response: this.generateClarificationResponse(input.intent),
        },
        tokensUsed: 0,
        transitionValid: true,
      }
    }

    // For proceed and reanalyze, call Claude
    try {
      const { result, tokensUsed } = await this.claudeClient.orchestrate(
        systemPrompt,
        input.history,
        input.intent,
        input.sessionState,
        tools,
        model
      )

      // Validate state transition if nextMode is specified
      let transitionValid = true
      let validationError: string | undefined

      if (result.nextMode) {
        const validation = this.validateTransition(
          input.currentMode,
          result.nextMode,
          input.sessionState
        )
        transitionValid = validation.valid
        validationError = validation.error

        if (!transitionValid) {
          logger.warn(
            { from: input.currentMode, to: result.nextMode, error: validationError },
            'Invalid state transition requested'
          )
          // Override the result to stay in current mode
          result.nextMode = input.currentMode
        }
      }

      logger.info(
        {
          action: result.action,
          toolCallCount: result.toolCalls?.length ?? 0,
          nextMode: result.nextMode,
          transitionValid,
          tokensUsed,
        },
        'Orchestration complete'
      )

      return { result, tokensUsed, transitionValid, validationError }
    } catch (error) {
      throw new AgentError(
        `Orchestration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { source: 'orchestrator' }
      )
    }
  }

  /**
   * Validate a state transition.
   */
  validateTransition(
    from: string,
    to: string,
    state: SessionState
  ): { valid: boolean; error?: string } {
    // Check if transition is allowed
    const allowed = Orchestrator.VALID_TRANSITIONS[from]
    if (!allowed || !allowed.includes(to)) {
      return {
        valid: false,
        error: `Transition from "${from}" to "${to}" is not allowed`,
      }
    }

    // Special validation for ofrecer_promos: need minimum data
    if (to === 'ofrecer_promos') {
      const missing = this.getMissingRequiredData(state)
      if (missing.length > 0) {
        return {
          valid: false,
          error: `Cannot transition to ofrecer_promos: missing ${missing.join(', ')}`,
        }
      }
    }

    // Special validation for resumen: need templates_enviados to include promo
    if (to === 'resumen') {
      const hasPromo = state.templates_enviados.some((t) =>
        t.toLowerCase().includes('promo') || t.toLowerCase().includes('ofrecer')
      )
      if (!hasPromo && state.intents_vistos.every((i) => i.intent !== 'ofrecer_promos')) {
        return {
          valid: false,
          error: 'Cannot transition to resumen: must offer promos first',
        }
      }
    }

    // Special validation for compra_confirmada: need resumen sent
    if (to === 'compra_confirmada') {
      const hasResumen = state.templates_enviados.some((t) =>
        t.toLowerCase().includes('resumen')
      )
      if (!hasResumen && !state.intents_vistos.some((i) => i.intent === 'resumen')) {
        return {
          valid: false,
          error: 'Cannot transition to compra_confirmada: must send resumen first',
        }
      }
    }

    return { valid: true }
  }

  /**
   * Get missing required data fields.
   */
  getMissingRequiredData(state: SessionState): string[] {
    return Orchestrator.REQUIRED_DATA_FIELDS.filter(
      (field) => !state.datos_capturados[field]
    )
  }

  /**
   * Check if minimum data is collected.
   */
  hasMinimumData(state: SessionState): boolean {
    return this.getMissingRequiredData(state).length === 0
  }

  /**
   * Generate a clarification response for ambiguous intents.
   */
  private generateClarificationResponse(intent: IntentResult): string {
    // If we have alternatives, mention them
    if (intent.alternatives && intent.alternatives.length > 0) {
      const topAlternative = intent.alternatives[0]
      return `Disculpa, no estoy seguro si te refieres a ${intent.intent} o ${topAlternative.intent}. Podrias ser mas especifico?`
    }

    // Generic clarification
    return 'Disculpa, no entendi bien tu mensaje. Podrias explicarme con mas detalle?'
  }

  /**
   * Get valid next states from current state.
   */
  getValidNextStates(currentMode: string): string[] {
    return Orchestrator.VALID_TRANSITIONS[currentMode] ?? []
  }

  /**
   * Check if a tool call is requested.
   */
  hasToolCalls(result: OrchestratorResult): boolean {
    return result.action === 'execute_tool' && (result.toolCalls?.length ?? 0) > 0
  }
}
