/**
 * Agent Timer Workflows
 * Phase 13 + Hotfix: Production timer integration
 *
 * Durable timer workflows for proactive agent actions.
 * Uses step.waitForEvent() for timeout-based customer engagement.
 *
 * Timer durations come from workspace_agent_config.timer_preset:
 * - real: 6-10 min (production defaults)
 * - rapido: 30-60 seg (fast testing)
 * - instantaneo: 1-2 seg (instant testing)
 *
 * Messages sent directly via 360dialog API (not tool executor).
 */

import { inngest } from '../client'
import { SessionManager } from '@/lib/agents/session-manager'
import { sendTextMessage } from '@/lib/whatsapp/api'
import { createAdminClient } from '@/lib/supabase/admin'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('agent-timers')

// Lazy initialization to avoid circular dependencies
let _sessionManager: SessionManager | null = null
function getSessionManager(): SessionManager {
  if (!_sessionManager) {
    _sessionManager = new SessionManager()
  }
  return _sessionManager
}

/**
 * Get WhatsApp API key from workspace settings, fallback to env var.
 */
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

/**
 * Get phone number for a conversation.
 */
async function getConversationPhone(conversationId: string): Promise<string | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('conversations')
    .select('phone')
    .eq('id', conversationId)
    .single()
  return data?.phone ?? null
}

/**
 * Send a WhatsApp message directly via 360dialog API.
 * Also records the message in the DB.
 */
async function sendWhatsAppMessage(
  workspaceId: string,
  conversationId: string,
  message: string
): Promise<boolean> {
  const apiKey = await getWhatsAppApiKey(workspaceId)
  if (!apiKey) {
    logger.error({ workspaceId }, 'No WhatsApp API key configured')
    return false
  }

  const phone = await getConversationPhone(conversationId)
  if (!phone) {
    logger.error({ conversationId }, 'No phone number for conversation')
    return false
  }

  try {
    const response = await sendTextMessage(apiKey, phone, message)
    const wamid = response.messages?.[0]?.id

    // Record message in DB
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

    // Update conversation preview
    await supabase
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: message.length > 100 ? message.slice(0, 100) + '...' : message,
      })
      .eq('id', conversationId)

    logger.info({ conversationId, wamid }, 'Timer message sent via WhatsApp')
    return true
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    logger.error({ error: errMsg, conversationId }, 'Failed to send timer message')
    return false
  }
}

/**
 * Data Collection Timer
 *
 * Triggered when agent enters 'collecting_data' mode.
 * Duration comes from workspace preset (event.data.timerDurationMs).
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
    const timeoutMs = event.data.timerDurationMs ?? 360_000 // default 6 min

    logger.info({ sessionId, timeoutMs }, 'Data collection timer started')

    // Update session state to track timer start
    await step.run('mark-timer-start', async () => {
      const sessionManager = getSessionManager()
      await sessionManager.updateState(sessionId, {
        proactive_started_at: new Date().toISOString(),
      })
    })

    // Wait for customer message or timeout
    const customerMessage = await step.waitForEvent('wait-for-data', {
      event: 'agent/customer.message',
      timeout: `${timeoutMs}ms`,
      match: 'data.sessionId',
    })

    if (!customerMessage) {
      // Timeout: check data status and act accordingly
      const dataStatus = await step.run('check-data-status', async () => {
        const sessionManager = getSessionManager()
        const session = await sessionManager.getSession(sessionId)
        const datos = session.state.datos_capturados

        const required = ['nombre', 'telefono', 'ciudad', 'direccion', 'departamento']
        const missing = required.filter((field) => !datos[field])

        return {
          hasAnyData: Object.keys(datos).length > 0,
          missingFields: missing,
          isComplete: missing.length === 0,
        }
      })

      if (!dataStatus.hasAnyData) {
        // No data at all - send "quedamos pendientes"
        await step.run('send-pending-message', async () => {
          await sendWhatsAppMessage(
            workspaceId,
            conversationId,
            'Quedamos pendientes! Cuando tengas un momento, me cuentas para ayudarte con tu pedido.'
          )
        })

        return { status: 'timeout', action: 'sent_pending_message' }
      }

      if (!dataStatus.isComplete) {
        // Partial data - request missing fields
        const missingText = dataStatus.missingFields.join(', ')
        await step.run('request-missing-data', async () => {
          await sendWhatsAppMessage(
            workspaceId,
            conversationId,
            `Para continuar con tu pedido, necesito que me confirmes: ${missingText}`
          )
        })

        return { status: 'timeout', action: 'requested_missing_data', missing: dataStatus.missingFields }
      }

      // Complete data but timeout - still transition to promos
      logger.info({ sessionId }, 'Data complete, transitioning to promos after timeout')
    }

    // Check if data is complete
    const isComplete = await step.run('verify-data-complete', async () => {
      const sessionManager = getSessionManager()
      const session = await sessionManager.getSession(sessionId)
      const datos = session.state.datos_capturados
      const required = ['nombre', 'telefono', 'ciudad', 'direccion', 'departamento']
      return required.every((field) => !!datos[field])
    })

    if (isComplete) {
      // Data complete - wait briefly then trigger promos
      await step.sleep('wait-before-promos', '5s')

      await step.run('transition-to-promos', async () => {
        await inngest.send({
          name: 'agent/promos.offered',
          data: {
            sessionId,
            conversationId,
            workspaceId,
            packOptions: ['1x', '2x', '3x'],
          },
        })

        const sessionManager = getSessionManager()
        const session = await sessionManager.getSession(sessionId)
        await sessionManager.updateSessionWithVersion(sessionId, session.version, {
          currentMode: 'ofrecer_promos',
        })
        await sessionManager.updateState(sessionId, {
          ofrecer_promos_at: new Date().toISOString(),
        })
      })

      return { status: 'complete', action: 'transitioned_to_promos' }
    }

    // Customer responded but data still incomplete
    return { status: 'responded', action: 'awaiting_more_data' }
  }
)

/**
 * Promos Timer
 *
 * Triggered when promos are offered to customer.
 * Duration comes from workspace preset (event.data.timerDurationMs).
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
    const timeoutMs = event.data.timerDurationMs ?? 600_000 // default 10 min

    logger.info({ sessionId, timeoutMs }, 'Promos timer started')

    // Wait for customer response or timeout
    const response = await step.waitForEvent('wait-for-selection', {
      event: 'agent/customer.message',
      timeout: `${timeoutMs}ms`,
      match: 'data.sessionId',
    })

    if (!response) {
      // Timeout: send reminder message
      logger.info({ sessionId }, 'Promos timeout, sending reminder')

      await step.run('send-promos-reminder', async () => {
        await sendWhatsAppMessage(
          workspaceId,
          conversationId,
          'Quedamos pendientes con tu seleccion de pack. Cuando estes listo, me cuentas cual prefieres: 1x, 2x, o 3x'
        )
      })

      return { status: 'timeout', action: 'sent_reminder' }
    }

    // Customer responded - let the main engine process the selection
    return { status: 'responded', action: 'awaiting_selection_processing' }
  }
)

// ============================================================================
// Ingest Timer (Phase 15.5: Somnio Ingest System)
// ============================================================================

/**
 * Build timeout message based on data status.
 */
