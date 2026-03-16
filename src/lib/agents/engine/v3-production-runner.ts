/**
 * V3 Production Runner — Thin I/O Runner for Somnio Sales Agent v3
 * Quick-027: Integrar v3 a produccion - Fase 1 Foundation
 *
 * Equivalent to UnifiedEngine but for the v3 agent pipeline.
 * Uses the SAME production adapters (Storage, Timer, Messaging, Orders, Debug).
 *
 * Key differences from UnifiedEngine:
 * - No SomnioAgent instantiation — v3 uses processMessage() as pure function
 * - No block composition — v3 response-track already composes blocks
 * - No MessageClassifier — v3 uses comprehension + sales-track for silence
 * - No forceIntent — v3 uses systemEvent for timer-triggered processing
 *
 * Flow:
 * 1. Get session via storage adapter
 * 2. Get history via storage adapter (or use provided history)
 * 3. Map session state → V3AgentInput
 * 4. Call v3 processMessage()
 * 5. Route V3AgentOutput → adapter calls (storage, timer, messaging, orders, debug)
 * 6. Build and return EngineOutput
 */

import { VersionConflictError } from '../errors'
import type {
  EngineInput,
  EngineOutput,
  EngineConfig,
  EngineAdapters,
} from './types'
import type { V3AgentInput, V3AgentOutput, ProcessedMessage } from '../somnio-v3/types'

const MAX_VERSION_CONFLICT_RETRIES = 3

export class V3ProductionRunner {
  private adapters: EngineAdapters
  private config: EngineConfig

  constructor(adapters: EngineAdapters, config: EngineConfig) {
    this.adapters = adapters
    this.config = config
  }

