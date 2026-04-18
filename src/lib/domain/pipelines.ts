// ============================================================================
// Domain Layer — Pipelines + Stages (Phase 44 — extracted from builder/tools.ts)
// Read-only helpers. All write operations on pipelines/stages belong to
// the Settings UI (out of scope for CRM bots per agent-scope.md — writer
// NO PUEDE crear recursos base).
//
// Pattern:
//   1. createAdminClient() (bypasses RLS)
//   2. Filter by ctx.workspaceId on every query
//   3. Return DomainResult<T>
//
// NOTE: pipeline_stages schema uses `position` (not `order`) for stage ordering
// (see 20260129000003_orders_foundation.sql:55).
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import type { DomainContext, DomainResult } from './types'

// ============================================================================
// Result Types
// ============================================================================

export interface PipelineSummary {
  id: string
  name: string
  createdAt: string
}

export interface PipelineWithStages extends PipelineSummary {
  stages: Array<{ id: string; name: string; position: number | null }>
}

export interface StageSummary {
  id: string
  pipelineId: string
  name: string
  position: number | null
  createdAt: string
}

// ============================================================================
// listPipelines
// ============================================================================

/**
 * List pipelines in the workspace with their stages nested.
 * Reader tool (Plan 04) consumes this. No write counterpart — UI-managed.
 */
export async function listPipelines(
  ctx: DomainContext,
): Promise<DomainResult<PipelineWithStages[]>> {
  const supabase = createAdminClient()

  try {
    const { data: pipelines, error: pError } = await supabase
      .from('pipelines')
      .select('id, name, created_at, pipeline_stages(id, name, position)')
      .eq('workspace_id', ctx.workspaceId)
      .order('created_at', { ascending: true })

    if (pError) return { success: false, error: pError.message }

    return {
      success: true,
      data: (pipelines ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        createdAt: p.created_at,
        stages: Array.isArray(p.pipeline_stages)
          ? p.pipeline_stages
              .map((s: { id: string; name: string; position: number | null }) => ({
                id: s.id,
                name: s.name,
                position: s.position,
              }))
              .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
          : [],
      })),
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ============================================================================
// listStages
// ============================================================================

/**
 * List stages for a pipeline. Verifies the pipeline belongs to the workspace
 * before returning rows (cross-workspace guard).
 */
export async function listStages(
  ctx: DomainContext,
  params: { pipelineId: string },
): Promise<DomainResult<StageSummary[]>> {
  const supabase = createAdminClient()

  try {
    // First verify the pipeline belongs to this workspace (cross-workspace guard).
    const { data: pipeline, error: pError } = await supabase
      .from('pipelines')
      .select('id')
      .eq('id', params.pipelineId)
      .eq('workspace_id', ctx.workspaceId)
      .maybeSingle()
    if (pError) return { success: false, error: pError.message }
    if (!pipeline) return { success: true, data: [] }

    const { data, error } = await supabase
      .from('pipeline_stages')
      .select('id, pipeline_id, name, position, created_at')
      .eq('pipeline_id', params.pipelineId)
      .order('position', { ascending: true })

    if (error) return { success: false, error: error.message }

    return {
      success: true,
      data: (data ?? []).map((s) => ({
        id: s.id,
        pipelineId: s.pipeline_id,
        name: s.name,
        position: s.position,
        createdAt: s.created_at,
      })),
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ============================================================================
// getPipelineById
// ============================================================================

export async function getPipelineById(
  ctx: DomainContext,
  params: { pipelineId: string },
): Promise<DomainResult<PipelineSummary | null>> {
  const supabase = createAdminClient()

  try {
    const { data, error } = await supabase
      .from('pipelines')
      .select('id, name, created_at')
      .eq('workspace_id', ctx.workspaceId)
      .eq('id', params.pipelineId)
      .maybeSingle()

    if (error) return { success: false, error: error.message }
    if (!data) return { success: true, data: null }

    return { success: true, data: { id: data.id, name: data.name, createdAt: data.created_at } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ============================================================================
// getStageById
// ============================================================================

/**
 * getStageById: workspace-scoped via pipeline_stages.pipeline_id → pipelines.workspace_id.
 * Two-step: fetch stage, then verify pipeline workspace match. Cheaper than a join.
 * Returns data=null (success) for both "not found" and "cross-workspace" — the caller
 * cannot distinguish, by design (Pitfall 4 / T-44-03-07 mitigation).
 */
export async function getStageById(
  ctx: DomainContext,
  params: { stageId: string },
): Promise<DomainResult<StageSummary | null>> {
  const supabase = createAdminClient()

  try {
    const { data: stage, error: sError } = await supabase
      .from('pipeline_stages')
      .select('id, pipeline_id, name, position, created_at')
      .eq('id', params.stageId)
      .maybeSingle()

    if (sError) return { success: false, error: sError.message }
    if (!stage) return { success: true, data: null }

    // Verify workspace via pipeline (cross-workspace protection).
    const { data: pipeline, error: pError } = await supabase
      .from('pipelines')
      .select('id')
      .eq('id', stage.pipeline_id)
      .eq('workspace_id', ctx.workspaceId)
      .maybeSingle()

    if (pError) return { success: false, error: pError.message }
    if (!pipeline) return { success: true, data: null }  // stage belongs to another workspace

    return {
      success: true,
      data: {
        id: stage.id,
        pipelineId: stage.pipeline_id,
        name: stage.name,
        position: stage.position,
        createdAt: stage.created_at,
      },
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
