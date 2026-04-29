/**
 * Integration — cross-workspace isolation for crm-query-tools.
 *
 * Standalone crm-query-tools Wave 5 (Plan 06).
 *
 * Pattern: env-gated, real Supabase admin client.
 *   Required env: TEST_WORKSPACE_ID, TEST_WORKSPACE_ID_2,
 *                 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 *
 * Verifies Pitfall 1 mitigation: same phone in two workspaces resolves
 * to the workspace's own contact, never the other.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createCrmQueryTools } from '@/lib/agents/shared/crm-query-tools'

const WS_A = process.env.TEST_WORKSPACE_ID ?? ''
const WS_B = process.env.TEST_WORKSPACE_ID_2 ?? ''
const SHARED_PHONE = '+573009999111'

const skip = !WS_A || !WS_B || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL

function admin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

let contactIdA = ''
let contactIdB = ''

describe.skipIf(skip)('crm-query-tools cross-workspace isolation (D-05)', () => {
  beforeAll(async () => {
    const supabase = admin()
    const insA = await supabase
      .from('contacts')
      .insert({ workspace_id: WS_A, name: 'X-Test Contact A', phone: SHARED_PHONE })
      .select('id')
      .single()
    if (insA.error) throw new Error(`seed A failed: ${insA.error.message}`)
    contactIdA = insA.data!.id

    const insB = await supabase
      .from('contacts')
      .insert({ workspace_id: WS_B, name: 'X-Test Contact B', phone: SHARED_PHONE })
      .select('id')
      .single()
    if (insB.error) throw new Error(`seed B failed: ${insB.error.message}`)
    contactIdB = insB.data!.id
  })

  afterAll(async () => {
    const supabase = admin()
    if (contactIdA) await supabase.from('contacts').delete().eq('id', contactIdA)
    if (contactIdB) await supabase.from('contacts').delete().eq('id', contactIdB)
  })

  it('workspace A query returns contact A only', async () => {
    const tools = createCrmQueryTools({ workspaceId: WS_A, invoker: 'integration-test' })
    const result = await (tools.getContactByPhone as unknown as { execute: (i: unknown) => Promise<unknown> }).execute({ phone: SHARED_PHONE }) as { status: string; data?: { id: string } }
    expect(result.status).toBe('found')
    expect(result.data?.id).toBe(contactIdA)
    expect(result.data?.id).not.toBe(contactIdB)
  })

  it('workspace B query returns contact B only', async () => {
    const tools = createCrmQueryTools({ workspaceId: WS_B, invoker: 'integration-test' })
    const result = await (tools.getContactByPhone as unknown as { execute: (i: unknown) => Promise<unknown> }).execute({ phone: SHARED_PHONE }) as { status: string; data?: { id: string } }
    expect(result.status).toBe('found')
    expect(result.data?.id).toBe(contactIdB)
    expect(result.data?.id).not.toBe(contactIdA)
  })
})
