/**
 * Tool Execution Logger
 * Phase 3: Action DSL Core - Plan 02, Task 2
 *
 * Logs tool executions to both console (Pino) and database (Supabase).
 * Designed to never throw - logging failures must not interrupt business logic.
 */

import { logger, createModuleLogger } from './logger'
import { createClient } from '@/lib/supabase/server'
import type { ToolExecutionRecord, RequestContext } from '@/lib/tools/types'

const toolLogger = createModuleLogger('tools')

/**
 * Tool execution data for logging (excludes id and created_at which are auto-generated)
 */
export type ToolExecutionInput = Omit<ToolExecutionRecord, 'id' | 'created_at'>

/**
 * Log a tool execution to both console (Pino) and database (Supabase)
 *
 * IMPORTANT: This function never throws. Logging failures are logged
 * but don't interrupt tool execution.
 *
 * @param execution - The execution data to log
 * @returns The execution ID if persisted, null if persistence failed
 *
 * @example
 * const id = await logToolExecution({
 *   workspace_id: 'ws-123',
 *   tool_name: 'crm.contact.create',
 *   inputs: { name: 'John', phone: '+57300...' },
 *   outputs: { contactId: 'c-456' },
 *   status: 'success',
 *   started_at: startTime.toISOString(),
 *   completed_at: endTime.toISOString(),
 *   duration_ms: 145,
 *   request_context: { source: 'ui' }
 * })
 */
export async function logToolExecution(
  execution: ToolExecutionInput
): Promise<string | null> {
  const executionId = crypto.randomUUID()
  const startTime = Date.now()

  // 1. Log to console (immediate, never fails)
  toolLogger.info({
    event: 'tool_execution',
    execution_id: executionId,
    tool_name: execution.tool_name,
    status: execution.status,
    duration_ms: execution.duration_ms,
    workspace_id: execution.workspace_id,
    source: execution.request_context.source,
  })

  // 2. Persist to database (async, may fail)
  try {
    const supabase = await createClient()

    const { error } = await supabase.from('tool_executions').insert({
      id: executionId,
      workspace_id: execution.workspace_id,
      tool_name: execution.tool_name,
      inputs: execution.inputs,
      outputs: execution.outputs,
      status: execution.status,
      error_message: execution.error_message,
      error_stack: execution.error_stack,
      started_at: execution.started_at,
      completed_at: execution.completed_at,
      duration_ms: execution.duration_ms,
      user_id: execution.user_id,
      session_id: execution.session_id,
      request_context: execution.request_context,
      snapshot_before: execution.snapshot_before,
      snapshot_after: execution.snapshot_after,
      batch_id: execution.batch_id,
      related_executions: execution.related_executions,
    })

    if (error) {
      toolLogger.error({
        event: 'log_persist_error',
        execution_id: executionId,
        error: error.message,
        code: error.code,
      })
      return null
    }

    toolLogger.debug({
      event: 'log_persisted',
      execution_id: executionId,
      persist_duration_ms: Date.now() - startTime,
    })

    return executionId
  } catch (err) {
    // Never throw from logging
    toolLogger.error({
      event: 'log_persist_exception',
      execution_id: executionId,
      error: err instanceof Error ? err.message : 'Unknown error',
    })
    return null
  }
}

/**
 * Log an error that occurred outside normal tool execution
 * (e.g., tool registration failure, validation error)
 *
 * @param toolName - The tool that encountered the error
 * @param error - The error object
 * @param context - Additional context for debugging
 *
 * @example
 * logToolError('crm.contact.create', new Error('Failed to connect'), {
 *   workspace_id: 'ws-123',
 *   attempt: 3
 * })
 */
export function logToolError(
  toolName: string,
  error: Error,
  context: Record<string, unknown> = {}
): void {
  toolLogger.error({
    event: 'tool_error',
    tool_name: toolName,
    error: error.message,
    stack: error.stack,
    ...context,
  })
}

/**
 * Log a tool registration event
 *
 * @param toolName - The tool that was registered
 * @param metadata - Tool metadata for context
 */
export function logToolRegistration(
  toolName: string,
  metadata: Record<string, unknown>
): void {
  toolLogger.info({
    event: 'tool_registered',
    tool_name: toolName,
    ...metadata,
  })
}

/**
 * Log a validation failure
 *
 * @param toolName - The tool that failed validation
 * @param errors - The validation errors
 * @param inputs - The inputs that failed (will be redacted)
 */
export function logValidationError(
  toolName: string,
  errors: unknown[],
  inputs: Record<string, unknown>
): void {
  toolLogger.warn({
    event: 'validation_error',
    tool_name: toolName,
    error_count: errors.length,
    errors,
    inputs, // Sensitive fields will be auto-redacted by Pino
  })
}

/**
 * Log a permission denial
 *
 * @param toolName - The tool that was denied
 * @param requiredPermissions - Permissions the tool required
 * @param userRole - The user's role
 * @param userId - The user's ID
 */
export function logPermissionDenied(
  toolName: string,
  requiredPermissions: string[],
  userRole: string,
  userId?: string
): void {
  toolLogger.warn({
    event: 'permission_denied',
    tool_name: toolName,
    required_permissions: requiredPermissions,
    user_role: userRole,
    user_id: userId,
  })
}
