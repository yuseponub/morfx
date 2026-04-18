/**
 * CRM Reader — Tag Tools
 * Phase 44 Plan 04.
 *
 * BLOCKER 1 invariant: domain-layer imports ONLY.
 *
 * V1 surface (2026-04-18 revision): only tagsList. 'tagsEntities' (list
 * contactos/pedidos por tag) deferred to V1.1 — not in this reader.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { listTags, type TagListItem } from '@/lib/domain/tags'
import type { DomainContext } from '@/lib/domain/types'
import { createModuleLogger } from '@/lib/audit/logger'
import type { ReaderContext, ToolListResult } from '../types'

const logger = createModuleLogger('crm-reader.tags')

export function makeTagReadTools(ctx: ReaderContext) {
  const domainCtx: DomainContext = {
    workspaceId: ctx.workspaceId,
    source: 'tool-handler',
  }

  return {
    tagsList: tool({
      description: 'Lista todos los tags del workspace (id, name, createdAt).',
      inputSchema: z.object({}),
      execute: async (): Promise<ToolListResult<TagListItem>> => {
        const result = await listTags(domainCtx)
        if (!result.success) {
          logger.error(
            { error: result.error, workspaceId: ctx.workspaceId },
            'tagsList domain error',
          )
          return { status: 'error', message: result.error ?? 'unknown' }
        }
        const items = result.data ?? []
        return { status: 'ok', count: items.length, items }
      },
    }),
  }
}
