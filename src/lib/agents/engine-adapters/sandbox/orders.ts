/**
 * Sandbox Orders Adapter
 * Phase 16.1: Engine Unification - Plan 03
 *
 * Routes order creation through CrmOrchestrator with dry-run or live mode.
 * Uses the CRM agent system (order-manager) for sandbox order creation
 * with tool execution tracking and mode annotation for debug panel.
 */

import type { OrdersAdapter } from '../../engine/types'
import type { CrmExecutionMode } from '../../crm/types'

/** CRM agent mode configuration */
interface CrmMode {
  agentId: string
  mode: CrmExecutionMode
}

export class SandboxOrdersAdapter implements OrdersAdapter {
  private crmModes: CrmMode[]
  private workspaceId: string

  constructor(crmModes?: CrmMode[], workspaceId?: string) {
    this.crmModes = crmModes ?? []
    this.workspaceId = workspaceId ?? 'sandbox'
  }

  /**
   * Create order via CrmOrchestrator if order-manager mode is configured.
   * Returns tool execution details with mode annotation for debug panel.
   */
  async createOrder(
    data: {
      datosCapturados: Record<string, string>
      packSeleccionado: unknown
      workspaceId: string
      sessionId: string
    },
    mode?: 'dry-run' | 'live'
  ): Promise<{
    success: boolean
    orderId?: string
    contactId?: string
    toolCalls?: unknown[]
    tokensUsed?: unknown[]
    error?: { message: string }
  }> {
    const orderManagerMode = this.crmModes.find(m => m.agentId === 'order-manager')

    if (!orderManagerMode) {
      // No CRM agents enabled - return placeholder
      return {
        success: false,
        error: {
          message: `No order-manager CRM agent configured. Pack: ${data.packSeleccionado}`,
        },
      }
    }

    const executionMode = mode ?? orderManagerMode.mode

    try {
      // Dynamic import to avoid circular dependencies
      const { crmOrchestrator } = await import('../../crm')

      const crmResult = await crmOrchestrator.route(
        {
          type: 'create_order',
          payload: {
            ...data.datosCapturados,
            pack: data.packSeleccionado,
            _workspaceId: this.workspaceId,
          },
          source: 'orchestrator',
          orderMode: 'full',
        },
        executionMode
      )

      // Add mode annotation to tool calls for debug panel
      const toolCalls = crmResult.toolCalls.map(t => ({
        ...t,
        mode: executionMode,
      }))

      return {
        success: crmResult.success,
        toolCalls,
        tokensUsed: crmResult.tokensUsed,
        error: crmResult.error ? { message: crmResult.error.message } : undefined,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown CRM error'
      return {
        success: false,
        error: { message: errorMessage },
      }
    }
  }
}
