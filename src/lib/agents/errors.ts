/**
 * Agent Engine Error Classes
 * Phase 13: Agent Engine Core - Plan 01
 *
 * Custom error classes for agent-specific failure scenarios.
 * Provides structured error handling for session management,
 * Claude API, and budget enforcement.
 */

// ============================================================================
// Base Agent Error
// ============================================================================

/**
 * Base error class for all agent-related errors.
 * Extends Error with additional context for debugging.
 */
export class AgentError extends Error {
  /** Error category for routing/handling */
  readonly category: string = 'agent'
  /** Whether this error is retryable */
  readonly retryable: boolean = false
  /** Additional context for debugging */
  readonly context?: Record<string, unknown>

  constructor(
    message: string,
    context?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'AgentError'
    this.context = context

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AgentError)
    }
  }

  /**
   * Convert to JSON for logging/API responses
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      category: this.category,
      retryable: this.retryable,
      context: this.context,
    }
  }
}

// ============================================================================
// Session Errors
// ============================================================================

/**
 * Error thrown when session operations fail.
 * Includes original database error for debugging.
 */
export class SessionError extends AgentError {
  readonly category = 'session'
  /** Original error from database/supabase */
  readonly originalError?: unknown

  constructor(
    message: string,
    originalError?: unknown,
    context?: Record<string, unknown>
  ) {
    super(message, context)
    this.name = 'SessionError'
    this.originalError = originalError
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      originalError: this.originalError instanceof Error
        ? { message: this.originalError.message, name: this.originalError.name }
        : this.originalError,
    }
  }
}

/**
 * Error thrown when optimistic locking fails due to concurrent update.
 * This error IS retryable - caller should reload session and retry.
 */
export class VersionConflictError extends SessionError {
  readonly retryable = true
  /** Session ID that had the conflict */
  readonly sessionId: string
  /** Expected version that was stale */
  readonly expectedVersion: number

  constructor(sessionId: string, expectedVersion: number) {
    super(
      `Version conflict for session ${sessionId}: expected version ${expectedVersion} is stale`,
      undefined,
      { sessionId, expectedVersion }
    )
    this.name = 'VersionConflictError'
    this.sessionId = sessionId
    this.expectedVersion = expectedVersion
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      sessionId: this.sessionId,
      expectedVersion: this.expectedVersion,
    }
  }
}

/**
 * Error thrown when a session is not found.
 */
export class SessionNotFoundError extends SessionError {
  readonly sessionId: string

  constructor(sessionId: string) {
    super(
      `Session not found: ${sessionId}`,
      undefined,
      { sessionId }
    )
    this.name = 'SessionNotFoundError'
    this.sessionId = sessionId
  }
}

/**
 * Error thrown when session is in an invalid state for the requested operation.
 */
export class InvalidSessionStateError extends SessionError {
  readonly sessionId: string
  readonly currentState: string
  readonly requestedOperation: string

  constructor(sessionId: string, currentState: string, requestedOperation: string) {
    super(
      `Session ${sessionId} is in state '${currentState}' and cannot perform '${requestedOperation}'`,
      undefined,
      { sessionId, currentState, requestedOperation }
    )
    this.name = 'InvalidSessionStateError'
    this.sessionId = sessionId
    this.currentState = currentState
    this.requestedOperation = requestedOperation
  }
}

// ============================================================================
// Agent Configuration Errors
// ============================================================================

/**
 * Error thrown when an agent configuration is not found in the registry.
 */
export class AgentNotFoundError extends AgentError {
  readonly category = 'config'
  readonly agentId: string

  constructor(agentId: string) {
    super(
      `Agent not found in registry: ${agentId}`,
      { agentId }
    )
    this.name = 'AgentNotFoundError'
    this.agentId = agentId
  }
}

/**
 * Error thrown when agent configuration is invalid.
 */
export class AgentConfigError extends AgentError {
  readonly category = 'config'
  readonly agentId: string
  readonly validationErrors: string[]

  constructor(agentId: string, validationErrors: string[]) {
    super(
      `Invalid agent configuration for ${agentId}: ${validationErrors.join(', ')}`,
      { agentId, validationErrors }
    )
    this.name = 'AgentConfigError'
    this.agentId = agentId
    this.validationErrors = validationErrors
  }
}

// ============================================================================
// Budget Errors
// ============================================================================

/**
 * Error thrown when token budget is exceeded.
 * Not retryable - conversation must be ended or summarized.
 */
export class BudgetExceededError extends AgentError {
  readonly category = 'budget'
  readonly sessionId: string
  /** Tokens already used */
  readonly used: number
  /** Maximum allowed tokens */
  readonly limit: number
  /** Tokens requested that would exceed limit */
  readonly requested: number

  constructor(
    sessionId: string,
    used: number,
    limit: number,
    requested: number
  ) {
    super(
      `Token budget exceeded for session ${sessionId}: used ${used}/${limit}, requested ${requested}`,
      { sessionId, used, limit, requested }
    )
    this.name = 'BudgetExceededError'
    this.sessionId = sessionId
    this.used = used
    this.limit = limit
    this.requested = requested
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      sessionId: this.sessionId,
      used: this.used,
      limit: this.limit,
      requested: this.requested,
    }
  }
}

