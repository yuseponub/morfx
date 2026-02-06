/**
 * Agent Engine Type Definitions
 * Phase 13: Agent Engine Core - Plan 01
 *
 * TypeScript types for the Agent Engine system.
 * Matches database schema in supabase/migrations/20260205_agent_sessions.sql
 */

// ============================================================================
// Claude Model Types
// ============================================================================

/**
 * Available Claude models for agent components.
 * Haiku for fast/cheap operations, Sonnet for complex reasoning.
 */
export type ClaudeModel = 'claude-haiku-4-5' | 'claude-sonnet-4-5'

// ============================================================================
// Agent Configuration
// ============================================================================

/**
 * Configuration for a component that uses Claude (Intent Detector or Orchestrator)
 */
export interface ClaudeComponentConfig {
  /** Claude model to use */
  model: ClaudeModel
  /** System prompt for this component */
  systemPrompt: string
  /** Maximum tokens for response */
  maxTokens: number
}

/**
 * Confidence threshold configuration for routing decisions.
 * Based on user decision: 85/60/40 defaults.
 */
export interface ConfidenceThresholds {
  /** >= this confidence: proceed with flow (default: 85) */
  proceed: number
  /** >= this confidence: re-analyze with more context (default: 60) */
  reanalyze: number
  /** >= this confidence: ask for clarification (default: 40) */
  clarify: number
  /** < clarify threshold: handoff to human */
  handoff: number
}

/**
 * Agent state machine transition rules.
 * Maps each state to valid next states.
 */
export type StateTransitions = Record<string, string[]>

/**
 * Full agent configuration.
 * Registered in AgentRegistry, referenced by agent_id in sessions.
 */
export interface AgentConfig {
  /** Unique identifier (e.g., 'somnio-sales-v1') */
  id: string
  /** Human-readable name */
  name: string
  /** Description of agent's purpose */
  description: string

  /** Intent Detector configuration (Haiku recommended) */
  intentDetector: ClaudeComponentConfig
  /** Orchestrator configuration (Sonnet recommended) */
  orchestrator: ClaudeComponentConfig

  /** Available tools from Action DSL (e.g., ['crm.contact.create', 'whatsapp.message.send']) */
  tools: string[]

  /** State machine states (e.g., ['conversacion', 'collecting_data', 'ofrecer_promos']) */
  states: string[]
  /** Initial state for new sessions */
  initialState: string
  /** Valid state transitions */
  validTransitions: StateTransitions

  /** Confidence thresholds for routing */
  confidenceThresholds: ConfidenceThresholds

  /** Maximum tokens per conversation (default: 50000) */
  tokenBudget?: number
}

// ============================================================================
// Session Types (matches database schema)
// ============================================================================

/**
 * Session status values.
 * Matches CHECK constraint in agent_sessions table.
 */
export type SessionStatus = 'active' | 'paused' | 'closed' | 'handed_off'

/**
 * Agent session record.
 * Matches agent_sessions table schema.
 */
export interface AgentSession {
  id: string
  agent_id: string
  conversation_id: string
  contact_id: string
  workspace_id: string

  /** Optimistic locking version - increment on each update */
  version: number

  status: SessionStatus
  current_mode: string

  created_at: string
  updated_at: string
  last_activity_at: string
}

/**
 * Parameters for creating a new agent session
 */
export interface CreateSessionParams {
  agentId: string
  conversationId: string
  contactId: string
  workspaceId: string
  initialMode?: string
  initialState?: Partial<SessionState>
}

/**
 * Parameters for updating a session with optimistic locking
 */
export interface UpdateSessionParams {
  sessionId: string
  expectedVersion: number
  updates: Partial<Pick<AgentSession, 'status' | 'current_mode' | 'last_activity_at'>>
}

// ============================================================================
// Turn Types (matches database schema)
// ============================================================================

/**
 * Role for conversation turns.
 * Matches CHECK constraint in agent_turns table.
 */
export type TurnRole = 'user' | 'assistant' | 'system'

