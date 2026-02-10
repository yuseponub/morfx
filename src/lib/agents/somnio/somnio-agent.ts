/**
 * Somnio Agent - Single Source of Truth for Business Logic
 * Phase 16.1: Engine Unification - Plan 02
 *
 * Extracted from both SandboxEngine and SomnioEngine into one class.
 * The SomnioAgent owns ALL business logic:
 * - Ingest mode handling (classification, silent accumulation, completion)
 * - Implicit yes detection (datos outside collecting_data)
 * - Intent detection (via IntentDetector)
 * - Orchestration (via SomnioOrchestrator)
 * - State update computation
 * - Order decision (shouldCreateOrder flag)
 * - Timer signal decisions
 * - Debug info collection
 *
 * What the agent does NOT do (adapter territory):
 * - Read/write to DB (storage adapter)
 * - Send actual messages (messaging adapter)
 * - Create actual orders (orders adapter)
 * - Emit Inngest events (timer adapter)
 * - Build DebugTurn objects (debug adapter)
 */

import { ClaudeClient } from '../claude-client'
import { IntentDetector, type IntentDetectionResult } from '../intent-detector'
import { SomnioOrchestrator } from './somnio-orchestrator'
import { IngestManager, type IngestState } from './ingest-manager'
import { MessageClassifier } from './message-classifier'
import { mergeExtractedData, hasCriticalData } from './data-extractor'
import { somnioAgentConfig } from './config'
import { agentRegistry } from '../registry'
import type { AgentSessionLike } from '../engine/types'
import type { ModelTokenEntry, IntentResult } from '../types'

// ============================================================================
// Input / Output Types
// ============================================================================

/**
 * Input for SomnioAgent.processMessage().
 * All data is pre-fetched by the engine via storage adapter.
 */
export interface SomnioAgentInput {
  /** Customer message content */
  message: string
  /** Session data (from storage adapter) */
  session: AgentSessionLike
  /** Conversation history (from storage adapter) */
  history: { role: 'user' | 'assistant'; content: string }[]
  /** Current turn number */
  turnNumber: number
  /** Force a specific intent (timer-triggered or ingest-complete) */
  forceIntent?: string
}

/**
 * Output from SomnioAgent.processMessage().
 * Contains all data needed for the engine to route to adapters.
 */
export interface SomnioAgentOutput {
  success: boolean
  /** Response messages to send (sandbox: display, production: WhatsApp) */
  messages: string[]
  /** Response templates from orchestrator (production needs for MessageSequencer) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  templates?: any[]
  /** Orchestrator intent name (production needs for buildSequence) */
  orchestratorIntent?: string
  /** State updates to persist via storage adapter */
  stateUpdates: {
    newMode?: string
    newIntentsVistos: string[]
    newTemplatesEnviados: string[]
    newDatosCapturados: Record<string, string>
    newPackSeleccionado: unknown
    newIngestStatus?: unknown
  }
  /** Order creation signal */
  shouldCreateOrder: boolean
  /** Order data if shouldCreateOrder is true */
  orderData?: {
    datosCapturados: Record<string, string>
    packSeleccionado: unknown
  }
  /** Timer signals accumulated during processing */
  timerSignals: Array<{ type: 'start' | 'reevaluate' | 'cancel'; reason?: string }>
  /** Total tokens used in this turn */
  totalTokens: number
  /** Per-model token breakdown */
  tokenDetails: ModelTokenEntry[]
  /** Intent info for debug */
  intentInfo?: {
    intent: string
    confidence: number
    alternatives?: Array<{ intent: string; confidence: number }>
    reasoning?: string
    timestamp: string
  }
  /** Tools for debug (from orchestrator/CRM) */
  tools: unknown[]
  /** Error details if processing failed */
  error?: { code: string; message: string }
}

// ============================================================================
// Internal Result Types (explicit return instead of state mutation)
// ============================================================================

/**
 * Result from handleIngestMode.
 * Replaces the old pattern where handleIngestMode mutated currentState.
 */
