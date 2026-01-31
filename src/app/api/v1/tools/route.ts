/**
 * Tool Discovery API
 * Phase 3: Action DSL Core - Plan 04, Task 3
 *
 * GET /api/v1/tools - List all available tools (MCP-compatible discovery endpoint)
 */

import { NextResponse } from 'next/server'
import { toolRegistry } from '@/lib/tools/registry'
import { initializeTools, areToolsInitialized } from '@/lib/tools/init'

/**
 * GET /api/v1/tools
 *
 * List all available tools (MCP-compatible discovery endpoint)
 *
 * Query params:
 * - module: Filter by module (crm, whatsapp, system)
 * - permission: Filter by required permission
 *
 * Response:
 * {
 *   tools: ToolSchema[],
 *   total: number
 * }
 */
export async function GET(request: Request) {
  // Ensure tools are initialized
  if (!areToolsInitialized()) {
    initializeTools()
  }

  const { searchParams } = new URL(request.url)
  const moduleFilter = searchParams.get('module')
  const permissionFilter = searchParams.get('permission')

  let tools = toolRegistry.listTools()

  // Apply filters
  if (moduleFilter) {
    tools = tools.filter((t) => t.metadata.module === moduleFilter)
  }

  if (permissionFilter) {
    tools = tools.filter((t) => t.metadata.permissions.includes(permissionFilter as any))
  }

  return NextResponse.json({
    tools,
    total: tools.length
  })
}
