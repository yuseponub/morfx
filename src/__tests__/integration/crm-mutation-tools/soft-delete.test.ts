/**
 * Integration — soft-delete invariant for crm-mutation-tools.
 *
 * Standalone crm-mutation-tools Wave 4 (Plan 05).
 *
 * Pattern: env-gated, real Supabase admin client.
 *
 * Verifies Pitfall 4 mitigation (D-pre-04): every "destructive" tool only
 * sets a soft-delete flag (`archived_at` for contacts/orders/notes,
 * `completed_at` for tasks) and NEVER hard-DELETEs the row.
 *
 * Plus D-11 (closeOrder independence): `closeOrder` populates `closed_at`
 * AND leaves `archived_at` NULL — they are independent fields.
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

interface SeededIds {
  contactId: string
  pipelineId: string
  stageId: string
  orderId: string
  closeOrderId: string
  contactNoteId: string
  taskId: string
}

let seeded: SeededIds | null = null

async function seedAll(): Promise<SeededIds> {
  const supabase = admin()

  const c = await supabase
    .from('contacts')
    .insert({ workspace_id: TEST_WORKSPACE_ID, name: 'X-SoftDelete Contact' })
    .select('id')
    .single()
  if (c.error || !c.data) throw new Error(`seed contact: ${c.error?.message}`)
  const contactId = c.data.id as string

  // Pipeline + stage (reusable per-run; cleanup at end).
  const p = await supabase
    .from('pipelines')
    .insert({ workspace_id: TEST_WORKSPACE_ID, name: `X-SoftDelete Pipeline ${Date.now()}` })
    .select('id')
    .single()
  if (p.error || !p.data) throw new Error(`seed pipeline: ${p.error?.message}`)
  const pipelineId = p.data.id as string

  const s = await supabase
    .from('pipeline_stages')
    .insert({ pipeline_id: pipelineId, name: 'X-SoftDelete Stage', position: 0 })
    .select('id')
    .single()
  if (s.error || !s.data) throw new Error(`seed stage: ${s.error?.message}`)
  const stageId = s.data.id as string

  const o1 = await supabase
    .from('orders')
    .insert({
      workspace_id: TEST_WORKSPACE_ID,
      contact_id: contactId,
      pipeline_id: pipelineId,
      stage_id: stageId,
      name: 'X-SoftDelete Archive Target',
    })
    .select('id')
    .single()
  if (o1.error || !o1.data) throw new Error(`seed order1: ${o1.error?.message}`)
  const orderId = o1.data.id as string

  const o2 = await supabase
    .from('orders')
    .insert({
      workspace_id: TEST_WORKSPACE_ID,
      contact_id: contactId,
      pipeline_id: pipelineId,
      stage_id: stageId,
      name: 'X-SoftDelete Close Target',
    })
    .select('id')
    .single()
  if (o2.error || !o2.data) throw new Error(`seed order2: ${o2.error?.message}`)
  const closeOrderId = o2.data.id as string

  const n = await supabase
    .from('contact_notes')
    .insert({
      workspace_id: TEST_WORKSPACE_ID,
      contact_id: contactId,
      content: 'X-SoftDelete note body',
      user_id: 'integration-test',
    })
    .select('id')
    .single()
  if (n.error || !n.data) throw new Error(`seed note: ${n.error?.message}`)
  const contactNoteId = n.data.id as string

  const t = await supabase
    .from('tasks')
    .insert({
      workspace_id: TEST_WORKSPACE_ID,
      title: 'X-SoftDelete Task',
      status: 'pending',
      priority: 'medium',
    })
    .select('id')
    .single()
  if (t.error || !t.data) throw new Error(`seed task: ${t.error?.message}`)
  const taskId = t.data.id as string

  return { contactId, pipelineId, stageId, orderId, closeOrderId, contactNoteId, taskId }
}

async function cleanupAll(s: SeededIds): Promise<void> {
  const supabase = admin()
  // Delete dependent rows first then parent — orders before pipeline.
  await supabase.from('tasks').delete().eq('id', s.taskId)
  await supabase.from('contact_notes').delete().eq('id', s.contactNoteId)
  await supabase.from('orders').delete().in('id', [s.orderId, s.closeOrderId])
  await supabase.from('pipelines').delete().eq('id', s.pipelineId)
  await supabase.from('contacts').delete().eq('id', s.contactId)
}

describe.skipIf(skip)('crm-mutation-tools soft-delete invariant (D-pre-04, Pitfall 4)', () => {
  beforeAll(async () => {
    seeded = await seedAll()
  })

  afterAll(async () => {
    if (seeded) await cleanupAll(seeded)
  })

  it('archiveContact populates archived_at; row is NOT deleted', async () => {
    const tools = createCrmMutationTools({
      workspaceId: TEST_WORKSPACE_ID,
      invoker: 'integration-test-soft-delete',
    })
    const result = (await (
      tools.archiveContact as unknown as { execute: (i: unknown) => Promise<unknown> }
    ).execute({ contactId: seeded!.contactId })) as { status: string }
    expect(result.status).toBe('executed')

    const supabase = admin()
    const { data, count, error } = await supabase
      .from('contacts')
      .select('id, archived_at', { count: 'exact' })
      .eq('id', seeded!.contactId)
    if (error) throw error
    expect(count).toBe(1)
    expect(data?.[0]?.archived_at).not.toBeNull()
  })

  it('archiveOrder populates archived_at; row is NOT deleted', async () => {
    const tools = createCrmMutationTools({
      workspaceId: TEST_WORKSPACE_ID,
      invoker: 'integration-test-soft-delete',
    })
    const result = (await (
      tools.archiveOrder as unknown as { execute: (i: unknown) => Promise<unknown> }
    ).execute({ orderId: seeded!.orderId })) as { status: string }
    expect(result.status).toBe('executed')

    const supabase = admin()
    const { data, count, error } = await supabase
      .from('orders')
      .select('id, archived_at', { count: 'exact' })
      .eq('id', seeded!.orderId)
    if (error) throw error
    expect(count).toBe(1)
    expect(data?.[0]?.archived_at).not.toBeNull()
  })

  it('archiveContactNote populates archived_at; row is NOT deleted', async () => {
    const tools = createCrmMutationTools({
      workspaceId: TEST_WORKSPACE_ID,
      invoker: 'integration-test-soft-delete',
    })
    const result = (await (
      tools.archiveContactNote as unknown as { execute: (i: unknown) => Promise<unknown> }
    ).execute({ noteId: seeded!.contactNoteId })) as { status: string }
    expect(result.status).toBe('executed')

    const supabase = admin()
    const { data, count, error } = await supabase
      .from('contact_notes')
      .select('id, archived_at', { count: 'exact' })
      .eq('id', seeded!.contactNoteId)
    if (error) throw error
    expect(count).toBe(1)
    expect(data?.[0]?.archived_at).not.toBeNull()
  })

  it('completeTask populates completed_at; row is NOT deleted', async () => {
    const tools = createCrmMutationTools({
      workspaceId: TEST_WORKSPACE_ID,
      invoker: 'integration-test-soft-delete',
    })
    const result = (await (
      tools.completeTask as unknown as { execute: (i: unknown) => Promise<unknown> }
    ).execute({ taskId: seeded!.taskId })) as { status: string }
    expect(result.status).toBe('executed')

    const supabase = admin()
    const { data, count, error } = await supabase
      .from('tasks')
      .select('id, completed_at, status', { count: 'exact' })
      .eq('id', seeded!.taskId)
    if (error) throw error
    expect(count).toBe(1)
    expect(data?.[0]?.completed_at).not.toBeNull()
    expect(data?.[0]?.status).toBe('completed')
  })

  // D-11 — closeOrder independence: closed_at populated AND archived_at NULL.
  it('closeOrder populates closed_at without setting archived_at (D-11 independence)', async () => {
    const tools = createCrmMutationTools({
      workspaceId: TEST_WORKSPACE_ID,
      invoker: 'integration-test-soft-delete',
    })
    const result = (await (
      tools.closeOrder as unknown as { execute: (i: unknown) => Promise<unknown> }
    ).execute({ orderId: seeded!.closeOrderId })) as { status: string }
    expect(result.status).toBe('executed')

    const supabase = admin()
    const { data, error } = await supabase
      .from('orders')
      .select('closed_at, archived_at')
      .eq('id', seeded!.closeOrderId)
      .single()
    if (error) throw error
    expect(data?.closed_at).not.toBeNull()
    // D-11: closed_at and archived_at are independent — closing must NOT archive.
    expect(data?.archived_at).toBeNull()
  })

  it('closeOrder is idempotent — second call returns executed and closed_at unchanged', async () => {
    const supabase = admin()
    const before = await supabase
      .from('orders')
      .select('closed_at')
      .eq('id', seeded!.closeOrderId)
      .single()
    if (before.error) throw before.error
    const firstClosedAt = before.data?.closed_at as string | null
    expect(firstClosedAt).not.toBeNull()

    const tools = createCrmMutationTools({
      workspaceId: TEST_WORKSPACE_ID,
      invoker: 'integration-test-soft-delete',
    })
    const result = (await (
      tools.closeOrder as unknown as { execute: (i: unknown) => Promise<unknown> }
    ).execute({ orderId: seeded!.closeOrderId })) as { status: string }
    expect(result.status).toBe('executed')

    const after = await supabase
      .from('orders')
      .select('closed_at')
      .eq('id', seeded!.closeOrderId)
      .single()
    if (after.error) throw after.error
    expect(after.data?.closed_at).toBe(firstClosedAt)
  })
})
