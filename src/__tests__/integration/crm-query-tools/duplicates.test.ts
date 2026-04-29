/**
 * Integration — D-08 duplicates resolution.
 *
 * Standalone crm-query-tools Wave 5 (Plan 06).
 * Verifies: 2+ contacts same phone in same workspace → newest first
 * + duplicates_count + duplicates list.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createCrmQueryTools } from '@/lib/agents/shared/crm-query-tools'

const WS = process.env.TEST_WORKSPACE_ID ?? ''
const PHONE = '+573009999222'
const skip = !WS || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL

function admin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const ids: string[] = []

describe.skipIf(skip)('crm-query-tools duplicates resolution (D-08)', () => {
  beforeAll(async () => {
    const supabase = admin()
    // Insert 3 contacts with explicit created_at so newest is unambiguous
    const rows = [
      { workspace_id: WS, name: 'X-Dup-T1', phone: PHONE, created_at: '2026-01-01T00:00:00.000Z' },
      { workspace_id: WS, name: 'X-Dup-T2', phone: PHONE, created_at: '2026-02-01T00:00:00.000Z' },
      { workspace_id: WS, name: 'X-Dup-T3', phone: PHONE, created_at: '2026-04-01T00:00:00.000Z' },
    ]
    const ins = await supabase.from('contacts').insert(rows).select('id, name')
    if (ins.error) throw new Error(`seed dups failed: ${ins.error.message}`)
    for (const r of ins.data!) ids.push(r.id)
  })

  afterAll(async () => {
    const supabase = admin()
    if (ids.length) await supabase.from('contacts').delete().in('id', ids)
  })

  it('returns the newest contact + duplicates_count: 2', async () => {
    const supabase = admin()
    const verify = await supabase
      .from('contacts')
      .select('id, name, created_at')
      .in('id', ids)
      .order('created_at', { ascending: false })
    if (verify.error) throw new Error(`verify failed: ${verify.error.message}`)
    const newestId = verify.data![0].id
    const olderIds = verify.data!.slice(1).map((r) => r.id)

    const tools = createCrmQueryTools({ workspaceId: WS, invoker: 'integration-test' })
    const result = await (tools.getContactByPhone as unknown as { execute: (i: unknown) => Promise<unknown> }).execute({ phone: PHONE }) as {
      status: string
      data?: { id: string; duplicates_count: number; duplicates: string[] }
    }

    expect(result.status).toBe('found')
    expect(result.data?.id).toBe(newestId)
    expect(result.data?.duplicates_count).toBe(2)
    expect(new Set(result.data?.duplicates ?? [])).toEqual(new Set(olderIds))
  })
})
