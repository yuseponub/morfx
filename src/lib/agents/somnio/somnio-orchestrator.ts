/**
 * Somnio Orchestrator Component
 * Phase 14: Agente Ventas Somnio - Plan 05
 *
 * The brain of the Somnio agent - decides what to do based on intent,
 * current state, captured data, and transition rules from CONTEXT.md.
 *
 * Responsibilities:
 * - Validate transitions with rules from CONTEXT.md
 * - Extract data in collecting_data mode
 * - Auto-trigger ofrecer_promos at 8 fields
 * - Select templates for intent
 * - Determine next mode based on flow
 * - Signal shouldCreateOrder on compra_confirmada for OrderCreator
 * - Generate tool calls for CRM and WhatsApp
 */

import { Orchestrator } from '../orchestrator'
import { ClaudeClient } from '../claude-client'
import type {
  ClaudeMessage,
  IntentRecord,
  IntentResult,
  OrchestratorAction,
  PackSelection,
  ToolCallRequest,
} from '../types'
import type { AgentSessionWithState } from '../session-manager'
import { createModuleLogger } from '@/lib/audit/logger'
import { DataExtractor, mergeExtractedData, type ExtractedData } from './data-extractor'
import { TemplateManager, type ProcessedTemplate } from './template-manager'
import { TransitionValidator, type TransitionResult } from './transition-validator'
import { somnioAgentConfig, SOMNIO_TRANSITIONS, type SomnioState } from './config'
import { isCombinationIntent, splitCombinationIntent } from './intents'
import type { VariableContext } from './variable-substitutor'

const logger = createModuleLogger('somnio-orchestrator')

// ============================================================================
// Types
// ============================================================================

/**
 * Result from SomnioOrchestrator.orchestrate()
 */
export interface SomnioOrchestratorResult {
  /** Action determined by orchestration */
  action: OrchestratorAction
  /** Intent that was processed */
  intent: string
  /** Response text to send to customer (if any) */
  response?: string
  /** Processed templates to send */
  templates?: ProcessedTemplate[]
  /** Tool calls to execute */
  toolCalls?: ToolCallRequest[]
  /** Next mode to transition to */
  nextMode?: string
  /** State updates to apply */
  stateUpdates?: {
    intentsVistos?: string[]
    templatesSent?: string[]
    datosCapturados?: Record<string, string>
    packSeleccionado?: PackSelection
  }
  /** Whether data should be extracted from message */
  shouldExtractData?: boolean
  /** Data extracted from message (if extraction was performed) */
  extractedData?: ExtractedData
  /** Flag for compra_confirmada to signal order creation */
  shouldCreateOrder?: boolean
  /** Transition validation result */
  transitionResult?: TransitionResult
  /** Total tokens used */
  tokensUsed?: number
}

/**
 * Pack selection patterns for detection.
 */
interface PackPattern {
  pack: PackSelection
  patterns: RegExp[]
}

/**
 * Pack detection patterns.
 */
const PACK_PATTERNS: PackPattern[] = [
  {
    pack: '1x',
    patterns: [
      /\b1x\b/i,
      /\buno\s*solo\b/i,
      /\buna?\s*unidad\b/i,
      /\bel\s*(de)?\s*uno\b/i,
      /\bindividual\b/i,
      /\bsolo\s*uno\b/i,
    ],
  },
  {
    pack: '2x',
    patterns: [
      /\b2x\b/i,
      /\bdos\s*unidades?\b/i,
      /\bel\s*(de)?\s*dos\b/i,
      /\bpack\s*(de)?\s*dos\b/i,
      /\bcombo\s*(de)?\s*dos?\b/i,
      /\bel\s*doble\b/i,
      /\bquiero\s*(el)?\s*2\b/i,
      /\bdame\s*(el)?\s*de?\s*2\b/i,
    ],
  },
  {
    pack: '3x',
    patterns: [
      /\b3x\b/i,
      /\btres\s*unidades?\b/i,
      /\bel\s*(de)?\s*tres\b/i,
      /\bpack\s*(de)?\s*tres\b/i,
      /\bcombo\s*(de)?\s*tres?\b/i,
      /\bel\s*triple\b/i,
      /\bquiero\s*(el)?\s*3\b/i,
      /\bdame\s*(el)?\s*de?\s*3\b/i,
    ],
  },
]

// ============================================================================
// SomnioOrchestrator Class
// ============================================================================

/**
 * Somnio-specific orchestrator extending base Orchestrator with
 * custom flow logic for the Somnio sales agent.
 */
