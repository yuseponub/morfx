import type { ToolSet } from 'ai'
import { kbSearchTool } from './kb-search-tool'
import { createCrmQueryTools } from '@/lib/agents/shared/crm-query-tools'
import { createCrmMutationTools } from '@/lib/agents/shared/crm-mutation-tools'
import type { SubLoopReason } from './output-schema'
import { SOMNIO_V4_AGENT_ID } from '../config'

export interface SubLoopToolsContext {
  workspaceId: string
  conversationId: string
  sessionId: string
}

/**
 * Factory de tool dict por SubLoopReason (D-09 — 3-5 tools por scope, no 20).
 *
 * Plan-local: instancia las factories CADA llamada (RESEARCH Anti-pattern: no
 * module-scope cache; mismo patrón que crm-query-tools D-04).
 *
 * Mapeo (D-09 + D-19):
 * - low_confidence / razonamiento_libre → solo `kb_search`
 * - crm_mutation → kb_search + getActiveOrderByPhone + 5 mutations (D-19 set mínimo)
 * - cas_reject → kb_search + getActiveOrderByPhone + moveOrderToStage
 *
 * Anti-patterns aplicados:
 * - NO spread `{...mutationTools}` wholesale (15 tools degrada focus del modelo de tooling — GPT-4o-mini en el path legacy).
 * - NO instantiate factory en module scope (Pitfall 6 query-tools).
 * - NO imports desde `@/lib/agents/somnio-v3/*` (D-24).
 *
 * Standalone: somnio-sales-v4 / Plan 05 / Task 4.
 */
export function buildSubLoopTools(
  reason: SubLoopReason,
  ctx: SubLoopToolsContext
): ToolSet {
  const queryTools = createCrmQueryTools({
    workspaceId: ctx.workspaceId,
    invoker: SOMNIO_V4_AGENT_ID,
  })
  const mutationTools = createCrmMutationTools({
    workspaceId: ctx.workspaceId,
    invoker: SOMNIO_V4_AGENT_ID,
  })

  switch (reason) {
    case 'low_confidence':
    case 'razonamiento_libre':
      return {
        kb_search: kbSearchTool({ workspaceId: ctx.workspaceId }),
      }

    case 'crm_mutation':
      // D-19 set mínimo de 5 mutations + 1 query relevante + kb_search.
      return {
        kb_search: kbSearchTool({ workspaceId: ctx.workspaceId }),
        getActiveOrderByPhone: queryTools.getActiveOrderByPhone,
        createOrder: mutationTools.createOrder,
        updateOrder: mutationTools.updateOrder,
        moveOrderToStage: mutationTools.moveOrderToStage,
        addOrderNote: mutationTools.addOrderNote,
        updateContact: mutationTools.updateContact,
      }

    case 'cas_reject':
      return {
        kb_search: kbSearchTool({ workspaceId: ctx.workspaceId }),
        getActiveOrderByPhone: queryTools.getActiveOrderByPhone,
        moveOrderToStage: mutationTools.moveOrderToStage,
      }
  }
}
