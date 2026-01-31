/**
 * Tool Execution API
 * Phase 3: Action DSL Core - Plan 04, Task 3
 *
 * POST /api/v1/tools/{toolName} - Execute a tool
 * GET /api/v1/tools/{toolName} - Get tool schema/documentation
 */

import { NextRequest, NextResponse } from 'next/server'
import { executeTool, ToolValidationError, PermissionError } from '@/lib/tools/executor'
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
 *   outputs: object,
 *   duration_ms: number
 * }
 *
 * Response (error):
 * {
 *   error: string,
 *   code: string,
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
        { error: 'Invalid JSON body', code: 'INVALID_JSON' },
        { status: 400 }
      )
    }

    const { inputs = {}, dry_run = false } = body

    // Extract context from middleware headers
    const workspaceId = request.headers.get('x-workspace-id')
    const apiKeyPrefix = request.headers.get('x-api-key-prefix')

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'Missing workspace context', code: 'MISSING_CONTEXT' },
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

    // Return result
    if (result.status === 'error') {
      return NextResponse.json(
        {
          error: result.error?.message || 'Tool execution failed',
          code: 'EXECUTION_ERROR',
          execution_id: result.id
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
    // Handle validation errors
    if (error instanceof ToolValidationError) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: error.toJSON().errors
        },
        { status: 400 }
      )
    }

    // Handle permission errors
    if (error instanceof PermissionError) {
      return NextResponse.json(
        {
          error: error.message,
          code: 'PERMISSION_DENIED'
        },
        { status: 403 }
      )
    }

    // Log unexpected errors
    console.error('Tool API error:', error)

    return NextResponse.json(
      {
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
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
