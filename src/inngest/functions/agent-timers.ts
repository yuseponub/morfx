/**
 * Agent Timer Workflows
 * Phase 13: Agent Engine Core - Plan 06
 *
 * Durable timer workflows for proactive agent actions.
 * Uses step.waitForEvent() for timeout-based customer engagement.
 *
 * Replaces n8n's Proactive Timer with event-driven architecture:
 * - No polling loops
 * - Persistent across restarts
 * - Automatic retry on failures
 *
 * Note: Uses whatsapp.message.send handler implemented in Phase 12
 * (src/lib/tools/handlers/whatsapp/index.ts)
 */

import { inngest } from '../client'
import { SessionManager } from '@/lib/agents/session-manager'
import { executeToolFromAgent } from '@/lib/tools/executor'
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
 * Data Collection Timer
 *
 * Triggered when agent enters 'collecting_data' mode.
 * Waits for customer message with 6-minute timeout.
 *
 * Flow from CONTEXT.md:
 * - Wait for customer message (6 min timeout)
 * - If timeout without data: send "quedamos pendientes"
 * - If partial data: request missing fields
 * - If complete data: wait 2 min, then offer promos
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

    logger.info({ sessionId }, 'Data collection timer started')

    // Update session state to track timer start
    await step.run('mark-timer-start', async () => {
      const sessionManager = getSessionManager()
      await sessionManager.updateState(sessionId, {
        proactive_started_at: new Date().toISOString(),
      })
    })

    // Wait for customer message or timeout after 6 minutes
    const customerMessage = await step.waitForEvent('wait-for-data', {
      event: 'agent/customer.message',
      timeout: '6m',
      match: 'data.sessionId',
    })

    if (!customerMessage) {
      // Timeout: check data status and act accordingly
      const dataStatus = await step.run('check-data-status', async () => {
        const sessionManager = getSessionManager()
        const session = await sessionManager.getSession(sessionId)
        const datos = session.state.datos_capturados

        const required = ['nombre', 'telefono', 'ciudad', 'direccion']
        const missing = required.filter((field) => !datos[field])

        return {
          hasAnyData: Object.keys(datos).length > 0,
          missingFields: missing,
          isComplete: missing.length === 0,
        }
      })

      if (!dataStatus.hasAnyData) {
        // No data at all - send "quedamos pendientes"
        // Uses whatsapp.message.send from Phase 12: src/lib/tools/handlers/whatsapp/index.ts
        await step.run('send-pending-message', async () => {
          await executeToolFromAgent(
            'whatsapp.message.send',
            {
              contactId: conversationId, // Tool uses contactId to find conversation
              message: 'Quedamos pendientes! Cuando tengas un momento, me cuentas para ayudarte con tu pedido.',
            },
            workspaceId,
            sessionId
          )
        })

        return { status: 'timeout', action: 'sent_pending_message' }
      }

      if (!dataStatus.isComplete) {
        // Partial data - request missing fields
        const missingText = dataStatus.missingFields.join(', ')
        await step.run('request-missing-data', async () => {
          await executeToolFromAgent(
            'whatsapp.message.send',
            {
              contactId: conversationId,
              message: `Para continuar con tu pedido, necesito que me confirmes: ${missingText}`,
            },
            workspaceId,
            sessionId
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
      const required = ['nombre', 'telefono', 'ciudad', 'direccion']
      return required.every((field) => !!datos[field])
    })

    if (isComplete) {
      // Data complete - wait 2 minutes then trigger promos
      await step.sleep('wait-before-promos', '2m')

      await step.run('transition-to-promos', async () => {
        // Emit event to trigger promos workflow
        await inngest.send({
          name: 'agent/promos.offered',
          data: {
            sessionId,
            conversationId,
            workspaceId,
            packOptions: ['1x', '2x', '3x'],
          },
        })

        // Update session mode
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
 * Waits for pack selection with 10-minute timeout.
 *
 * Flow from CONTEXT.md:
 * - Wait for customer response (10 min timeout)
 * - If timeout: auto-create order with default pack
 * - If response: process pack selection
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

    logger.info({ sessionId }, 'Promos timer started')

    // Wait for customer response or timeout after 10 minutes
    const response = await step.waitForEvent('wait-for-selection', {
      event: 'agent/customer.message',
      timeout: '10m',
      match: 'data.sessionId',
    })

    if (!response) {
      // Timeout: auto-create order with default pack (1x)
      logger.info({ sessionId }, 'Promos timeout, auto-creating order')

      const orderResult = await step.run('auto-create-order', async () => {
        const sessionManager = getSessionManager()
        const session = await sessionManager.getSession(sessionId)

        // Create order with default pack
        const result = await executeToolFromAgent(
          'crm.order.create',
          {
            contact_id: session.contact_id,
            products: [{ product_id: 'default-pack-1x', quantity: 1 }],
            notes: 'Auto-created after 10 min timeout. Pack: 1x',
          },
          workspaceId,
          sessionId
        )

        // Update session state
        await sessionManager.updateState(sessionId, {
          pack_seleccionado: '1x',
        })

        return result
      })

      // Send confirmation message using whatsapp.message.send from Phase 12
      await step.run('send-order-confirmation', async () => {
        await executeToolFromAgent(
          'whatsapp.message.send',
          {
            contactId: conversationId,
            message: 'He creado tu pedido con el Pack 1x. Un asesor se pondra en contacto contigo pronto para confirmar los detalles.',
          },
          workspaceId,
          sessionId
        )
      })

      // Update session mode
      await step.run('update-session-mode', async () => {
        const sessionManager = getSessionManager()
        const session = await sessionManager.getSession(sessionId)
        await sessionManager.updateSessionWithVersion(sessionId, session.version, {
          currentMode: 'compra_confirmada',
        })
      })

      // Access orderId safely from untyped outputs
      const orderId = orderResult?.outputs && typeof orderResult.outputs === 'object'
        ? (orderResult.outputs as Record<string, unknown>).id
        : undefined
      return { status: 'timeout', action: 'auto_created_order', orderId }
    }

    // Customer responded - let the main engine process the selection
    return { status: 'responded', action: 'awaiting_selection_processing' }
  }
)

/**
 * All agent timer functions for export.
 */
export const agentTimerFunctions = [
  dataCollectionTimer,
  promosTimer,
]
