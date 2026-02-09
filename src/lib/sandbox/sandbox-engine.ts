/**
 * Sandbox Engine
 * Phase 15: Agent Sandbox
 *
 * In-memory engine wrapper that uses Somnio components without
 * writing to the real database. Simulates full agent flow.
 * Phase 15.6: CRM orchestrator integration for order creation.
 */

import { ClaudeClient } from '@/lib/agents/claude-client'
import { IntentDetector } from '@/lib/agents/intent-detector'
import { SomnioOrchestrator } from '@/lib/agents/somnio/somnio-orchestrator'
import { somnioAgentConfig } from '@/lib/agents/somnio/config'
import { agentRegistry } from '@/lib/agents/registry'
import { mergeExtractedData, hasCriticalData } from '@/lib/agents/somnio/data-extractor'
import { IngestManager } from '@/lib/agents/somnio/ingest-manager'
import { MessageClassifier } from '@/lib/agents/somnio/message-classifier'
import { crmOrchestrator } from '@/lib/agents/crm'
import type { CrmExecutionMode } from '@/lib/agents/crm/types'
import type { IngestState } from '@/lib/agents/somnio/ingest-manager'
import type { ModelTokenEntry } from '@/lib/agents/types'
import type { SandboxState, SandboxEngineResult, DebugTurn, ToolExecution, IntentInfo, IngestStatus, TimerSignal } from './types'

/** CRM agent mode passed from the client */
interface CrmMode {
  agentId: string
  mode: CrmExecutionMode
}

/**
 * SandboxEngine: Processes messages using Somnio agent components
 * but stores all state in memory (no database writes).
 *
 * Key differences from real SomnioEngine:
 * - No SessionManager (state passed in/out)
 * - No MessageSequencer (returns messages array, caller handles delays)
 * - CRM orchestrator integration for order creation when agents enabled
 */
export class SandboxEngine {
  private claudeClient: ClaudeClient
  private intentDetector: IntentDetector
  private orchestrator: SomnioOrchestrator
  private ingestManager: IngestManager
  private messageClassifier: MessageClassifier
  /** Timer signal to propagate in result (Phase 15.7) */
  private lastTimerSignal: TimerSignal | null = null

