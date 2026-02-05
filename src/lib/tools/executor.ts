/**
 * Tool Executor
 * Phase 12: Action DSL Real - Plan 04
 *
 * Handles tool execution with dry-run support, permission checking,
 * domain-specific timeouts, rate limiting, and full forensic logging.
 */

import {
  toolRegistry,
  ToolValidationError,
  ToolNotFoundError,
} from './registry'
import { rateLimiter } from './rate-limiter'
import { logToolExecution, logToolError, logPermissionDenied } from '@/lib/audit/tool-logger'
import { hasPermission } from '@/lib/permissions'
import type { WorkspaceRole } from '@/lib/types/database'
import type {
  ExecutionContext,
  ExecutionOptions,
  ToolExecutionResult,
  ToolModule,
} from './types'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('executor')

// ============================================================================
// Domain-Specific Timeouts
// ============================================================================

/** Timeout per module in milliseconds */
const TIMEOUTS: Record<ToolModule, number> = {
  crm: 5_000,       // 5 seconds for DB operations
  whatsapp: 15_000,  // 15 seconds for external API (360dialog)
  system: 10_000,    // 10 seconds default
}

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Timeout error thrown when a tool exceeds its domain-specific timeout
 */
export class TimeoutError extends Error {
  public readonly toolName: string
  public readonly timeoutMs: number

  constructor(toolName: string, timeoutMs: number) {
    super(`Tool ${toolName} timed out after ${timeoutMs}ms`)
    this.name = 'TimeoutError'
    this.toolName = toolName
    this.timeoutMs = timeoutMs
  }
}

/**
 * Rate limit error thrown when workspace exceeds module rate limit
 */
export class RateLimitError extends Error {
  public readonly toolName: string
  public readonly resetMs: number

  constructor(toolName: string, resetMs: number) {
    super(`Rate limit exceeded for tool ${toolName}. Retry after ${Math.ceil(resetMs / 1000)}s`)
    this.name = 'RateLimitError'
    this.toolName = toolName
    this.resetMs = resetMs
  }
}

/**
 * Permission error thrown when user lacks required permissions
 */
export class PermissionError extends Error {
  public readonly toolName: string
  public readonly requiredPermissions: string[]
  public readonly userRole: string

  constructor(
    toolName: string,
    requiredPermissions: string[],
    userRole: string
  ) {
    super(
      `Permission denied for tool ${toolName}. Required: ${requiredPermissions.join(', ')}. Role: ${userRole}`
    )
    this.name = 'PermissionError'
    this.toolName = toolName
    this.requiredPermissions = requiredPermissions
    this.userRole = userRole
  }

  /**
   * Get error in a simplified format for API responses
   */
  toJSON() {
    return {
      name: this.name,
      toolName: this.toolName,
      requiredPermissions: this.requiredPermissions,
      userRole: this.userRole,
      message: this.message,
    }
  }
}

/**
 * Execute a tool with full logging and dry-run support
 *
 * Flow:
 * 1. Validate tool exists
 * 2. Validate inputs against JSON Schema
 * 3. Check permissions (if userRole provided)
 * 4. Execute handler (real or dry-run)
 * 5. Log execution to audit trail
 * 6. Return result
 *
 * @param toolName - The tool to execute (e.g., 'crm.contact.create')
 * @param inputs - The inputs to pass to the tool
 * @param options - Execution options including context and dryRun flag
 * @param userRole - Optional user role for permission checking
 *
 * @throws ToolValidationError if inputs fail schema validation
 * @throws PermissionError if user lacks required permissions
 * @throws ToolNotFoundError if tool doesn't exist
 *
 * @example
 * // Dry-run execution (no side effects)
 * const result = await executeTool('crm.contact.create', { name: 'John', phone: '+57...' }, {
 *   dryRun: true,
 *   context: {
 *     workspaceId: 'ws-123',
 *     userId: 'user-456',
 *     requestContext: { source: 'ui' }
 *   }
 * })
 *
 * // Real execution with permission check
 * const result = await executeTool('crm.contact.create', { name: 'John', phone: '+57...' }, {
 *   dryRun: false,
 *   context: { ... }
 * }, 'agent')  // Will check 'agent' role has required permissions
 */