interface IngestModeResult {
  /** true = handled (return early or state changed), false = no-op */
  handled: boolean
  /** If handled=true and this exists, return this immediately (silent accumulation) */
  earlyReturn?: SomnioAgentOutput
  /** If ingest completed, new mode (e.g., 'ofrecer_promos') */
  modeChanged?: string
  /** Merged datos after extraction */
  updatedData?: Record<string, string>
  /** New IngestStatus for debug tracking */
  updatedIngestStatus?: unknown
  /** Timer signal generated during ingest handling */
  timerSignal?: { type: 'start' | 'reevaluate' | 'cancel'; reason?: string }
}

/**
 * Result from checkImplicitYes.
 * Replaces the old pattern where checkImplicitYes mutated currentState.
 */
interface ImplicitYesResult {
  /** true = handled (return early or state changed), false = no-op */
  handled: boolean
  /** If handled=true and this exists, return this immediately */
  earlyReturn?: SomnioAgentOutput
  /** If all fields arrived at once, new mode */
  modeChanged?: string
  /** Merged datos after extraction */
  updatedData?: Record<string, string>
  /** New IngestStatus for debug tracking */
  updatedIngestStatus?: unknown
  /** Timer signal generated during implicit yes handling */
  timerSignal?: { type: 'start' | 'reevaluate' | 'cancel'; reason?: string }
}

// ============================================================================
// SomnioAgent Class
// ============================================================================

/**
 * Somnio Sales Agent - Business Logic Core.
 *
 * This class contains ALL Somnio-specific flow logic extracted from both
 * SandboxEngine and SomnioEngine. It receives pre-fetched data and produces
 * output signals — the UnifiedEngine handles all I/O via adapters.
 *
 * Constructor creates all Somnio components directly (not injectable per CONTEXT.md).
 */
export class SomnioAgent {
  private claudeClient: ClaudeClient
  private intentDetector: IntentDetector
  private orchestrator: SomnioOrchestrator
  private ingestManager: IngestManager
  private messageClassifier: MessageClassifier

  constructor() {
    this.claudeClient = new ClaudeClient()
    this.intentDetector = new IntentDetector(this.claudeClient)
    this.orchestrator = new SomnioOrchestrator(this.claudeClient)
    this.ingestManager = new IngestManager()
    this.messageClassifier = new MessageClassifier()
  }