/**
 * Tool call record stored in tools_called JSONB column
 */
export interface ToolCallRecord {
  /** Tool name (Action DSL format: module.entity.action) */
  name: string
  /** Input parameters passed to tool */
  input: Record<string, unknown>
  /** Result from tool execution */
  result?: {
    success: boolean
    data?: unknown
    error?: {
      code: string
      message: string
    }
  }
}

/**
 * Agent turn record.
 * Matches agent_turns table schema.
 */
export interface AgentTurn {
  id: string
  session_id: string
  turn_number: number

  role: TurnRole
  content: string

  /** Intent detected (for user turns only) */
  intent_detected: string | null
  /** Confidence score 0-100 (for user turns only) */
  confidence: number | null

  /** Tool calls made during this turn (for assistant turns) */
  tools_called: ToolCallRecord[]

  /** Tokens used for this turn (input + output) */
  tokens_used: number

  created_at: string
}

/**
 * Parameters for adding a new turn
 */
export interface AddTurnParams {
  sessionId: string
  turnNumber: number
  role: TurnRole
  content: string
  intentDetected?: string
  confidence?: number
  toolsCalled?: ToolCallRecord[]
  tokensUsed?: number
}

// ============================================================================
// Session State Types (matches database schema)
// ============================================================================

/**
 * Intent tracking record for intents_vistos
 */
export interface IntentRecord {
  intent: string
  orden: number
  timestamp: string
}

/**
 * Pack selection options.
 * Matches CHECK constraint in session_state table.
 */
export type PackSelection = '1x' | '2x' | '3x'

/**
 * Session state record.
 * Matches session_state table schema.
 */
export interface SessionState {
  session_id: string

  /** History of detected intents in order */
  intents_vistos: IntentRecord[]
  /** Templates that have been sent */
  templates_enviados: string[]
  /** Customer data collected (name, phone, city, address, etc.) */
  datos_capturados: Record<string, string>
  /** Selected pack (null until selection made) */
  pack_seleccionado: PackSelection | null

  /** Timer tracking timestamps */
  proactive_started_at: string | null
  first_data_at: string | null
  min_data_at: string | null
  ofrecer_promos_at: string | null

  updated_at: string
}

/**
 * Initial state values for new sessions
 */
export interface InitialSessionState {
  intents_vistos?: IntentRecord[]
  templates_enviados?: string[]
  datos_capturados?: Record<string, string>
  pack_seleccionado?: PackSelection | null
}

// ============================================================================
// Intent Detection Types
// ============================================================================

/**
 * Alternative intent with confidence score
 */
export interface IntentAlternative {
  intent: string
  confidence: number
}

/**
 * Result from Intent Detector Claude component
 */
export interface IntentResult {
  /** Detected intent name */
  intent: string
  /** Confidence score 0-100 */
  confidence: number
  /** Alternative interpretations if ambiguous */
  alternatives?: IntentAlternative[]
  /** Brief reasoning explanation */
  reasoning?: string
}

// ============================================================================
// Orchestrator Types
// ============================================================================

/**
 * Action determined by Orchestrator based on confidence
 */
export type OrchestratorAction =
  | 'proceed'      // High confidence: continue with flow
  | 'reanalyze'    // Medium confidence: re-analyze with more context
  | 'clarify'      // Low confidence: ask customer for clarification
  | 'handoff'      // Very low confidence: transfer to human
  | 'execute_tool' // Execute one or more tools

/**
 * Tool call request from Orchestrator
 */
export interface ToolCallRequest {
  /** Tool name in Action DSL format (module.entity.action) */
  name: string
  /** Input parameters for the tool */
  input: Record<string, unknown>
}

/**
 * Result from Orchestrator Claude component
 */
export interface OrchestratorResult {
  /** Determined action based on intent and confidence */
  action: OrchestratorAction
  /** Tool calls to execute (when action is 'execute_tool') */
  toolCalls?: ToolCallRequest[]
  /** Response text to send to customer */
  response?: string
  /** Next mode to transition to */
  nextMode?: string
}

