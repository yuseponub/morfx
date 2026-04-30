// e2e/fixtures/seed.ts
// Body filled in standalone crm-query-tools Plan 06 (Wave 5).
// Pattern derived from src/__tests__/integration/crm-query-tools/config-driven.test.ts.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface SeededData {
  workspaceId: string
  pipelineId: string
  stageIds: string[]   // [activo1, activo2, terminal1]
  contactId: string
  orderIds: string[]
}

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const srk = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !srk) {
    throw new Error('seed requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(url, srk)
}

const E2E_PHONE = '+573009998888'
const E2E_PIPELINE_NAME = 'X-E2E-Pipeline crm-query-tools'

export async function seedTestFixture(): Promise<SeededData> {
  const supabase = admin()
  const workspaceId = process.env.TEST_WORKSPACE_ID
  if (!workspaceId) throw new Error('seed requires TEST_WORKSPACE_ID')

  // 1. Pipeline
  const pipeIns = await supabase
    .from('pipelines')
    .insert({ workspace_id: workspaceId, name: E2E_PIPELINE_NAME })
    .select('id')
    .single()
  if (pipeIns.error) throw new Error(`seed pipeline failed: ${pipeIns.error.message}`)
  const pipelineId = pipeIns.data!.id

  // 2. Stages: 2 active + 1 terminal
  const stagesIns = await supabase
    .from('pipeline_stages')
    .insert([
      { pipeline_id: pipelineId, name: 'X-E2E-ACTIVO-1', position: 1 },
      { pipeline_id: pipelineId, name: 'X-E2E-ACTIVO-2', position: 2 },
      { pipeline_id: pipelineId, name: 'X-E2E-TERMINAL', position: 3 },
    ])
    .select('id, name')
  if (stagesIns.error) throw new Error(`seed stages failed: ${stagesIns.error.message}`)
  const stageMap = new Map(stagesIns.data!.map((s: { id: string; name: string }) => [s.name, s.id]))
  const activo1 = stageMap.get('X-E2E-ACTIVO-1')!
  const activo2 = stageMap.get('X-E2E-ACTIVO-2')!
  const terminal = stageMap.get('X-E2E-TERMINAL')!

  // 3. Contact
  const contactIns = await supabase
    .from('contacts')
    .insert({ workspace_id: workspaceId, name: 'X-E2E Contact', phone: E2E_PHONE })
    .select('id')
    .single()
  if (contactIns.error) throw new Error(`seed contact failed: ${contactIns.error.message}`)
  const contactId = contactIns.data!.id

  // 4. Two orders: one in activo1 (newest), one in terminal (older)
  const ordersIns = await supabase
    .from('orders')
    .insert([
      {
        workspace_id: workspaceId,
        contact_id: contactId,
        pipeline_id: pipelineId,
        stage_id: terminal,
        total_value: 50000,
        description: 'X-E2E older terminal order',
        created_at: '2026-01-01T00:00:00.000Z',
      },
      {
        workspace_id: workspaceId,
        contact_id: contactId,
        pipeline_id: pipelineId,
        stage_id: activo1,
        total_value: 100000,
        description: 'X-E2E active order (newer)',
        created_at: '2026-04-01T00:00:00.000Z',
      },
    ])
    .select('id')
  if (ordersIns.error) throw new Error(`seed orders failed: ${ordersIns.error.message}`)
  const orderIds = ordersIns.data!.map((r: { id: string }) => r.id)

  return {
    workspaceId,
    pipelineId,
    stageIds: [activo1, activo2, terminal],
    contactId,
    orderIds,
  }
}

export async function cleanupTestFixture(seeded: SeededData): Promise<void> {
  const supabase = admin()
  // Reset config that the E2E test set
  await supabase
    .from('crm_query_tools_active_stages')
    .delete()
    .eq('workspace_id', seeded.workspaceId)
    .in('stage_id', seeded.stageIds)
  await supabase
    .from('crm_query_tools_config')
    .update({ pipeline_id: null })
    .eq('workspace_id', seeded.workspaceId)

  // Delete orders, contact, pipeline (stages CASCADE with pipeline FK in your schema)
  if (seeded.orderIds.length) {
    await supabase.from('orders').delete().in('id', seeded.orderIds)
  }
  if (seeded.contactId) {
    await supabase.from('contacts').delete().eq('id', seeded.contactId)
  }
  if (seeded.pipelineId) {
    // Stages CASCADE-delete with pipeline
    await supabase.from('pipelines').delete().eq('id', seeded.pipelineId)
  }
}

// ============================================================================
// Mutation-tools E2E fixtures (Standalone crm-mutation-tools Plan 05 / Wave 4)
// ============================================================================

export interface MutationSeededData {
  pipelineId: string
  stageIds: { initial: string; second: string }
  contactId: string
}

const E2E_MUT_PIPELINE_NAME = 'X-E2E-Mutation-Pipeline crm-mutation-tools'

/**
 * Mutation-tools E2E fixture: ensures a pipeline with at least 2 stages exists
 * in TEST_WORKSPACE_ID and seeds a contact for createOrder/createTask scenarios.
 * Pipeline + stages are reused across runs (idempotent ensure-or-create);
 * contact is unique per run.
 */
export async function seedMutationToolsFixture(): Promise<MutationSeededData> {
  const supabase = admin()
  const ws = process.env.TEST_WORKSPACE_ID
  if (!ws) throw new Error('seedMutationToolsFixture requires TEST_WORKSPACE_ID')

  // Ensure pipeline (idempotent — reused across runs).
  let pipelineId: string
  const existingPipeline = await supabase
    .from('pipelines')
    .select('id')
    .eq('workspace_id', ws)
    .eq('name', E2E_MUT_PIPELINE_NAME)
    .maybeSingle()
  if (existingPipeline.error) {
    throw new Error(`pipeline lookup failed: ${existingPipeline.error.message}`)
  }
  if (existingPipeline.data) {
    pipelineId = existingPipeline.data.id as string
  } else {
    const created = await supabase
      .from('pipelines')
      .insert({ workspace_id: ws, name: E2E_MUT_PIPELINE_NAME })
      .select('id')
      .single()
    if (created.error || !created.data) {
      throw new Error(`pipeline insert failed: ${created.error?.message}`)
    }
    pipelineId = created.data.id as string
  }

  // Ensure 2 stages — initial (position 0) + second (position 1).
  let initial: string
  let second: string
  const stagesQuery = await supabase
    .from('pipeline_stages')
    .select('id, name, position')
    .eq('pipeline_id', pipelineId)
    .order('position', { ascending: true })
  if (stagesQuery.error) {
    throw new Error(`stages lookup failed: ${stagesQuery.error.message}`)
  }
  const stages = stagesQuery.data ?? []
  if (stages.length >= 2) {
    initial = stages[0].id as string
    second = stages[1].id as string
  } else {
    // Insert any missing stages.
    const missing: Array<{ pipeline_id: string; name: string; position: number }> = []
    if (stages.length === 0) {
      missing.push({ pipeline_id: pipelineId, name: 'X-E2E-Mut Initial', position: 0 })
      missing.push({ pipeline_id: pipelineId, name: 'X-E2E-Mut Second', position: 1 })
    } else {
      missing.push({ pipeline_id: pipelineId, name: 'X-E2E-Mut Second', position: 1 })
    }
    const ins = await supabase
      .from('pipeline_stages')
      .insert(missing)
      .select('id, position')
    if (ins.error) throw new Error(`stage insert failed: ${ins.error.message}`)
    // Re-query in deterministic order to bind initial / second.
    const reread = await supabase
      .from('pipeline_stages')
      .select('id, position')
      .eq('pipeline_id', pipelineId)
      .order('position', { ascending: true })
    if (reread.error || !reread.data) {
      throw new Error(`stages reread failed: ${reread.error?.message}`)
    }
    initial = reread.data[0].id as string
    second = reread.data[1].id as string
  }

  // Fresh contact per run (unique name to enable cleanup).
  const contactInsert = await supabase
    .from('contacts')
    .insert({
      workspace_id: ws,
      name: `X-E2E-Mut Contact ${Date.now()}`,
    })
    .select('id')
    .single()
  if (contactInsert.error || !contactInsert.data) {
    throw new Error(`contact insert failed: ${contactInsert.error?.message}`)
  }

  return {
    pipelineId,
    stageIds: { initial, second },
    contactId: contactInsert.data.id as string,
  }
}

/**
 * Cleanup mutation-tools fixture. Hard-deletes orders + tasks + notes for the
 * seeded contact, then deletes the contact. Pipeline + stages are intentionally
 * preserved for re-use across runs (idempotent seed).
 */
export async function cleanupMutationToolsFixture(seed: {
  contactId: string
}): Promise<void> {
  const supabase = admin()
  const ws = process.env.TEST_WORKSPACE_ID
  if (!ws) return
  // Delete dependents first (orders → contact_notes → tasks → contact).
  await supabase
    .from('orders')
    .delete()
    .eq('workspace_id', ws)
    .eq('contact_id', seed.contactId)
  await supabase
    .from('contact_notes')
    .delete()
    .eq('workspace_id', ws)
    .eq('contact_id', seed.contactId)
  await supabase
    .from('tasks')
    .delete()
    .eq('workspace_id', ws)
    .eq('contact_id', seed.contactId)
  await supabase.from('contacts').delete().eq('id', seed.contactId).eq('workspace_id', ws)
}
