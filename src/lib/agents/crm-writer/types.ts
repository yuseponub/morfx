/**
 * CRM Writer Agent — Types
 * Phase 44 Plan 05.
 *
 * Revision 2026-04-18 (Blocker 4): ResourceNotFoundError.resource_type covers
 * the FULL set of entity types the writer can reference, including the
 * entities it mutates (contact/order/note/task) and the base resources it
 * CANNOT create (tag/pipeline/stage/template/user). This means every writer
 * tool returns the same shape whether a missing tag or a missing contact is
 * detected — no special-casing in Task 2.
 */

export interface WriterContext {
  workspaceId: string
  invoker?: string
}

export interface WriterPreview {
  action: 'create' | 'update' | 'archive' | 'move'
  entity: 'contact' | 'order' | 'note' | 'task'
  before?: Record<string, unknown>
  after: Record<string, unknown>
}

export interface ProposedAction {
  status: 'proposed'
  action_id: string
  tool: string
  preview: WriterPreview
  expires_at: string
}

export type ConfirmResult =
  | { status: 'executed'; output: unknown }
  | { status: 'already_executed'; output: unknown }
  | { status: 'expired' }
  | { status: 'not_found' }
  | { status: 'failed'; error: { code: string; message: string } }

// Full entity-type union (Blocker 4 fix). Covers:
//   - Base resources the writer CANNOT create: tag, pipeline, stage, template, user
//   - Mutable entities that might not exist (update/archive targets): contact, order, note, task
export type ResourceType =
  | 'tag'
  | 'pipeline'
  | 'stage'
  | 'template'
  | 'user'
  | 'contact'
  | 'order'
  | 'note'
  | 'task'

export interface ResourceNotFoundError {
  status: 'resource_not_found'
  resource_type: ResourceType
  resource_id: string
  suggested_action: 'create manually in UI' | 'propose create via crm-writer'
}

export type WriterToolResult =
  | ProposedAction
  | ResourceNotFoundError
  | { status: 'validation_error'; message: string }
  | { status: 'error'; message: string }

export interface WriterProposeInput {
  workspaceId: string
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  invoker?: string
}

export interface WriterProposeOutput {
  text: string
  proposedActions: ProposedAction[]
  steps: number
  agentId: 'crm-writer'
}