export class SomnioOrchestrator {
  private baseOrchestrator: Orchestrator
  private dataExtractor: DataExtractor
  private templateManager: TemplateManager
  private transitionValidator: TransitionValidator

  constructor(
    claudeClient?: ClaudeClient,
    options?: {
      dataExtractor?: DataExtractor
      templateManager?: TemplateManager
      transitionValidator?: TransitionValidator
    }
  ) {
    this.baseOrchestrator = new Orchestrator(claudeClient)
    this.dataExtractor = options?.dataExtractor ?? new DataExtractor(claudeClient)
    this.templateManager = options?.templateManager ?? new TemplateManager()
    this.transitionValidator = options?.transitionValidator ?? new TransitionValidator()
  }

  /**
   * Main orchestration entry point.
   *
   * @param intent - Detected intent from IntentDetector
   * @param session - Current session with state
   * @param message - Customer's message
   * @param history - Conversation history in Claude format
   * @returns SomnioOrchestratorResult with action, templates, tool calls, etc.
   */
  async orchestrate(
    intent: IntentResult,
    session: AgentSessionWithState,
    message: string,
    history: ClaudeMessage[],
    options?: { skipValidation?: boolean }
  ): Promise<SomnioOrchestratorResult> {
    const currentMode = session.current_mode as SomnioState
    const { state } = session
    let tokensUsed = 0

    logger.info(
      {
        intent: intent.intent,
        confidence: intent.confidence,
        currentMode,
        fieldsCount: Object.keys(state.datos_capturados).length,
      },
      'Starting Somnio orchestration'
    )

    // =========================================================================
    // Step 1: Check auto-triggers (before processing intent)
    // =========================================================================
    const autoTrigger = this.transitionValidator.checkAutoTriggers(
      state.intents_vistos,
      state.datos_capturados
    )

    if (autoTrigger) {
      logger.info({ autoTrigger }, 'Auto-trigger detected')
      // Override intent with auto-triggered intent
      intent = { ...intent, intent: autoTrigger, confidence: 100 }
    }

    // =========================================================================
    // Step 2: Validate transition (skipped for timer-forced intents)
    // =========================================================================
    const transitionResult = options?.skipValidation
      ? { allowed: true as const }
      : this.transitionValidator.validateTransition(
          intent.intent,
          state.intents_vistos,
          currentMode,
          state.datos_capturados
        )

    if (!transitionResult.allowed) {
      logger.warn(
        { intent: intent.intent, reason: transitionResult.reason },
        'Transition blocked'
      )

      // Return clarification response
      return {
        action: 'clarify',
        intent: intent.intent,
        response: this.buildBlockedTransitionResponse(intent.intent, transitionResult),
        transitionResult,
        tokensUsed: 0,
      }
    }

    // =========================================================================
    // Step 3: Handle collecting_data mode - extract data from message
    // =========================================================================
    let extractedData: ExtractedData | undefined
    let shouldExtractData = false

    if (currentMode === 'collecting_data') {
      shouldExtractData = true
      const extraction = await this.handleCollectingDataMode(
        session,
        message,
        history
      )
      extractedData = extraction.extracted.normalized
      tokensUsed += extraction.tokensUsed ?? 0
    }

    // =========================================================================
    // Step 4: Detect pack selection
    // =========================================================================
    const packSelection = this.detectPackSelection(message, intent.intent)

    // =========================================================================
    // Step 5: Select and process templates
    // =========================================================================
    const templates = await this.selectTemplates(intent.intent, session)

    // =========================================================================
    // Step 6: Determine next mode
    // =========================================================================
    const nextMode = this.determineNextMode(
      intent.intent,
      currentMode,
      state.datos_capturados
    )

    // =========================================================================
    // Step 7: Check for compra_confirmada (order creation trigger)
    // =========================================================================
    const shouldCreateOrder = intent.intent === 'compra_confirmada'

    if (shouldCreateOrder) {
      logger.info(
        { sessionId: session.id, pack: state.pack_seleccionado },
        'Order creation triggered via compra_confirmada'
      )
    }

    // =========================================================================
    // Step 8: Build tool calls
    // =========================================================================
    const toolCalls = this.buildToolCalls(
      intent.intent,
      session,
      extractedData,
      shouldCreateOrder
    )

    // =========================================================================
    // Step 9: Build state updates
    // =========================================================================
    const stateUpdates = this.buildStateUpdates(
      intent.intent,
      templates,
      extractedData,
      packSelection
    )

    // =========================================================================
    // Step 10: Determine action type
    // =========================================================================
    const action = this.determineAction(intent, shouldCreateOrder, toolCalls)

    logger.info(
      {
        action,
        intent: intent.intent,
        nextMode,
        templatesCount: templates.length,
        toolCallsCount: toolCalls.length,
        shouldCreateOrder,
        tokensUsed,
      },
      'Somnio orchestration complete'
    )

    return {
      action,
      intent: intent.intent,
      templates,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      nextMode,
      stateUpdates,
      shouldExtractData,
      extractedData,
      shouldCreateOrder,
      transitionResult,
      tokensUsed,
    }
  }

