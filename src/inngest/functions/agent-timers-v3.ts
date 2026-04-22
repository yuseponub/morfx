/**
 * V3 Agent Timer Workflows — Production
 * Quick-028: V3 Production Timer System - Fase 2
 *
 * Single generic timer function for all V3 levels (L0-L8).
 * Key difference from V1: V1 has 5 functions that evaluate level with TIMER_LEVELS[].evaluate().
 * V3 has 1 function that passes systemEvent directly to the v3 pipeline.
 *
 * Flow:
 * 1. agent/v3.timer.started → settle 5s → waitForEvent(customer.message)
 * 2. If customer replies → return 'responded'
 * 3. If timeout → v3 processMessage with systemEvent { type: 'timer_expired', level }
 * 4. Send templates via domain layer (WhatsApp/Facebook/Instagram), persist state, create order if needed
 */

import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'
import { createModuleLogger } from '@/lib/audit/logger'
import { getWorkspaceAgentConfig } from '@/lib/agents/production/agent-config'
import { checkSessionActive } from '@/lib/agents/timer-guard'
import type { V3AgentInput, V3AgentOutput, AccionRegistrada } from '@/lib/agents/somnio-v3/types'

const logger = createModuleLogger('agent-timers-v3')

// ============================================================================
// Helper: Send message via domain layer (supports WhatsApp + Facebook/Instagram)
// ============================================================================

async function sendTimerMessage(
  workspaceId: string,
  conversationId: string,
  message: string
): Promise<boolean> {
  try {
    const supabase = createAdminClient()

    // 1. Get conversation channel + recipient info
    const { data: conv } = await supabase
      .from('conversations')
      .select('phone, channel, external_subscriber_id')
      .eq('id', conversationId)
      .single()

    if (!conv?.phone && !conv?.external_subscriber_id) {
      logger.error({ conversationId }, 'No phone/subscriber for conversation')
      return false
    }

    // 2. Get API key for the correct channel
    const channel = (conv.channel as 'whatsapp' | 'facebook' | 'instagram') || 'whatsapp'
    const { data: ws } = await supabase
      .from('workspaces')
      .select('settings')
      .eq('id', workspaceId)
      .single()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settings = ws?.settings as any
    const apiKey = (channel === 'facebook' || channel === 'instagram')
      ? settings?.manychat_api_key
      : settings?.whatsapp_api_key || process.env.WHATSAPP_API_KEY

    if (!apiKey) {
      logger.error({ workspaceId, channel }, 'No API key for channel')
      return false
    }

    // 3. Resolve recipient (phone for WhatsApp, external_subscriber_id for FB/IG)
    const recipientId = (channel !== 'whatsapp' && conv.external_subscriber_id)
      ? conv.external_subscriber_id
      : conv.phone!

    // 4. Send via domain layer (handles API call + DB storage + conversation update)
    const { sendTextMessage: domainSend } = await import('@/lib/domain/messages')
    const result = await domainSend(
      { workspaceId, source: 'inngest' },
      {
        conversationId,
        contactPhone: recipientId,
        messageBody: message,
        apiKey,
        channel,
      }
    )

    if (!result.success) {
      logger.error({ conversationId, channel, error: result.error }, 'Domain sendTextMessage failed')
      return false
    }

    // 5. Mark as sent_by_agent
    if (result.data?.messageId) {
      await supabase
        .from('messages')
        .update({ sent_by_agent: true })
        .eq('id', result.data.messageId)
    }

    logger.info({ conversationId, channel, messageId: result.data?.messageId }, 'V3 timer message sent')

    return true
  } catch (err) {
    logger.error({ conversationId, err }, 'Failed to send V3 timer message')
    return false
  }
}

/**
 * Send an image message from a V3 timer via domain layer.
 * Supports "URL" or "URL|caption" format.
 */