// ============================================================================
// Claude API Errors
// ============================================================================

/**
 * Error thrown when Claude API call fails.
 * May be retryable depending on the underlying error.
 */
export class ClaudeApiError extends AgentError {
  readonly category = 'claude'
  /** HTTP status code if available */
  readonly statusCode?: number
  /** Error type from Anthropic API */
  readonly errorType?: string
  /** Original error from SDK */
  readonly originalError?: unknown

  constructor(
    message: string,
    options?: {
      statusCode?: number
      errorType?: string
      originalError?: unknown
      retryable?: boolean
    }
  ) {
    super(message, {
      statusCode: options?.statusCode,
      errorType: options?.errorType,
    })
    this.name = 'ClaudeApiError'
    this.statusCode = options?.statusCode
    this.errorType = options?.errorType
    this.originalError = options?.originalError

    // Rate limits and temporary failures are retryable
    if (options?.retryable !== undefined) {
      (this as { retryable: boolean }).retryable = options.retryable
    } else if (options?.statusCode === 429 || options?.statusCode === 503) {
      (this as { retryable: boolean }).retryable = true
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      statusCode: this.statusCode,
      errorType: this.errorType,
    }
  }
}

/**
 * Error thrown when Claude response cannot be parsed.
 * Typically indicates a prompt issue or unexpected model behavior.
 */
export class ClaudeParseError extends ClaudeApiError {
  /** Raw response that couldn't be parsed */
  readonly rawResponse: string

  constructor(message: string, rawResponse: string) {
    super(message, { retryable: true })
    this.name = 'ClaudeParseError'
    this.rawResponse = rawResponse
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      rawResponse: this.rawResponse.substring(0, 500), // Truncate for logging
    }
  }
}

/**
 * Error thrown when intent detection fails.
 * This may be retryable depending on the underlying cause.
 */
export class IntentDetectionError extends ClaudeApiError {
  /** Raw response that caused the error, if available */
  readonly rawResponse?: string

  constructor(message: string, rawResponse?: string) {
    super(message, { retryable: true })
    this.name = 'IntentDetectionError'
    this.rawResponse = rawResponse
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      rawResponse: this.rawResponse?.substring(0, 500),
    }
  }
}

// ============================================================================
// State Machine Errors
// ============================================================================

/**
 * Error thrown when an invalid state transition is attempted.
 */
export class InvalidTransitionError extends AgentError {
  readonly category = 'state'
  readonly sessionId: string
  readonly fromState: string
  readonly toState: string
  readonly validTransitions: string[]

  constructor(
    sessionId: string,
    fromState: string,
    toState: string,
    validTransitions: string[]
  ) {
    super(
      `Invalid state transition for session ${sessionId}: cannot go from '${fromState}' to '${toState}'. Valid transitions: ${validTransitions.join(', ') || 'none'}`,
      { sessionId, fromState, toState, validTransitions }
    )
    this.name = 'InvalidTransitionError'
    this.sessionId = sessionId
    this.fromState = fromState
    this.toState = toState
    this.validTransitions = validTransitions
  }
}

// ============================================================================
// Tool Execution Errors (within agent context)
// ============================================================================

/**
 * Error thrown when tool execution fails during agent processing.
 * Wraps the underlying tool error with agent context.
 */
export class AgentToolError extends AgentError {
  readonly category = 'tool'
  readonly toolName: string
  readonly toolError: {
    type: string
    code: string
    message: string
    retryable: boolean
  }

  constructor(
    toolName: string,
    toolError: {
      type: string
      code: string
      message: string
      retryable: boolean
    }
  ) {
    super(
      `Tool execution failed: ${toolName} - ${toolError.message}`,
      { toolName, toolError }
    )
    this.name = 'AgentToolError'
    this.toolName = toolName
    this.toolError = toolError
    // Inherit retryability from tool error
    ;(this as { retryable: boolean }).retryable = toolError.retryable
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      toolName: this.toolName,
      toolError: this.toolError,
    }
  }
}

// ============================================================================
// Error Type Guards
// ============================================================================

/**
 * Type guard for AgentError
 */
export function isAgentError(error: unknown): error is AgentError {
  return error instanceof AgentError
}

/**
 * Type guard for VersionConflictError
 */
export function isVersionConflictError(error: unknown): error is VersionConflictError {
  return error instanceof VersionConflictError
}

/**
 * Type guard for BudgetExceededError
 */
export function isBudgetExceededError(error: unknown): error is BudgetExceededError {
  return error instanceof BudgetExceededError
}

/**
 * Type guard for ClaudeApiError
 */
export function isClaudeApiError(error: unknown): error is ClaudeApiError {
  return error instanceof ClaudeApiError
}

/**
 * Type guard for retryable errors
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof AgentError) {
    return error.retryable
  }
  return false
}
