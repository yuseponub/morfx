/**
 * Domain — CRM Query Tools workspace-scoped config.
 *
 * Standalone crm-query-tools Wave 1 (Plan 02).
 *
 * Tables:
 *   - crm_query_tools_config (singleton per workspace)
 *   - crm_query_tools_active_stages (junction)
 *
 * Read pattern: parallel queries via Promise.all; fail-open default
 * `{ pipelineId: null, activeStageIds: [] }` on read errors so tool callers
 * can distinguish "config_not_set" via empty `activeStageIds` (D-27) vs DB error
 * (logged but not surfaced — caller sees default).
 *
 * Write pattern: upsert config row + delete-then-insert junction. Admin UI write
 * tolerates brief inconsistency (last-write-wins acceptable per RESEARCH Open Q5).
 *
 * D-13 FK behavior:
 *   - junction.stage_id ON DELETE CASCADE (stage deleted → row gone, no stale UUIDs).
 *   - config.pipeline_id ON DELETE SET NULL (pipeline deleted → "all pipelines" default).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createModuleLogger } from '@/lib/audit/logger'
import type { DomainContext, DomainResult } from './types'

const logger = createModuleLogger('domain.crm-query-tools-config')

export interface CrmQueryToolsConfig {
  pipelineId: string | null
  activeStageIds: string[]
}

export interface UpdateCrmQueryToolsConfigParams {
  pipelineId?: string | null
  activeStageIds?: string[]
}

/**
 * Get the workspace's crm-query-tools config.
 *
 * Fail-open: returns `{ pipelineId: null, activeStageIds: [] }` on read errors
 * (logged) so a misconfigured workspace does not cascade tool failures. NOT
 * wrapped in DomainResult — caller treats empty `activeStageIds` as
 * "config_not_set" (D-27) and pipelineId=null as "all pipelines" (D-16).
 */
export async function getCrmQueryToolsConfig(
  ctx: DomainContext,
): Promise<CrmQueryToolsConfig> {
  const supabase = createAdminClient()

  const [cfgRes, stagesRes] = await Promise.all([
    supabase
      .from('crm_query_tools_config')
      .select('pipeline_id')
      .eq('workspace_id', ctx.workspaceId)
      .maybeSingle(),
    supabase
      .from('crm_query_tools_active_stages')
      .select('stage_id')
      .eq('workspace_id', ctx.workspaceId),
  ])

  if (cfgRes.error) {
    logger.error(
      { error: cfgRes.error, workspaceId: ctx.workspaceId },
      'getCrmQueryToolsConfig: config read error — defaulting to empty',
    )
    return { pipelineId: null, activeStageIds: [] }
  }
  if (stagesRes.error) {
    logger.error(
      { error: stagesRes.error, workspaceId: ctx.workspaceId },
      'getCrmQueryToolsConfig: junction read error — defaulting activeStageIds to []',
    )
    return {
      pipelineId: cfgRes.data?.pipeline_id ?? null,
      activeStageIds: [],
    }
  }

  return {
    pipelineId: cfgRes.data?.pipeline_id ?? null,
    activeStageIds: (stagesRes.data ?? []).map(
      (r: { stage_id: string }) => r.stage_id,
    ),
  }
}

/**
 * Update the workspace's crm-query-tools config.
 *
 * Wrapped in DomainResult so the UI server action can surface errors. Uses
 * upsert for the singleton + delete-then-insert for the junction (acceptable
 * for an admin-UI write; full transactional atomicity deferred to backlog).
 *
 * Regla 2: `updated_at` intentionally NOT set in payload — DB trigger
 * trg_crm_query_tools_config_updated_at bumps it via
 * timezone('America/Bogota', NOW()). Setting it client-side would write UTC
 * and break the Bogota invariant.
 *
 * Regla 3: filtered by ctx.workspaceId on every query.
 */
export async function updateCrmQueryToolsConfig(
  ctx: DomainContext,
  params: UpdateCrmQueryToolsConfigParams,
): Promise<DomainResult<CrmQueryToolsConfig>> {
  const supabase = createAdminClient()

  try {
    // 1. Upsert config row (singleton).
    if (params.pipelineId !== undefined) {
      const { error: upsertErr } = await supabase
        .from('crm_query_tools_config')
        .upsert(
          {
            workspace_id: ctx.workspaceId,
            pipeline_id: params.pipelineId,
          },
          { onConflict: 'workspace_id' },
        )
      if (upsertErr) {
        logger.error(
          { error: upsertErr, workspaceId: ctx.workspaceId },
          'updateCrmQueryToolsConfig: upsert config failed',
        )
        return { success: false, error: upsertErr.message }
      }
    }

    // 2. Sync junction (delete-then-insert) if activeStageIds provided.
    if (params.activeStageIds !== undefined) {
      const { error: delErr } = await supabase
        .from('crm_query_tools_active_stages')
        .delete()
        .eq('workspace_id', ctx.workspaceId)
      if (delErr) {
        logger.error(
          { error: delErr, workspaceId: ctx.workspaceId },
          'updateCrmQueryToolsConfig: delete junction failed',
        )
        return { success: false, error: delErr.message }
      }

      if (params.activeStageIds.length > 0) {
        const rows = params.activeStageIds.map((stageId) => ({
          workspace_id: ctx.workspaceId,
          stage_id: stageId,
        }))
        const { error: insErr } = await supabase
          .from('crm_query_tools_active_stages')
          .insert(rows)
        if (insErr) {
          logger.error(
            {
              error: insErr,
              workspaceId: ctx.workspaceId,
              stageCount: rows.length,
            },
            'updateCrmQueryToolsConfig: insert junction failed',
          )
          return { success: false, error: insErr.message }
        }
      }
    }

    // 3. Return fresh state.
    const fresh = await getCrmQueryToolsConfig(ctx)
    return { success: true, data: fresh }
  } catch (err) {
    logger.error(
      { error: err, workspaceId: ctx.workspaceId },
      'updateCrmQueryToolsConfig: unexpected error',
    )
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
