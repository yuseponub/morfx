/**
 * Sandbox Type Definitions
 * Phase 15: Agent Sandbox
 *
 * Types for the sandbox testing UI that simulates agent conversations
 * without affecting real data.
 */

import type { IntentResult, SessionState, ToolCallRecord, PackSelection } from '@/lib/agents/types'

/**
 * Message in sandbox conversation
 */
export interface SandboxMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string // ISO string, always show HH:MM:SS
}

/**
 * Tool execution with full details for debugging
 */
export interface ToolExecution {
  name: string
  input: Record<string, unknown>
  result?: {
    success: boolean
    data?: unknown
    error?: { code: string; message: string }
  }
  durationMs?: number
  timestamp: string
}

/**
 * Intent detection info for debugging
 */
export interface IntentInfo {
  intent: string
  confidence: number
  alternatives?: { intent: string; confidence: number }[]
  reasoning?: string
  timestamp: string
}

/**
 * Token usage info for debugging
 */
export interface TokenInfo {
  turnNumber: number
  tokensUsed: number
  timestamp: string
}

/**
 * Debug information for a single turn
 */
export interface DebugTurn {
  turnNumber: number
  intent?: IntentInfo
  tools: ToolExecution[]
  tokens: TokenInfo
  stateAfter: SandboxState
}

/**
 * Sandbox session state (in-memory, not persisted to DB)
 */
export interface SandboxState {
  currentMode: string
  intentsVistos: string[]
  templatesEnviados: string[]
  datosCapturados: Record<string, string>
  packSeleccionado: PackSelection | null
}

/**
 * Saved sandbox session for localStorage
 */
export interface SavedSandboxSession {
  id: string
  name: string
  agentId: string
  messages: SandboxMessage[]
  state: SandboxState
  debugTurns: DebugTurn[]
  totalTokens: number
  createdAt: string
  updatedAt: string
}

/**
 * Active sandbox session (in-memory during testing)
 */
export interface ActiveSandboxSession {
  agentId: string
  messages: SandboxMessage[]
  state: SandboxState
  debugTurns: DebugTurn[]
  totalTokens: number
  isTyping: boolean
}

/**
 * Result from SandboxEngine.processMessage()
 */
export interface SandboxEngineResult {
  success: boolean
  /** Response messages (may be multiple for sequences) */
  messages: string[]
  /** Debug info for this turn */
  debugTurn: DebugTurn
  /** New state after processing */
  newState: SandboxState
  /** Error if failed */
  error?: { code: string; message: string }
}
