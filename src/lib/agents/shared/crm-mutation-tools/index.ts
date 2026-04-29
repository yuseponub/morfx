/**
 * CRM Mutation Tools — factory aggregator.
 *
 * Standalone crm-mutation-tools Wave 1 (Plan 02).
 *
 * Usage from a future agent (NOT migrated in THIS standalone — D-pre-08):
 *   tools: { ...createCrmMutationTools({ workspaceId: ctx.workspaceId, invoker: 'agent-id' }) }
 *
 * D-pre-01: factory pattern mirrors crm-query-tools.
 * D-pre-03: ctx.workspaceId is the workspace boundary — never accepted from input.
 * D-pre-04: NO DELETE — soft-delete only via archived_at / closed_at / completed_at.
 *
 * Plans 03 + 04 spread additional factories (orders, notes, tasks) into this aggregator.
 */

import { makeContactMutationTools } from './contacts'
import type { CrmMutationToolsContext } from './types'

export type {
  CrmMutationToolsContext,
  MutationResult,
  ResourceType,
  ContactDetail,
  OrderDetail,
} from './types'

export function createCrmMutationTools(ctx: CrmMutationToolsContext) {
  return {
    ...makeContactMutationTools(ctx),
    // Plan 03 → orders mutation tools (createOrder, updateOrder, moveOrderToStage, archiveOrder, closeOrder).
    // Plan 04 → notes + tasks mutation tools (addContactNote, addOrderNote, archive*, createTask, updateTask, completeTask).
  }
}