async function sendTimerImage(
  workspaceId: string,
  conversationId: string,
  content: string
): Promise<boolean> {
  try {
    const supabase = createAdminClient()

    const { data: conv } = await supabase
      .from('conversations')
      .select('phone, channel, external_subscriber_id')
      .eq('id', conversationId)
      .single()

    if (!conv?.phone && !conv?.external_subscriber_id) {
      logger.error({ conversationId }, 'No phone/subscriber for conversation (image)')
      return false
    }

    const channel = (conv.channel as 'whatsapp' | 'facebook' | 'instagram') || 'whatsapp'
    const { data: ws } = await supabase
      .from('workspaces')
      .select('settings')
      .eq('id', workspaceId)
      .single()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settings = ws?.settings as any
    const apiKey = (channel === 'facebook' || channel === 'instagram')
      ? settings?.manychat_api_key
      : settings?.whatsapp_api_key || process.env.WHATSAPP_API_KEY

    if (!apiKey) {
      logger.error({ workspaceId, channel }, 'No API key for channel (image)')
      return false
    }

    const recipientId = (channel !== 'whatsapp' && conv.external_subscriber_id)
      ? conv.external_subscriber_id
      : conv.phone!

    // Parse "URL|caption" format
    const pipeIdx = content.indexOf('|')
    const mediaUrl = pipeIdx > 0 ? content.slice(0, pipeIdx) : content
    const caption = pipeIdx > 0 ? content.slice(pipeIdx + 1) : undefined

    const { sendMediaMessage: domainSendMedia } = await import('@/lib/domain/messages')
    const result = await domainSendMedia(
      { workspaceId, source: 'inngest' },
      {
        conversationId,
        contactPhone: recipientId,
        mediaUrl,
        mediaType: 'image',
        caption,
        apiKey,
        channel,
      }
    )

    if (!result.success) {
      logger.error({ conversationId, channel, error: result.error }, 'Domain sendMediaMessage failed')
      return false
    }

    if (result.data?.messageId) {
      await supabase
        .from('messages')
        .update({ sent_by_agent: true })
        .eq('id', result.data.messageId)
    }

    logger.info({ conversationId, channel, messageId: result.data?.messageId }, 'V3 timer image sent')
    return true
  } catch (error) {
    logger.error({ error, conversationId }, 'Failed to send v3 timer message')
    return false
  }
}

// ============================================================================
// Inngest Function: V3 Timer (generic for all levels L0-L8)
// ============================================================================

/**
 * V3 Agent Timer — Generic
 *
 * Single function for all 9 timer levels. On timeout, calls v3 processMessage
 * with systemEvent { type: 'timer_expired', level } and routes output to
 * WhatsApp sending + state persistence.
 *
 * Concurrency 1 per sessionId prevents multiple timers of the same level
 * running in parallel for the same session.
 */
