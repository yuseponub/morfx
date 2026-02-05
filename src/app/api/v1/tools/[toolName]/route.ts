/**
 * Tool Execution API
 * Phase 12: Action DSL Real - Plan 04
 *
 * POST /api/v1/tools/{toolName} - Execute a tool
 * GET /api/v1/tools/{toolName} - Get tool schema/documentation
 *
 * Returns structured ToolResult responses with proper HTTP status codes:
 * - 200: Success or dry_run
 * - 400: Validation error
 * - 403: Permission denied
 * - 404: Unknown tool
 * - 429: Rate limit exceeded
 * - 500: Internal/execution error
 * - 504: Timeout
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  executeTool,
  ToolValidationError,
  PermissionError,
  TimeoutError,
  RateLimitError,
} from '@/lib/tools/executor'
import { toolRegistry } from '@/lib/tools/registry'
import { initializeTools, areToolsInitialized } from '@/lib/tools/init'
import type { ExecutionContext } from '@/lib/tools/types'

/**
 * POST /api/v1/tools/{toolName}
 *
 * Execute a tool
 *
 * Request body:
 * {
 *   inputs: object,      // Tool-specific inputs
 *   dry_run?: boolean    // If true, validate and simulate only
 * }
 *
 * Headers (set by middleware):
 * - x-workspace-id: Workspace ID from API key
 * - x-permissions: JSON array of permissions
 * - x-api-key-prefix: Key prefix for logging
 *
 * Response (success):
 * {
 *   execution_id: string,
 *   status: 'success' | 'dry_run',
 *   outputs: ToolResult<T>,    // Structured handler response
 *   duration_ms: number
 * }
 *
 * Response (error):
 * {
 *   error: string,
 *   code: string,
 *   retryable: boolean,
 *   retry_after_ms?: number,
 *   details?: object
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ toolName: string }> }
) {
  // Ensure tools are initialized
  if (!areToolsInitialized()) {
    initializeTools()
  }

  try {
    const { toolName } = await params

    // Validate tool exists
    if (!toolRegistry.hasTool(toolName)) {
      return NextResponse.json(
        {
          error: `Unknown tool: ${toolName}`,
          code: 'UNKNOWN_TOOL',
          retryable: false,
          available_tools: toolRegistry.listTools().map((t) => t.name)
        },
        { status: 404 }
      )
    }

    // Parse request body
    let body: { inputs?: unknown; dry_run?: boolean }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body', code: 'INVALID_JSON', retryable: false },
        { status: 400 }
      )
    }

    const { inputs = {}, dry_run = false } = body

    // Extract context from middleware headers
    const workspaceId = request.headers.get('x-workspace-id')
    const apiKeyPrefix = request.headers.get('x-api-key-prefix')

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'Missing workspace context', code: 'MISSING_CONTEXT', retryable: false },
        { status: 500 }
      )
    }

    // Build execution context
    const context: ExecutionContext = {
      userId: null, // API calls don't have user ID
      workspaceId,
      requestContext: {
        ip: request.headers.get('x-forwarded-for') ||
            request.headers.get('x-real-ip') ||
            'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        source: 'api'
      }
    }

    // Execute tool
    const result = await executeTool(toolName, inputs, {
      dryRun: dry_run,
      context
    })

    // Return result - pass through ToolResult structure from handlers
    if (result.status === 'error') {
      return NextResponse.json(
        {
          error: result.error?.message || 'Tool execution failed',
          code: 'EXECUTION_ERROR',
          retryable: false,
          execution_id: result.id,
          duration_ms: result.durationMs,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      execution_id: result.id,
      status: result.status,
      outputs: result.outputs,
      duration_ms: result.durationMs
    })
  } catch (error) {
    // Handle rate limit errors -> 429
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        {
          error: error.message,
          code: 'RATE_LIMITED',
          retryable: true,
          retry_after_ms: error.resetMs,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil(error.resetMs / 1000)),
          },
        }
      )
    }

    // Handle timeout errors -> 504
    if (error instanceof TimeoutError) {
      return NextResponse.json(
        {
          error: error.message,
          code: 'TIMEOUT',
          retryable: true,
          timeout_ms: error.timeoutMs,
        },
        { status: 504 }
      )
    }

    // Handle validation errors -> 400
    if (error instanceof ToolValidationError) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          retryable: false,
          details: error.toJSON().errors
        },
        { status: 400 }
      )
    }

    // Handle permission errors -> 403
    if (error instanceof PermissionError) {
      return NextResponse.json(
        {
          error: error.message,
          code: 'PERMISSION_DENIED',
          retryable: false,
        },
        { status: 403 }
      )
    }

    // Log unexpected errors -> 500
    console.error('Tool API error:', error)

    return NextResponse.json(
      {
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        retryable: false,
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/v1/tools/{toolName}
 *
 * Get tool schema/documentation
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ toolName: string }> }
) {
  if (!areToolsInitialized()) {
    initializeTools()
  }

  const { toolName } = await params

  if (!toolRegistry.hasTool(toolName)) {
    return NextResponse.json(
      { error: `Unknown tool: ${toolName}`, code: 'UNKNOWN_TOOL' },
      { status: 404 }
    )
  }

  const tools = toolRegistry.listTools()
  const tool = tools.find((t) => t.name === toolName)

  return NextResponse.json({ tool })
}
