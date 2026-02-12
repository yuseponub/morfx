/**
 * Agent Timer Workflows — Production
 * Mirrors sandbox IngestTimerSimulator behavior via Inngest durable functions.
 *
 * Sandbox timer fires → evaluates level → executes action:
 *   - send_message: send WhatsApp message
 *   - transition_mode: call engine with forceIntent (e.g., ofrecer_promos)
 *   - create_order: L3 → forceIntent: timer_sinpack, L4 → forceIntent: timer_pendiente
 *
 * Production does the SAME via Inngest step.waitForEvent() + UnifiedEngine.
 * Timer durations come from workspace_agent_config.timer_preset.
 */

import { inngest } from '../client'
import { SessionManager } from '@/lib/agents/session-manager'
import { sendTextMessage } from '@/lib/whatsapp/api'
import { createAdminClient } from '@/lib/supabase/admin'
import { createModuleLogger } from '@/lib/audit/logger'
import { TIMER_LEVELS, TIMER_ALL_FIELDS } from '@/lib/sandbox/ingest-timer'
import type { TimerEvalContext, TimerAction } from '@/lib/sandbox/types'
import { TIMER_MINIMUM_FIELDS } from '@/lib/agents/somnio/constants'

const logger = createModuleLogger('agent-timers')

// Lazy SessionManager
let _sessionManager: SessionManager | null = null
function getSessionManager(): SessionManager {
  if (!_sessionManager) _sessionManager = new SessionManager()
  return _sessionManager
}

// ============================================================================
// Helper: Send WhatsApp message directly via 360dialog API
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

async function getConversationPhone(conversationId: string): Promise<string | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('conversations')
    .select('phone')
    .eq('id', conversationId)
    .single()
  return data?.phone ?? null
}

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
    logger.info({ conversationId, wamid }, 'Timer WhatsApp message sent')
    return true
  } catch (error) {
    logger.error({ error, conversationId }, 'Failed to send timer WhatsApp message')
    return false
  }
}

// ============================================================================
// Helper: Call engine with forceIntent (mirrors sandbox timer behavior)
// ============================================================================

async function callEngineWithForceIntent(
  sessionId: string,
  conversationId: string,
  workspaceId: string,
  forceIntent: string,
  phone: string,
): Promise<void> {
  try {
    // Import barrel to trigger agent self-registration
    await import('@/lib/agents/somnio')

    const { UnifiedEngine } = await import('@/lib/agents/engine/unified-engine')
    const { createProductionAdapters } = await import('@/lib/agents/engine-adapters/production')

    const adapters = createProductionAdapters({
      workspaceId,
      conversationId,
      phoneNumber: phone,
    })

    const engine = new UnifiedEngine(adapters, { workspaceId })

    const result = await engine.processMessage({
      sessionId,
      conversationId,
      contactId: '', // Engine resolves from session
      message: '', // No customer message for timer-triggered calls
      workspaceId,
      history: [], // Production adapter reads from DB
      forceIntent,
      phoneNumber: phone,
    })

    logger.info(
      {
        sessionId,
        forceIntent,
        success: result.success,
        messagesSent: result.messagesSent,
        newMode: result.newMode,
        orderCreated: result.orderCreated,
      },
      'Engine forceIntent call completed'
    )
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    logger.error({ error: errMsg, sessionId, forceIntent }, 'Engine forceIntent call failed')
  }
}

// ============================================================================
// Helper: Build TimerEvalContext from session state
// ============================================================================

function buildTimerContext(session: {
  current_mode: string
  state: {
    datos_capturados: Record<string, string>
    pack_seleccionado: unknown
    templates_enviados?: string[]
  }
}): TimerEvalContext {
  const datos = session.state.datos_capturados ?? {}
  const fieldsCollected = TIMER_ALL_FIELDS.filter(
    f => datos[f] && datos[f].trim() !== '' && datos[f] !== 'N/A'
  )

  return {
    fieldsCollected,
    totalFields: fieldsCollected.length,
    currentMode: session.current_mode,
    packSeleccionado: session.state.pack_seleccionado as string | null,
    promosOffered: (session.state.templates_enviados ?? []).some(
      t => t.includes('ofrecer_promos') || t.includes('promo')
    ),
  }
}