  constructor() {
    this.claudeClient = new ClaudeClient()
    this.intentDetector = new IntentDetector(this.claudeClient)
    this.orchestrator = new SomnioOrchestrator(this.claudeClient)
    this.ingestManager = new IngestManager()
    this.messageClassifier = new MessageClassifier()
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
      ingestStatus: undefined,
    }
  }

  /**
   * Process a customer message through the Somnio agent.
   *
   * @param message - Customer message content
   * @param currentState - Current sandbox state
   * @param history - Conversation history
   * @param turnNumber - Current turn number (for debug tracking)
   * @param crmModes - Enabled CRM agent modes (from sandbox header)
   */
  async processMessage(
    message: string,
    currentState: SandboxState,
    history: { role: 'user' | 'assistant'; content: string }[],
    turnNumber: number,
    crmModes?: CrmMode[],
    workspaceId?: string,
    forceIntent?: string
  ): Promise<SandboxEngineResult> {
    const tools: ToolExecution[] = []
    let totalTokens = 0
    const tokenDetails: ModelTokenEntry[] = []

    // Reset timer signal for this message (Phase 15.7)
    this.lastTimerSignal = null

    try {
      const agentConfig = agentRegistry.get(somnioAgentConfig.id)

      // Track ingest status for debug visibility
      let ingestStatus: IngestStatus | undefined = currentState.ingestStatus

      // 1. Check for ingest mode handling (collecting_data)
      // Track if we just completed ingest to force ofrecer_promos intent
      let justCompletedIngest = false
      const previousMode = currentState.currentMode

      if (currentState.currentMode === 'collecting_data') {
        const ingestResult = await this.handleIngestMode(
          message,
          currentState,
          history,
          turnNumber,
          tools,
          totalTokens,
          tokenDetails
        )

        if (ingestResult) {
          return ingestResult
        }
        // If null, continue with normal orchestration (for pregunta/mixto or complete)
        // Check if handleIngestMode transitioned to ofrecer_promos (mutated currentState)
        // Use type assertion because TypeScript doesn't track the mutation
        if (previousMode === 'collecting_data' && (currentState.currentMode as string) === 'ofrecer_promos') {
          justCompletedIngest = true
        }
      }

      // 2. Check for "implicit yes" - datos sent outside collecting_data
      if (currentState.currentMode !== 'collecting_data' && currentState.currentMode !== 'ofrecer_promos') {
        const implicitYesResult = await this.checkImplicitYes(
          message,
          currentState,
          history,
          turnNumber,
          tools,
          totalTokens,
          tokenDetails
        )

        if (implicitYesResult) {
          return implicitYesResult
        }

        // Check if checkImplicitYes transitioned to ofrecer_promos (all 8 fields in one message)
        if ((currentState.currentMode as string) === 'ofrecer_promos') {
          justCompletedIngest = true
        }
      }

      // 3. Detect intent (or force ofrecer_promos if just completed ingest)
      let intent: { intent: string; confidence: number; alternatives?: Array<{ intent: string; confidence: number }>; reasoning?: string }
      let action: 'proceed' | 'handoff' | 'clarify' | 'reanalyze'

      if (justCompletedIngest || forceIntent) {
        // Force intent when ingest completes or timer triggers a mode transition
        intent = {
          intent: forceIntent ?? 'ofrecer_promos',
          confidence: 100,
          alternatives: [],
          reasoning: forceIntent
            ? `Timer-triggered: ${forceIntent}`
            : 'Auto-triggered: all 8 fields collected',
        }
        action = 'proceed'
      } else {
        const detected = await this.intentDetector.detect(
          message,
          history,
          {
            systemPrompt: agentConfig.intentDetector.systemPrompt,
            model: agentConfig.intentDetector.model,
            thresholds: agentConfig.confidenceThresholds,
          }
        )
        intent = detected.intent
        action = detected.action
        totalTokens += detected.tokensUsed
        // Collect per-model details from intent detection
        if (detected.tokenDetails) {
          tokenDetails.push(...detected.tokenDetails)
        }
      }

      const intentInfo: IntentInfo = {
        intent: intent.intent,
        confidence: intent.confidence,
        alternatives: intent.alternatives ?? [],
        reasoning: intent.reasoning,
        timestamp: new Date().toISOString(),
      }

      // 4. Update intents_vistos
      const newIntentsVistos = [...currentState.intentsVistos]
      if (!newIntentsVistos.includes(intent.intent)) {
        newIntentsVistos.push(intent.intent)
      }

      // 5. Handle handoff
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
          tokens: { turnNumber, tokensUsed: totalTokens, models: tokenDetails, timestamp: new Date().toISOString() },
          stateAfter: handoffState,
        }

        return {
          success: true,
          messages: ['Voy a transferirte con un asesor humano para atenderte mejor. Un momento por favor.'],
          debugTurn,
          newState: handoffState,
        }
      }

      // 6. Build mock session for orchestrator
      // IMPORTANT: Use currentState.intentsVistos (BEFORE adding current intent)
      // so TemplateManager correctly detects primera_vez vs siguientes
      const mockSession = {
        id: 'sandbox-session',
        agent_id: somnioAgentConfig.id,
        conversation_id: 'sandbox-conversation',
        contact_id: 'sandbox-contact',
        workspace_id: workspaceId ?? 'sandbox-workspace',
        version: 1,
        status: 'active' as const,
        current_mode: currentState.currentMode,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
        state: {
          session_id: 'sandbox-session',
          // Use state BEFORE adding current intent - determines primera_vez vs siguientes
          intents_vistos: currentState.intentsVistos.map((i, idx) => ({
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

      // 7. Orchestrate response (skip validation for timer-forced intents)
      const orchestratorResult = await this.orchestrator.orchestrate(
        intent,
        mockSession,
        message,
        history,
        forceIntent ? { skipValidation: true } : undefined
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

      // 8. Build new state
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

      // 8b. Emit timer start signal on transition to collecting_data (Phase 15.7 fix)
      // The normal orchestration flow (captura_datos_si_compra intent) transitions
      // to collecting_data but never emitted a timerSignal. handleIngestMode and
      // checkImplicitYes handle their own signals; this covers the remaining path.
      if (
        !this.lastTimerSignal &&
        newState.currentMode === 'collecting_data' &&
        currentState.currentMode !== 'collecting_data'
      ) {
        this.lastTimerSignal = { type: 'start' }
        // Initialize ingestStatus so the debug panel shows "Activo"
        newState.ingestStatus = {
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

      // 8c. Emit timer start after ingest completion → ofrecer_promos
      // When ingest completes normally (all data at once), the engine emits 'cancel'
      // to stop the ingest timer. But we need Level 3 ("promos sin respuesta").
      // Override cancel with 'start' so the client evaluates Level 3.
      // Also covers checkImplicitYes path where no signal was set.
      if (justCompletedIngest && newState.currentMode === 'ofrecer_promos') {
        this.lastTimerSignal = { type: 'start' }
      }

      // 9. Extract response messages
      const messages: string[] = []
      if (orchestratorResult.response) {
        messages.push(orchestratorResult.response)
      }
      if (orchestratorResult.templates) {
        for (const template of orchestratorResult.templates) {
          messages.push(template.content)
        }
      }

      // 10. Handle shouldCreateOrder - route to CRM orchestrator if agents enabled
      if (orchestratorResult.shouldCreateOrder) {
        const orderManagerMode = crmModes?.find(m => m.agentId === 'order-manager')

        if (orderManagerMode) {
          // Route create_order command to CRM orchestrator
          try {
            const crmResult = await crmOrchestrator.route(
              {
                type: 'create_order',
                payload: { ...newState.datosCapturados, _workspaceId: workspaceId ?? 'sandbox' },
                source: 'orchestrator',
                orderMode: 'full',
              },
              orderManagerMode.mode
            )

            // Add CRM tool calls to debug tools with mode annotation
            const crmToolCalls = crmResult.toolCalls.map(t => ({
              ...t,
              mode: orderManagerMode.mode as 'dry-run' | 'live',
            }))
            tools.push(...crmToolCalls)

            // Add CRM token usage
            if (crmResult.tokensUsed.length > 0) {
              tokenDetails.push(...crmResult.tokensUsed)
              const crmTokenTotal = crmResult.tokensUsed.reduce(
                (sum, t) => sum + t.inputTokens + t.outputTokens, 0
              )
              totalTokens += crmTokenTotal
            }

            // Replace placeholder message with CRM result
            const modeLabel = orderManagerMode.mode === 'dry-run' ? 'DRY-RUN' : 'LIVE'
            if (crmResult.success) {
              messages.push(`[SANDBOX: CRM ${modeLabel} - Order created via ${crmResult.agentId}]`)
            } else {
              messages.push(`[SANDBOX: CRM ${modeLabel} - Order creation failed: ${crmResult.error?.message ?? 'Unknown error'}]`)
            }
          } catch (crmError) {
            const crmErrorMsg = crmError instanceof Error ? crmError.message : 'Unknown CRM error'
            messages.push(`[SANDBOX: CRM Error - ${crmErrorMsg}]`)
          }
        } else {
          // No CRM agents enabled - show original placeholder
          messages.push('[SANDBOX: Order would be created here with pack: ' + newState.packSeleccionado + ']')
        }
      }

      const debugTurn: DebugTurn = {
        turnNumber,
        intent: intentInfo,
        tools, // Tool executions from CRM agents (if any)
        tokens: { turnNumber, tokensUsed: totalTokens, models: tokenDetails, timestamp: new Date().toISOString() },
        stateAfter: newState,
      }

      return {
        success: true,
        messages: messages.length > 0 ? messages : ['[No response generated]'],
        debugTurn,
        newState,
        timerSignal: this.lastTimerSignal ?? undefined,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      return {
        success: false,
        messages: [],
        debugTurn: {
          turnNumber,
          tools,
          tokens: { turnNumber, tokensUsed: totalTokens, models: tokenDetails, timestamp: new Date().toISOString() },
          stateAfter: currentState,
        },
        newState: currentState,
        error: { code: 'SANDBOX_ERROR', message: errorMessage },
      }
    }
  }

  // ============================================================================
  // Ingest Mode Methods (Phase 15.5)
  // ============================================================================

  /**
   * Handle ingest mode during collecting_data.
   *
   * Routes messages through IngestManager for classification and silent accumulation.
   * Returns SandboxEngineResult if handled silently, null to continue normal flow.
   */
  private async handleIngestMode(
    message: string,
    currentState: SandboxState,
    history: { role: 'user' | 'assistant'; content: string }[],
    turnNumber: number,
    tools: ToolExecution[],
    totalTokens: number,
    tokenDetails: ModelTokenEntry[]
  ): Promise<SandboxEngineResult | null> {
    // Build ingest state from sandbox state
    const ingestState: IngestState = {
      active: true,
      startedAt: currentState.ingestStatus?.startedAt ?? null,
      firstDataAt: currentState.ingestStatus?.firstDataAt ?? null,
      fieldsCollected: Object.keys(currentState.datosCapturados).filter(
        (k) => currentState.datosCapturados[k] && currentState.datosCapturados[k] !== 'N/A'
      ),
    }

    // Route through IngestManager
    const ingestResult = await this.ingestManager.handleMessage({
      sessionId: 'sandbox-session',
      message,
      ingestState,
      existingData: currentState.datosCapturados,
      conversationHistory: history,
    })

    // Build updated ingest status for debug visibility
    const newIngestStatus: IngestStatus = {
      active: currentState.currentMode === 'collecting_data',
      startedAt: currentState.ingestStatus?.startedAt ?? new Date().toISOString(),
      firstDataAt: ingestResult.extractedData && Object.keys(ingestResult.extractedData.normalized).length > 0
        ? (currentState.ingestStatus?.firstDataAt ?? new Date().toISOString())
        : currentState.ingestStatus?.firstDataAt ?? null,
      fieldsAccumulated: [
        ...(currentState.ingestStatus?.fieldsAccumulated ?? []),
        ...Object.keys(ingestResult.extractedData?.normalized ?? {}),
      ].filter((v, i, a) => a.indexOf(v) === i), // unique
      timerType: ingestResult.timerDuration === '6m' ? 'partial' : 'no_data',
      timerExpiresAt: null, // Kept for backward compat; timer display reads from TimerState (Phase 15.7)
      lastClassification: ingestResult.classification.classification,
      timeline: [
        ...(currentState.ingestStatus?.timeline ?? []),
        {
          message: message.substring(0, 100),
          classification: ingestResult.classification.classification,
          confidence: ingestResult.classification.confidence,
          fieldsExtracted: Object.keys(ingestResult.extractedData?.normalized ?? {}),
          timestamp: new Date().toISOString(),
        },
      ],
    }

    // Handle silent accumulation (datos or irrelevante)
    if (ingestResult.action === 'silent') {
      const silentState: SandboxState = {
        ...currentState,
        datosCapturados: ingestResult.mergedData ?? currentState.datosCapturados,
        ingestStatus: newIngestStatus,
      }

      const debugTurn: DebugTurn = {
        turnNumber,
        tools,
        tokens: { turnNumber, tokensUsed: totalTokens, models: tokenDetails, timestamp: new Date().toISOString() },
        stateAfter: silentState,
      }

      // Silent response with classification info for debug
      const classificationNote = `[SANDBOX: Silent - clasificacion: ${ingestResult.classification.classification}, confidence: ${ingestResult.classification.confidence}%]`

      // Determine timer signal (Phase 15.7)
      // First data arrival -> start timer, subsequent data -> reevaluate level
      const timerSignal: TimerSignal | undefined = ingestResult.shouldEmitTimerStart
        ? { type: 'start' }
        : ingestResult.extractedData && Object.keys(ingestResult.extractedData.normalized).length > 0
          ? { type: 'reevaluate' }
          : undefined

      return {
        success: true,
        messages: [classificationNote],
        debugTurn,
        newState: silentState,
        timerSignal,
      }
    }

    // Handle complete (all 8 fields) - transition to ofrecer_promos
    // Mutate currentState and return null to continue with orchestrator
    // The orchestrator will then send the ofrecer_promos templates
    if (ingestResult.action === 'complete') {
      // Mutate currentState to reflect transition (passed by reference)
      currentState.currentMode = 'ofrecer_promos'
      currentState.datosCapturados = ingestResult.mergedData ?? currentState.datosCapturados
      currentState.ingestStatus = {
        ...newIngestStatus,
        active: false,
      }

      // Signal timer cancellation (Phase 15.7) - ingest complete, timer no longer needed
      this.lastTimerSignal = { type: 'cancel', reason: 'ingest_complete' }

      // Return null to continue with normal orchestration
      // The orchestrator will process with mode=ofrecer_promos and send templates
      return null
    }

    // For 'respond' (pregunta or mixto), update state and continue normal flow
    // Return null to let orchestrator handle the response
    return null
  }

  /**
   * Check for "implicit yes" - customer sends datos outside collecting_data mode.
   *
   * If detected, returns result with collecting_data transition message.
   */
  private async checkImplicitYes(
    message: string,
    currentState: SandboxState,
    history: { role: 'user' | 'assistant'; content: string }[],
    turnNumber: number,
    tools: ToolExecution[],
    totalTokens: number,
    tokenDetails: ModelTokenEntry[]
  ): Promise<SandboxEngineResult | null> {
    // Classify the message
    const classification = await this.messageClassifier.classify(message)

    // Only trigger implicit yes for 'datos' or 'mixto' (contains data)
    if (
      classification.classification !== 'datos' &&
      classification.classification !== 'mixto'
    ) {
      return null
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
      sessionId: 'sandbox-session',
      message,
      ingestState,
      existingData: currentState.datosCapturados,
      conversationHistory: history,
    })

    // Check if all 8 fields are complete after extraction
    const mergedData = ingestResult.mergedData ?? currentState.datosCapturados
    const allFieldsComplete = hasCriticalData(mergedData)

    // Determine target mode: ofrecer_promos if complete, collecting_data if not
    const targetMode = allFieldsComplete ? 'ofrecer_promos' : 'collecting_data'

    // Build ingest status
    const newIngestStatus: IngestStatus = {
      active: !allFieldsComplete, // Active only if still collecting
      startedAt: new Date().toISOString(),
      firstDataAt: ingestResult.extractedData && Object.keys(ingestResult.extractedData.normalized).length > 0
        ? new Date().toISOString()
        : null,
      fieldsAccumulated: Object.keys(ingestResult.extractedData?.normalized ?? {}),
      timerType: ingestResult.timerDuration === '6m' ? 'partial' : 'no_data',
      timerExpiresAt: null,
      lastClassification: classification.classification,
      timeline: [
        ...(currentState.ingestStatus?.timeline ?? []),
        {
          message: message.substring(0, 100),
          classification: classification.classification,
          confidence: classification.confidence,
          fieldsExtracted: Object.keys(ingestResult.extractedData?.normalized ?? {}),
          timestamp: new Date().toISOString(),
        },
      ],
    }

    const newState: SandboxState = {
      ...currentState,
      currentMode: targetMode,
      datosCapturados: mergedData,
      ingestStatus: newIngestStatus,
    }

    // If all fields complete, continue to orchestrator with ofrecer_promos
    if (allFieldsComplete) {
      // Mutate currentState to let the main flow continue with ofrecer_promos
      currentState.currentMode = 'ofrecer_promos'
      currentState.datosCapturados = mergedData
      currentState.ingestStatus = newIngestStatus

      // Return null to continue flow - main loop will detect ofrecer_promos transition
      return null
    }

    const debugTurn: DebugTurn = {
      turnNumber,
      tools,
      tokens: { turnNumber, tokensUsed: totalTokens, models: tokenDetails, timestamp: new Date().toISOString() },
      stateAfter: newState,
    }

    // Return with implicit yes message for partial data
    // Include timer start signal (Phase 15.7) - first data in collecting_data
    return {
      success: true,
      messages: [
        `[SANDBOX: Implicit yes detected - clasificacion: ${classification.classification}]`,
        '[SANDBOX: Transitioning to collecting_data mode]',
      ],
      debugTurn,
      newState,
      timerSignal: { type: 'start' },
    }
  }
}
