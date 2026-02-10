/**
 * Intent Detector
 * Phase 13: Agent Engine Core
 *
 * Classifies customer messages and returns confidence scores.
 * Uses fast Claude model (Haiku) for low latency and cost.
 *
 * Architecture decision from CONTEXT.md:
 * - Detects the intent of the customer message
 * - Returns percentage of confidence (0-100%)
 * - Returns alternatives when there's ambiguity
 * - Does NOT decide the flow, only classifies
 */

import { ClaudeClient } from './claude-client'
import type {
  ClaudeMessage,
  ClaudeModel,
  ConfidenceAction,
  ConfidenceThresholds,
  IntentResult,
  ModelTokenEntry,
} from './types'
import { CLAUDE_MODELS, DEFAULT_CONFIDENCE_THRESHOLDS } from './types'
import { IntentDetectionError } from './errors'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('intent-detector')

/**
 * Default system prompt for intent detection.
 * Can be overridden per agent in AgentConfig.
 */
export const DEFAULT_INTENT_PROMPT = `Eres un clasificador de intents para un agente de ventas.

Tu UNICA tarea es analizar el mensaje del cliente y retornar JSON con:
- intent: el intent detectado
- confidence: porcentaje de confianza (0-100)
- alternatives: array de intents alternativos si hay ambiguedad
- reasoning: breve explicacion de por que elegiste ese intent

INTENTS DISPONIBLES:
- saludo: Cliente saluda o inicia conversacion
- precio: Pregunta sobre precios o costos
- envio: Pregunta sobre envio, delivery o tiempos de entrega
- producto: Pregunta sobre caracteristicas, materiales, tamanos del producto
- promocion: Pregunta sobre promociones, descuentos, ofertas
- datos_cliente: Cliente proporciona datos personales (nombre, direccion, telefono, ciudad)
- seleccion_pack: Cliente selecciona un pack especifico (1x, 2x, 3x)
- confirmar_compra: Cliente confirma que quiere comprar
- cancelar: Cliente quiere cancelar, no esta interesado, rechaza
- duda_general: Pregunta que no encaja en otras categorias
- otro: Mensaje que no es una pregunta ni respuesta clara

REGLAS DE CONFIANZA:
- > 90%: El mensaje es claro y sin ambiguedad
- 70-90%: Bastante seguro pero podria haber otras interpretaciones
- 50-70%: Ambiguo, hay varias interpretaciones posibles
- < 50%: Muy incierto, el mensaje no es claro

RESPONDE SOLO JSON, sin texto adicional ni markdown:
{
  "intent": "string",
  "confidence": number,
  "alternatives": [{"intent": "string", "confidence": number}],
  "reasoning": "breve explicacion"
}

Ejemplos:
- "hola buenas" -> {"intent": "saludo", "confidence": 95, "alternatives": [], "reasoning": "Saludo tipico"}
- "cuanto cuesta?" -> {"intent": "precio", "confidence": 92, "alternatives": [], "reasoning": "Pregunta directa de precio"}
- "ok" -> {"intent": "otro", "confidence": 40, "alternatives": [{"intent": "confirmar_compra", "confidence": 35}], "reasoning": "ok es ambiguo, puede ser confirmacion o acknowledgment"}
- "mi nombre es Juan y vivo en Bogota" -> {"intent": "datos_cliente", "confidence": 95, "alternatives": [], "reasoning": "Proporciona nombre y ciudad"}
`

/**
 * Intent detection result with routing decision.
 */
export interface IntentDetectionResult {
  intent: IntentResult
  action: ConfidenceAction
  tokensUsed: number
  /** Per-model token breakdown from all Claude calls (Phase 15.6) */
  tokenDetails: ModelTokenEntry[]
}

/**
 * Intent Detector component.
 *
 * Wraps ClaudeClient.detectIntent with:
 * - Default prompt management
 * - Confidence-to-action routing
 * - Validation and error handling
 */