function buildTimeoutMessage(
  datosCapturados: Record<string, string>,
  hasPartialData: boolean
): string {
  if (!hasPartialData) {
    return 'Quedamos pendientes a tus datos, o si tienes alguna pregunta acerca del producto no dudes en hacerla'
  }

  const criticalFields = ['nombre', 'telefono', 'direccion', 'ciudad', 'departamento']
  const fieldLabels: Record<string, string> = {
    nombre: 'Tu nombre completo',
    telefono: 'Numero de telefono',
    direccion: 'Direccion de entrega',
    ciudad: 'Ciudad',
    departamento: 'Departamento',
  }

  const missing = criticalFields
    .filter(f => !datosCapturados[f] || datosCapturados[f] === 'N/A')
    .map(f => `- ${fieldLabels[f]}`)

  if (missing.length === 0) {
    return 'Quedamos pendientes a tus datos, o si tienes alguna pregunta acerca del producto no dudes en hacerla'
  }

  return `Para poder despachar tu producto nos faltaria:\n${missing.join('\n')}\nQuedamos pendientes`
}

/**
 * Ingest Timer
 *
 * Triggered when first data is received in collecting_data mode.
 * Duration comes from workspace preset via event.data.timerDurationMs.
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

    logger.info(
      { sessionId, hasPartialData, timerDurationMs },
      'Ingest timer started'
    )

    // Wait for completion event OR timeout
    const completionEvent = await step.waitForEvent('wait-for-completion', {
      event: 'agent/ingest.completed',
      timeout: `${timerDurationMs}ms`,
      match: 'data.sessionId',
    })

    if (completionEvent) {
      logger.info(
        { sessionId, reason: completionEvent.data.reason },
        'Ingest completed - timer cancelled'
      )
      return { status: 'completed', reason: completionEvent.data.reason }
    }

    // Timeout expired - send appropriate message
    await step.run('handle-ingest-timeout', async () => {
      const sessionManager = getSessionManager()
      const session = await sessionManager.getSession(sessionId)
      const datos = session.state.datos_capturados

      const message = buildTimeoutMessage(datos, hasPartialData)

      logger.info(
        { sessionId, hasPartialData },
        'Ingest timeout - sending message'
      )

      await sendWhatsAppMessage(workspaceId, conversationId, message)
    })

    return { status: 'timeout', hadData: hasPartialData }
  }
)

/**
 * All agent timer functions for export.
 */
export const agentTimerFunctions = [
  dataCollectionTimer,
  promosTimer,
  ingestTimer,
]
