/**
 * V4 Agent Timer Workflows — Production
 * Standalone: somnio-sales-v4 (Plan 08)
 *
 * Cloned from agent-timers-v3.ts with Pitfall 10 renames + D-07/D-22 order creation.
 *
 * Single generic timer function for all V4 levels (L0-L8). Cloning rationale:
 * v4 is an independent agent (D-24) — cero imports desde @/lib/agents/somnio-v3/*.
 * v3 timer keeps running unchanged (Regla 6 — protect production agent).
 *
 * Diferencias clave vs v3:
 *  - id 'v4-timer' (v3 sigue como 'v3-timer' — sin colisión)
 *  - event 'agent/v4.timer.started' (sin colisión con v3 listener)
 *  - V4_TIMER_DURATIONS desde @/lib/agents/somnio-v4/constants (D-21 — duraciones idénticas a v3)
 *  - Routing dispatch directo a somnio-v4 (sin branching godentist/recompra — fuera de scope D-23)
 *  - Order creation INLINE via crm-mutation-tools.createOrder (D-07/D-22) en lugar de
 *    el legacy production adapter del agente v3 (D-07 — sin createProductionAdapters)
 *  - idempotencyKey por timer level: 'somnio-v4-createOrder-{sessionId}-timer_L{level}' (Pitfall 5)
 *
 * Defensive guard checkSessionActive preservado (D-43 — timers v4 post-flip hacen no-op
 * si sesión cerrada).
 *
 * Flow:
 * 1. agent/v4.timer.started → settle 5s → waitForEvent(customer.message)
 * 2. If customer replies → return 'responded'
 * 3. If timeout → v4 processMessage with systemEvent { type: 'timer_expired', level }
 * 4. Send templates via domain layer (WhatsApp/Facebook/Instagram), persist state, create order if needed
 */

import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'
import { createModuleLogger } from '@/lib/audit/logger'
import { checkSessionActive } from '@/lib/agents/timer-guard'
import type { V4AgentInput, V4AgentOutput, AccionRegistrada } from '@/lib/agents/somnio-v4/types'

const logger = createModuleLogger('agent-timers-v4')

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
      .select('settings, messenger_provider, instagram_provider')
      .eq('id', workspaceId)
      .single()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settings = ws?.settings as any
    const isMetaDirect =
      (channel === 'facebook' && ws?.messenger_provider === 'meta_direct') ||
      (channel === 'instagram' && ws?.instagram_provider === 'meta_direct')
    // meta_direct FB/IG: the domain resolves the Page token via resolveByWorkspace;
    // no manychat key needed. manychat + whatsapp arms byte-identical (Regla 6).
    const apiKey = isMetaDirect
      ? ''
      : (channel === 'facebook' || channel === 'instagram')
        ? settings?.manychat_api_key
        : settings?.whatsapp_api_key || process.env.WHATSAPP_API_KEY

    if (!apiKey && !isMetaDirect) {
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

    logger.info({ conversationId, channel, messageId: result.data?.messageId }, 'V4 timer message sent')

    return true
  } catch (err) {
    logger.error({ conversationId, err }, 'Failed to send V4 timer message')
    return false
  }
}

/**
 * Send an image message from a V4 timer via domain layer.
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
      .select('settings, messenger_provider, instagram_provider')
      .eq('id', workspaceId)
      .single()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settings = ws?.settings as any
    const isMetaDirect =
      (channel === 'facebook' && ws?.messenger_provider === 'meta_direct') ||
      (channel === 'instagram' && ws?.instagram_provider === 'meta_direct')
    // meta_direct FB/IG: the domain resolves the Page token via resolveByWorkspace;
    // no manychat key needed. manychat + whatsapp arms byte-identical (Regla 6).
    const apiKey = isMetaDirect
      ? ''
      : (channel === 'facebook' || channel === 'instagram')
        ? settings?.manychat_api_key
        : settings?.whatsapp_api_key || process.env.WHATSAPP_API_KEY

    if (!apiKey && !isMetaDirect) {
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

    logger.info({ conversationId, channel, messageId: result.data?.messageId }, 'V4 timer image sent')
    return true
  } catch (error) {
    logger.error({ error, conversationId }, 'Failed to send v4 timer message')
    return false
  }
}

// ============================================================================
// Inngest Function: V4 Timer (generic for all levels L0-L8)
// ============================================================================

/**
 * V4 Agent Timer — Generic
 *
 * Single function for all 9 timer levels. On timeout, calls v4 processMessage
 * with systemEvent { type: 'timer_expired', level } and routes output to
 * WhatsApp sending + state persistence + crm-mutation-tools.createOrder (D-07/D-22).
 *
 * Concurrency 1 per sessionId prevents multiple timers of the same level
 * running in parallel for the same session.
 *
 * Pitfall 10 — id / event name distintos a v3 (NO colisión con v3-timer).
 */