// ============================================================================
// Claude Message Types
// ============================================================================

/**
 * Content block types in Claude messages
 */
export type ContentBlockType = 'text' | 'tool_use' | 'tool_result'

/**
 * Text content block
 */
export interface TextBlock {
  type: 'text'
  text: string
}

/**
 * Tool use content block (from Claude)
 */
export interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

/**
 * Tool result content block (sent back to Claude)
 */
export interface ToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error?: boolean
}

/**
 * Union of all content block types
 */
export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock

/**
 * Message in Claude conversation format
 */
export interface ClaudeMessage {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

// ============================================================================
// Engine Types
// ============================================================================

/**
 * Parameters for processing a message through the agent engine
 */
export interface ProcessMessageParams {
  sessionId: string
  conversationId: string
  messageContent: string
  workspaceId: string
}

/**
 * Result from processing a message
 */
export interface AgentResponse {
  /** Response text to send to customer */
  response?: string
  /** Results from tool executions */
  toolResults?: ToolCallRecord[]
  /** Whether session was updated */
  sessionUpdated: boolean
  /** New session mode (if changed) */
  newMode?: string
  /** Total tokens used in this turn */
  tokensUsed?: number
}

// ============================================================================
// Token Budget Types
// ============================================================================

/**
 * Token usage tracking for a session
 */
export interface TokenUsage {
  sessionId: string
  /** Estimated input tokens used */
  totalInputTokens: number
  /** Estimated output tokens used */
  totalOutputTokens: number
  /** Total turns in session */
  turnCount: number
}

/**
 * Budget check result
 */
export interface BudgetCheckResult {
  /** Whether the operation is allowed */
  allowed: boolean
  /** Tokens remaining in budget */
  remaining: number
  /** Tokens already used */
  used: number
}

/**
 * Maximum tokens per conversation (user decision)
 */
export const MAX_TOKENS_PER_CONVERSATION = 50_000

// ============================================================================
// Database Row Types (for Supabase queries)
// ============================================================================

/**
 * Database row type for agent_sessions table
 */
export interface AgentSessionRow {
  id: string
  agent_id: string
  conversation_id: string
  contact_id: string
  workspace_id: string
  version: number
  status: string
  current_mode: string
  created_at: string
  updated_at: string
  last_activity_at: string
}

/**
 * Database row type for agent_turns table
 */
export interface AgentTurnRow {
  id: string
  session_id: string
  turn_number: number
  role: string
  content: string
  intent_detected: string | null
  confidence: number | null
  tools_called: unknown
  tokens_used: number
  created_at: string
}

/**
 * Database row type for session_state table
 */
export interface SessionStateRow {
  session_id: string
  intents_vistos: unknown
  templates_enviados: unknown
  datos_capturados: unknown
  pack_seleccionado: string | null
  proactive_started_at: string | null
  first_data_at: string | null
  min_data_at: string | null
  ofrecer_promos_at: string | null
  updated_at: string
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for TextBlock
 */
export function isTextBlock(block: ContentBlock): block is TextBlock {
  return block.type === 'text'
}

/**
 * Type guard for ToolUseBlock
 */
export function isToolUseBlock(block: ContentBlock): block is ToolUseBlock {
  return block.type === 'tool_use'
}

/**
 * Type guard for ToolResultBlock
 */
export function isToolResultBlock(block: ContentBlock): block is ToolResultBlock {
  return block.type === 'tool_result'
}

/**
 * Type guard for valid SessionStatus
 */
export function isValidSessionStatus(status: string): status is SessionStatus {
  return ['active', 'paused', 'closed', 'handed_off'].includes(status)
}

/**
 * Type guard for valid TurnRole
 */
export function isValidTurnRole(role: string): role is TurnRole {
  return ['user', 'assistant', 'system'].includes(role)
}

/**
 * Type guard for valid PackSelection
 */
export function isValidPackSelection(pack: string | null): pack is PackSelection | null {
  return pack === null || ['1x', '2x', '3x'].includes(pack)
}