// ============================================================================
// Helper: Execute timer action (mirrors sandbox onExpire handler)
// ============================================================================

async function executeTimerAction(
  level: number,
  action: TimerAction,
  sessionId: string,
  conversationId: string,
  workspaceId: string,
  phone: string,
): Promise<{ status: string; action: string }> {
  logger.info({ level, actionType: action.type, sessionId }, 'Executing timer action')

  if (action.type === 'send_message' && action.message) {
    // L0, L1: Just send message
    await sendWhatsAppMessage(workspaceId, conversationId, action.message)
    return { status: 'timeout', action: 'sent_message' }
  }

  if (action.type === 'transition_mode' && action.targetMode) {
    // L2: Transition to ofrecer_promos — call engine with forceIntent
    await callEngineWithForceIntent(
      sessionId, conversationId, workspaceId, action.targetMode, phone
    )
    return { status: 'timeout', action: `transitioned_to_${action.targetMode}` }
  }

  if (action.type === 'create_order') {
    // L3, L4: Send message + create order via engine with level-specific forceIntent
    // L3 (promos sin respuesta): timer_sinpack → pedido_sinpack mode, order with valor 0
    // L4 (pack sin confirmar): timer_pendiente → pedido_pendiente mode, order with selected pack valor 0
    if (action.message) {
      await sendWhatsAppMessage(workspaceId, conversationId, action.message)
    }
    const forceIntent = level === 3 ? 'timer_sinpack' : 'timer_pendiente'
    await callEngineWithForceIntent(
      sessionId, conversationId, workspaceId, forceIntent, phone
    )
    // Touch conversation AFTER order is created to trigger frontend realtime refresh.
    // The initial sendWhatsAppMessage fires BEFORE the engine creates the order,
    // so the frontend refreshes too early. This second touch ensures the conversations
    // realtime listener fires when the order already exists in DB.
    try {
      const supabase = createAdminClient()
      await supabase.from('conversations').update({
        last_message_at: new Date().toISOString(),
      }).eq('id', conversationId)
    } catch {
      // Non-critical — don't fail the timer action
    }
    return { status: 'timeout', action: `created_order_${forceIntent}` }
  }

  return { status: 'timeout', action: 'unknown_action' }
}

// ============================================================================
// Inngest Function: Ingest Timer (main timer — replaces all 3 old functions)
// ============================================================================

/**
 * Unified Ingest Timer
 *
 * Single timer function that evaluates levels on fire, same as sandbox.
 * Triggered by agent/ingest.started (when first data arrives or mode enters collecting_data).
 * Also handles collecting_data.started and promos.offered via separate triggers.
 *
 * Flow:
 * 1. Wait for timeout (duration from workspace preset)
 * 2. On timeout: evaluate current level from session state
 * 3. Build action for that level
 * 4. Execute action (send_message / transition_mode / create_order)
 */