export const v4Timer = inngest.createFunction(
  {
    id: 'v4-timer',
    name: 'V4 Agent Timer',
    retries: 3,
    concurrency: [{ key: 'event.data.sessionId', limit: 1 }],
  },
  { event: 'agent/v4.timer.started' },
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
      `V4 timer started (L${level})`
    )

    // CRITICAL: Settle 5s — same pattern as ALL v1/v3 timers.
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
      logger.info({ sessionId, level }, 'V4 timer cancelled — customer replied')
      return { status: 'responded', action: 'customer_replied' }
    }

    // Timeout: execute v4 processMessage with systemEvent
    const result = await step.run('execute-timer', async () => {
      const supabase = createAdminClient()

      // a. Verify agent is still enabled
      const { data: conv } = await supabase
        .from('conversations')
        .select('is_agent_enabled')
        .eq('id', conversationId)
        .single()
      if (conv?.is_agent_enabled === false) {
        logger.info({ conversationId, level }, 'Agent disabled — skipping v4 timer')
        return { status: 'skipped' as const, action: 'agent_disabled' }
      }

      // D-43 (Phase 42 + somnio-sales-v4): defensive check — abort if session no longer active.
      // Critical post-flip behavior: v3 timers in flight at the moment of the v4 cutover
      // become no-ops because their sessions are bulk-closed by the flip SQL (D-38/D-40).
      // The same guard protects v4 timers if the inverse rollback ever happens.
      const guardResult = await checkSessionActive(sessionId)
      if (!guardResult.ok) {
        logger.info(
          { sessionId, level, handlerName: 'v4Timer', observedStatus: guardResult.status },
          'V4 timer aborted: session no longer active'
        )
        return { status: 'skipped' as const, action: 'session_not_active' }
      }

      // b. Read session via SessionManager
      const { SessionManager } = await import('@/lib/agents/session-manager')
      const sm = new SessionManager()
      const session = await sm.getSession(sessionId)

      // c. Build V4AgentInput with systemEvent
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawState = session.state as any
      const accionesEjecutadas: AccionRegistrada[] = rawState.acciones_ejecutadas ??
        (() => {
          try {
            // V4_META_PREFIX='_v4:' (D-30 — isolation from v3 keys)
            const raw = (session.state.datos_capturados ?? {})['_v4:accionesEjecutadas']
            return raw ? JSON.parse(raw) : []
          } catch { return [] }
        })()

      const intentsVistos: string[] = (session.state.intents_vistos ?? []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (r: any) => typeof r === 'string' ? r : r.intent
      )

      const v4Input: V4AgentInput = {
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
        sessionId,
        systemEvent: { type: 'timer_expired', level: level as 0|1|2|3|4|5|6|7|8 },
      }

      // d. Call processMessage — direct dispatch to somnio-v4.
      // D-23 + D-24: v4 scope is exclusively Somnio. No routing branches
      // (godentist / recompra / v3) — those agents have their own timer functions.
      const { processMessage } = await import('@/lib/agents/somnio-v4/somnio-v4-agent')
      const output: V4AgentOutput = await processMessage(v4Input)

      logger.info(
        {
          sessionId, level,
          newMode: output.newMode,
          messageCount: output.messages.length,
          templateCount: output.templates?.length ?? 0,
          requiresHuman: output.requiresHuman ?? false,
        },
        'V4 timer processMessage completed'
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
            logger.info({ sessionId, level, chars: assistantContent.length }, 'V4 timer assistant turn saved')
          } catch (turnError) {
            logger.error({ turnError, sessionId, level }, 'Failed to save v4 timer assistant turn')
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

      // g. (creación de pedido por timer ELIMINADA) — somnio-v4-consolidation D-13 / Pitfall 1.
      //    Ese camino era conductualmente INALCANZABLE: ninguna transición
      //    `timer_expired:*` produce acciones de CREATE_ORDER_ACTIONS (transitions.ts +
      //    constants.ts D-19). El big-bang D-06 del crm-subloop ya movió toda creación
      //    de pedido DENTRO del sub-loop (crm-gate), nunca por timer. Se borró el campo
      //    legacy de V4AgentOutput y el helper inline (re-construible si algún día un
      //    timer necesitara mutar CRM).

      // h. Return result (include timerSignals for chaining)
      return {
        status: 'timeout' as const,
        action: `timer_L${level}_expired`,
        messagesSent: sentCount,
        newMode: output.newMode,
        timerSignals: output.timerSignals ?? [],
      }
    })

    // Chain: if the pipeline emitted new timer signals (e.g. L2→L3), fire them as v4 events
    if (result.status === 'timeout' && result.timerSignals && result.timerSignals.length > 0) {
      await step.run('emit-chained-timers', async () => {
        const { getWorkspaceAgentConfig } = await import('@/lib/agents/production/agent-config')
        // V4_TIMER_DURATIONS: D-21 — heredar 3 timer levels de v3 sin cambios.
        const { V4_TIMER_DURATIONS } = await import('@/lib/agents/somnio-v4/constants')
        const config = await getWorkspaceAgentConfig(workspaceId)
        const preset = config?.timer_preset ?? 'real'

        for (const signal of result.timerSignals) {
          if (signal.type !== 'start' || !signal.level) continue
          const chainLevel = parseInt(signal.level.replace('L', ''), 10)
          if (isNaN(chainLevel) || chainLevel < 0 || chainLevel > 8) continue

          const durationSeconds = V4_TIMER_DURATIONS[preset]?.[chainLevel]
            ?? V4_TIMER_DURATIONS.real[chainLevel]

          await inngest.send({
            name: 'agent/v4.timer.started',
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
            `V4 chained timer L${chainLevel} emitted from L${level}`
          )
        }
      })
    }

    return result
  }
)

/**
 * All V4 timer functions for export.
 * Plan 08: registrar en src/app/api/inngest/route.ts (Inngest serve registry).
 */
export const v4TimerFunctions = [v4Timer]
