/**
 * Unified Engine — Thin I/O Runner
 * Phase 16.1: Engine Unification - Plan 04
 *
 * The engine connects input -> agent -> adapters. It contains NO business logic.
 * All Somnio-specific decisions (intents, transitions, ingest, templates, orders)
 * live in SomnioAgent. The engine only routes data through adapters.
 *
 * Flow:
 * 1. Get session via storage adapter
 * 2. Get history via storage adapter (or use provided history)
 * 3. Call SomnioAgent.processMessage()
 * 4. Route agent output to adapters (storage, timer, messaging, orders, debug)
 * 5. Build and return EngineOutput
 */

import { SomnioAgent } from '../somnio/somnio-agent'
import { VersionConflictError } from '../errors'
import type { ClaudeModelId } from '../types'
import type {
  EngineInput,
  EngineOutput,
  EngineConfig,
  EngineAdapters,
} from './types'

const MAX_VERSION_CONFLICT_RETRIES = 3

export class UnifiedEngine {
  private somnioAgent: SomnioAgent
  private adapters: EngineAdapters
  private config: EngineConfig

  constructor(adapters: EngineAdapters, config: EngineConfig) {
    this.adapters = adapters
    this.config = config
    this.somnioAgent = new SomnioAgent()
  }

  /**
   * Process a customer message through the unified pipeline.
   *
   * This method is a thin runner — it fetches data via adapters, delegates all
   * business logic to SomnioAgent, and routes agent output back through adapters.
   */
  async processMessage(input: EngineInput, retryCount = 0): Promise<EngineOutput> {
    try {
      // 1. Get session via storage adapter
      // Production passes empty sessionId — use getOrCreateSession via conversationId
      const session = input.sessionId
        ? await this.adapters.storage.getSession(input.sessionId)
        : await this.adapters.storage.getOrCreateSession(input.conversationId, input.contactId)

      // 2. Get history (sandbox passes it in; production reads from DB)
      const history = input.history.length > 0
        ? input.history
        : await this.adapters.storage.getHistory(session.id)

      console.log(`[ENGINE] msg="${input.message}" sessionId=${session.id} historyLen=${history.length} roles=${history.map(h => h.role).join(',')}`)

      // 3. Call SomnioAgent — ALL business logic happens here
      const agentOutput = await this.somnioAgent.processMessage({
        message: input.message,
        session,
        history,
        turnNumber: input.turnNumber ?? (history.length + 1),
        forceIntent: input.forceIntent,
      })

      // 4. Route agent output to adapters

      // 4a. Storage: persist state updates
      if (agentOutput.stateUpdates.newMode && agentOutput.stateUpdates.newMode !== session.current_mode) {
        await this.adapters.storage.updateMode(
          session.id,
          session.version,
          agentOutput.stateUpdates.newMode
        )
      }

      // Only save columns that exist in session_state table
      // (ingestStatus is sandbox-only, not a DB column)
      await this.adapters.storage.saveState(session.id, {
        datos_capturados: agentOutput.stateUpdates.newDatosCapturados,
        templates_enviados: agentOutput.stateUpdates.newTemplatesEnviados,
        pack_seleccionado: agentOutput.stateUpdates.newPackSeleccionado,
      })

      // Storage: record turns (production writes to DB; sandbox is no-op)
      await this.adapters.storage.addTurn({
        sessionId: session.id,
        turnNumber: input.turnNumber ?? (history.length + 1),
        role: 'user',
        content: input.message,
        intentDetected: agentOutput.intentInfo?.intent,
        confidence: agentOutput.intentInfo?.confidence,
        tokensUsed: agentOutput.totalTokens,
      })

      // Storage: add intent to intents_vistos
      if (agentOutput.intentInfo?.intent) {
        await this.adapters.storage.addIntentSeen(session.id, agentOutput.intentInfo.intent)
      }

      // Storage: handle handoff
      if (agentOutput.stateUpdates.newMode === 'handoff') {
        await this.adapters.storage.handoff(session.id, session.version)
      }

      // 4b. Timer: emit signals
      for (const signal of agentOutput.timerSignals) {
        this.adapters.timer.signal(signal)
      }

      // Timer: lifecycle hooks (production emits Inngest events)
      // 1. Customer message → cancels pending timers
      if (this.adapters.timer.onCustomerMessage && !input.forceIntent) {
        await this.adapters.timer.onCustomerMessage(
          session.id,
          input.conversationId,
          input.message
        )
      }

      const hasIngestStart = agentOutput.timerSignals.some(s => s.type === 'start')
      const hasIngestCancel = agentOutput.timerSignals.some(s => s.type === 'cancel' && s.reason === 'ingest_complete')
      const newMode = agentOutput.stateUpdates.newMode
      const modeChanged = newMode && newMode !== session.current_mode

      // 2. Ingest cancel → all fields collected, cancel data timer
      if (hasIngestCancel && this.adapters.timer.onIngestCompleted) {
        await this.adapters.timer.onIngestCompleted(session.id, 'all_fields')
      }

      // 3. Ingest start → start data collection timer (ONLY for collecting_data mode)
      //    Skip if also cancelling (two-step cancel+start → promos via onModeTransition)
      //    Skip if mode is NOT collecting_data (e.g., forceIntent ofrecer_promos uses onModeTransition)
      const effectiveMode = newMode || session.current_mode
      if (
        hasIngestStart &&
        !hasIngestCancel &&
        effectiveMode === 'collecting_data' &&
        this.adapters.timer.onIngestStarted
      ) {
        const hasPartialData = Object.keys(agentOutput.stateUpdates.newDatosCapturados).length > 0
        await this.adapters.timer.onIngestStarted(session, hasPartialData)
      }

      // 4. Mode transition → only for ofrecer_promos (collecting_data is handled by ingest hooks above)
      //    This covers both: direct transition to promos AND two-step cancel+start pattern
      if (
        this.adapters.timer.onModeTransition &&
        modeChanged &&
        newMode !== 'collecting_data'
      ) {
        await this.adapters.timer.onModeTransition(
          session.id,
          session.current_mode,
          newMode,
          input.conversationId
        )
      }

      // 4c. Orders: create order if agent signals it
      let orderResult: {
        success: boolean
        orderId?: string
        contactId?: string
        toolCalls?: unknown[]
        tokensUsed?: unknown[]
        error?: { message: string }
      } | undefined

      console.log(`[ENGINE-ORDER] shouldCreateOrder=${agentOutput.shouldCreateOrder} hasOrderData=${!!agentOutput.orderData} pack=${agentOutput.orderData?.packSeleccionado} datos=${JSON.stringify(Object.keys(agentOutput.orderData?.datosCapturados ?? {}))}`)

      if (agentOutput.shouldCreateOrder && agentOutput.orderData) {
        const orderMode = this.config.crmModes?.find(m => m.agentId === 'order-manager')?.mode
        console.log(`[ENGINE-ORDER] Creating order... orderMode=${orderMode} datosCapturados=${JSON.stringify(agentOutput.orderData.datosCapturados)}`)
        orderResult = await this.adapters.orders.createOrder(
          {
            datosCapturados: agentOutput.orderData.datosCapturados,
            packSeleccionado: agentOutput.orderData.packSeleccionado,
            workspaceId: this.config.workspaceId,
            sessionId: session.id,
            valorOverride: agentOutput.orderData.valorOverride,
          },
          orderMode
        )

        console.log(`[ENGINE-ORDER] Result: success=${orderResult.success} orderId=${orderResult.orderId} contactId=${orderResult.contactId} error=${orderResult.error?.message}`)

        // Add CRM tool calls and tokens to agent output for debug
        if (orderResult.toolCalls) {
          agentOutput.tools.push(...orderResult.toolCalls)
        }
        if (orderResult.tokensUsed) {
          agentOutput.tokenDetails.push(
            ...(orderResult.tokensUsed as Array<{ model: ClaudeModelId; inputTokens: number; outputTokens: number }>)
          )
          const extraTokens = (orderResult.tokensUsed as Array<{ inputTokens: number; outputTokens: number }>)
            .reduce((sum, t) => sum + t.inputTokens + t.outputTokens, 0)
          agentOutput.totalTokens += extraTokens
        }

        // Add order result messages
        if (orderMode) {
          const modeLabel = orderMode === 'dry-run' ? 'DRY-RUN' : 'LIVE'
          if (orderResult.success) {
            agentOutput.messages.push(`[SANDBOX: CRM ${modeLabel} - Order created via order-manager]`)
          } else {
            agentOutput.messages.push(
              `[SANDBOX: CRM ${modeLabel} - Order creation failed: ${orderResult.error?.message ?? 'Unknown error'}]`
            )
          }
        } else {
          // No CRM agents enabled - show placeholder
          agentOutput.messages.push(
            `[SANDBOX: Order would be created here with pack: ${agentOutput.orderData.packSeleccionado}]`
          )
        }
      }

      // 4d. Messaging: send (production sends via WhatsApp; sandbox is no-op)
      let messagesSent = 0
      if (agentOutput.messages.length > 0) {
        const sendResult = await this.adapters.messaging.send({
          sessionId: session.id,
          conversationId: input.conversationId,
          messages: agentOutput.messages,
          templates: agentOutput.templates,
          intent: agentOutput.orchestratorIntent,
          workspaceId: this.config.workspaceId,
          contactId: input.contactId,
          phoneNumber: input.phoneNumber,
        })
        messagesSent = sendResult.messagesSent

        // Record assistant turn so production history includes bot responses
        // (critical for intent detection context on subsequent messages)
        const assistantContent = agentOutput.messages
          .filter(m => !m.startsWith('[SANDBOX:') && !m.startsWith('[No response'))
          .join('\n')
        if (assistantContent.trim()) {
          try {
            await this.adapters.storage.addTurn({
              sessionId: session.id,
              turnNumber: (input.turnNumber ?? (history.length + 1)) + 1,
              role: 'assistant',
              content: assistantContent,
            })
            console.log(`[ENGINE] Assistant turn saved (${assistantContent.length} chars)`)
          } catch (turnError) {
            // Non-blocking: don't crash main flow if turn recording fails
            console.error('[ENGINE] Failed to save assistant turn:', turnError)
          }
        }
      }

      // 4e. Debug: record all info
      this.adapters.debug.recordIntent(agentOutput.intentInfo)
      this.adapters.debug.recordTools(agentOutput.tools as unknown[])
      this.adapters.debug.recordTokens({
        turnNumber: input.turnNumber ?? (history.length + 1),
        tokensUsed: agentOutput.totalTokens,
        models: agentOutput.tokenDetails,
        timestamp: new Date().toISOString(),
      })

      // Build new sandbox state for debug stateAfter snapshot
      // The storage adapter already has the updated state internally
      const storageAdapter = this.adapters.storage as { getState?: () => unknown }
      const newState = storageAdapter.getState ? storageAdapter.getState() : undefined

      // Apply final mode update to state snapshot (for sandbox, the state already
      // reflects saveState calls, but the mode update needs to be consistent)
      if (newState && agentOutput.stateUpdates.newMode) {
        const sandboxState = newState as { currentMode: string; intentsVistos: string[] }
        sandboxState.currentMode = agentOutput.stateUpdates.newMode
        // Ensure intentsVistos includes the current intent
        if (agentOutput.intentInfo?.intent && !sandboxState.intentsVistos.includes(agentOutput.intentInfo.intent)) {
          sandboxState.intentsVistos.push(agentOutput.intentInfo.intent)
        }
      }

      this.adapters.debug.recordState(newState)

      const debugTurn = this.adapters.debug.getDebugTurn(input.turnNumber ?? (history.length + 1))
      const timerSignal = this.adapters.timer.getLastSignal()

      // 5. Build EngineOutput
      return {
        success: agentOutput.success,
        messages: agentOutput.messages,
        newState,
        debugTurn,
        timerSignal,
        orderCreated: orderResult?.success,
        orderId: orderResult?.orderId,
        contactId: orderResult?.contactId ?? input.contactId,
        newMode: agentOutput.stateUpdates.newMode,
        tokensUsed: agentOutput.totalTokens,
        sessionId: session.id,
        messagesSent,
        response: agentOutput.messages.join('\n'),
        error: agentOutput.error,
      }
    } catch (error) {
      if (error instanceof VersionConflictError && retryCount < MAX_VERSION_CONFLICT_RETRIES) {
        console.warn(`[ENGINE] Version conflict, retrying (${retryCount + 1}/${MAX_VERSION_CONFLICT_RETRIES})`)
        return this.processMessage(input, retryCount + 1)
      }

      const errorMessage = error instanceof Error
        ? `${error.message}\n${(error as Error).stack?.split('\n').slice(0, 3).join('\n')}`
        : 'Unknown error'
      console.error('[ENGINE] CRASH:', errorMessage)

      return {
        success: false,
        messages: [],
        error: {
          code: 'ENGINE_ERROR',
          message: errorMessage,
        },
      }
    }
  }
}
