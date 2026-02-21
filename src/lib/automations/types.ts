// ============================================================================
// Phase 17: CRM Automations Engine — Type System
// Complete type definitions for automation triggers, conditions, actions,
// execution history, and form data.
// ============================================================================

// ============================================================================
// TRIGGER TYPES
// ============================================================================

/**
 * Exhaustive list of trigger types matching the DB trigger_type column.
 * Each trigger type corresponds to a specific event in the system.
 */
export type TriggerType =
  | 'order.stage_changed'
  | 'tag.assigned'
  | 'tag.removed'
  | 'contact.created'
  | 'order.created'
  | 'field.changed'
  | 'whatsapp.message_received'
  | 'whatsapp.keyword_match'
  | 'task.completed'
  | 'task.overdue'
  | 'shopify.order_created'
  | 'shopify.draft_order_created'
  | 'shopify.order_updated'
  | 'robot.coord.completed'

/**
 * Trigger configuration — stored in trigger_config JSONB column.
 * Fields are optional; which ones apply depends on the trigger_type.
 */
export type TriggerConfig = {
  pipelineId?: string    // For order triggers: filter by specific pipeline
  stageId?: string       // For stage_changed: specific stage
  tagId?: string         // For tag triggers: specific tag
  fieldName?: string     // For field.changed: which field
  keywords?: string[]    // For keyword_match: list of keywords to match
}

// ============================================================================
// CONDITION SYSTEM
// ============================================================================

/**
 * Operators for condition evaluation.
 */
export type ConditionOperator =
  | 'equals' | 'not_equals'
  | 'contains' | 'not_contains'
  | 'in' | 'not_in'
  | 'gt' | 'lt' | 'gte' | 'lte'
  | 'exists' | 'not_exists'

/**
 * Single condition: compare a field against a value using an operator.
 */
export interface Condition {
  field: string           // e.g., 'order.stage_id', 'contact.city', 'order.tags'
  operator: ConditionOperator
  value: unknown
}

/**
 * Condition group with AND/OR logic and support for nesting.
 * Stored in the conditions JSONB column. Null means "always match".
 */
export interface ConditionGroup {
  logic: 'AND' | 'OR'
  conditions: (Condition | ConditionGroup)[]
}

// ============================================================================
// ACTION TYPES
// ============================================================================

/**
 * Exhaustive list of action types available for automations.
 */
export type ActionType =
  | 'assign_tag'
  | 'remove_tag'
  | 'change_stage'
  | 'update_field'
  | 'create_order'
  | 'duplicate_order'
  | 'send_whatsapp_template'
  | 'send_whatsapp_text'
  | 'send_whatsapp_media'
  | 'create_task'
  | 'webhook'
  | 'send_sms'

/**
 * Optional delay before an action executes.
 */
export interface DelayConfig {
  amount: number
  unit: 'seconds' | 'minutes' | 'hours' | 'days'
}

/**
 * Single action in the automation actions array.
 * Stored in the actions JSONB column as AutomationAction[].
 */
export interface AutomationAction {
  type: ActionType
  params: Record<string, unknown>  // Type-specific params
  delay?: DelayConfig | null
}

// ============================================================================
// DB ROW TYPES
// ============================================================================

/**
 * Automation folder — mirrors the automation_folders table row.
 */
export interface AutomationFolder {
  id: string
  workspace_id: string
  name: string
  position: number
  is_collapsed: boolean
  created_at: string
  updated_at: string
}

/**
 * Automation definition — mirrors the automations table row.
 */
export interface Automation {
  id: string
  workspace_id: string
  name: string
  description: string | null
  is_enabled: boolean
  trigger_type: TriggerType
  trigger_config: TriggerConfig
  conditions: ConditionGroup | null
  actions: AutomationAction[]
  folder_id: string | null
  position: number
  created_by: string | null
  created_at: string
  updated_at: string
}

/**
 * Execution history entry — mirrors the automation_executions table row.
 */
export interface AutomationExecution {
  id: string
  workspace_id: string
  automation_id: string
  trigger_event: Record<string, unknown>
  status: 'running' | 'success' | 'failed' | 'cancelled'
  actions_log: ActionLog[]
  error_message: string | null
  started_at: string
  completed_at: string | null
  duration_ms: number | null
  cascade_depth: number
}

/**
 * Per-action log entry within an execution's actions_log JSONB array.
 */
export interface ActionLog {
  index: number
  type: ActionType
  status: 'success' | 'failed' | 'skipped'
  result?: unknown
  duration_ms: number
  error?: string
}

// ============================================================================
// FORM TYPES
// ============================================================================

/**
 * Form data for creating/updating an automation (excludes server-generated fields).
 */
export interface AutomationFormData {
  name: string
  description?: string
  trigger_type: TriggerType
  trigger_config: TriggerConfig
  conditions?: ConditionGroup | null
  actions: AutomationAction[]
}

// ============================================================================
// TRIGGER CONTEXT
// ============================================================================

/**
 * The data available when a trigger fires.
 * Passed to condition evaluator and variable resolver.
 * Fields are populated based on the trigger type.
 */
export interface TriggerContext {
  workspaceId: string
  // Order context
  orderId?: string
  orderName?: string
  orderValue?: number
  previousStageId?: string
  previousStageName?: string
  newStageId?: string
  newStageName?: string
  pipelineId?: string
  pipelineName?: string
  // Contact context
  contactId?: string
  contactName?: string
  contactPhone?: string
  contactEmail?: string
  contactCity?: string
  contactDepartment?: string
  contactAddress?: string
  // Tag context
  tagId?: string
  tagName?: string
  // WhatsApp context
  conversationId?: string
  messageContent?: string
  // Task context
  taskId?: string
  taskTitle?: string
  // Generic extension
  [key: string]: unknown
}
