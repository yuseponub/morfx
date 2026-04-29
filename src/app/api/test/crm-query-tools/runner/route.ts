/**
 * Test-only endpoint to invoke crm-query-tools from Playwright E2E.
 *
 * Standalone crm-query-tools Wave 5 (Plan 06).
 *
 * Security gates (V13 ASVS):
 *   1. NODE_ENV !== 'production' (returns 404 in prod).
 *   2. x-test-secret header MUST match process.env.PLAYWRIGHT_TEST_SECRET.
 *   3. workspaceId is read from process.env.TEST_WORKSPACE_ID — NEVER from body.
 *   4. Only the 5 documented tools are exposed; any other name returns 400.
 *
 * Documented in INTEGRATION-HANDOFF.md (Plan 07): how to set
 * PLAYWRIGHT_TEST_SECRET + TEST_WORKSPACE_ID in dev / preview env.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createCrmQueryTools } from '@/lib/agents/shared/crm-query-tools'

const ALLOWED_TOOLS = new Set([
  'getContactByPhone',
  'getLastOrderByPhone',
  'getOrdersByPhone',
  'getActiveOrderByPhone',
  'getOrderById',
])

export async function POST(req: NextRequest) {
  // Gate 1: NODE_ENV
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse('Not found', { status: 404 })
  }

  // Gate 2: header secret
  const expected = process.env.PLAYWRIGHT_TEST_SECRET
  if (!expected) {
    return NextResponse.json(
      { error: 'PLAYWRIGHT_TEST_SECRET not configured on server' },
      { status: 500 },
    )
  }
  const got = req.headers.get('x-test-secret')
  if (!got || got !== expected) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  // Gate 3: workspace from env, NOT body
  const workspaceId = process.env.TEST_WORKSPACE_ID
  if (!workspaceId) {
    return NextResponse.json(
      { error: 'TEST_WORKSPACE_ID not configured' },
      { status: 500 },
    )
  }

  let body: { tool?: string; input?: Record<string, unknown> }
  try {
    body = (await req.json()) as { tool?: string; input?: Record<string, unknown> }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.tool || !ALLOWED_TOOLS.has(body.tool)) {
    return NextResponse.json(
      { error: `Unknown tool: ${body.tool ?? '(missing)'}. Allowed: ${[...ALLOWED_TOOLS].join(', ')}` },
      { status: 400 },
    )
  }

  const tools = createCrmQueryTools({ workspaceId, invoker: 'playwright-e2e' })
  const tool = tools[body.tool as keyof typeof tools]
  if (!tool) {
    return NextResponse.json({ error: `Tool not registered: ${body.tool}` }, { status: 500 })
  }

  try {
    // AI SDK v6 tool object exposes execute(input) directly.
    // (Two-step cast matches the unit-test pattern in src/lib/agents/shared/crm-query-tools/__tests__.)
    const result = await (tool as unknown as { execute: (input: unknown) => Promise<unknown> }).execute(body.input ?? {})
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      {
        status: 'error',
        error: { code: 'runner_threw', message: err instanceof Error ? err.message : String(err) },
      },
      { status: 500 },
    )
  }
}