  /**
   * Process a customer message through the full Somnio pipeline.
   *
   * Flow (mirrors sandbox-engine.ts — the reference implementation):
   * 1. Get agent config from registry
   * 2. Initialize tracking variables
   * 3. Check ingest mode (if collecting_data)
   * 4. Check implicit yes (if NOT collecting_data AND NOT ofrecer_promos)
   * 5. Detect intent (or force)
   * 6. Update intentsVistos
   * 7. Handle handoff
   * 8. Build mock session for orchestrator (intentsVistos BEFORE current intent)
   * 9. Orchestrate via SomnioOrchestrator
   * 10. Build new state from orchestrator result
   * 11. Timer signal decisions
   * 12. Extract messages
   * 13. Signal order creation
   * 14. Return SomnioAgentOutput
   */
  async processMessage(input: SomnioAgentInput): Promise<SomnioAgentOutput> {
    const tools: unknown[] = []
    let totalTokens = 0
    const tokenDetails: ModelTokenEntry[] = []

    try {
      // 1. Get agent config
      const agentConfig = agentRegistry.get(somnioAgentConfig.id)

      // 2. Initialize mutable tracking variables (explicit, not via state mutation)
      let currentMode = input.session.current_mode ?? 'bienvenida'
      let currentData = { ...input.session.state.datos_capturados }
      let currentIngestStatus: unknown = (input.session.state as unknown as Record<string, unknown>).ingestStatus
      const previousMode = currentMode
      let justCompletedIngest = false
      const timerSignals: Array<{ type: 'start' | 'reevaluate' | 'cancel'; reason?: string }> = []

      // 3. Check ingest mode (if collecting_data)
      if (currentMode === 'collecting_data') {
        const ingestResult = await this.handleIngestMode(
          input, currentMode, currentData, currentIngestStatus, totalTokens, tokenDetails, tools
        )

        if (ingestResult.handled && ingestResult.earlyReturn) {
          return ingestResult.earlyReturn
        }
        if (ingestResult.modeChanged) {
          justCompletedIngest = ingestResult.modeChanged === 'ofrecer_promos'
          currentMode = ingestResult.modeChanged
        }
        if (ingestResult.updatedData) currentData = ingestResult.updatedData
        if (ingestResult.updatedIngestStatus !== undefined) currentIngestStatus = ingestResult.updatedIngestStatus
        if (ingestResult.timerSignal) timerSignals.push(ingestResult.timerSignal)
      }

      // 4. Check implicit yes (if NOT collecting_data AND NOT ofrecer_promos)
      if (currentMode !== 'collecting_data' && currentMode !== 'ofrecer_promos') {
        const implicitResult = await this.checkImplicitYes(
          input, currentMode, currentData, currentIngestStatus, totalTokens, tokenDetails, tools
        )

        if (implicitResult.handled && implicitResult.earlyReturn) {
          return implicitResult.earlyReturn
        }
        if (implicitResult.modeChanged) {
          justCompletedIngest = implicitResult.modeChanged === 'ofrecer_promos'
          currentMode = implicitResult.modeChanged
        }
        if (implicitResult.updatedData) currentData = implicitResult.updatedData
        if (implicitResult.updatedIngestStatus !== undefined) currentIngestStatus = implicitResult.updatedIngestStatus
        if (implicitResult.timerSignal) timerSignals.push(implicitResult.timerSignal)
      }

      // 5. Detect intent (or force)
      let intent: IntentResult
      let action: 'proceed' | 'handoff' | 'clarify' | 'reanalyze'

      if (justCompletedIngest || input.forceIntent) {
        intent = {
          intent: input.forceIntent ?? 'ofrecer_promos',
          confidence: 100,
          alternatives: [],
          reasoning: input.forceIntent
            ? `Timer-triggered: ${input.forceIntent}`
            : 'Auto-triggered: all 8 fields collected',
        }
        action = 'proceed'
      } else {
        const detected = await this.intentDetector.detect(
          input.message,
          input.history,
          {
            systemPrompt: agentConfig.intentDetector.systemPrompt,
            model: agentConfig.intentDetector.model,
            thresholds: agentConfig.confidenceThresholds,
          }
        )
        intent = detected.intent
        action = detected.action
        totalTokens += detected.tokensUsed
        if (detected.tokenDetails) {
          tokenDetails.push(...detected.tokenDetails)
        }
      }

      const intentInfo = {
        intent: intent.intent,
        confidence: intent.confidence,
        alternatives: intent.alternatives ?? [],
        reasoning: intent.reasoning,
        timestamp: new Date().toISOString(),
      }

      // 6. Update intentsVistos
      // CRITICAL: Capture intentsVistos BEFORE adding current intent
      // This is used for mock session building (primera_vez vs siguientes detection)
      const intentsVistosBeforeCurrent = [...(input.session.state.intents_vistos?.map(i => i.intent) ?? [])]
      const newIntentsVistos = [...intentsVistosBeforeCurrent]
      if (!newIntentsVistos.includes(intent.intent)) {
        newIntentsVistos.push(intent.intent)
      }

      // 7. Handle handoff
      if (action === 'handoff') {
        return {
          success: true,
          messages: ['Voy a transferirte con un asesor humano para atenderte mejor. Un momento por favor.'],
          stateUpdates: {
            newMode: 'handoff',
            newIntentsVistos: newIntentsVistos,
            newTemplatesEnviados: input.session.state.templates_enviados ?? [],
            newDatosCapturados: currentData,
            newPackSeleccionado: input.session.state.pack_seleccionado,
            newIngestStatus: currentIngestStatus,
          },
          shouldCreateOrder: false,
          timerSignals: [],
          totalTokens,
          tokenDetails,
          intentInfo,
          tools: [],
        }
      }

      // 8. Build mock session for orchestrator
      // CRITICAL: Use intentsVistosBeforeCurrent (BEFORE adding current intent)
      // so TemplateManager correctly detects primera_vez vs siguientes
      const mockSession = {
        id: input.session.id,
        agent_id: somnioAgentConfig.id,
        conversation_id: input.session.conversation_id,
        contact_id: input.session.contact_id,
        workspace_id: input.session.workspace_id,
        version: input.session.version,
        status: 'active' as const,
        current_mode: currentMode,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
        state: {
          session_id: input.session.id,
          // Use state BEFORE adding current intent - determines primera_vez vs siguientes
          intents_vistos: intentsVistosBeforeCurrent.map((i, idx) => ({
            intent: i,
            orden: idx + 1,
            timestamp: new Date().toISOString(),
          })),
          templates_enviados: input.session.state.templates_enviados ?? [],
          datos_capturados: currentData,
          pack_seleccionado: input.session.state.pack_seleccionado,
          proactive_started_at: input.session.state.proactive_started_at ?? null,
          first_data_at: input.session.state.first_data_at ?? null,
          min_data_at: input.session.state.min_data_at ?? null,
          ofrecer_promos_at: input.session.state.ofrecer_promos_at ?? null,
          updated_at: new Date().toISOString(),
        },
      }

      // 9. Orchestrate response (skip validation for timer-forced intents)
      const orchestratorResult = await this.orchestrator.orchestrate(
        intent,
        // The mock session satisfies all fields the orchestrator actually uses
        // (id, current_mode, state.*, contact_id). AgentSessionWithState extends
        // AgentSession with timestamp fields, but the orchestrator never reads them.
        mockSession as Parameters<typeof this.orchestrator.orchestrate>[1],
        input.message,
        input.history,
        input.forceIntent ? { skipValidation: true } : undefined
      )
      totalTokens += orchestratorResult.tokensUsed ?? 0
      // Approximate per-model detail for orchestrator (doesn't expose input/output split)
      if (orchestratorResult.tokensUsed) {
        tokenDetails.push({
          model: 'claude-sonnet-4-5',
          inputTokens: Math.round((orchestratorResult.tokensUsed ?? 0) * 0.7),
          outputTokens: Math.round((orchestratorResult.tokensUsed ?? 0) * 0.3),
        })
      }

      // 10. Build new state from orchestrator result
      const newMode = orchestratorResult.nextMode ?? currentMode
      const newTemplatesEnviados = orchestratorResult.stateUpdates?.templatesSent
        ? [...(input.session.state.templates_enviados ?? []), ...orchestratorResult.stateUpdates.templatesSent]
        : (input.session.state.templates_enviados ?? [])
      const newDatosCapturados = orchestratorResult.stateUpdates?.datosCapturados
        ? mergeExtractedData(currentData, orchestratorResult.stateUpdates.datosCapturados)
        : currentData
      const newPackSeleccionado = orchestratorResult.stateUpdates?.packSeleccionado ?? input.session.state.pack_seleccionado
      let newIngestStatus = currentIngestStatus

      // 11. Timer signal decisions

      // 11a. Start timer on transition to collecting_data (no prior signal)
      // The normal orchestration flow (captura_datos_si_compra intent) transitions
      // to collecting_data but never emitted a timerSignal. handleIngestMode and
      // checkImplicitYes handle their own signals; this covers the remaining path.
      if (
        timerSignals.length === 0 &&
        newMode === 'collecting_data' &&
        currentMode !== 'collecting_data'
      ) {
        timerSignals.push({ type: 'start' })
        // Initialize ingestStatus so debug panel shows "Activo"
        newIngestStatus = {
          active: true,
          startedAt: new Date().toISOString(),
          firstDataAt: null,
          fieldsAccumulated: [],
          timerType: 'no_data',
          timerExpiresAt: null,
          lastClassification: undefined,
          timeline: [],
        }
      }

      // 11b. Start promo timer after ingest completion (two-step pattern).
      // This intentionally ADDS a 'start' signal after the 'cancel' signal from handleIngestMode.
      // The cancel cleared the ingest timer (levels 0-2); this starts the promo timer (level 3).
      // Step 2 of a two-step signal. See handleIngestMode for step 1.
      // Also covers checkImplicitYes path where no signal was previously set.
      if (justCompletedIngest && newMode === 'ofrecer_promos') {
        timerSignals.push({ type: 'start' })
      }

      // 11c. Re-evaluate timer on any other mode transition
      // e.g., ofrecer_promos -> resumen (start L4), resumen -> confirmado (no level -> stops)
      if (
        timerSignals.length === 0 &&
        previousMode !== newMode
      ) {
        timerSignals.push({ type: 'start' })
      }

      // 12. Extract response messages
      // Skip templates for timer-forced compra_confirmada (order creation only, no dispatch)
      const skipTemplates = input.forceIntent === 'compra_confirmada'
      const messages: string[] = []
      if (!skipTemplates && orchestratorResult.response) {
        messages.push(orchestratorResult.response)
      }
      if (!skipTemplates && orchestratorResult.templates) {
        for (const template of orchestratorResult.templates) {
          messages.push(template.content)
        }
      }

      // 13. Determine shouldCreateOrder
      const shouldCreateOrder = orchestratorResult.shouldCreateOrder === true

      // 14. Return SomnioAgentOutput
      return {
        success: true,
        messages: messages.length > 0 ? messages : ['[No response generated]'],
        templates: orchestratorResult.templates,
        orchestratorIntent: orchestratorResult.intent,
        stateUpdates: {
          newMode,
          newIntentsVistos: newIntentsVistos,
          newTemplatesEnviados: newTemplatesEnviados,
          newDatosCapturados: newDatosCapturados,
          newPackSeleccionado: newPackSeleccionado,
          newIngestStatus: newIngestStatus,
        },
        shouldCreateOrder,
        orderData: shouldCreateOrder
          ? { datosCapturados: newDatosCapturados, packSeleccionado: newPackSeleccionado }
          : undefined,
        timerSignals,
        totalTokens,
        tokenDetails,
        intentInfo,
        tools,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      return {
        success: false,
        messages: [],
        stateUpdates: {
          newMode: input.session.current_mode,
          newIntentsVistos: input.session.state.intents_vistos?.map(i => i.intent) ?? [],
          newTemplatesEnviados: input.session.state.templates_enviados ?? [],
          newDatosCapturados: input.session.state.datos_capturados ?? {},
          newPackSeleccionado: input.session.state.pack_seleccionado,
        },
        shouldCreateOrder: false,
        timerSignals: [],
        totalTokens,
        tokenDetails,
        tools,
        error: { code: 'AGENT_ERROR', message: errorMessage },
      }
    }
  }

  // ============================================================================
  // Ingest Mode Handling
  // ============================================================================

  /**
   * Handle ingest mode during collecting_data.
   *
   * Routes messages through IngestManager for classification and silent accumulation.
   * Returns explicit IngestModeResult instead of mutating state (refactored from
   * SandboxEngine's mutation pattern).
   */
  private async handleIngestMode(
    input: SomnioAgentInput,
    currentMode: string,
    currentData: Record<string, string>,
    currentIngestStatus: unknown,
    totalTokens: number,
    tokenDetails: ModelTokenEntry[],
    tools: unknown[]
  ): Promise<IngestModeResult> {
    const ingestStatusTyped = currentIngestStatus as {
      startedAt?: string | null
      firstDataAt?: string | null
      fieldsAccumulated?: string[]
      timeline?: unknown[]
      [key: string]: unknown
    } | undefined

    // Build ingest state from session
    const ingestState: IngestState = {
      active: true,
      startedAt: ingestStatusTyped?.startedAt ?? null,
      firstDataAt: ingestStatusTyped?.firstDataAt ?? null,
      fieldsCollected: Object.keys(currentData).filter(
        (k) => currentData[k] && currentData[k] !== 'N/A'
      ),
    }

    // Route through IngestManager
    const ingestResult = await this.ingestManager.handleMessage({
      sessionId: input.session.id,
      message: input.message,
      ingestState,
      existingData: currentData,
      conversationHistory: input.history,
    })

    // Build updated ingest status for debug visibility
    const newIngestStatus = {
      active: currentMode === 'collecting_data',
      startedAt: ingestStatusTyped?.startedAt ?? new Date().toISOString(),
      firstDataAt: ingestResult.extractedData && Object.keys(ingestResult.extractedData.normalized).length > 0
        ? (ingestStatusTyped?.firstDataAt ?? new Date().toISOString())
        : ingestStatusTyped?.firstDataAt ?? null,
      fieldsAccumulated: [
        ...(ingestStatusTyped?.fieldsAccumulated ?? []),
        ...Object.keys(ingestResult.extractedData?.normalized ?? {}),
      ].filter((v, i, a) => a.indexOf(v) === i), // unique
      timerType: ingestResult.timerDuration === '6m' ? 'partial' : 'no_data',
      timerExpiresAt: null,
      lastClassification: ingestResult.classification.classification,
      timeline: [
        ...((ingestStatusTyped?.timeline as unknown[] ?? [])),
        {
          message: input.message.substring(0, 100),
          classification: ingestResult.classification.classification,
          confidence: ingestResult.classification.confidence,
          fieldsExtracted: Object.keys(ingestResult.extractedData?.normalized ?? {}),
          timestamp: new Date().toISOString(),
        },
      ],
    }

    // Handle silent accumulation (datos or irrelevante)
    if (ingestResult.action === 'silent') {
      const silentData = ingestResult.mergedData ?? currentData

      // Determine timer signal
      // First data arrival -> start timer, subsequent data -> reevaluate level
      const timerSignal: { type: 'start' | 'reevaluate' | 'cancel'; reason?: string } | undefined =
        ingestResult.shouldEmitTimerStart
          ? { type: 'start' }
          : ingestResult.extractedData && Object.keys(ingestResult.extractedData.normalized).length > 0
            ? { type: 'reevaluate' }
            : undefined

      const classificationNote = `[SANDBOX: Silent - clasificacion: ${ingestResult.classification.classification}, confidence: ${ingestResult.classification.confidence}%]`

      return {
        handled: true,
        earlyReturn: {
          success: true,
          messages: [classificationNote],
          stateUpdates: {
            newMode: currentMode,
            newIntentsVistos: input.session.state.intents_vistos?.map(i => i.intent) ?? [],
            newTemplatesEnviados: input.session.state.templates_enviados ?? [],
            newDatosCapturados: silentData,
            newPackSeleccionado: input.session.state.pack_seleccionado,
            newIngestStatus: newIngestStatus,
          },
          shouldCreateOrder: false,
          timerSignals: timerSignal ? [timerSignal] : [],
          totalTokens,
          tokenDetails: [...tokenDetails],
          tools: [...(tools as unknown[])],
        },
      }
    }

    // Handle complete (all 8 fields) - transition to ofrecer_promos
    // Return result signaling mode change instead of mutating state
    if (ingestResult.action === 'complete') {
      return {
        handled: true,
        modeChanged: 'ofrecer_promos',
        updatedData: ingestResult.mergedData ?? currentData,
        updatedIngestStatus: {
          ...newIngestStatus,
          active: false,
        },
        // TIMER SIGNAL: Cancel ingest timer (levels 0-2).
        // When ingest completes, we cancel the data-collection timer.
        // processMessage will then ADD a 'start' signal for the promo timer (level 3).
        // This is step 1 of a two-step signal. See processMessage step 11b for step 2.
        timerSignal: { type: 'cancel', reason: 'ingest_complete' },
      }
    }

    // For 'respond' (pregunta or mixto), continue normal flow
    // No early return, no mode change — just pass through
    return { handled: false }
  }

  // ============================================================================
  // Implicit Yes Detection
  // ============================================================================

  /**
   * Check for "implicit yes" - customer sends datos outside collecting_data mode.
   *
   * If datos detected outside collecting_data:
   * - Partial data: transition to collecting_data, return early with transition message
   * - All fields complete: transition to ofrecer_promos, continue to orchestrator
   *
   * Returns explicit ImplicitYesResult instead of mutating state.
   */
  private async checkImplicitYes(
    input: SomnioAgentInput,
    currentMode: string,
    currentData: Record<string, string>,
    currentIngestStatus: unknown,
    totalTokens: number,
    tokenDetails: ModelTokenEntry[],
    tools: unknown[]
  ): Promise<ImplicitYesResult> {
    // Classify the message
    const classification = await this.messageClassifier.classify(input.message)

    // Only trigger implicit yes for 'datos' or 'mixto' (contains data)
    if (
      classification.classification !== 'datos' &&
      classification.classification !== 'mixto'
    ) {
      return { handled: false }
    }

    // Build ingest state for the implicit yes
    const ingestState: IngestState = {
      active: true,
      startedAt: new Date().toISOString(),
      firstDataAt: null,
      fieldsCollected: [],
    }

    // Process the data through IngestManager
    const ingestResult = await this.ingestManager.handleMessage({
      sessionId: input.session.id,
      message: input.message,
      ingestState,
      existingData: currentData,
      conversationHistory: input.history,
    })

    // If no actual data was extracted, this is just a confirmation ("si", "ok", etc.)
    // Fall through to normal intent detection which has full history context
    const extractedFields = Object.keys(ingestResult.extractedData?.normalized ?? {})
    if (extractedFields.length === 0) {
      return { handled: false }
    }

    // Check if all 8 fields are complete after extraction
    const mergedData = ingestResult.mergedData ?? currentData
    const allFieldsComplete = hasCriticalData(mergedData)

    // Build ingest status
    const ingestStatusTyped = currentIngestStatus as {
      timeline?: unknown[]
      [key: string]: unknown
    } | undefined

    const newIngestStatus = {
      active: !allFieldsComplete,
      startedAt: new Date().toISOString(),
      firstDataAt: ingestResult.extractedData && Object.keys(ingestResult.extractedData.normalized).length > 0
        ? new Date().toISOString()
        : null,
      fieldsAccumulated: Object.keys(ingestResult.extractedData?.normalized ?? {}),
      timerType: ingestResult.timerDuration === '6m' ? 'partial' : 'no_data',
      timerExpiresAt: null,
      lastClassification: classification.classification,
      timeline: [
        ...((ingestStatusTyped?.timeline as unknown[]) ?? []),
        {
          message: input.message.substring(0, 100),
          classification: classification.classification,
          confidence: classification.confidence,
          fieldsExtracted: Object.keys(ingestResult.extractedData?.normalized ?? {}),
          timestamp: new Date().toISOString(),
        },
      ],
    }

    // If all fields complete, signal mode change to ofrecer_promos
    // Return result for orchestrator to handle (no early return)
    if (allFieldsComplete) {
      return {
        handled: true,
        modeChanged: 'ofrecer_promos',
        updatedData: mergedData,
        updatedIngestStatus: newIngestStatus,
        // No timer signal here — processMessage step 11b handles start for promos
      }
    }

    // Partial data or implicit yes: signal mode change, let normal flow continue
    // to orchestrator which selects proper templates (works in both sandbox and production)
    return {
      handled: true,
      modeChanged: 'collecting_data',
      updatedData: mergedData,
      updatedIngestStatus: newIngestStatus,
      timerSignal: { type: 'start' as const },
    }
  }
}
