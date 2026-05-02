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
          shouldCreateOrder: output.shouldCreateOrder,
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

      // g. Create order if needed — D-07/D-22 INLINE via crm-mutation-tools.
      //    Pitfall 5: idempotencyKey per timer level distinguishes happy-path
      //    'somnio-v4-createOrder-{sessionId}-happy' from L3/L4 timer-driven calls.
      //
      //    NOTE: crm-mutation-tools.createOrder requires contactId/pipelineId/stageId UUIDs
      //    inline. Resolution lives in the helper below — uses OrderCreator (shared,
      //    NOT somnio-v3) for findOrCreateContact + lookups for pipeline/stage. The actual
      //    mutation runs through tools.createOrder which routes to domain.createOrder
      //    (Regla 3 — domain layer único punto de mutación).
      let orderCreated = false
      let orderError: string | undefined
      if (output.shouldCreateOrder && output.orderData) {
        const orderResult = await createTimerOrderV4({
          workspaceId,
          sessionId,
          level: level as 0|1|2|3|4|5|6|7|8,
          datosCapturados: output.orderData.datosCapturados,
          packSeleccionado: output.orderData.packSeleccionado,
          valorOverride: output.orderData.valorOverride,
          isOfiInter: output.datosCapturados['_v4:ofiInter'] === 'true',
          cedulaRecoge: output.datosCapturados.cedula_recoge,
        })
        orderCreated = orderResult.success
        orderError = orderResult.error
        if (orderResult.success) {
          logger.info({ sessionId, level, orderId: orderResult.orderId }, 'V4 timer order created')
        } else {
          logger.error({ sessionId, level, error: orderResult.error, errorCode: orderResult.errorCode }, 'V4 timer order creation failed')
        }
      }

      // h. Return result (include timerSignals for chaining)
      return {
        status: 'timeout' as const,
        action: `timer_L${level}_expired`,
        messagesSent: sentCount,
        newMode: output.newMode,
        shouldCreateOrder: output.shouldCreateOrder,
        orderCreated,
        orderError,
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

// ============================================================================
// Helper: Create order INLINE via crm-mutation-tools (D-07/D-22)
// ============================================================================

interface CreateTimerOrderArgs {
  workspaceId: string
  sessionId: string
  level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  datosCapturados: Record<string, string>
  packSeleccionado: string | null
  valorOverride?: number
  isOfiInter: boolean
  cedulaRecoge?: string
}

interface CreateTimerOrderResult {
  success: boolean
  orderId?: string
  contactId?: string
  error?: string
  errorCode?: string
}

/**
 * V4 timer-driven createOrder — INLINE via crm-mutation-tools (D-07/D-22).
 *
 * Replaces the v3 timer's legacy production adapter (`adapters.orders.createOrder` reached
 * through the agent-id specific factory) with a direct call to
 * `crm-mutation-tools.createOrder.execute()`. The contact / pipeline /
 * stage UUID resolution that the tool expects is performed inline using:
 *   - OrderCreator.findOrCreateContact (SHARED helper under @/lib/agents/somnio/, NOT v3)
 *     to resolve / create the contact UUID.
 *   - direct Supabase queries for default pipeline + 'NUEVO PEDIDO' stage by name
 *     (same pattern as ProductionOrdersAdapter — pre-existing infrastructure code, not
 *     agent-specific).
 *
 * Pitfall 5: idempotencyKey carries the timer level tag so repeated runs of the
 * same Inngest function (retries=3) do not duplicate orders, and L3 vs L4 vs happy
 * path each get distinct keys.
 *
 * Anti-patterns:
 * - NO usar el production adapter del agente legacy (D-07 — sin createProductionAdapters)
 * - NO importar @/lib/agents/somnio-v3/* (D-24)
 * - NO retry implícito en stage_changed_concurrently (Pitfall 1) — N/A para createOrder
 *   pero documentado por consistencia con moveOrderToStage.
 */
async function createTimerOrderV4(args: CreateTimerOrderArgs): Promise<CreateTimerOrderResult> {
  const { OrderCreator } = await import('@/lib/agents/somnio/order-creator')
  const { createCrmMutationTools } = await import('@/lib/agents/shared/crm-mutation-tools')
  const { SOMNIO_V4_AGENT_ID, SOMNIO_WORKSPACE_ID } = await import('@/lib/agents/somnio-v4/config')
  const { initializeTools } = await import('@/lib/tools/init')

  // findOrCreateContact uses executeToolFromAgent — required initialization.
  initializeTools()

  const pack = (args.packSeleccionado as '1x' | '2x' | '3x' | null) ?? '1x'
  const isTimerOrder = args.valorOverride !== undefined

  // Validate required contact data BEFORE we touch CRM.
  const required = args.isOfiInter
    ? ['nombre', 'telefono', 'ciudad', 'departamento']
    : ['nombre', 'telefono', 'direccion', 'ciudad', 'departamento']
  const missing = required.filter((f) => {
    const v = args.datosCapturados[f]
    return !v || v.trim().length === 0 || v === 'N/A'
  })
  if (missing.length > 0) {
    return {
      success: false,
      error: `Missing required contact data: ${missing.join(', ')}`,
      errorCode: 'missing_contact_data',
    }
  }

  if (!pack && !isTimerOrder) {
    return { success: false, error: 'No pack selected', errorCode: 'no_pack' }
  }

  try {
    // Step 1: resolve contactId via shared helper.
    const orderCreator = new OrderCreator(args.workspaceId)
    const contactData = {
      nombre: args.datosCapturados.nombre,
      apellido: args.datosCapturados.apellido,
      telefono: args.datosCapturados.telefono,
      direccion: args.datosCapturados.direccion,
      ciudad: args.datosCapturados.ciudad,
      departamento: args.datosCapturados.departamento,
      barrio: args.datosCapturados.barrio,
      correo: args.datosCapturados.correo,
      indicaciones_extra: args.datosCapturados.indicaciones_extra,
    }
    const { contactId } = await orderCreator.findOrCreateContact(contactData, args.sessionId)
    if (!contactId) {
      return { success: false, error: 'No se pudo crear el contacto', errorCode: 'contact_failed' }
    }

    // Step 2: lookup default pipeline + 'NUEVO PEDIDO' stage.
    const supabase = createAdminClient()
    const { data: pipelineData } = await supabase
      .from('pipelines')
      .select('id')
      .eq('workspace_id', args.workspaceId)
      .eq('is_default', true)
      .single()
    const pipelineId = pipelineData?.id ?? (
      await supabase
        .from('pipelines')
        .select('id')
        .eq('workspace_id', args.workspaceId)
        .limit(1)
        .single()
    ).data?.id
    if (!pipelineId) {
      return { success: false, error: 'No pipeline configured', errorCode: 'no_pipeline' }
    }

    let stageId: string | undefined
    const { data: namedStage } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('pipeline_id', pipelineId)
      .ilike('name', 'NUEVO PEDIDO')
      .single()
    if (namedStage) stageId = namedStage.id

    // Step 3: pack metadata + price.
    const product = orderCreator.mapPackToProduct(pack)
    const effectivePrice = isTimerOrder ? (args.valorOverride ?? 0) : product.price

    // Step 4: build shipping address + description.
    const shippingAddress = args.isOfiInter
      ? `OFICINA INTER - ${contactData.ciudad}, ${contactData.departamento}`
      : [
          contactData.direccion,
          contactData.barrio ? `Barrio ${contactData.barrio}` : null,
          contactData.ciudad,
          contactData.departamento && contactData.departamento !== contactData.ciudad ? contactData.departamento : null,
        ].filter(Boolean).join(', ')

    // Step 5: createOrder via crm-mutation-tools (D-07/D-22) with idempotencyKey per level (Pitfall 5).
    const tools = createCrmMutationTools({
      workspaceId: args.workspaceId || SOMNIO_WORKSPACE_ID,
      invoker: SOMNIO_V4_AGENT_ID,
    })

    const idempotencyKey = `somnio-v4-createOrder-${args.sessionId}-timer_L${args.level}`

    const orderName = contactData.apellido
      ? `${contactData.nombre} ${contactData.apellido}`
      : contactData.nombre

    const sku = product.productName.substring(0, 50).toUpperCase().replace(/\s+/g, '-')

    // Cast helper — AI SDK v6 typed Tool.execute? signature wraps the runtime call.
    // Same pattern used in src/lib/agents/somnio-v4/invocations.ts (Plan 07).
    type CreateOrderInput = {
      contactId: string
      pipelineId: string
      stageId?: string
      name?: string
      description?: string
      shippingAddress?: string
      shippingCity?: string
      shippingDepartment?: string
      items?: Array<{ sku: string; title: string; unitPrice: number; quantity: number }>
      idempotencyKey?: string
    }
    type CreateOrderOutcome = { status: string; data?: { orderId?: string; id?: string }; error?: { code?: string; message?: string } }

    const exec = tools.createOrder.execute as unknown as
      (input: CreateOrderInput) => Promise<CreateOrderOutcome>

    const result = await exec({
      contactId,
      pipelineId,
      stageId,
      name: orderName,
      description: args.isOfiInter
        ? `OFI INTER | Cedula recoge: ${args.cedulaRecoge || 'No proporcionada'}${contactData.indicaciones_extra ? ` | ${contactData.indicaciones_extra}` : ''}`
        : (contactData.indicaciones_extra ?? undefined),
      shippingAddress,
      shippingCity: contactData.ciudad ?? undefined,
      shippingDepartment: contactData.departamento ?? undefined,
      items: [
        {
          sku,
          title: product.productName,
          unitPrice: effectivePrice,
          quantity: product.quantity,
        },
      ],
      idempotencyKey,
    })

    // D-20: validate success BEFORE the outer caller emits the post-success template.
    // The template send already happened in step 'e' above (templatesToSend) which is
    // upstream of createOrder. v4 plan acepta gap: el template se envia antes de
    // crear el pedido (mismo orden que v3). Si la mutación falla, observability
    // captura el fallo + addOrderNote audit (V1.1 cierra el loop con re-orden).
    if (result.status !== 'executed' && result.status !== 'duplicate') {
      return {
        success: false,
        contactId,
        error: result.error?.message ?? 'createOrder failed',
        errorCode: result.error?.code ?? result.status ?? 'unknown',
      }
    }

    const orderId = result.data?.orderId ?? result.data?.id

    return {
      success: true,
      orderId,
      contactId,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMessage, errorCode: 'unexpected' }
  }
}

/**
 * All V4 timer functions for export.
 * Plan 08: registrar en src/app/api/inngest/route.ts (Inngest serve registry).
 */
export const v4TimerFunctions = [v4Timer]