export const ingestTimer = inngest.createFunction(
  {
    id: 'ingest-timer',
    name: 'Ingest Timer',
    retries: 3,
  },
  { event: 'agent/ingest.started' },
  async ({ event, step }) => {
    const { sessionId, conversationId, workspaceId, hasPartialData, timerDurationMs } = event.data

    logger.info({ sessionId, hasPartialData, timerDurationMs }, 'Ingest timer started')

    // Wait for completion or timeout
    const completionEvent = await step.waitForEvent('wait-for-completion', {
      event: 'agent/ingest.completed',
      timeout: `${timerDurationMs}ms`,
      match: 'data.sessionId',
    })

    if (completionEvent) {
      logger.info({ sessionId, reason: completionEvent.data.reason }, 'Ingest completed — timer cancelled')
      return { status: 'completed', reason: completionEvent.data.reason }
    }

    // Timeout: evaluate level and execute action
    const result = await step.run('evaluate-and-execute', async () => {
      const sm = getSessionManager()
      const session = await sm.getSession(sessionId)
      const ctx = buildTimerContext(session)

      // Evaluate which level applies
      let matchedLevel: number | null = null
      for (const level of TIMER_LEVELS) {
        if (level.evaluate(ctx)) {
          matchedLevel = level.id
          break
        }
      }

      if (matchedLevel === null) {
        logger.warn({ sessionId, ctx }, 'No timer level matched on timeout')
        return { status: 'timeout', action: 'no_level_matched' }
      }

      const levelConfig = TIMER_LEVELS.find(l => l.id === matchedLevel)!
      const action = levelConfig.buildAction(ctx)

      // Get phone for WhatsApp sending
      const phone = await getConversationPhone(conversationId)
      if (!phone) {
        logger.error({ conversationId }, 'No phone — cannot execute timer action')
        return { status: 'error', action: 'no_phone' }
      }

      return executeTimerAction(matchedLevel, action, sessionId, conversationId, workspaceId, phone)
    })

    return result
  }
)

/**
 * Data Collection Timer
 * Triggered when entering collecting_data mode (before any data arrives).
 * Evaluates level on timeout and delegates to same action system.
 */
export const dataCollectionTimer = inngest.createFunction(
  {
    id: 'data-collection-timer',
    name: 'Data Collection Timer',
    retries: 3,
  },
  { event: 'agent/collecting_data.started' },
  async ({ event, step }) => {
    const { sessionId, conversationId, workspaceId } = event.data
    const timeoutMs = event.data.timerDurationMs ?? 360_000

    logger.info({ sessionId, timeoutMs }, 'Data collection timer started')

    // Mark timer start
    await step.run('mark-timer-start', async () => {
      const sm = getSessionManager()
      await sm.updateState(sessionId, { proactive_started_at: new Date().toISOString() })
    })

    // Let concurrent events from the same request settle before listening
    // (prevents customer.message emitted in same request from cancelling this timer)
    await step.sleep('settle', '5s')

    // Wait for customer message or timeout
    const customerMessage = await step.waitForEvent('wait-for-data', {
      event: 'agent/customer.message',
      timeout: `${timeoutMs}ms`,
      match: 'data.sessionId',
    })

    if (customerMessage) {
      return { status: 'responded', action: 'customer_replied' }
    }

    // Timeout: evaluate level and execute action
    const result = await step.run('evaluate-and-execute', async () => {
      const sm = getSessionManager()
      const session = await sm.getSession(sessionId)
      const ctx = buildTimerContext(session)

      let matchedLevel: number | null = null
      for (const level of TIMER_LEVELS) {
        if (level.evaluate(ctx)) {
          matchedLevel = level.id
          break
        }
      }

      if (matchedLevel === null) {
        logger.warn({ sessionId }, 'No timer level matched')
        return { status: 'timeout', action: 'no_level_matched' }
      }

      const levelConfig = TIMER_LEVELS.find(l => l.id === matchedLevel)!
      const action = levelConfig.buildAction(ctx)

      const phone = await getConversationPhone(conversationId)
      if (!phone) {
        logger.error({ conversationId }, 'No phone')
        return { status: 'error', action: 'no_phone' }
      }

      return executeTimerAction(matchedLevel, action, sessionId, conversationId, workspaceId, phone)
    })

    return result
  }
)

/**
 * Promos Timer
 * Triggered when entering ofrecer_promos mode.
 * On timeout: create order via engine forceIntent.
 */
