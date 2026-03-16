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
 * 4. Send templates via WhatsApp, persist state, create order if needed
 */

import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'
import { createModuleLogger } from '@/lib/audit/logger'
import type { V3AgentInput, V3AgentOutput, AccionRegistrada } from '@/lib/agents/somnio-v3/types'

const logger = createModuleLogger('agent-timers-v3')

// ============================================================================
// Helper: Get WhatsApp API key from workspace settings
// ============================================================================

async function getWhatsAppApiKey(workspaceId: string): Promise<string | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('workspaces')
    .select('settings')
    .eq('id', workspaceId)
    .single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settings = data?.settings as any
  return settings?.whatsapp_api_key || process.env.WHATSAPP_API_KEY || null
}

// ============================================================================
// Helper: Get phone number from conversation
// ============================================================================

async function getConversationPhone(conversationId: string): Promise<string | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('conversations')
    .select('phone')
    .eq('id', conversationId)
    .single()
  return data?.phone ?? null
}

// ============================================================================
// Helper: Send WhatsApp message + store in DB
// ============================================================================

async function sendWhatsAppMessage(
  workspaceId: string,
  conversationId: string,
  message: string
): Promise<boolean> {
  const apiKey = await getWhatsAppApiKey(workspaceId)
  if (!apiKey) {
    logger.error({ workspaceId }, 'No WhatsApp API key')
    return false
  }
  const phone = await getConversationPhone(conversationId)
  if (!phone) {
    logger.error({ conversationId }, 'No phone for conversation')
    return false
  }
  try {
    const { sendTextMessage } = await import('@/lib/whatsapp/api')
    const response = await sendTextMessage(apiKey, phone, message)
    const wamid = response.messages?.[0]?.id
    const supabase = createAdminClient()
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      workspace_id: workspaceId,
      wamid,
      direction: 'outbound',
      type: 'text',
      content: { body: message } as unknown as Record<string, unknown>,
      status: 'sent',
      timestamp: new Date().toISOString(),
    })
    await supabase.from('conversations').update({
      last_message_at: new Date().toISOString(),
      last_message_preview: message.length > 100 ? message.slice(0, 100) + '...' : message,
    }).eq('id', conversationId)
    logger.info({ conversationId, wamid }, 'V3 timer WhatsApp message sent')
    return true
  } catch (error) {
    logger.error({ error, conversationId }, 'Failed to send v3 timer WhatsApp message')
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
        return { status: 'skipped', action: 'agent_disabled' }
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

      // d. Call v3 processMessage
      const { processMessage } = await import('@/lib/agents/somnio-v3/somnio-v3-agent')
      const output: V3AgentOutput = await processMessage(v3Input)

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
      const messagesToSend = output.templates
        ? output.templates.map(t => t.content)
        : output.messages

      if (messagesToSend.length > 0) {
        const { calculateCharDelay } = await import('@/lib/agents/somnio/char-delay')

        for (const msg of messagesToSend) {
          if (!msg || msg.trim().length === 0) continue

          // Apply character delay for human-like timing
          const delayMs = calculateCharDelay(msg.length)
          await new Promise(resolve => setTimeout(resolve, delayMs))

          const sent = await sendWhatsAppMessage(workspaceId, conversationId, msg)
          if (sent) sentCount++
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

      // h. Return result
      return {
        status: 'timeout',
        action: `timer_L${level}_expired`,
        messagesSent: sentCount,
        newMode: output.newMode,
        shouldCreateOrder: output.shouldCreateOrder,
      }
    })

    return result
  }
)

/**
 * All V3 timer functions for export.
 */
export const v3TimerFunctions = [v3Timer]