export class IntentDetector {
  private claudeClient: ClaudeClient

  constructor(claudeClient?: ClaudeClient) {
    this.claudeClient = claudeClient ?? new ClaudeClient()
  }

  /**
   * Detect intent from customer message.
   *
   * @param message The customer's message
   * @param history Conversation history for context
   * @param config Agent configuration (for custom prompt/model)
   * @returns Intent result with confidence and routing action
   */
  async detect(
    message: string,
    history: ClaudeMessage[],
    config?: {
      systemPrompt?: string
      model?: ClaudeModel
      thresholds?: ConfidenceThresholds
    }
  ): Promise<IntentDetectionResult> {
    const systemPrompt = config?.systemPrompt ?? DEFAULT_INTENT_PROMPT
    const model = config?.model ?? CLAUDE_MODELS.HAIKU
    const thresholds = config?.thresholds ?? DEFAULT_CONFIDENCE_THRESHOLDS

    logger.debug(
      { messageLength: message.length, historyLength: history.length, model },
      'Detecting intent'
    )

    try {
      const { result: intent, tokensUsed, tokenDetail } = await this.claudeClient.detectIntent(
        systemPrompt,
        history,
        message,
        model
      )

      // Collect per-model token details from all Claude calls
      const tokenDetails: ModelTokenEntry[] = [tokenDetail]

      // Validate intent result
      if (!intent.intent || typeof intent.confidence !== 'number') {
        throw new IntentDetectionError(
          'Invalid intent response: missing intent or confidence',
          JSON.stringify(intent)
        )
      }

      // Determine action based on confidence
      const action = this.routeByConfidence(intent.confidence, thresholds)

      logger.info(
        {
          intent: intent.intent,
          confidence: intent.confidence,
          action,
          tokensUsed,
        },
        'Intent detected with action'
      )

      return { intent, action, tokensUsed, tokenDetails }
    } catch (error) {
      if (error instanceof IntentDetectionError) {
        throw error
      }
      throw new IntentDetectionError(
        `Intent detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        undefined
      )
    }
  }

  /**
   * Route to action based on confidence score.
   *
   * Thresholds from CONTEXT.md:
   * >= 85%: PROCEED - execute flow normally
   * 60-84%: REANALYZE - use more context to decide
   * 40-59%: CLARIFY - ask customer for clarification
   * < 40%: HANDOFF - pass to human
   */
  routeByConfidence(
    confidence: number,
    thresholds: ConfidenceThresholds = DEFAULT_CONFIDENCE_THRESHOLDS
  ): ConfidenceAction {
    if (confidence >= thresholds.proceed) {
      return 'proceed'
    }
    if (confidence >= thresholds.reanalyze) {
      return 'reanalyze'
    }
    if (confidence >= thresholds.clarify) {
      return 'clarify'
    }
    return 'handoff'
  }

  /**
   * Check if an intent requires clarification.
   */
  needsClarification(intent: IntentResult, thresholds?: ConfidenceThresholds): boolean {
    const action = this.routeByConfidence(
      intent.confidence,
      thresholds ?? DEFAULT_CONFIDENCE_THRESHOLDS
    )
    return action === 'clarify' || action === 'reanalyze'
  }

  /**
   * Check if an intent should be handed off to human.
   */
  shouldHandoff(intent: IntentResult, thresholds?: ConfidenceThresholds): boolean {
    const action = this.routeByConfidence(
      intent.confidence,
      thresholds ?? DEFAULT_CONFIDENCE_THRESHOLDS
    )
    return action === 'handoff'
  }

  /**
   * Get the best alternative intent if available.
   */
  getBestAlternative(intent: IntentResult): { intent: string; confidence: number } | null {
    if (!intent.alternatives || intent.alternatives.length === 0) {
      return null
    }
    // Return highest confidence alternative
    return intent.alternatives.reduce((best, alt) =>
      alt.confidence > best.confidence ? alt : best
    )
  }
}
