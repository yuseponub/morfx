/**
 * Sandbox Adapter Factory
 * Phase 16.1: Engine Unification - Plan 03
 *
 * Creates the complete EngineAdapters bundle for sandbox environment.
 * All adapters use in-memory state with no database operations.
 */

import type { EngineAdapters } from '../../engine/types'
import type { SandboxState } from '@/lib/sandbox/types'
import type { CrmExecutionMode } from '../../crm/types'
import { SandboxStorageAdapter } from './storage'
import { SandboxTimerAdapter } from './timer'
import { SandboxMessagingAdapter } from './messaging'
import { SandboxOrdersAdapter } from './orders'
import { SandboxDebugAdapter } from './debug'

/** CRM agent mode configuration */
interface CrmMode {
  agentId: string
  mode: CrmExecutionMode
}

/** Parameters for creating sandbox adapters */
interface CreateSandboxAdaptersParams {
  /** Current sandbox state */
  initialState: SandboxState
  /** Conversation history */
  history: { role: 'user' | 'assistant'; content: string }[]
  /** Enabled CRM agent modes */
  crmModes?: CrmMode[]
  /** Workspace ID for isolation */
  workspaceId?: string
}

/**
 * Create the complete set of sandbox adapters.
 *
 * @returns EngineAdapters bundle with all 5 sandbox adapter implementations
 */
export function createSandboxAdapters(params: CreateSandboxAdaptersParams): EngineAdapters {
  return {
    storage: new SandboxStorageAdapter(params.initialState, params.history, params.workspaceId),
    timer: new SandboxTimerAdapter(),
    messaging: new SandboxMessagingAdapter(),
    orders: new SandboxOrdersAdapter(params.crmModes, params.workspaceId),
    debug: new SandboxDebugAdapter(),
  }
}

// Re-export individual adapters for direct use/testing
export { SandboxStorageAdapter } from './storage'
export { SandboxTimerAdapter } from './timer'
export { SandboxMessagingAdapter } from './messaging'
export { SandboxOrdersAdapter } from './orders'
export { SandboxDebugAdapter } from './debug'
