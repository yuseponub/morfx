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
import type { ClaudeModelId } from '../types'
import type {
  EngineInput,
  EngineOutput,
  EngineConfig,
  EngineAdapters,
} from './types'

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
  async processMessage(input: EngineInput): Promise<EngineOutput> {
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
      console.log(`[ENGINE-TIMER] timerSignals=${JSON.stringify(agentOutput.timerSignals)} newMode=${agentOutput.stateUpdates.newMode} prevMode=${session.current_mode}`)
      for (const signal of agentOutput.timerSignals) {
        this.adapters.timer.signal(signal)
      }

      // Timer: optional lifecycle hooks (production emits Inngest events)
      if (this.adapters.timer.onCustomerMessage && !input.forceIntent) {
        console.log(`[ENGINE-TIMER] Calling onCustomerMessage for session=${session.id}`)
        await this.adapters.timer.onCustomerMessage(
          session.id,
          input.conversationId,
          input.message
        )
      }

      if (
        this.adapters.timer.onModeTransition &&
        agentOutput.stateUpdates.newMode &&
        agentOutput.stateUpdates.newMode !== session.current_mode
      ) {
        console.log(`[ENGINE-TIMER] Calling onModeTransition ${session.current_mode} -> ${agentOutput.stateUpdates.newMode}`)
        await this.adapters.timer.onModeTransition(
          session.id,
          session.current_mode,
          agentOutput.stateUpdates.newMode,
          input.conversationId
        )
      }

      // Timer: ingest lifecycle hooks (production emits Inngest events for ingest timer)
      // Agent signals 'start' when first data arrives in collecting_data mode
      const hasIngestStart = agentOutput.timerSignals.some(s => s.type === 'start')
      const hasIngestCancel = agentOutput.timerSignals.some(s => s.type === 'cancel' && s.reason === 'ingest_complete')
      console.log(`[ENGINE-TIMER] hasIngestStart=${hasIngestStart} hasIngestCancel=${hasIngestCancel} hasOnIngestStarted=${!!this.adapters.timer.onIngestStarted} hasOnIngestCompleted=${!!this.adapters.timer.onIngestCompleted}`)

      if (hasIngestCancel && this.adapters.timer.onIngestCompleted) {
        console.log(`[ENGINE-TIMER] Calling onIngestCompleted for session=${session.id}`)
        await this.adapters.timer.onIngestCompleted(session.id, 'all_fields')
      } else if (hasIngestStart && this.adapters.timer.onIngestStarted) {
        const hasPartialData = Object.keys(agentOutput.stateUpdates.newDatosCapturados).length > 0
        console.log(`[ENGINE-TIMER] Calling onIngestStarted hasPartialData=${hasPartialData} session=${session.id}`)
        await this.adapters.timer.onIngestStarted(session, hasPartialData)
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

      if (agentOutput.shouldCreateOrder && agentOutput.orderData) {
        const orderMode = this.config.crmModes?.find(m => m.agentId === 'order-manager')?.mode
        orderResult = await this.adapters.orders.createOrder(
          {
            datosCapturados: agentOutput.orderData.datosCapturados,
            packSeleccionado: agentOutput.orderData.packSeleccionado,
            workspaceId: this.config.workspaceId,
            sessionId: session.id,
          },
          orderMode
        )

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
