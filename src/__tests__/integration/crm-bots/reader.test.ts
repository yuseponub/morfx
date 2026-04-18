/**
 * Integration tests — POST /api/v1/crm-bots/reader
 * Phase 44 Plan 09, Task 1.
 *
 * These tests exercise the reader endpoint end-to-end:
 *   - Kill-switch (503 when CRM_BOT_ENABLED=false — process.env toggled in-test;
 *     production validation with Vercel redeploy lives in Task 5 step 8 per
 *     Blocker 6 procedure).
 *   - Happy path (200 with agentId='crm-reader' for a valid search query).
 *   - Auth (401 when authorization header is missing).
 *   - Observability (agent_observability_turns row written per call).
 *
 * Preconditions (set via env):
 *   - TEST_WORKSPACE_ID — uuid of the workspace where the test API key lives.
 *   - TEST_API_KEY      — full 'mfx_...' key minted for TEST_WORKSPACE_ID.
 *   - TEST_BASE_URL     — optional; defaults to 'http://localhost:3020' per CLAUDE.md.
 *   - NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY — required for the
 *     observability SELECT step (admin client).
 *
 * Test-runner: vitest. Install with `npm i -D vitest` when the suite is to run.
 * The project repo already uses vitest for existing unit tests — see
 * src/lib/agents/somnio/__tests__/*.test.ts.
 */

import { describe, expect, it, beforeAll, beforeEach, afterEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3020'
const TEST_WORKSPACE_ID = process.env.TEST_WORKSPACE_ID ?? ''
const TEST_API_KEY = process.env.TEST_API_KEY ?? ''

const READER_ENDPOINT = `${BASE_URL}/api/v1/crm-bots/reader`

// 30-second per-test budget for LLM calls (AI SDK generateText with Sonnet 4.5).
const LLM_TIMEOUT_MS = 30_000

// ---------------------------------------------------------------------------
// Preconditions — fail fast if env is not wired.
// ---------------------------------------------------------------------------
beforeAll(() => {
  if (!TEST_WORKSPACE_ID || !TEST_API_KEY) {
    throw new Error(
      'TEST_WORKSPACE_ID and TEST_API_KEY env vars are required. ' +
        'Mint a test API key via the admin UI (or SQL insert into api_keys) ' +
        'and export both vars before running this suite.',
    )
  }
  if (!TEST_API_KEY.startsWith('mfx_')) {
    throw new Error('TEST_API_KEY must start with "mfx_" (see src/lib/auth/api-key.ts)')
  }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function postReader(
  body: unknown,
  opts: { authorize?: boolean } = {},
): Promise<Response> {
  const authorize = opts.authorize ?? true
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (authorize) {
    headers.authorization = `Bearer ${TEST_API_KEY}`
  }
  return fetch(READER_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const srk = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !srk) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required ' +
        'for the observability verification step.',
    )
  }
  return createClient(url, srk)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('POST /api/v1/crm-bots/reader', () => {
  // -------------------------------------------------------------------------
  // Kill-switch (local process.env toggle — NOT the Vercel production path,
  // which requires a redeploy per Blocker 6; see Task 5 step 8 in PLAN.)
  // -------------------------------------------------------------------------
  describe('kill-switch', () => {
    let originalFlag: string | undefined
    beforeEach(() => {
      originalFlag = process.env.CRM_BOT_ENABLED
      process.env.CRM_BOT_ENABLED = 'false'
    })
    afterEach(() => {
      if (originalFlag === undefined) delete process.env.CRM_BOT_ENABLED
      else process.env.CRM_BOT_ENABLED = originalFlag
    })

    it(
      'returns 503 with code=KILL_SWITCH when CRM_BOT_ENABLED=false',
      async () => {
        const res = await postReader({
          messages: [{ role: 'user', content: 'listar pipelines' }],
        })
        expect(res.status).toBe(503)
        const body = await res.json()
        expect(body.code).toBe('KILL_SWITCH')
        expect(body.retryable).toBe(false)
      },
      LLM_TIMEOUT_MS,
    )
  })

  // -------------------------------------------------------------------------
  // Happy path — real LLM + tool invocation.
  // -------------------------------------------------------------------------
  describe('happy path', () => {
    it(
      'returns 200 with agentId=crm-reader for a valid query',
      async () => {
        const res = await postReader({
          messages: [{ role: 'user', content: 'listar pipelines' }],
        })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.status).toBe('ok')
        expect(body.output).toBeDefined()
        expect(body.output.agentId).toBe('crm-reader')
        expect(typeof body.output.text).toBe('string')
        expect(Array.isArray(body.output.toolCalls)).toBe(true)
      },
      LLM_TIMEOUT_MS,
    )
  })

  // -------------------------------------------------------------------------
  // Auth — missing Authorization header should be rejected by middleware
  // before reaching the handler (no x-workspace-id → 401 MISSING_CONTEXT, or
  // middleware returns 401 directly depending on where the gate triggers).
  // -------------------------------------------------------------------------
  describe('auth', () => {
    it(
      'returns 401 when authorization header is missing',
      async () => {
        const res = await postReader(
          { messages: [{ role: 'user', content: 'hola' }] },
          { authorize: false },
        )
        expect(res.status).toBe(401)
      },
      LLM_TIMEOUT_MS,
    )
  })

  // -------------------------------------------------------------------------
  // Observability — after a successful call, a row should exist in
  // agent_observability_turns for (workspace_id, agent_id='crm-reader',
  // trigger_kind='api'). Gated on OBSERVABILITY_ENABLED=true in the target
  // environment — if the flag is off the assertion is skipped.
  // -------------------------------------------------------------------------
  describe('observability', () => {
    it(
      'writes an agent_observability_turns row (agentId=crm-reader, trigger=api)',
      async () => {
        if (process.env.OBSERVABILITY_ENABLED !== 'true') {
          // eslint-disable-next-line no-console
          console.warn(
            'Skipping observability assertion: OBSERVABILITY_ENABLED != "true" in target env.',
          )
          return
        }

        const before = new Date(Date.now() - 5_000).toISOString()

        const res = await postReader({
          messages: [{ role: 'user', content: 'listar pipelines' }],
        })
        expect(res.status).toBe(200)

        // Small delay to allow the async observability flush to persist.
        await new Promise((r) => setTimeout(r, 1_500))

        const supabase = adminClient()
        const { data, error } = await supabase
          .from('agent_observability_turns')
          .select('id, agent_id, trigger_kind, workspace_id, started_at')
          .eq('workspace_id', TEST_WORKSPACE_ID)
          .eq('agent_id', 'crm-reader')
          .eq('trigger_kind', 'api')
          .gte('started_at', before)
          .order('started_at', { ascending: false })
          .limit(5)

        expect(error).toBeNull()
        expect(Array.isArray(data)).toBe(true)
        expect((data ?? []).length).toBeGreaterThanOrEqual(1)
      },
      LLM_TIMEOUT_MS,
    )
  })
})
