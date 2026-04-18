/**
 * Integration tests — POST /api/v1/crm-bots/writer/propose + /confirm
 * Phase 44 Plan 09, Task 2 (file 1/3).
 *
 * Scenarios covered:
 *   1. Happy path: propose createContact → confirm → executed + contact persisted.
 *   2. Idempotency (Pitfall 3): confirm twice serially → first executed,
 *      second already_executed with SAME output. Contact count +1 exactly.
 *   3. Concurrent double-confirm: two confirms in parallel → exactly one
 *      executed, one already_executed. Only ONE contact created.
 *   4. Resource not found: propose createContact with a fake tagId →
 *      proposedActions empty + text mentions resource_not_found. No row in
 *      crm_bot_actions for createContact (propose rejected before DB insert).
 *   5. Workspace scope bind (Pitfall 4): confirm with an action_id that
 *      belongs to a DIFFERENT workspace → not_found. The legit workspace's
 *      action was NOT touched.
 *
 * Preconditions (env):
 *   - TEST_WORKSPACE_ID + TEST_API_KEY (workspace A — primary test)
 *   - TEST_WORKSPACE_ID_B + TEST_API_KEY_B (workspace B — for scenario 5;
 *     skip scenario 5 if unset)
 *   - NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (for admin reads)
 *
 * Test-runner: vitest.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3020'
const TEST_WORKSPACE_ID = process.env.TEST_WORKSPACE_ID ?? ''
const TEST_API_KEY = process.env.TEST_API_KEY ?? ''
const TEST_WORKSPACE_ID_B = process.env.TEST_WORKSPACE_ID_B ?? ''
const TEST_API_KEY_B = process.env.TEST_API_KEY_B ?? ''

const PROPOSE_ENDPOINT = `${BASE_URL}/api/v1/crm-bots/writer/propose`
const CONFIRM_ENDPOINT = `${BASE_URL}/api/v1/crm-bots/writer/confirm`

const LLM_TIMEOUT_MS = 30_000

// Test-contact name prefix — the cleanup hook archives any matching contacts.
const TEST_NAME_PREFIX = 'Test44WriterIT'

const createdContactNames: string[] = []

beforeAll(() => {
  if (!TEST_WORKSPACE_ID || !TEST_API_KEY) {
    throw new Error('TEST_WORKSPACE_ID and TEST_API_KEY env vars are required.')
  }
})

afterAll(async () => {
  // Best-effort cleanup: archive any test-contacts we created. Fail-silent if
  // the env is incomplete.
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const srk = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !srk) return
    const admin = createClient(url, srk)
    if (createdContactNames.length === 0) return
    await admin
      .from('contacts')
      .update({ archived_at: new Date().toISOString() })
      .eq('workspace_id', TEST_WORKSPACE_ID)
      .in('name', createdContactNames)
  } catch {
    /* ignore */
  }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function postPropose(
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  apiKey = TEST_API_KEY,
): Promise<Response> {
  return fetch(PROPOSE_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ messages }),
  })
}

function postConfirm(actionId: string, apiKey = TEST_API_KEY): Promise<Response> {
  return fetch(CONFIRM_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ actionId }),
  })
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const srk = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !srk) throw new Error('Supabase admin env missing')
  return createClient(url, srk)
}