export const v3Timer = inngest.createFunction(
  {
    id: 'v3-timer',
    name: 'V3 Agent Timer',
    retries: 3,
    concurrency: [{ key: 'event.data.sessionId', limit: 1 }],
  },
  { event: 'agent/v3.timer.started' },
  async ({ event, step }) => {
    const {
      sessionId,
      conversationId,
      workspaceId,
      level,
      timerDurationMs,
      phoneNumber,
      contactId,
    } = event.data

    logger.info(
      { sessionId, conversationId, level, timerDurationMs },
      `V3 timer started (L${level})`
    )

    // CRITICAL: Settle 5s — same pattern as ALL v1 timers.
    // Prevents the agent/customer.message emitted in the same request
    // from cancelling this timer immediately.
    await step.sleep('settle', '5s')

    // Wait for customer message or timeout
    const reply = await step.waitForEvent('wait-for-reply', {
      event: 'agent/customer.message',
      timeout: `${timerDurationMs}ms`,
      match: 'data.sessionId',
    })

    if (reply) {
      logger.info({ sessionId, level }, 'V3 timer cancelled — customer replied')
      return { status: 'responded', action: 'customer_replied' }
    }

    // Timeout: execute v3 processMessage with systemEvent
    const result = await step.run('execute-timer', async () => {
      const supabase = createAdminClient()

      // a. Verify agent is still enabled
      const { data: conv } = await supabase
        .from('conversations')
        .select('is_agent_enabled')
        .eq('id', conversationId)
        .single()
      if (conv?.is_agent_enabled === false) {
        logger.info({ conversationId, level }, 'Agent disabled — skipping v3 timer')
        return { status: 'skipped' as const, action: 'agent_disabled' }
      }

      // Phase 42: defensive check — abort if session no longer active
      const guardResult = await checkSessionActive(sessionId)
      if (!guardResult.ok) {
        logger.info(
          { sessionId, level, handlerName: 'v3Timer', observedStatus: guardResult.status },
          'V3 timer aborted: session no longer active'
        )
        return { status: 'skipped' as const, action: 'session_not_active' }
      }

      // b. Read session via SessionManager
      const { SessionManager } = await import('@/lib/agents/session-manager')
      const sm = new SessionManager()
      const session = await sm.getSession(sessionId)

      // c. Build V3AgentInput with systemEvent
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawState = session.state as any
      const accionesEjecutadas: AccionRegistrada[] = rawState.acciones_ejecutadas ??
        (() => {
          try {
            const raw = (session.state.datos_capturados ?? {})['_v3:accionesEjecutadas']
            return raw ? JSON.parse(raw) : []
          } catch { return [] }
        })()

      const intentsVistos: string[] = (session.state.intents_vistos ?? []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (r: any) => typeof r === 'string' ? r : r.intent
      )

      const v3Input: V3AgentInput = {
        message: '',  // No customer message for timer
        history: [],  // Production reads from DB inside processMessage
        currentMode: session.current_mode,
        intentsVistos,
        templatesEnviados: session.state.templates_enviados ?? [],
        datosCapturados: session.state.datos_capturados ?? {},
        packSeleccionado: session.state.pack_seleccionado as string | null,
        accionesEjecutadas,
        turnNumber: 0,  // Timer turns don't increment turn counter
        workspaceId,
        systemEvent: { type: 'timer_expired', level: level as 0|1|2|3|4|5|6|7|8 },
      }

      // d. Call processMessage — route by agent module
      // Check session state first (contact-level routing for recompra),
      // then fall back to workspace-level config (godentist vs somnio-v3)
      const agentConfig = await getWorkspaceAgentConfig(workspaceId)
      let agentModule: 'somnio-v3' | 'godentist' | 'somnio-recompra' = 'somnio-v3'
      // `_v3:agent_module` lives inside `session.state.datos_capturados` (jsonb),
      // not as a top-level column of session_state — there is no such column.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sessionAgentModule = (session.state as any)?.datos_capturados?.['_v3:agent_module'] as string | undefined
      if (sessionAgentModule === 'somnio-recompra') {
        agentModule = 'somnio-recompra'
      } else if (agentConfig?.conversational_agent_id === 'godentist') {
        agentModule = 'godentist'
      }

      let output: V3AgentOutput
      if (agentModule === 'godentist') {
        const { processMessage } = await import('@/lib/agents/godentist/godentist-agent')
        output = await processMessage(v3Input as any) as unknown as V3AgentOutput
      } else if (agentModule === 'somnio-recompra') {
        const { processMessage } = await import('@/lib/agents/somnio-recompra/somnio-recompra-agent')
        output = await processMessage(v3Input as any) as unknown as V3AgentOutput
      } else {
        const { processMessage } = await import('@/lib/agents/somnio-v3/somnio-v3-agent')
        output = await processMessage(v3Input)
      }

      logger.info(
        {
          sessionId, level,
          newMode: output.newMode,
          messageCount: output.messages.length,
          templateCount: output.templates?.length ?? 0,
          shouldCreateOrder: output.shouldCreateOrder,
        },
        'V3 timer processMessage completed'
      )

      // e. Send templates via WhatsApp
      let sentCount = 0
      const templatesToSend = output.templates ?? output.messages.map(m => ({ content: m, contentType: 'texto' as const }))

      if (templatesToSend.length > 0) {
        const { calculateCharDelay } = await import('@/lib/agents/somnio/char-delay')

        for (const tmpl of templatesToSend) {
          const content = typeof tmpl === 'string' ? tmpl : tmpl.content
          const contentType = typeof tmpl === 'string' ? 'texto' : (tmpl.contentType ?? 'texto')
          if (!content || content.trim().length === 0) continue

          // Apply character delay for human-like timing
          const delayMs = calculateCharDelay(content.length)
          await new Promise(resolve => setTimeout(resolve, delayMs))

          let sent: boolean
          if (contentType === 'imagen') {
            sent = await sendTimerImage(workspaceId, conversationId, content)
          } else {
            sent = await sendTimerMessage(workspaceId, conversationId, content)
          }
          if (sent) sentCount++
        }
      }

      // e2. Record assistant turn in agent_turns (so comprehension has timer messages as context)
      if (sentCount > 0) {
        const messageBodies = templatesToSend.map(t => typeof t === 'string' ? t : t.content)
        const assistantContent = messageBodies.filter(m => m && m.trim().length > 0).join('\n')
        if (assistantContent.trim()) {
          try {
            const { SessionManager } = await import('@/lib/agents/session-manager')
            const sm = new SessionManager()
            const currentTurns = await sm.getTurns(sessionId)
            const nextTurnNumber = currentTurns.length > 0
              ? Math.max(...currentTurns.map(t => t.turn_number)) + 1
              : 1
            await sm.addTurn({
              sessionId,
              turnNumber: nextTurnNumber,
              role: 'assistant',
              content: assistantContent,
            })
            logger.info({ sessionId, level, chars: assistantContent.length }, 'Timer assistant turn saved')
          } catch (turnError) {
            logger.error({ turnError, sessionId, level }, 'Failed to save timer assistant turn')
          }
        }
      }

      // f. Save state updates
      await supabase.from('session_state').update({
        datos_capturados: output.datosCapturados,
        templates_enviados: output.templatesEnviados,
        pack_seleccionado: output.packSeleccionado,
        acciones_ejecutadas: output.accionesEjecutadas,
      }).eq('session_id', sessionId)

      // Update mode if changed
      if (output.newMode && output.newMode !== session.current_mode) {
        await supabase.from('agent_sessions').update({
          current_mode: output.newMode,
        }).eq('id', sessionId)
      }

      // g. Create order if needed
      if (output.shouldCreateOrder && output.orderData) {
        try {
          const { createProductionAdapters } = await import('@/lib/agents/engine-adapters/production')
          const adapters = createProductionAdapters({
            workspaceId,
            conversationId,
            phoneNumber,
            contactId,
            agentId: 'somnio-sales-v3',
          })
          const isOfiInter = output.datosCapturados['_v3:ofiInter'] === 'true'
          await adapters.orders.createOrder({
            datosCapturados: output.orderData.datosCapturados,
            packSeleccionado: output.orderData.packSeleccionado,
            workspaceId,
            sessionId,
            valorOverride: output.orderData.valorOverride,
            isOfiInter,
            cedulaRecoge: output.datosCapturados.cedula_recoge,
          })
          logger.info({ sessionId, level }, 'V3 timer order created')
        } catch (orderError) {
          logger.error({ orderError, sessionId, level }, 'V3 timer order creation failed')
        }
      }

      // h. Return result (include timerSignals for chaining)
      return {
        status: 'timeout' as const,
        action: `timer_L${level}_expired`,
        messagesSent: sentCount,
        newMode: output.newMode,
        shouldCreateOrder: output.shouldCreateOrder,
        timerSignals: output.timerSignals ?? [],
      }
    })

    // Chain: if the pipeline emitted new timer signals (e.g. L2→L3), fire them
    if (result.status === 'timeout' && result.timerSignals && result.timerSignals.length > 0) {
      await step.run('emit-chained-timers', async () => {
        const { getWorkspaceAgentConfig } = await import('@/lib/agents/production/agent-config')
        const { V3_TIMER_DURATIONS } = await import('@/lib/agents/somnio-v3/constants')
        const config = await getWorkspaceAgentConfig(workspaceId)
        const preset = config?.timer_preset ?? 'real'

        for (const signal of result.timerSignals) {
          if (signal.type !== 'start' || !signal.level) continue
          const chainLevel = parseInt(signal.level.replace('L', ''), 10)
          if (isNaN(chainLevel) || chainLevel < 0 || chainLevel > 8) continue

          const durationSeconds = V3_TIMER_DURATIONS[preset]?.[chainLevel]
            ?? V3_TIMER_DURATIONS.real[chainLevel]

          await inngest.send({
            name: 'agent/v3.timer.started',
            data: {
              sessionId,
              conversationId,
              workspaceId,
              level: chainLevel,
              timerDurationMs: durationSeconds * 1000,
              phoneNumber,
              contactId,
            },
          })

          logger.info(
            { chainLevel, timerDurationMs: durationSeconds * 1000, preset },
            `Chained timer L${chainLevel} emitted from L${level}`
          )
        }
      })
    }

    return result
  }
)

/**
 * All V3 timer functions for export.
 */
export const v3TimerFunctions = [v3Timer]
