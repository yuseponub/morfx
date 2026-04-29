/**
 * CRM Mutation Tools — shared types.
 *
 * Standalone crm-mutation-tools Wave 1 (Plan 02).
 *
 * D-pre-01: factory + types mirror crm-query-tools (sibling module shipped 2026-04-29).
 * D-pre-03: workspace ALWAYS from ctx.workspaceId — never input.
 * D-07 / D-pre-05: discriminated union with 7 statuses:
 *   - 'executed'                  — happy path (mutation applied)
 *   - 'duplicate'                 — idempotency-key hit (D-03); data re-hydrated fresh (D-09)
 *   - 'resource_not_found'        — pre-check missing entity in this workspace
 *   - 'stage_changed_concurrently' — CAS reject from domain.moveOrderToStage
 *                                    (Standalone crm-stage-integrity D-06 contract — propagate verbatim, NO retry)
 *   - 'validation_error'          — input invalid per domain rules (e.g. invalid phone)
 *   - 'workspace_mismatch'        — defensive guard against cross-workspace exploits
 *   - 'error'                     — unanticipated failure (DB down, etc.)
 *
 * Pitfall 10: ResourceType is duplicated here (NOT imported from crm-writer/types) to keep
 * this module independent of crm-writer (D-01 coexistence rule). The two unions stay
 * structurally identical by convention; convergence (if ever) lives in a future standalone.
 *
 * D-09: ContactDetail / OrderDetail come from domain layer — never forked.
 */

import type { ContactDetail } from '@/lib/domain/contacts'
import type { OrderDetail } from '@/lib/domain/orders'

// Re-exports for convenient downstream consumption
export type { ContactDetail, OrderDetail }

export interface CrmMutationToolsContext {
  workspaceId: string
  /** Caller agent id for observability (e.g. 'somnio-sales-v3-pw-confirmation'). Optional. */
  invoker?: string
}

/**
 * Resource type union covering both mutable entities (contact/order/note/task)
 * AND base resources (tag/pipeline/stage/template/user) that this module CANNOT
 * mutate (D-pre-05) but may surface as `resource_not_found` when referenced.
 */
export type ResourceType =
  | 'contact'
  | 'order'
  | 'note'
  | 'task'
  | 'tag'
  | 'pipeline'
  | 'stage'
  | 'template'
  | 'user'

/**
 * Discriminated union returned by every mutation tool.
 * Tools NEVER throw for expected outcomes — only for infra-level failures
 * the agent loop cannot handle (e.g. createAdminClient init failure).
 */
export type MutationResult<T> =
  | { status: 'executed'; data: T }
  | {
      status: 'resource_not_found'
      error: {
        code: string
        message?: string
        missing: { resource: ResourceType; id: string }
      }
    }
  | {
      status: 'stage_changed_concurrently'
      error: {
        code: 'stage_changed_concurrently'
        expectedStageId: string
        actualStageId: string | null
      }
    }
  | {
      status: 'validation_error'
      error: { code: string; message: string; field?: string }
    }
  | { status: 'duplicate'; data: T }
  | { status: 'workspace_mismatch'; error: { code: 'workspace_mismatch' } }
  | { status: 'error'; error: { code: string; message?: string } }
