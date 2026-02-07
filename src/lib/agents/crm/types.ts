/**
 * CRM Agent Type Definitions
 * Phase 15.6: Sandbox Evolution
 *
 * Interfaces for CRM agents that execute data operations.
 * CRM agents are separate from conversational agents (Somnio).
 */

import type { ModelTokenEntry } from '@/lib/agents/types'
import type { ToolExecution } from '@/lib/sandbox/types'

/** Execution mode for CRM agents */
export type CrmExecutionMode = 'dry-run' | 'live'

/** CRM command types (extensible as more agents are added) */
export type CrmCommandType =
  | 'create_order'    // Order Manager: create order with contact
  | 'edit_order'      // Future: Edit Order agent
  | 'search_contact'  // Future: Search Contact agent

/** Order Manager operating modes */
export type OrderManagerMode = 'full' | 'no_promo' | 'draft'

/** A command to be executed by a CRM agent */
export interface CrmCommand {
  /** Command type determines which agent handles it */
  type: CrmCommandType
  /** Command-specific payload */
  payload: Record<string, unknown>
  /** Source of the command */
  source: 'orchestrator' | 'manual'
  /** Order Manager specific: operating mode */
  orderMode?: OrderManagerMode
}

/** Result from a CRM agent execution */
export interface CrmAgentResult {
  /** Whether the operation succeeded */
  success: boolean
  /** Agent that executed the command */
  agentId: string
  /** Command type that was executed */
  commandType: CrmCommandType
  /** Result data (mock in dry-run, real in live) */
  data?: Record<string, unknown>
  /** Tool calls made during execution (for debug visibility) */
  toolCalls: ToolExecution[]
  /** Token usage per model (if Claude was used) */
  tokensUsed: ModelTokenEntry[]
  /** Execution mode */
  mode: CrmExecutionMode
  /** Execution timestamp */
  timestamp: string
  /** Error info if failed */
  error?: { code: string; message: string }
}

/** CRM agent interface - all CRM agents must implement this */
export interface CrmAgent {
  /** Unique identifier */
  id: string
  /** Human-readable name */
  name: string
  /** Description of what this agent does */
  description: string
  /** Command types this agent can handle */
  supportedCommands: CrmCommandType[]
  /** Execute a command in dry-run or live mode */
  execute(command: CrmCommand, mode: CrmExecutionMode): Promise<CrmAgentResult>
}

/** Configuration for CRM agent UI display in sandbox */
export interface CrmAgentInfo {
  id: string
  name: string
  description: string
  supportedCommands: CrmCommandType[]
}