export async function executeTool<TOutput = unknown>(
  toolName: string,
  inputs: unknown,
  options: ExecutionOptions,
  userRole?: WorkspaceRole
): Promise<ToolExecutionResult<TOutput>> {
  const startedAt = new Date()
  const startTime = performance.now()

  try {
    // 1. Get tool and validate inputs
    const tool = toolRegistry.getTool(toolName)
    toolRegistry.validateInputs(toolName, inputs)

    // 2. Check permissions (if role provided and tool requires permissions)
    if (userRole && tool.metadata.permissions.length > 0) {
      const hasAllPermissions = tool.metadata.permissions.every((perm) =>
        hasPermission(userRole, perm)
      )

      if (!hasAllPermissions) {
        logPermissionDenied(
          toolName,
          tool.metadata.permissions,
          userRole,
          options.context.userId ?? undefined
        )
        throw new PermissionError(
          toolName,
          tool.metadata.permissions,
          userRole
        )
      }
    }

    // 3. Rate limit check (before handler execution)
    const module = tool.metadata.module
    const rateLimitResult = rateLimiter.check(options.context.workspaceId, module)
    if (!rateLimitResult.allowed) {
      throw new RateLimitError(toolName, rateLimitResult.resetMs)
    }

    // 4. Execute handler with domain-specific timeout
    const dryRun = options.dryRun ?? false
    const timeoutMs = TIMEOUTS[module] ?? TIMEOUTS.system

    const outputs = await Promise.race([
      tool.handler(inputs, options.context, dryRun),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new TimeoutError(toolName, timeoutMs)), timeoutMs)
      ),
    ])

    const completedAt = new Date()
    const durationMs = Math.round(performance.now() - startTime)

    // 5. Log execution (unless explicitly skipped)
    let executionId: string | null = null
    if (!options.skipLogging) {
      executionId = await logToolExecution({
        workspace_id: options.context.workspaceId,
        tool_name: toolName,
        inputs: inputs as Record<string, unknown>,
        outputs: outputs as Record<string, unknown>,
        status: dryRun ? 'dry_run' : 'success',
        started_at: startedAt.toISOString(),
        completed_at: completedAt.toISOString(),
        duration_ms: durationMs,
        user_id: options.context.userId ?? undefined,
        session_id: options.context.sessionId,
        agent_session_id: options.context.agent_session_id,
        request_context: options.context.requestContext,
      })
    }

    logger.debug({
      event: 'tool_executed',
      tool_name: toolName,
      execution_id: executionId,
      status: dryRun ? 'dry_run' : 'success',
      duration_ms: durationMs,
    })

    return {
      id: executionId ?? crypto.randomUUID(),
      toolName,
      status: dryRun ? 'dry_run' : 'success',
      outputs: outputs as TOutput,
      durationMs,
    }
  } catch (error) {
    const completedAt = new Date()
    const durationMs = Math.round(performance.now() - startTime)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const errorStack = error instanceof Error ? error.stack : undefined

    // Log error execution (unless explicitly skipped)
    let executionId: string | null = null
    if (!options.skipLogging) {
      executionId = await logToolExecution({
        workspace_id: options.context.workspaceId,
        tool_name: toolName,
        inputs: inputs as Record<string, unknown>,
        outputs: {},
        status: 'error',
        error_message: errorMessage,
        error_stack: errorStack,
        started_at: startedAt.toISOString(),
        completed_at: completedAt.toISOString(),
        duration_ms: durationMs,
        user_id: options.context.userId ?? undefined,
        session_id: options.context.sessionId,
        agent_session_id: options.context.agent_session_id,
        request_context: options.context.requestContext,
      })
    }

    // Re-throw validation, permission, not-found, timeout, and rate limit errors (client should handle)
    if (
      error instanceof ToolValidationError ||
      error instanceof PermissionError ||
      error instanceof ToolNotFoundError ||
      error instanceof TimeoutError ||
      error instanceof RateLimitError
    ) {
      throw error
    }

    // Log unexpected errors
    logToolError(toolName, error instanceof Error ? error : new Error(errorMessage), {
      execution_id: executionId,
      workspace_id: options.context.workspaceId,
    })

    return {
      id: executionId ?? crypto.randomUUID(),
      toolName,
      status: 'error',
      outputs: {} as TOutput,
      durationMs,
      error: {
        message: errorMessage,
        stack: errorStack,
      },
    }
  }
}

