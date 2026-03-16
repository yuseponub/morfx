/**
 * Production Adapter Factory
 * Phase 16.1: Engine Unification - Plan 03
 *
 * Creates the complete EngineAdapters bundle for production environment.
 * All adapters use real DB (SessionManager), Inngest events, and WhatsApp messaging.
 */

import type { EngineAdapters } from '../../engine/types'
import { SessionManager } from '../../session-manager'
import { ProductionStorageAdapter } from './storage'
import { ProductionTimerAdapter } from './timer'
import { V3ProductionTimerAdapter } from './v3-timer'
import { ProductionMessagingAdapter } from './messaging'
import { ProductionOrdersAdapter } from './orders'
import { ProductionDebugAdapter } from './debug'

/** Parameters for creating production adapters */
interface CreateProductionAdaptersParams {
  /** Workspace ID for DB operations and isolation */
  workspaceId: string
  /** Conversation ID for message sequencer */
  conversationId: string
  /** Phone number for WhatsApp sending */
  phoneNumber?: string
  /** Contact ID for V3 timer adapter */
  contactId?: string
  /** Optional pre-existing SessionManager instance (reuse for performance) */
  sessionManager?: SessionManager
  /** Response speed multiplier (1.0=real delays, 0.2=fast, 0=instant) */
  responseSpeed?: number
  /** Agent ID for routing (v3 uses V3ProductionTimerAdapter, default uses V1) */
  agentId?: string
}

/**
 * Create the complete set of production adapters.
 *
 * Routes timer adapter by agentId:
 * - 'somnio-sales-v3' → V3ProductionTimerAdapter (signal-based, Inngest v3 timer)
 * - default → ProductionTimerAdapter (lifecycle hooks, Inngest v1 timers)
 *
 * @returns EngineAdapters bundle with all 5 production adapter implementations
 */
export function createProductionAdapters(params: CreateProductionAdaptersParams): EngineAdapters {
  const sessionManager = params.sessionManager ?? new SessionManager()

  // Route timer adapter based on agent version
  const timer = params.agentId === 'somnio-sales-v3'
    ? new V3ProductionTimerAdapter(
        params.workspaceId,
        params.conversationId,
        params.phoneNumber ?? '',
        params.contactId ?? '',
      )
    : new ProductionTimerAdapter(params.workspaceId)

  return {
    storage: new ProductionStorageAdapter(sessionManager, params.workspaceId),
    timer,
    messaging: new ProductionMessagingAdapter(
      sessionManager,
      params.conversationId,
      params.workspaceId,
      params.phoneNumber,
      params.responseSpeed
    ),
    orders: new ProductionOrdersAdapter(params.workspaceId),
    debug: new ProductionDebugAdapter(),
  }
}

// Re-export individual adapters for direct use/testing
export { ProductionStorageAdapter } from './storage'
export { ProductionTimerAdapter } from './timer'
export { V3ProductionTimerAdapter } from './v3-timer'
export { ProductionMessagingAdapter } from './messaging'
export { ProductionOrdersAdapter } from './orders'
export { ProductionDebugAdapter } from './debug'
