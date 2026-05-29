import type { ToolSet } from 'ai'
import { kbSearchTool } from './kb-search-tool'
import { createCrmQueryTools } from '@/lib/agents/shared/crm-query-tools'
import { createCrmMutationTools } from '@/lib/agents/shared/crm-mutation-tools'
import type { SubLoopReason } from './output-schema'
import { SOMNIO_V4_AGENT_ID } from '../config'
import { createSimulatedMutationTools } from './crm-echo'

export interface SubLoopToolsContext {
  workspaceId: string
  conversationId: string
  sessionId: string
  /**
   * Grounding tipado fuerte (Plan 02) — pedido activo + contacto + crmActions del
   * ledger + mensaje crudo. El prompt crm_mutation lo inyecta (Claude's Discretion
   * D-04 — forma del campo nuevo). Opcional: callers RAG/cas_reject no lo pasan.
   */
  grounding?: import('../crm-grounding').CrmGrounding | null
  /**
   * Hint determinista (D-04) — que mutacion sugiere el state-machine (ej "crear
   * pedido cascaron en NUEVO PEDIDO" / "mover pedido X a CONFIRMADO"). El prompt lo
   * inyecta como sugerencia (el LLM grounded decide+ejecuta). Opcional.
   */
  crmHint?: string | null
  /**
   * Sandbox parity (D-22/S5). Cuando `true`, buildSubLoopTools usa mutation-tools
   * SIMULADAS (no-op, no DB write) en vez de las reales. Solo afecta las mutation-tools;
   * las query-tools (read-only) nunca se simulan. Default undefined/false = prod real.
   */
  simulate?: boolean
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
  // D-22/S5 — seam de simulacion por contexto. Sandbox inyecta mutation-tools
  // simuladas (no-op, no DB write); prod usa las reales. Las query-tools NO se
  // simulan (read-only, no escriben). Paridad INTERRUPTION-PARITY §4.4 (DB vs memoria).
  const mutationTools = ctx.simulate
    ? createSimulatedMutationTools()
    : createCrmMutationTools({
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