  /**
   * Handle data extraction in collecting_data mode.
   */
  private async handleCollectingDataMode(
    session: AgentSessionWithState,
    message: string,
    history: ClaudeMessage[]
  ): Promise<{ extracted: Awaited<ReturnType<DataExtractor['extract']>>; nextMode?: string; tokensUsed?: number }> {
    const result = await this.dataExtractor.extract(
      message,
      session.state.datos_capturados,
      history
    )

    logger.debug(
      {
        extractedFields: Object.keys(result.normalized),
        negations: result.negations,
      },
      'Data extraction complete'
    )

    return {
      extracted: result,
      tokensUsed: result.tokensUsed ?? 0,
    }
  }

  /**
   * Select and process templates for the intent.
   */
  private async selectTemplates(
    intent: string,
    session: AgentSessionWithState
  ): Promise<ProcessedTemplate[]> {
    // Handle combination intents (hola+precio -> [hola, precio])
    const intentsToFetch = isCombinationIntent(intent)
      ? splitCombinationIntent(intent).filter((i): i is string => i !== null)
      : [intent]

    // Build variable context for substitution
    const context: VariableContext = {
      nombre: session.state.datos_capturados.nombre,
      ciudad: session.state.datos_capturados.ciudad,
      packSeleccionado: (session.state.pack_seleccionado ?? undefined) as '1x' | '2x' | '3x' | undefined,
    }

    // Fetch templates for all intents
    const templateMap = await this.templateManager.getTemplatesForIntents(
      somnioAgentConfig.id,
      intentsToFetch,
      session.state.intents_vistos,
      session.state.templates_enviados
    )

    // DEBUG: log template selection details
    for (const [intentKey, selection] of templateMap.entries()) {
      logger.info(
        {
          intentKey,
          visitType: selection.visitType,
          rawCount: selection.templates.length,
          alreadySent: selection.alreadySent.length,
          intentsToFetch,
          intentsVistos: session.state.intents_vistos.length,
        },
        'Template selection detail'
      )
    }

    // Combine and process all templates
    const allTemplates: ProcessedTemplate[] = []
    for (const selection of templateMap.values()) {
      const processed = this.templateManager.processTemplates(selection.templates, context)
      allTemplates.push(...processed)
    }

    // Sort by orden
    allTemplates.sort((a, b) => a.orden - b.orden)

    return allTemplates
  }

  /**
   * Determine next mode based on intent and current state.
   */
  private determineNextMode(
    intent: string,
    currentMode: SomnioState,
    datosCapturados: Record<string, string>
  ): string | undefined {
    // Intent-based mode transitions
    const modeMap: Record<string, SomnioState> = {
      captura_datos_si_compra: 'collecting_data',
      'hola+captura_datos_si_compra': 'collecting_data',
      ofrecer_promos: 'ofrecer_promos',
      resumen_1x: 'resumen',
      resumen_2x: 'resumen',
      resumen_3x: 'resumen',
      compra_confirmada: 'confirmado',
      fallback: 'handoff',
      no_interesa: 'handoff',
    }

    const targetMode = modeMap[intent]
    if (!targetMode) {
      return undefined // Stay in current mode
    }

    // Validate transition is allowed
    const allowedTransitions = SOMNIO_TRANSITIONS[currentMode]
    if (allowedTransitions?.includes(targetMode)) {
      return targetMode
    }

    // Transition not allowed, stay in current mode
    logger.debug(
      { from: currentMode, to: targetMode, intent },
      'Mode transition not allowed by state machine'
    )
    return undefined
  }

