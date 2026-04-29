/**
 * CRM Query Tools — shared types.
 *
 * Standalone crm-query-tools Wave 2 (Plan 03).
 *
 * D-07 / D-10 / D-15 / D-17 / D-27 — discriminated union with statuses:
 *   - 'found'              — happy path
 *   - 'not_found'          — phone unknown (D-10) — renamed from the crm-reader
 *                            equivalent ("not found in this workspace") per Open Q7
 *                            since workspace scoping is implicit in ctx.
 *   - 'no_orders'          — contact exists, has zero orders (D-10)
 *   - 'no_active_order'    — contact + orders exist, none in active stages (D-17)
 *   - 'config_not_set'     — workspace never configured active stages (D-27)
 *   - 'error'              — DB / validation failure
 *
 * Error shape diverges intentionally from crm-reader: `{ error: { code, message? } }`
 * vs flat `{ message }`. The nested code allows downstream agents to switch on
 * 'invalid_phone' / 'db_error' / 'config_not_set' without parsing strings.
 * Document divergence in INTEGRATION-HANDOFF.md (Plan 07).
 *
 * D-18: ContactDetail and OrderDetail are imported from domain layer — never forked.
 */

import type { ContactDetail } from '@/lib/domain/contacts'
import type { OrderDetail } from '@/lib/domain/orders'

export interface CrmQueryToolsContext {
  workspaceId: string
  /** Caller agent id for observability (e.g. 'somnio-recompra-v1'). Optional. */
  invoker?: string
}

export type CrmQueryLookupResult<T> =
  | { status: 'found'; data: T }
  | { status: 'not_found' }
  | { status: 'no_orders'; contact: ContactDetail }
  | { status: 'no_active_order'; contact: ContactDetail; last_terminal_order?: OrderDetail }
  | { status: 'config_not_set'; contact: ContactDetail }
  | { status: 'error'; error: { code: string; message?: string } }

export type CrmQueryListResult<T> =
  | { status: 'ok'; count: number; items: T[] }
  | { status: 'not_found' }
  | { status: 'no_orders'; contact: ContactDetail }
  | { status: 'error'; error: { code: string; message?: string } }

/** Convenience type for getContactByPhone — adds duplicates flag (D-08). */
export type ContactWithDuplicates = ContactDetail & {
  duplicates_count: number
  duplicates: string[]
}
