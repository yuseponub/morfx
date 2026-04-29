/**
 * Integration — config-driven active stages + FK behavior.
 *
 * Standalone crm-query-tools Wave 5 (Plan 06).
 * Verifies D-11/D-12/D-13/D-16 + Pitfall 2 mitigation.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getCrmQueryToolsConfig } from '@/lib/domain/crm-query-tools-config'

const WS = process.env.TEST_WORKSPACE_ID ?? ''
const skip = !WS || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL

function admin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

let pipelineId = ''
let s1 = ''
let s2 = ''
let s3 = ''

describe.skipIf(skip)('crm-query-tools config-driven + FK CASCADE (D-13)', () => {
  beforeAll(async () => {
    const supabase = admin()

    const pipeIns = await supabase
      .from('pipelines')
      .insert({ workspace_id: WS, name: 'X-Test Pipeline crm-query-tools' })
      .select('id')
      .single()
    if (pipeIns.error) throw new Error(`pipeline seed failed: ${pipeIns.error.message}`)
    pipelineId = pipeIns.data!.id

    const stagesIns = await supabase
      .from('pipeline_stages')
      .insert([
        { pipeline_id: pipelineId, name: 'S1-Test', position: 1 },
        { pipeline_id: pipelineId, name: 'S2-Test', position: 2 },
        { pipeline_id: pipelineId, name: 'S3-Test', position: 3 },
      ])
      .select('id, name')
    if (stagesIns.error) throw new Error(`stages seed failed: ${stagesIns.error.message}`)

    const sMap = new Map(stagesIns.data!.map((s: { id: string; name: string }) => [s.name, s.id]))
    s1 = sMap.get('S1-Test')!
    s2 = sMap.get('S2-Test')!
    s3 = sMap.get('S3-Test')!

    // Upsert config row + junction
    await supabase
      .from('crm_query_tools_config')
      .upsert({ workspace_id: WS, pipeline_id: pipelineId }, { onConflict: 'workspace_id' })

    // Clean any pre-existing junction for this WS to keep test deterministic
    await supabase.from('crm_query_tools_active_stages').delete().eq('workspace_id', WS)

    await supabase
      .from('crm_query_tools_active_stages')
      .insert([
        { workspace_id: WS, stage_id: s1 },
        { workspace_id: WS, stage_id: s2 },
      ])
  })

  afterAll(async () => {
    const supabase = admin()
    // CASCADE may have removed junction rows — best-effort cleanup
    await supabase.from('crm_query_tools_active_stages').delete().eq('workspace_id', WS)
    if (pipelineId) {
      // Stages are CASCADE-deleted with pipeline (orders.ts FK)
      await supabase.from('pipelines').delete().eq('id', pipelineId)
    }
    // Reset config back to whatever it was — just clear the test pipeline_id
    await supabase
      .from('crm_query_tools_config')
      .update({ pipeline_id: null })
      .eq('workspace_id', WS)
  })

  it('reads config with 2 active stages', async () => {
    const cfg = await getCrmQueryToolsConfig({ workspaceId: WS, source: 'tool-handler' })
    expect(cfg.pipelineId).toBe(pipelineId)
    expect(cfg.activeStageIds.length).toBeGreaterThanOrEqual(2)
    expect(cfg.activeStageIds).toContain(s1)
    expect(cfg.activeStageIds).toContain(s2)
  })

  it('D-13: deleting a stage removes it from active list via FK CASCADE', async () => {
    const supabase = admin()
    const del = await supabase.from('pipeline_stages').delete().eq('id', s1)
    expect(del.error).toBeNull()

    const cfg = await getCrmQueryToolsConfig({ workspaceId: WS, source: 'tool-handler' })
    expect(cfg.activeStageIds).not.toContain(s1)
    // S2 is still there
    expect(cfg.activeStageIds).toContain(s2)
  })

  it('D-16: deleting the pipeline SETs pipeline_id NULL', async () => {
    const supabase = admin()
    const del = await supabase.from('pipelines').delete().eq('id', pipelineId)
    expect(del.error).toBeNull()

    const cfg = await getCrmQueryToolsConfig({ workspaceId: WS, source: 'tool-handler' })
    expect(cfg.pipelineId).toBeNull()
  })
})
