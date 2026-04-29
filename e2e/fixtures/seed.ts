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
