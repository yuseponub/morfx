/**
 * Integration tests — TTL cron for crm_bot_actions
 * Phase 44 Plan 09, Task 2 (file 3/3).
 *
 * Scenarios:
 *   1. Cron marks expired past TTL+30s: propose → force expires_at=-2m →
 *      simulate cron sweep (direct UPDATE emulating the cron predicate) →
 *      row transitions to status='expired'.
 *   2. Confirm past TTL returns 'expired': propose → force expires_at in past
 *      → confirm via HTTP → result.status='expired'. No business entity is
 *      created.
 *   3. 30s grace window: propose → set expires_at=-10s (inside grace) →
 *      simulated cron sweep leaves row at status='proposed'. Then set
 *      expires_at=-60s → sweep → row becomes 'expired'.
 *
 * The Inngest-dev cron is not triggered via HTTP in test; instead we run the
 * same UPDATE the cron would run (see src/inngest/functions/crm-bot-expire-proposals.ts)
 * so the test is deterministic in CI. The function's predicate is:
 *   UPDATE crm_bot_actions SET status='expired'
 *   WHERE status='proposed' AND expires_at < NOW() - INTERVAL '30 seconds'
 *
 * Preconditions (env):
 *   - TEST_WORKSPACE_ID + TEST_API_KEY
 *   - NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (admin client)
 *
 * Test-runner: vitest.
 */

import { describe, expect, it, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3020'
const TEST_WORKSPACE_ID = process.env.TEST_WORKSPACE_ID ?? ''
const TEST_API_KEY = process.env.TEST_API_KEY ?? ''

const PROPOSE_ENDPOINT = `${BASE_URL}/api/v1/crm-bots/writer/propose`
const CONFIRM_ENDPOINT = `${BASE_URL}/api/v1/crm-bots/writer/confirm`

const LLM_TIMEOUT_MS = 30_000

const GRACE_SECONDS = 30

beforeAll(() => {
  if (!TEST_WORKSPACE_ID || !TEST_API_KEY) {
    throw new Error('TEST_WORKSPACE_ID and TEST_API_KEY env vars are required.')
  }
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.',
    )
  }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function postPropose(
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
): Promise<Response> {
  return fetch(PROPOSE_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${TEST_API_KEY}`,
    },
    body: JSON.stringify({ messages }),
  })
}

function postConfirm(actionId: string): Promise<Response> {
  return fetch(CONFIRM_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${TEST_API_KEY}`,
    },
    body: JSON.stringify({ actionId }),
  })
}

function adminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function forceExpiresAt(
  admin: SupabaseClient,
  actionId: string,
  offsetSeconds: number,
): Promise<void> {
  const when = new Date(Date.now() + offsetSeconds * 1000).toISOString()
  const { error } = await admin
    .from('crm_bot_actions')
    .update({ expires_at: when })
    .eq('id', actionId)
    .eq('workspace_id', TEST_WORKSPACE_ID)
  if (error) throw error
}

/**
 * Mirror of the cron predicate
 * (see src/inngest/functions/crm-bot-expire-proposals.ts).
 *
 * NOW() - INTERVAL '30 seconds' is the cutoff. Anything older than that is
 * swept; anything newer remains 'proposed'.
 */
async function simulateCronSweep(admin: SupabaseClient): Promise<number> {
  const cutoff = new Date(Date.now() - GRACE_SECONDS * 1000).toISOString()
  const { data, error } = await admin
    .from('crm_bot_actions')
    .update({ status: 'expired' })
    .eq('status', 'proposed')
    .lt('expires_at', cutoff)
    .select('id')
  if (error) throw error
  return (data ?? []).length
}

async function proposeContactAction(): Promise<string> {
  const marker = `TTLTest44-${Date.now()}-${Math.floor(Math.random() * 1e4)}`
  const res = await postPropose([
    {
      role: 'user',
      content: `crea contacto llamado ${marker} con telefono +573005556666`,
    },
  ])
  if (res.status !== 200) {
    const t = await res.text()
    throw new Error(`propose failed: ${res.status} ${t}`)
  }
  const body = await res.json()
  const actions: Array<{ action_id: string }> = body?.output?.proposedActions ?? []
  if (actions.length === 0) {
    throw new Error('propose returned 0 proposedActions')
  }
  return actions[0].action_id
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('TTL cron + expired semantics', () => {
  it(
    'scenario 1: cron sweeps rows past TTL+30s; status → expired',
    async () => {
      const admin = adminClient()
      const actionId = await proposeContactAction()

      // Force expires_at to be 2 minutes in the past (well beyond the 30s grace).
      await forceExpiresAt(admin, actionId, -120)

      // Simulate the cron sweep.
      const expiredCount = await simulateCronSweep(admin)
      expect(expiredCount).toBeGreaterThanOrEqual(1)

      // Verify the row transitioned.
      const { data } = await admin
        .from('crm_bot_actions')
        .select('status')
        .eq('id', actionId)
        .maybeSingle()
      expect(data?.status).toBe('expired')
    },
    LLM_TIMEOUT_MS,
  )

  it(
    'scenario 2: confirm past TTL returns result.status=expired, no business entity created',
    async () => {
      const admin = adminClient()
      const actionId = await proposeContactAction()

      // Force expires_at 2 min in the past.
      await forceExpiresAt(admin, actionId, -120)

      const res = await postConfirm(actionId)
      const body = await res.json()
      expect(body.status).toBe('ok')
      expect(body.result.status).toBe('expired')

      // Row is marked expired, not executed; no output captured.
      const { data } = await admin
        .from('crm_bot_actions')
        .select('status, output, executed_at')
        .eq('id', actionId)
        .maybeSingle()
      expect(data?.status).toBe('expired')
      expect(data?.output).toBeFalsy()
      expect(data?.executed_at).toBeFalsy()
    },
    LLM_TIMEOUT_MS,
  )

  it(
    'scenario 3: 30s grace window — expires_at=-10s stays proposed; =-60s sweeps to expired',
    async () => {
      const admin = adminClient()
      const actionId = await proposeContactAction()

      // Inside the grace window.
      await forceExpiresAt(admin, actionId, -10)
      await simulateCronSweep(admin)
      {
        const { data } = await admin
          .from('crm_bot_actions')
          .select('status')
          .eq('id', actionId)
          .maybeSingle()
        expect(data?.status).toBe('proposed')
      }

      // Past the grace window.
      await forceExpiresAt(admin, actionId, -60)
      await simulateCronSweep(admin)
      {
        const { data } = await admin
          .from('crm_bot_actions')
          .select('status')
          .eq('id', actionId)
          .maybeSingle()
        expect(data?.status).toBe('expired')
      }
    },
    LLM_TIMEOUT_MS,
  )
})
