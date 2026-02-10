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
  /** Optional pre-existing SessionManager instance (reuse for performance) */
  sessionManager?: SessionManager
}

/**
 * Create the complete set of production adapters.
 *
 * @returns EngineAdapters bundle with all 5 production adapter implementations
 */
export function createProductionAdapters(params: CreateProductionAdaptersParams): EngineAdapters {
  const sessionManager = params.sessionManager ?? new SessionManager()

  return {
    storage: new ProductionStorageAdapter(sessionManager, params.workspaceId),
    timer: new ProductionTimerAdapter(params.workspaceId),
    messaging: new ProductionMessagingAdapter(
      sessionManager,
      params.conversationId,
      params.workspaceId,
      params.phoneNumber
    ),
    orders: new ProductionOrdersAdapter(params.workspaceId),
    debug: new ProductionDebugAdapter(),
  }
}

// Re-export individual adapters for direct use/testing
export { ProductionStorageAdapter } from './storage'
export { ProductionTimerAdapter } from './timer'
export { ProductionMessagingAdapter } from './messaging'
export { ProductionOrdersAdapter } from './orders'
export { ProductionDebugAdapter } from './debug'