  /**
   * Detect pack selection from message or intent.
   */
  private detectPackSelection(message: string, intent: string): PackSelection | undefined {
    // Check intent name first
    if (intent === 'resumen_1x') return '1x'
    if (intent === 'resumen_2x') return '2x'
    if (intent === 'resumen_3x') return '3x'

    // Check message patterns
    for (const { pack, patterns } of PACK_PATTERNS) {
      for (const pattern of patterns) {
        if (pattern.test(message)) {
          logger.debug({ pack, pattern: pattern.toString() }, 'Pack detected from message')
          return pack
        }
      }
    }

    return undefined
  }

  /**
   * Build tool calls based on intent and state.
   */
  private buildToolCalls(
    intent: string,
    session: AgentSessionWithState,
    extractedData?: ExtractedData,
    shouldCreateOrder?: boolean
  ): ToolCallRequest[] {
    const toolCalls: ToolCallRequest[] = []
    const { state } = session

    // Contact create/update in collecting_data mode
    if (extractedData && Object.keys(extractedData).length > 0) {
      // Merge with existing data for the update
      const mergedData = mergeExtractedData(state.datos_capturados, extractedData)

      toolCalls.push({
        name: 'crm.contact.update',
        input: {
          contactId: session.contact_id,
          data: {
            name: mergedData.nombre,
            phone: mergedData.telefono,
            city: mergedData.ciudad,
            customFields: {
              direccion: mergedData.direccion,
              departamento: mergedData.departamento,
              barrio: mergedData.barrio,
              indicaciones_extra: mergedData.indicaciones_extra,
            },
          },
        },
      })
    }

    // Order creation on compra_confirmada
    // NOTE: This is a signal - the actual order.create call is handled by SomnioEngine
    // using OrderCreator to ensure proper order line item handling
    if (shouldCreateOrder) {
      // The crm.order.create tool call will be generated by SomnioEngine
      // based on shouldCreateOrder flag and current pack selection
      // This is intentional - we don't build it here to avoid duplication
      logger.debug(
        { pack: state.pack_seleccionado },
        'Order creation will be handled by SomnioEngine'
      )
    }

    return toolCalls
  }

  /**
   * Build state updates to apply after orchestration.
   */
  private buildStateUpdates(
    intent: string,
    templates: ProcessedTemplate[],
    extractedData?: ExtractedData,
    packSelection?: PackSelection
  ): SomnioOrchestratorResult['stateUpdates'] {
    const updates: SomnioOrchestratorResult['stateUpdates'] = {}

    // Add intent to vistos
    updates.intentsVistos = [intent]

    // Add templates to enviados
    if (templates.length > 0) {
      updates.templatesSent = templates.map(t => t.id)
    }

    // Update captured data
    if (extractedData && Object.keys(extractedData).length > 0) {
      updates.datosCapturados = extractedData as Record<string, string>
    }

    // Update pack selection
    if (packSelection) {
      updates.packSeleccionado = packSelection
    }

    return updates
  }

  /**
   * Determine action type based on intent and results.
   */
  private determineAction(
    intent: IntentResult,
    shouldCreateOrder: boolean,
    toolCalls: ToolCallRequest[]
  ): OrchestratorAction {
    // Handoff for fallback or very low confidence
    if (intent.intent === 'fallback' || intent.confidence < 40) {
      return 'handoff'
    }

    // Execute tool if we have tool calls
    if (toolCalls.length > 0 || shouldCreateOrder) {
      return 'execute_tool'
    }

    // Default to proceed
    return 'proceed'
  }

  /**
   * Build response for blocked transitions.
   */
  private buildBlockedTransitionResponse(
    intent: string,
    result: TransitionResult
  ): string {
    // Blocked resumen without ofrecer_promos
    if (intent.startsWith('resumen_') && result.suggestedIntent === 'ofrecer_promos') {
      return 'Primero dejame mostrarte las promociones disponibles para que elijas la que mas te convenga.'
    }

    // Blocked compra_confirmada without resumen
    if (intent === 'compra_confirmada') {
      return 'Antes de confirmar, necesito que elijas cual pack te gustaria llevar. Tenemos opciones de 1, 2 y 3 unidades con descuentos especiales.'
    }

    // Generic blocked response
    return result.reason ?? 'No puedo procesar esta solicitud en este momento.'
  }

  /**
   * Get the transition validator (for testing or external use).
   */
  getTransitionValidator(): TransitionValidator {
    return this.transitionValidator
  }

  /**
   * Get the data extractor (for testing or external use).
   */
  getDataExtractor(): DataExtractor {
    return this.dataExtractor
  }

  /**
   * Get the template manager (for testing or external use).
   */
  getTemplateManager(): TemplateManager {
    return this.templateManager
  }
}