/**
 * Execute a tool with automatic context from Server Action
 * Convenience wrapper for UI-triggered executions
 *
 * @param toolName - The tool to execute
 * @param inputs - The inputs to pass to the tool
 * @param workspaceId - The workspace context
 * @param userId - The authenticated user ID
 * @param userRole - The user's role in the workspace
 * @param dryRun - Whether to run in dry-run mode (default: false)
 *
 * @example
 * // In a Server Action
 * 'use server'
 * export async function createContact(data: CreateContactInput) {
 *   const { workspaceId, userId, role } = await getCurrentUser()
 *   return executeToolFromUI('crm.contact.create', data, workspaceId, userId, role)
 * }
 */
export async function executeToolFromUI<TOutput = unknown>(
  toolName: string,
  inputs: unknown,
  workspaceId: string,
  userId: string,
  userRole: WorkspaceRole,
  dryRun = false
): Promise<ToolExecutionResult<TOutput>> {
  return executeTool<TOutput>(
    toolName,
    inputs,
    {
      dryRun,
      context: {
        workspaceId,
        userId,
        requestContext: {
          source: 'ui',
        },
      },
    },
    userRole
  )
}

/**
 * Execute a tool from an API request
 * Uses 'api' as the source and includes request metadata
 *
 * @param toolName - The tool to execute
 * @param inputs - The inputs to pass to the tool
 * @param workspaceId - The workspace context
 * @param userId - The user ID associated with the API key (can be null)
 * @param requestMeta - Request metadata for forensic logging
 * @param dryRun - Whether to run in dry-run mode (default: false)
 */
export async function executeToolFromAPI<TOutput = unknown>(
  toolName: string,
  inputs: unknown,
  workspaceId: string,
  userId: string | null,
  requestMeta: { ip?: string; userAgent?: string },
  dryRun = false
): Promise<ToolExecutionResult<TOutput>> {
  return executeTool<TOutput>(toolName, inputs, {
    dryRun,
    context: {
      workspaceId,
      userId,
      requestContext: {
        source: 'api',
        ip: requestMeta.ip,
        userAgent: requestMeta.userAgent,
      },
    },
  })
}

/**
 * Execute a tool from an AI agent
 * Uses 'agent' as the source and tracks agent_session_id for forensic logging
 *
 * @param toolName - The tool to execute
 * @param inputs - The inputs to pass to the tool
 * @param workspaceId - The workspace context
 * @param sessionId - The agent session ID for tracking related operations
 * @param agentSessionId - The agent session ID for forensic logging (persisted in tool_executions)
 * @param dryRun - Whether to run in dry-run mode (default: false)
 */
export async function executeToolFromAgent<TOutput = unknown>(
  toolName: string,
  inputs: unknown,
  workspaceId: string,
  sessionId: string,
  agentSessionId?: string,
  dryRun = false
): Promise<ToolExecutionResult<TOutput>> {
  return executeTool<TOutput>(toolName, inputs, {
    dryRun,
    context: {
      workspaceId,
      userId: null, // Agents don't have a user context
      sessionId,
      agent_session_id: agentSessionId ?? sessionId, // Default to sessionId if no explicit agentSessionId
      requestContext: {
        source: 'agent',
      },
    },
  })
}

/**
 * Execute a tool from a webhook
 * Uses 'webhook' as the source and includes request metadata
 *
 * @param toolName - The tool to execute
 * @param inputs - The inputs to pass to the tool
 * @param workspaceId - The workspace context
 * @param requestMeta - Request metadata for forensic logging
 */
export async function executeToolFromWebhook<TOutput = unknown>(
  toolName: string,
  inputs: unknown,
  workspaceId: string,
  requestMeta: { ip?: string; userAgent?: string }
): Promise<ToolExecutionResult<TOutput>> {
  return executeTool<TOutput>(toolName, inputs, {
    dryRun: false, // Webhooks always execute for real
    context: {
      workspaceId,
      userId: null, // Webhooks don't have a user context
      requestContext: {
        source: 'webhook',
        ip: requestMeta.ip,
        userAgent: requestMeta.userAgent,
      },
    },
  })
}

// Re-export errors for consumers
export { ToolValidationError, ToolNotFoundError } from './registry'
export { TimeoutError as ToolTimeoutError, RateLimitError as ToolRateLimitError }