function uniqueContactName(): string {
  const name = `${TEST_NAME_PREFIX}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`
  createdContactNames.push(name)
  return name
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('writer two-step (propose → confirm)', () => {
  // -------------------------------------------------------------------------
  // Scenario 1: happy path
  // -------------------------------------------------------------------------
  it(
    'happy path: propose createContact → confirm executed + contact persisted',
    async () => {
      const name = uniqueContactName()
      const proposeRes = await postPropose([
        {
          role: 'user',
          content: `crea contacto llamado ${name} con telefono +573001234567`,
        },
      ])
      expect(proposeRes.status).toBe(200)
      const proposeBody = await proposeRes.json()
      expect(proposeBody.status).toBe('ok')
      expect(Array.isArray(proposeBody.output.proposedActions)).toBe(true)
      expect(proposeBody.output.proposedActions.length).toBeGreaterThanOrEqual(1)
      const action = proposeBody.output.proposedActions[0]
      expect(action.action_id).toBeTruthy()
      expect(typeof action.expires_at).toBe('string')

      const confirmRes = await postConfirm(action.action_id)
      expect(confirmRes.status).toBe(200)
      const confirmBody = await confirmRes.json()
      expect(confirmBody.status).toBe('ok')
      expect(confirmBody.result.status).toBe('executed')

      // Verify persistence (the contact row exists in the workspace).
      const supabase = adminClient()
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, name')
        .eq('workspace_id', TEST_WORKSPACE_ID)
        .eq('name', name)
      expect((contacts ?? []).length).toBe(1)
    },
    LLM_TIMEOUT_MS,
  )

  // -------------------------------------------------------------------------
  // Scenario 2: idempotency (serial)
  // -------------------------------------------------------------------------
  it(
    'idempotency: double-confirm serial → executed then already_executed (same output)',
    async () => {
      const name = uniqueContactName()
      const proposeRes = await postPropose([
        {
          role: 'user',
          content: `crea contacto llamado ${name} con telefono +573001112222`,
        },
      ])
      const proposeBody = await proposeRes.json()
      const actionId = proposeBody.output.proposedActions[0].action_id

      const first = await (await postConfirm(actionId)).json()
      expect(first.result.status).toBe('executed')
      const second = await (await postConfirm(actionId)).json()
      expect(second.result.status).toBe('already_executed')
      expect(second.result.output).toEqual(first.result.output)

      // Contact count increased by exactly 1.
      const supabase = adminClient()
      const { data } = await supabase
        .from('contacts')
        .select('id')
        .eq('workspace_id', TEST_WORKSPACE_ID)
        .eq('name', name)
      expect((data ?? []).length).toBe(1)
    },
    LLM_TIMEOUT_MS,
  )

  // -------------------------------------------------------------------------
  // Scenario 3: concurrent double-confirm (optimistic UPDATE race — Pitfall 3)
  // -------------------------------------------------------------------------
  it(
    'concurrent double-confirm: exactly one executed, one already_executed',
    async () => {
      const name = uniqueContactName()
      const proposeBody = await (
        await postPropose([
          {
            role: 'user',
            content: `crea contacto llamado ${name} con telefono +573002223333`,
          },
        ])
      ).json()
      const actionId = proposeBody.output.proposedActions[0].action_id

      const [a, b] = await Promise.all([
        postConfirm(actionId).then((r) => r.json()),
        postConfirm(actionId).then((r) => r.json()),
      ])

      const statuses = [a.result.status, b.result.status].sort()
      expect(statuses).toEqual(['already_executed', 'executed'])

      // Only one entity created.
      const supabase = adminClient()
      const { data } = await supabase
        .from('contacts')
        .select('id')
        .eq('workspace_id', TEST_WORKSPACE_ID)
        .eq('name', name)
      expect((data ?? []).length).toBe(1)
    },
    LLM_TIMEOUT_MS,
  )

  // -------------------------------------------------------------------------
  // Scenario 4: resource not found — fake tagId must NOT lead to a
  // createContact row in crm_bot_actions.
  // -------------------------------------------------------------------------
  it(
    'resource_not_found: fake tagId yields no createContact row + text mentions the error',
    async () => {
      const fakeTagId = '00000000-0000-0000-0000-000000000001'
      const name = `${TEST_NAME_PREFIX}-fakeTag-${Date.now()}`
      const res = await postPropose([
        {
          role: 'user',
          content: `crea contacto llamado ${name} con telefono +573003334444 y asignale el tag ${fakeTagId}`,
        },
      ])
      expect(res.status).toBe(200)
      const body = await res.json()
      // Either the LLM returns proposedActions=[] OR it produces no createContact
      // proposal. Either way, there must be zero createContact rows in crm_bot_actions
      // tied to this name.
      expect(body.status).toBe('ok')
      // The assistant text should mention that a resource was not found
      // OR politely decline referencing the missing tag.
      const text: string = body.output.text ?? ''
      expect(
        /resource_not_found|no (existe|encontrado|encontre)|not\s*found/i.test(text),
      ).toBe(true)

      // No createContact row was persisted for this contact name.
      const supabase = adminClient()
      const { data } = await supabase
        .from('crm_bot_actions')
        .select('id, tool_name, input_params')
        .eq('workspace_id', TEST_WORKSPACE_ID)
        .eq('tool_name', 'createContact')
        .order('created_at', { ascending: false })
        .limit(50)
      const rows = (data ?? []) as Array<{
        id: string
        tool_name: string
        input_params: unknown
      }>
      const match = rows.find((r) => {
        try {
          return JSON.stringify(r.input_params ?? {}).includes(name)
        } catch {
          return false
        }
      })
      expect(match).toBeUndefined()
    },
    LLM_TIMEOUT_MS,
  )

  // -------------------------------------------------------------------------
  // Scenario 5: workspace scope bind. Requires workspace B creds.
  // -------------------------------------------------------------------------
  it(
    'workspace scope: confirm with another workspace\'s action_id → not_found (action untouched)',
    async () => {
      if (!TEST_WORKSPACE_ID_B || !TEST_API_KEY_B) {
        // eslint-disable-next-line no-console
        console.warn('Scenario 5 skipped: TEST_WORKSPACE_ID_B / TEST_API_KEY_B not set.')
        return
      }

      const name = uniqueContactName()
      const proposeA = await (
        await postPropose(
          [
            {
              role: 'user',
              content: `crea contacto llamado ${name} con telefono +573004445555`,
            },
          ],
          TEST_API_KEY,
        )
      ).json()
      const actionId = proposeA.output.proposedActions[0].action_id

      const crossRes = await postConfirm(actionId, TEST_API_KEY_B)
      const crossBody = await crossRes.json()
      expect(crossBody.result.status).toBe('not_found')

      // The original row in workspace A is still 'proposed' (untouched).
      const supabase = adminClient()
      const { data: row } = await supabase
        .from('crm_bot_actions')
        .select('status, workspace_id')
        .eq('id', actionId)
        .eq('workspace_id', TEST_WORKSPACE_ID)
        .maybeSingle()
      expect(row?.status).toBe('proposed')
    },
    LLM_TIMEOUT_MS,
  )
})