  /**
   * Process a customer message through the v3 agent pipeline.
   *
   * This method is a thin I/O runner — it fetches data via adapters, delegates all
   * business logic to v3 processMessage(), and routes output back through adapters.
   */
  async processMessage(input: EngineInput, retryCount = 0): Promise<EngineOutput> {
    try {
      // 1. Get session via storage adapter
      const session = input.sessionId
        ? await this.adapters.storage.getSession(input.sessionId)
        : await this.adapters.storage.getOrCreateSession(input.conversationId, input.contactId)

      // 1b. Set sessionId on V3 timer adapter (needs session for Inngest events)
      if ('setSessionId' in this.adapters.timer && typeof (this.adapters.timer as any).setSessionId === 'function') {
        (this.adapters.timer as any).setSessionId(session.id)
      }

      // 2. Get history (production reads from DB)
      const history = input.history.length > 0
        ? input.history
        : await this.adapters.storage.getHistory(session.id)

      console.log(`[V3-RUNNER] msg="${input.message}" sessionId=${session.id} historyLen=${history.length}`)

      // 3. Build V3AgentInput from session state
      const turnNumber = input.turnNumber ?? (history.length + 1)

      // Read acciones_ejecutadas: prefer dedicated column (new), fallback to _v3: key in datos_capturados
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawState = session.state as any
      const accionesEjecutadas = rawState.acciones_ejecutadas ??
        (() => {
          try {
            const raw = (session.state.datos_capturados ?? {})['_v3:accionesEjecutadas']
            return raw ? JSON.parse(raw) : []
          } catch { return [] }
        })()

      // V3 expects intentsVistos as string[], production stores IntentRecord[]
      // Extract just the intent names
      const intentsVistos: string[] = (session.state.intents_vistos ?? []).map(
        (r: { intent: string } | string) => typeof r === 'string' ? r : r.intent
      )

      const v3Input: V3AgentInput = {
        message: input.message,
        history,
        currentMode: session.current_mode,
        intentsVistos,
        templatesEnviados: session.state.templates_enviados ?? [],
        datosCapturados: session.state.datos_capturados ?? {},
        packSeleccionado: session.state.pack_seleccionado as string | null,
        accionesEjecutadas,
        turnNumber,
        workspaceId: this.config.workspaceId,
        // systemEvent: undefined — only for timers, not user messages
      }

      // 4. Call v3 processMessage
      const { processMessage } = await import('../somnio-v3/somnio-v3-agent')
      const output: V3AgentOutput = await processMessage(v3Input)

      // 5. Route output to adapters

      // 5a. Storage — save state
      await this.adapters.storage.saveState(session.id, {
        datos_capturados: output.datosCapturados,
        templates_enviados: output.templatesEnviados,
        intents_vistos: output.intentsVistos,
        pack_seleccionado: output.packSeleccionado,
        acciones_ejecutadas: output.accionesEjecutadas,
      })

      // 5b. Storage — update mode (with optimistic locking)
      if (output.newMode && output.newMode !== session.current_mode) {
        await this.adapters.storage.updateMode(session.id, session.version, output.newMode)
      }

      // 5c. Storage — add user turn
      await this.adapters.storage.addTurn({
        sessionId: session.id,
        turnNumber,
        role: 'user',
        content: input.message,
        intentDetected: output.intentInfo?.intent,
        confidence: output.intentInfo?.confidence,
        tokensUsed: output.totalTokens,
      })

      // 5d. Storage — add intent seen
      if (output.intentInfo?.intent) {
        await this.adapters.storage.addIntentSeen(session.id, output.intentInfo.intent)
      }

      // 5e. Storage — handoff
      if (output.newMode === 'handoff') {
        await this.adapters.storage.handoff(session.id, session.version)
        if (this.adapters.storage.clearPendingTemplates) {
          await this.adapters.storage.clearPendingTemplates(session.id)
        }
      }

      // 5f. Timer — lifecycle hooks + signals
      if (this.adapters.timer.onCustomerMessage) {
        await this.adapters.timer.onCustomerMessage(session.id, input.conversationId, input.message)
      }

      if (output.newMode && output.newMode !== session.current_mode && this.adapters.timer.onModeTransition) {
        await this.adapters.timer.onModeTransition(session.id, session.current_mode, output.newMode, input.conversationId)
      }

      for (const signal of output.timerSignals) {
        this.adapters.timer.signal(signal)
      }

      // 5g. Orders — create if needed
      let orderResult: { success: boolean; orderId?: string; contactId?: string } | undefined

      if (output.shouldCreateOrder && output.orderData) {
        const isOfiInter = output.datosCapturados['_v3:ofiInter'] === 'true'
        const cedulaRecoge = output.datosCapturados.cedula_recoge

        console.log(`[V3-RUNNER] Creating order... isOfiInter=${isOfiInter} pack=${output.orderData.packSeleccionado}`)

        orderResult = await this.adapters.orders.createOrder({
          datosCapturados: output.orderData.datosCapturados,
          packSeleccionado: output.orderData.packSeleccionado,
          workspaceId: this.config.workspaceId,
          sessionId: session.id,
          valorOverride: output.orderData.valorOverride,
          isOfiInter,
          cedulaRecoge,
        })

        console.log(`[V3-RUNNER] Order result: success=${orderResult.success} orderId=${orderResult.orderId}`)
      }

      // 5h. Messaging — send templates (with no-rep filter)
      // V3 templates come pre-composed from response-track. NO extra block composition.
      let messagesSent = 0
      let sentMessageContents: string[] = []

      if (output.templates && output.templates.length > 0) {
        let templatesToSend: ProcessedMessage[] = output.templates

        // No-repetition filter (if USE_NO_REPETITION=true)
        if (process.env.USE_NO_REPETITION === 'true') {
          try {
            const { NoRepetitionFilter } = await import('../somnio/no-repetition-filter')
            const { buildOutboundRegistry } = await import('../somnio/outbound-registry')

            const registry = await buildOutboundRegistry(
              input.conversationId,
              session.id,
              output.templatesEnviados,
            )

            const { generateMinifrases } = await import('../somnio/minifrase-generator')
            await generateMinifrases(registry)

            const noRepFilter = new NoRepetitionFilter(this.config.workspaceId)

            // Map ProcessedMessage to PrioritizedTemplate shape for filterBlock
            const blockForFilter = templatesToSend.map(t => ({
              templateId: t.templateId,
              content: t.content,
              contentType: t.contentType as 'texto' | 'template' | 'imagen',
              priority: t.priority,
              intent: output.intentInfo?.intent ?? 'unknown',
              orden: 0,
              isNew: true,
            }))

            const filterResult = await noRepFilter.filterBlock(
              blockForFilter,
              registry,
              output.templatesEnviados,
            )

            // Map surviving back to original ProcessedMessage objects
            const survivingIds = new Set(filterResult.surviving.map(s => s.templateId))
            templatesToSend = templatesToSend.filter(t => survivingIds.has(t.templateId))

            if (filterResult.filtered.length > 0) {
              console.log(
                `[V3-RUNNER] No-rep filter: ${filterResult.filtered.length} filtered, ${filterResult.surviving.length} surviving`
              )
            }
          } catch (noRepError) {
            // Fail-open: send full block on error
            console.error('[V3-RUNNER] No-rep filter crashed, sending full block (fail-open):', noRepError)
            templatesToSend = output.templates
          }
        }

        if (templatesToSend.length > 0) {
          const sendResult = await this.adapters.messaging.send({
            sessionId: session.id,
            conversationId: input.conversationId,
            messages: templatesToSend.map(t => t.content),
            templates: templatesToSend.map(t => ({
              id: t.templateId,
              content: t.content,
              contentType: t.contentType,
              delaySeconds: 0,
            })),
            intent: output.intentInfo?.intent,
            workspaceId: this.config.workspaceId,
            contactId: input.contactId,
            phoneNumber: input.phoneNumber,
            triggerTimestamp: input.messageTimestamp,
          })
          messagesSent = sendResult.messagesSent
          sentMessageContents = templatesToSend
            .slice(0, sendResult.messagesSent)
            .map(t => t.content)

          // Post-send: append sent template IDs to templates_enviados
          const sentTemplateIds = templatesToSend
            .slice(0, sendResult.messagesSent)
            .map(t => t.templateId)
            .filter((id): id is string => id != null && id.length > 0)

          if (sentTemplateIds.length > 0) {
            const updatedTemplatesEnviados = [...output.templatesEnviados, ...sentTemplateIds]
            await this.adapters.storage.saveState(session.id, {
              templates_enviados: updatedTemplatesEnviados,
            })
          }

          // Handle interruption — pending templates
          if (sendResult.interrupted) {
            const sentIndex = sendResult.interruptedAtIndex ?? sendResult.messagesSent
            if (sendResult.messagesSent === 0) {
              if (this.adapters.storage.clearPendingTemplates) {
                await this.adapters.storage.clearPendingTemplates(session.id)
              }
            } else {
              const unsent = templatesToSend.slice(sentIndex)
              if (unsent.length > 0 && this.adapters.storage.savePendingTemplates) {
                await this.adapters.storage.savePendingTemplates(session.id, unsent)
              }
            }
          } else {
            // Clear stale pending
            if (this.adapters.storage.clearPendingTemplates) {
              await this.adapters.storage.clearPendingTemplates(session.id)
            }
          }
        }
      } else if (output.messages.length > 0) {
        // Fallback: plain messages (no templates)
        const sendResult = await this.adapters.messaging.send({
          sessionId: session.id,
          conversationId: input.conversationId,
          messages: output.messages,
          workspaceId: this.config.workspaceId,
          contactId: input.contactId,
          phoneNumber: input.phoneNumber,
        })
        messagesSent = sendResult.messagesSent
        sentMessageContents = output.messages
      }

      // 5i. Assistant turn recording (post-send)
      const assistantContent = sentMessageContents
        .filter(m => m.trim().length > 0)
        .join('\n')
      if (assistantContent.trim()) {
        try {
          await this.adapters.storage.addTurn({
            sessionId: session.id,
            turnNumber: turnNumber + 1,
            role: 'assistant',
            content: assistantContent,
          })
          console.log(`[V3-RUNNER] Assistant turn saved (${assistantContent.length} chars)`)
        } catch (turnError) {
          console.error('[V3-RUNNER] Failed to save assistant turn:', turnError)
        }
      }

      // 5j. Debug adapter — record intent, tokens, classification, sales track
      this.adapters.debug.recordIntent(output.intentInfo)
      this.adapters.debug.recordTokens({
        turnNumber,
        tokensUsed: output.totalTokens,
        timestamp: new Date().toISOString(),
      })
      if (output.classificationInfo) this.adapters.debug.recordClassification(output.classificationInfo)
      if (output.salesTrackInfo) this.adapters.debug.recordOrchestration(output.salesTrackInfo)
      this.adapters.debug.recordTimerSignals(output.timerSignals)

      // 6. Return EngineOutput compatible with webhook-processor
      return {
        success: output.success,
        messages: output.messages,
        newMode: output.newMode,
        tokensUsed: output.totalTokens,
        sessionId: session.id,
        messagesSent,
        response: sentMessageContents.join('\n'),
        orderCreated: orderResult?.success,
        orderId: orderResult?.orderId,
        contactId: orderResult?.contactId ?? input.contactId,
        error: output.success ? undefined : {
          code: 'V3_AGENT_ERROR',
          message: 'V3 agent processing failed',
        },
      }
    } catch (error) {
      if (error instanceof VersionConflictError && retryCount < MAX_VERSION_CONFLICT_RETRIES) {
        console.warn(`[V3-RUNNER] Version conflict, retrying (${retryCount + 1}/${MAX_VERSION_CONFLICT_RETRIES})`)
        return this.processMessage(input, retryCount + 1)
      }

      const errorMessage = error instanceof Error
        ? `${error.message}\n${(error as Error).stack?.split('\n').slice(0, 3).join('\n')}`
        : 'Unknown error'
      console.error('[V3-RUNNER] CRASH:', errorMessage)

      return {
        success: false,
        messages: [],
        error: {
          code: 'V3_ENGINE_ERROR',
          message: errorMessage,
        },
      }
    }
  }
}
