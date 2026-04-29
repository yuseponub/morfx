/**
 * CRM Query Tools — factory aggregator.
 *
 * Standalone crm-query-tools Wave 2 (Plan 03).
 *
 * Usage from a future agent (NOT migrated in THIS standalone, see D-25):
 *   tools: { ...createCrmQueryTools({ workspaceId: ctx.workspaceId, invoker: 'agent-id' }) }
 *
 * D-04: factory pattern. Per-call instantiation; no module-scope state (Pitfall 6).
 * D-19: no cache.
 */

import { makeContactQueryTools } from './contacts'
import { makeOrderQueryTools } from './orders'

export type {
  CrmQueryToolsContext,
  CrmQueryLookupResult,
  CrmQueryListResult,
  ContactWithDuplicates,
} from './types'

export function createCrmQueryTools(ctx: import('./types').CrmQueryToolsContext) {
  return {
    ...makeContactQueryTools(ctx),
    ...makeOrderQueryTools(ctx),
  }
}
