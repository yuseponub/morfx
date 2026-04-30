/**
 * Integration — idempotency race for crm-mutation-tools.createContact.
 *
 * Standalone crm-mutation-tools Wave 4 (Plan 05).
 *
 * Pattern: env-gated, real Supabase admin client.
 *
 * Verifies Pitfall 5 mitigation (D-03): N concurrent calls to createContact
 * with the SAME idempotencyKey must result in:
 *   - exactly 1 call returns status='executed'
 *   - the rest return status='duplicate'
 *   - all calls point to the SAME contact ID (re-hydrated)
 *   - exactly 1 row in `crm_mutation_idempotency_keys`
 *   - exactly 1 row in `contacts` for the synthesized name
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createCrmMutationTools } from '@/lib/agents/shared/crm-mutation-tools'

const TEST_WORKSPACE_ID = process.env.TEST_WORKSPACE_ID ?? ''
const skip =
  !TEST_WORKSPACE_ID ||
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  !process.env.SUPABASE_SERVICE_ROLE_KEY

function admin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const KEY = `e2e-idempotency-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const NAME = `X-Idempotency Test ${KEY}`
const CALL_COUNT = 5

let createdContactIds: Set<string> = new Set()

describe.skipIf(skip)('crm-mutation-tools idempotency race (Pitfall 5)', () => {
  afterAll(async () => {
    const supabase = admin()
    if (createdContactIds.size > 0) {
      await supabase
        .from('contacts')
        .delete()
        .in('id', Array.from(createdContactIds))
    }
    // Cleanup idempotency row.
    await supabase
      .from('crm_mutation_idempotency_keys')
      .delete()
      .eq('workspace_id', TEST_WORKSPACE_ID)
      .eq('tool_name', 'createContact')
      .eq('key', KEY)
  })

  it('Promise.all of N concurrent createContact calls with same key yields exactly 1 executed', async () => {
    const tools = createCrmMutationTools({
      workspaceId: TEST_WORKSPACE_ID,
      invoker: 'integration-test-idempotency',
    })
    const exec = tools.createContact as unknown as {
      execute: (i: unknown) => Promise<unknown>
    }

    const promises = Array.from({ length: CALL_COUNT }, () =>
      exec.execute({ name: NAME, idempotencyKey: KEY }),
    )
    const results = (await Promise.all(promises)) as Array<{
      status: string
      data?: { id?: string }
    }>

    // Track all returned contact IDs for cleanup.
    for (const r of results) {
      if (r.data?.id) createdContactIds.add(r.data.id)
    }

    const executedCount = results.filter((r) => r.status === 'executed').length
    const duplicateCount = results.filter((r) => r.status === 'duplicate').length

    expect(executedCount).toBe(1)
    expect(duplicateCount).toBe(CALL_COUNT - 1)

    // All results point to the SAME contact ID (re-hydrated).
    const uniqueIds = new Set(results.map((r) => r.data?.id).filter(Boolean) as string[])
    expect(uniqueIds.size).toBe(1)
  })

  it('exactly 1 row in crm_mutation_idempotency_keys for this key', async () => {
    const supabase = admin()
    const { data, error } = await supabase
      .from('crm_mutation_idempotency_keys')
      .select('result_id, tool_name, key')
      .eq('workspace_id', TEST_WORKSPACE_ID)
      .eq('tool_name', 'createContact')
      .eq('key', KEY)
    if (error) throw error
    expect(data).toHaveLength(1)
  })

  it('exactly 1 contact row created in DB despite N concurrent calls', async () => {
    const supabase = admin()
    const { data, error } = await supabase
      .from('contacts')
      .select('id')
      .eq('workspace_id', TEST_WORKSPACE_ID)
      .eq('name', NAME)
    if (error) throw error
    expect(data ?? []).toHaveLength(1)
  })
})
