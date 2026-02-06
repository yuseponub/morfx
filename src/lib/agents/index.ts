/**
 * Agent Engine Public Exports
 * Phase 13: Agent Engine Core - Plan 01
 *
 * Re-exports all public types and utilities from the agents module.
 * Import from '@/lib/agents' for clean access.
 */

// ============================================================================
// Types
// ============================================================================

// Claude model types
export type { ClaudeModel } from './types'

// Agent configuration types
export type {
  ClaudeComponentConfig,
  ConfidenceThresholds,
  StateTransitions,
  AgentConfig,
} from './types'

// Session types
export type {
  SessionStatus,
  AgentSession,
  CreateSessionParams,
  UpdateSessionParams,
} from './types'

// Turn types
export type {
  TurnRole,
  ToolCallRecord,
  AgentTurn,
  AddTurnParams,
} from './types'

// Session state types
export type {
  IntentRecord,
  PackSelection,
  SessionState,
  InitialSessionState,
} from './types'

// Intent detection types
export type {
  IntentAlternative,
  IntentResult,
} from './types'

// Orchestrator types
export type {
  OrchestratorAction,
  ToolCallRequest,
  OrchestratorResult,
} from './types'

// Claude message types
export type {
  ContentBlockType,
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
  ContentBlock,
  ClaudeMessage,
} from './types'

// Engine types
export type {
  ProcessMessageParams,
  AgentResponse,
} from './types'

// Token budget types
export type {
  TokenUsage,
  BudgetCheckResult,
} from './types'

// Database row types
export type {
  AgentSessionRow,
  AgentTurnRow,
  SessionStateRow,
} from './types'

// Constants
export { MAX_TOKENS_PER_CONVERSATION } from './types'

// Type guards
export {
  isTextBlock,
  isToolUseBlock,
  isToolResultBlock,
  isValidSessionStatus,
  isValidTurnRole,
  isValidPackSelection,
} from './types'

// ============================================================================
// Errors
// ============================================================================

// Error classes
export {
  AgentError,
  SessionError,
  VersionConflictError,
  SessionNotFoundError,
  InvalidSessionStateError,
  AgentNotFoundError,
  AgentConfigError,
  BudgetExceededError,
  ClaudeApiError,
  ClaudeParseError,
  InvalidTransitionError,
  AgentToolError,
} from './errors'

// Error type guards
export {
  isAgentError,
  isVersionConflictError,
  isBudgetExceededError,
  isClaudeApiError,
  isRetryableError,
} from './errors'

// ============================================================================
// Registry
// ============================================================================

export { AgentRegistry, agentRegistry } from './registry'

// ============================================================================
// Session Manager
// ============================================================================

export { SessionManager } from './session-manager'
export type {
  CreateSessionParams as CreateSessionManagerParams,
  AddTurnParams as AddTurnManagerParams,
  UpdateSessionParams as UpdateSessionManagerParams,
  AgentSessionWithState,
} from './session-manager'

// ============================================================================
// Claude Client
// ============================================================================

export { ClaudeClient } from './claude-client'

// ============================================================================
// Token Budget Manager
// ============================================================================

export { TokenBudgetManager } from './token-budget'
export type { BudgetCheckResult as TokenBudgetCheckResult } from './token-budget'
