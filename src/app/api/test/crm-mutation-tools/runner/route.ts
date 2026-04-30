/**
 * 4-GATE HARDENED test runner for crm-mutation-tools.
 * STRICTLY DEV/PREVIEW ONLY — returns 404 in production.
 *
 * Standalone crm-mutation-tools Wave 4 (Plan 05).
 *
 * Gate order matters (security defense-in-depth):
 *   1. NODE_ENV gate FIRST — return 404 in production (no info leak via subsequent errors).
 *   2. x-test-secret header — strict equality to PLAYWRIGHT_TEST_SECRET env.
 *   3. Workspace from TEST_WORKSPACE_ID env — NEVER from request body.
 *   4. ALLOWED_TOOLS Set — reject any tool name not in the closed list of 15.
 *
 * Mirror reference: src/app/api/test/crm-query-tools/runner/route.ts (sibling pattern).
 *
 * Threat model (05-PLAN.md §threat_model):
 *   - T-05-01 (EoP prod exposure)        → Gate 1
 *   - T-05-02 (forged secret)            → Gate 2
 *   - T-05-03 (cross-workspace tampering)→ Gate 3 (env-only, body ignored)
 *   - T-05-04 (arbitrary tool dispatch)  → Gate 4 (allow-list)
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createCrmMutationTools } from '@/lib/agents/shared/crm-mutation-tools'

const ALLOWED_TOOLS = new Set<string>([
  // contacts (3)
  'createContact',
  'updateContact',
  'archiveContact',
  // orders (5)
  'createOrder',
  'updateOrder',
  'moveOrderToStage',
  'archiveOrder',
  'closeOrder',
  // notes (4)
  'addContactNote',
  'addOrderNote',
  'archiveContactNote',
  'archiveOrderNote',
  // tasks (3)
  'createTask',
  'updateTask',
  'completeTask',
])

export async function POST(req: NextRequest) {
  // Gate 1: NODE_ENV gate FIRST — fail closed in production with 404 (no info leak).
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse('Not found', { status: 404 })
  }

  // Gate 2: x-test-secret strict equality.
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

  // Gate 3: workspace from env, NEVER from body.
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

  // Gate 4: tool allow-list (closed list of 15 mutation tool names).
  if (!body.tool || !ALLOWED_TOOLS.has(body.tool)) {
    return NextResponse.json(
      {
        error: `Unknown tool: ${body.tool ?? '(missing)'}. Allowed: ${[...ALLOWED_TOOLS].join(', ')}`,
      },
      { status: 400 },
    )
  }

  const tools = createCrmMutationTools({ workspaceId, invoker: 'playwright-e2e' })
  const tool = (tools as unknown as Record<string, unknown>)[body.tool]
  if (!tool) {
    return NextResponse.json({ error: `Tool not registered: ${body.tool}` }, { status: 500 })
  }

  try {
    // Two-step cast (Pitfall 3) — AI SDK v6 strict typing rejects single-step cast
    // because Tool<INPUT, OUTPUT>.execute signature requires (input, options) two-arg form.
    const result = await (
      tool as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute(body.input ?? {})
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      {
        status: 'error',
        error: {
          code: 'runner_threw',
          message: err instanceof Error ? err.message : String(err),
        },
      },
      { status: 500 },
    )
  }
}
