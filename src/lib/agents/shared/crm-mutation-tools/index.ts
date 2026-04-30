/**
 * CRM Mutation Tools — factory aggregator (15/15 final).
 *
 * Standalone crm-mutation-tools Plan 04 (Wave 3 — completes the full suite).
 *
 * Usage from a future agent (NOT migrated in THIS standalone — D-pre-08):
 *   tools: { ...createCrmMutationTools({ workspaceId: ctx.workspaceId, invoker: 'agent-id' }) }
 *
 * D-pre-01: factory pattern mirrors crm-query-tools.
 * D-pre-03: ctx.workspaceId is the workspace boundary — never accepted from input.
 * D-pre-04: NO DELETE — soft-delete only via archived_at / closed_at / completed_at.
 *
 * Closed list per CONTEXT D-02 — 15 tools:
 *   contacts(3): createContact, updateContact, archiveContact
 *   orders(5):   createOrder, updateOrder, moveOrderToStage, archiveOrder, closeOrder
 *   notes(4):    addContactNote, addOrderNote, archiveContactNote, archiveOrderNote
 *   tasks(3):    createTask, updateTask, completeTask
 */

import { makeContactMutationTools } from './contacts'
import { makeOrderMutationTools } from './orders'
import { makeNoteMutationTools } from './notes'
import { makeTaskMutationTools } from './tasks'
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
    ...makeOrderMutationTools(ctx),
    ...makeNoteMutationTools(ctx),
    ...makeTaskMutationTools(ctx),
  }
}
