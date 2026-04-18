// GET /api/mobile/pipeline-stages — workspace-scoped list of all pipeline
// stages for the CRM drawer's stage picker.
//
// Phase 43 Plan 10a. Read-only endpoint (Regla 3 applies to mutations only).
// Uses createAdminClient to bypass RLS and filters by workspace_id.
//
// Contract: MobilePipelineStagesResponseSchema in shared/mobile-api/schemas.ts.
//
// Returns every stage in the workspace, across every pipeline, each carrying
// its `pipeline_id` + `pipeline_name` so the Plan 10b stage picker can group
// or filter by pipeline. Ordered by pipeline name then stage position so
// the default UI grouping is stable.

import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'

import {
  MobilePipelineStagesResponseSchema,
  type MobilePipelineStage,
} from '../../../../../shared/mobile-api/schemas'

import { requireMobileAuth } from '../_lib/auth'
import { toMobileErrorResponse } from '../_lib/errors'

export const dynamic = 'force-dynamic'

interface PipelineRow {
  id: string
  name: string
  is_default: boolean | null
  stages:
    | Array<{
        id: string
        name: string
        color: string
        position: number
      }>
    | null
}

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const { workspaceId } = await requireMobileAuth(req)
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('pipelines')
      .select(
        `
        id, name, is_default,
        stages:pipeline_stages(id, name, color, position)
      `
      )
      .eq('workspace_id', workspaceId)
      .order('is_default', { ascending: false })
      .order('name', { ascending: true })

    if (error) {
      console.error('[mobile-api/pipeline-stages] query failed', error)
      throw error
    }

    const pipelines = (data ?? []) as unknown as PipelineRow[]

    const stages: MobilePipelineStage[] = []
    for (const p of pipelines) {
      const sorted = [...(p.stages ?? [])].sort(
        (a, b) => a.position - b.position
      )
      for (const s of sorted) {
        stages.push({
          id: s.id,
          pipeline_id: p.id,
          pipeline_name: p.name,
          name: s.name,
          color: s.color,
          position: s.position,
        })
      }
    }

    const body = MobilePipelineStagesResponseSchema.parse({ stages })

    return NextResponse.json(body, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    return toMobileErrorResponse(err)
  }
}
