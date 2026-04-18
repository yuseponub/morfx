/**
 * CRM Reader — Pipeline/Stage Tools
 * Phase 44 Plan 04.
 *
 * BLOCKER 1 invariant: domain-layer imports ONLY.
 */

import { tool } from 'ai'
import { z } from 'zod'
import {
  listPipelines,
  listStages,
  type PipelineWithStages,
  type StageSummary,
} from '@/lib/domain/pipelines'
import type { DomainContext } from '@/lib/domain/types'
import { createModuleLogger } from '@/lib/audit/logger'
import type { ReaderContext, ToolListResult } from '../types'

const logger = createModuleLogger('crm-reader.pipelines')

export function makePipelineReadTools(ctx: ReaderContext) {
  const domainCtx: DomainContext = {
    workspaceId: ctx.workspaceId,
    source: 'tool-handler',
  }

  return {
    pipelinesList: tool({
      description:
        'Lista todos los pipelines del workspace con sus stages anidados (ordenados por position).',
      inputSchema: z.object({}),
      execute: async (): Promise<ToolListResult<PipelineWithStages>> => {
        const result = await listPipelines(domainCtx)
        if (!result.success) {
          logger.error(
            { error: result.error, workspaceId: ctx.workspaceId },
            'pipelinesList domain error',
          )
          return { status: 'error', message: result.error ?? 'unknown' }
        }
        const items = result.data ?? []
        return { status: 'ok', count: items.length, items }
      },
    }),

    stagesList: tool({
      description:
        'Lista stages de un pipeline especifico, ordenados por position. ' +
        'Si el pipeline no existe o pertenece a otro workspace, retorna lista vacia.',
      inputSchema: z.object({ pipelineId: z.string().uuid() }),
      execute: async ({ pipelineId }): Promise<ToolListResult<StageSummary>> => {
        const result = await listStages(domainCtx, { pipelineId })
        if (!result.success) {
          logger.error(
            { error: result.error, workspaceId: ctx.workspaceId, pipelineId },
            'stagesList domain error',
          )
          return { status: 'error', message: result.error ?? 'unknown' }
        }
        const items = result.data ?? []
        return { status: 'ok', count: items.length, items }
      },
    }),
  }
}
