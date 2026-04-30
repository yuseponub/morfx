/**
 * Integration — cross-workspace isolation for crm-mutation-tools.
 *
 * Standalone crm-mutation-tools Wave 4 (Plan 05).
 *
 * Pattern: env-gated, real Supabase admin client.
 *   Required env: TEST_WORKSPACE_ID, TEST_WORKSPACE_ID_2,
 *                 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 *
 * Verifies T-05-03 mitigation (Pitfall 2): seed contact in WS_A; tool factory
 * with `ctx.workspaceId = WS_B` attempts to archive that contact → must
 * return `resource_not_found` (NOT `executed`). Contact in WS_A must remain
 * unchanged afterwards.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createCrmMutationTools } from '@/lib/agents/shared/crm-mutation-tools'

const WS_A = process.env.TEST_WORKSPACE_ID ?? ''
const WS_B = process.env.TEST_WORKSPACE_ID_2 ?? ''

const skip = !WS_A || !WS_B || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL

function admin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

let contactIdA = ''

describe.skipIf(skip)('crm-mutation-tools cross-workspace isolation (T-05-03)', () => {
  beforeAll(async () => {
    const supabase = admin()
    const insA = await supabase
      .from('contacts')
      .insert({ workspace_id: WS_A, name: 'X-Mutation-Test Contact A' })
      .select('id')
      .single()
    if (insA.error) throw new Error(`seed A failed: ${insA.error.message}`)
    contactIdA = insA.data!.id as string
  })

  afterAll(async () => {
    const supabase = admin()
    if (contactIdA) await supabase.from('contacts').delete().eq('id', contactIdA)
  })

  it('archiveContact from WS_B against contact seeded in WS_A returns resource_not_found', async () => {
    const tools = createCrmMutationTools({
      workspaceId: WS_B,
      invoker: 'integration-test',
    })
    const result = (await (
      tools.archiveContact as unknown as { execute: (i: unknown) => Promise<unknown> }
    ).execute({ contactId: contactIdA })) as {
      status: string
      error?: { code?: string; missing?: { resource?: string; id?: string } }
    }
    expect(result.status).toBe('resource_not_found')
    expect(result.error?.missing?.resource).toBe('contact')
    expect(result.error?.missing?.id).toBe(contactIdA)
  })

  it('contact in WS_A remains unchanged (no cross-workspace mutation)', async () => {
    const supabase = admin()
    const { data, error } = await supabase
      .from('contacts')
      .select('id, archived_at, workspace_id')
      .eq('id', contactIdA)
      .single()
    if (error) throw error
    expect(data?.archived_at).toBeNull()
    expect(data?.workspace_id).toBe(WS_A)
  })

  it('updateContact from WS_B against contact in WS_A returns resource_not_found', async () => {
    const tools = createCrmMutationTools({
      workspaceId: WS_B,
      invoker: 'integration-test',
    })
    const result = (await (
      tools.updateContact as unknown as { execute: (i: unknown) => Promise<unknown> }
    ).execute({ contactId: contactIdA, name: 'should-not-update' })) as {
      status: string
      error?: { missing?: { resource?: string } }
    }
    expect(result.status).toBe('resource_not_found')
    expect(result.error?.missing?.resource).toBe('contact')
  })
})