export const promosTimer = inngest.createFunction(
  {
    id: 'promos-timer',
    name: 'Promos Timer',
    retries: 3,
  },
  { event: 'agent/promos.offered' },
  async ({ event, step }) => {
    const { sessionId, conversationId, workspaceId } = event.data
    const timeoutMs = event.data.timerDurationMs ?? 600_000

    logger.info({ sessionId, timeoutMs }, 'Promos timer started')

    // Let concurrent events from the same request settle before listening
    // (prevents customer.message emitted in same request from cancelling this timer)
    await step.sleep('settle', '5s')

    // Wait for customer message or timeout
    const response = await step.waitForEvent('wait-for-selection', {
      event: 'agent/customer.message',
      timeout: `${timeoutMs}ms`,
      match: 'data.sessionId',
    })

    if (response) {
      return { status: 'responded', action: 'customer_replied' }
    }

    // Timeout: evaluate level and execute action
    const result = await step.run('evaluate-and-execute', async () => {
      const sm = getSessionManager()
      const session = await sm.getSession(sessionId)
      const ctx = buildTimerContext(session)

      let matchedLevel: number | null = null
      for (const level of TIMER_LEVELS) {
        if (level.evaluate(ctx)) {
          matchedLevel = level.id
          break
        }
      }

      if (matchedLevel === null) {
        logger.warn({ sessionId }, 'No timer level matched')
        return { status: 'timeout', action: 'no_level_matched' }
      }

      const levelConfig = TIMER_LEVELS.find(l => l.id === matchedLevel)!
      const action = levelConfig.buildAction(ctx)

      const phone = await getConversationPhone(conversationId)
      if (!phone) {
        logger.error({ conversationId }, 'No phone')
        return { status: 'error', action: 'no_phone' }
      }

      return executeTimerAction(matchedLevel, action, sessionId, conversationId, workspaceId, phone)
    })

    return result
  }
)

/**
 * Resumen Timer (L4: pack sin confirmar)
 * Triggered when customer selects a pack but doesn't confirm.
 * On timeout: create order with selected pack at valor 0.
 */
export const resumenTimer = inngest.createFunction(
  {
    id: 'resumen-timer',
    name: 'Resumen Timer',
    retries: 3,
  },
  { event: 'agent/resumen.started' },
  async ({ event, step }) => {
    const { sessionId, conversationId, workspaceId } = event.data
    const timeoutMs = event.data.timerDurationMs ?? 600_000

    logger.info({ sessionId, timeoutMs }, 'Resumen timer started (L4: pack sin confirmar)')

    // Let concurrent events from the same request settle before listening
    // (prevents customer.message emitted in same request from cancelling this timer)
    await step.sleep('settle', '5s')

    // Wait for customer message or timeout
    const response = await step.waitForEvent('wait-for-confirmation', {
      event: 'agent/customer.message',
      timeout: `${timeoutMs}ms`,
      match: 'data.sessionId',
    })

    if (response) {
      return { status: 'responded', action: 'customer_replied' }
    }

    // Timeout: evaluate level and execute action
    const result = await step.run('evaluate-and-execute', async () => {
      const sm = getSessionManager()
      const session = await sm.getSession(sessionId)
      const ctx = buildTimerContext(session)

      let matchedLevel: number | null = null
      for (const level of TIMER_LEVELS) {
        if (level.evaluate(ctx)) {
          matchedLevel = level.id
          break
        }
      }

      if (matchedLevel === null) {
        logger.warn({ sessionId }, 'No timer level matched')
        return { status: 'timeout', action: 'no_level_matched' }
      }

      const levelConfig = TIMER_LEVELS.find(l => l.id === matchedLevel)!
      const action = levelConfig.buildAction(ctx)

      const phone = await getConversationPhone(conversationId)
      if (!phone) {
        logger.error({ conversationId }, 'No phone')
        return { status: 'error', action: 'no_phone' }
      }

      return executeTimerAction(matchedLevel, action, sessionId, conversationId, workspaceId, phone)
    })

    return result
  }
)

/**
 * All agent timer functions for export.
 */
export const agentTimerFunctions = [
  dataCollectionTimer,
  promosTimer,
  resumenTimer,
  ingestTimer,
]
