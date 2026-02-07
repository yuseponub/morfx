/**
 * Sandbox Type Definitions
 * Phase 15: Agent Sandbox
 *
 * Types for the sandbox testing UI that simulates agent conversations
 * without affecting real data.
 */

import type { IntentResult, SessionState, ToolCallRecord, PackSelection, ModelTokenEntry } from '@/lib/agents/types'
import type { MessageClassification } from '@/lib/agents/somnio/message-classifier'

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
  tokensUsed: number // Total (backward compatible)
  /** Per-model breakdown (Phase 15.6) */
  models: ModelTokenEntry[]
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
 * Ingest status for sandbox visibility (Phase 15.5)
 *
 * Tracks the state of silent data accumulation during collecting_data mode.
 */
export interface IngestStatus {
  /** Whether ingest is currently active */
  active: boolean
  /** When ingest mode started (ISO string) */
  startedAt: string | null
  /** When first data message was received (ISO string) */
  firstDataAt: string | null
  /** List of fields that have been accumulated */
  fieldsAccumulated: string[]
  /** Timer type based on data status: 'partial' (6min) or 'no_data' (10min) */
  timerType: 'partial' | 'no_data' | null
  /** When timer expires (ISO string) - for display only, not enforced in sandbox */
  timerExpiresAt: string | null
  /** Last classification result for debug visibility */
  lastClassification?: MessageClassification
  /** Timeline of all classifications (Phase 15.6) */
  timeline: IngestTimelineEntry[]
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
  /** Ingest tracking for debug visibility (Phase 15.5) */
  ingestStatus?: IngestStatus
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

// ============================================================================
// CRM Agent Types (Phase 15.6)
// ============================================================================

/** Execution mode for CRM agents in sandbox */
export type CrmExecutionMode = 'dry-run' | 'live'

/** State of a CRM agent in the sandbox */
export interface CrmAgentState {
  agentId: string
  name: string
  description: string
  enabled: boolean
  mode: CrmExecutionMode
}

/** Result from a CRM agent command execution */
export interface CrmCommandResult {
  success: boolean
  agentId: string
  commandType: string
  data?: Record<string, unknown>
  toolCalls: ToolExecution[]
  tokensUsed: ModelTokenEntry[]
  mode: CrmExecutionMode
  timestamp: string
}

// ============================================================================
// Ingest Timeline Types (Phase 15.6)
// ============================================================================

/** A single entry in the ingest timeline */
export interface IngestTimelineEntry {
  /** Message content (truncated for display) */
  message: string
  /** Classification result */
  classification: 'datos' | 'pregunta' | 'mixto' | 'irrelevante'
  /** Classification confidence */
  confidence: number
  /** Fields extracted in this message (if any) */
  fieldsExtracted: string[]
  /** Timestamp of classification */
  timestamp: string
}

// ============================================================================
// Multi-Panel Debug Types (Phase 15.6)
// ============================================================================

/** Available debug panel tab IDs */
export type DebugPanelTabId = 'tools' | 'state' | 'intent' | 'tokens' | 'ingest'

/** Configuration for a debug panel tab */
export interface DebugPanelTab {
  id: DebugPanelTabId
  label: string
  visible: boolean
}
