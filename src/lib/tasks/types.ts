// ============================================================================
// Phase 10: Tasks Module Types
// Types for task management with entity linking via exclusive arc pattern
// ============================================================================

// ============================================================================
// TASK TYPE TYPES
// ============================================================================

/**
 * Task type/category for workspace customization.
 * Examples: "Llamada", "Seguimiento", "Cobro"
 */
export interface TaskType {
  id: string
  workspace_id: string
  name: string
  color: string
  position: number
  created_at: string
  updated_at: string
}

/**
 * Input for creating a task type.
 */
export interface CreateTaskTypeInput {
  name: string
  color?: string
}

/**
 * Input for updating a task type.
 */
export interface UpdateTaskTypeInput {
  name?: string
  color?: string
  position?: number
}

// ============================================================================
// TASK TYPES
// ============================================================================

/**
 * Priority levels for tasks.
 */
export type TaskPriority = 'low' | 'medium' | 'high'

/**
 * Status of a task.
 */
export type TaskStatus = 'pending' | 'completed'

/**
 * Base task entity without relations.
 *
 * Uses the "exclusive arc" pattern for entity linking:
 * A task can be linked to at most ONE of: contact, order, or conversation.
 * This is enforced at the database level via a CHECK constraint.
 */
export interface Task {
  id: string
  workspace_id: string
  title: string
  description: string | null
  due_date: string | null
  priority: TaskPriority
  status: TaskStatus
  task_type_id: string | null

  /**
   * Exclusive arc columns - at most one can be populated.
   * Links the task to a specific entity in the system.
   */
  contact_id: string | null
  order_id: string | null
  conversation_id: string | null

  /** User assigned to complete this task */
  assigned_to: string | null
  /** User who created this task */
  created_by: string | null
  /** Timestamp when task was marked completed */
  completed_at: string | null
  /** Number of times due_date was moved forward (postponed) */
  postponement_count: number
  created_at: string
  updated_at: string
}

/**
 * Task with all related entities loaded for display.
 */
export interface TaskWithDetails extends Task {
  task_type?: TaskType | null
  contact?: {
    id: string
    name: string
    phone: string | null
  } | null
  order?: {
    id: string
    total_value: number
    contact?: { name: string } | null
  } | null
  conversation?: {
    id: string
    phone: string
    contact?: { name: string } | null
  } | null
  assigned_user?: {
    id: string
    email: string
  } | null
  created_user?: {
    id: string
    email: string
  } | null
}

/**
 * Input for creating a task.
 * Entity linking follows exclusive arc: provide at most one of
 * contact_id, order_id, or conversation_id.
 */
export interface CreateTaskInput {
  title: string
  description?: string
  due_date?: string
  priority?: TaskPriority
  task_type_id?: string
  assigned_to?: string
  /** Link to contact (exclusive with order_id and conversation_id) */
  contact_id?: string
  /** Link to order (exclusive with contact_id and conversation_id) */
  order_id?: string
  /** Link to conversation (exclusive with contact_id and order_id) */
  conversation_id?: string
}

/**
 * Input for updating a task.
 */
export interface UpdateTaskInput {
  title?: string
  description?: string | null
  due_date?: string | null
  priority?: TaskPriority
  status?: TaskStatus
  task_type_id?: string | null
  assigned_to?: string | null
}

// ============================================================================
// FILTER TYPES
// ============================================================================

/**
 * Entity type for filtering tasks by linked entity.
 */
export type TaskEntityType = 'contact' | 'order' | 'conversation'

/**
 * Filter criteria for task list queries.
 */
export interface TaskFilters {
  /** Filter by status (defaults to 'pending' or 'all') */
  status?: TaskStatus | 'all'
  /** Filter by priority */
  priority?: TaskPriority
  /** Filter by assignment: user ID, 'me', or 'unassigned' */
  assigned_to?: string | 'me' | 'unassigned'
  /** Filter by linked entity type */
  entity_type?: TaskEntityType
  /** Filter by specific entity ID (requires entity_type) */
  entity_id?: string
  /** Filter tasks due before this date */
  due_before?: string
  /** Filter tasks due after this date */
  due_after?: string
  /** Filter by task type */
  task_type_id?: string
  /** Search in title/description */
  search?: string
}

// ============================================================================
// SUMMARY TYPES
// ============================================================================

/**
 * Summary counts for task badges and dashboard.
 */
export interface TaskSummary {
  /** Total pending tasks */
  pending: number
  /** Tasks past due date */
  overdue: number
  /** Tasks due within 24 hours */
  dueSoon: number
}

/**
 * Task summary for a specific entity (contact/order/conversation).
 */
export interface EntityTaskSummary extends TaskSummary {
  /** Total completed tasks */
  completed: number
}

// ============================================================================
// LIST/PAGINATION TYPES
// ============================================================================

/**
 * Sort options for task list.
 */
export type TaskSortField = 'due_date' | 'created_at' | 'priority' | 'title'

/**
 * Sort direction.
 */
export type SortDirection = 'asc' | 'desc'

/**
 * Options for fetching task list.
 */
export interface TaskListOptions {
  filters?: TaskFilters
  sortBy?: TaskSortField
  sortDirection?: SortDirection
  limit?: number
  offset?: number
}

// ============================================================================
// TASK NOTE TYPES
// ============================================================================

/**
 * Note attached to a task.
 * All workspace members can see notes; author (or admin/owner) can edit/delete.
 */
export interface TaskNote {
  id: string
  task_id: string
  workspace_id: string
  user_id: string
  content: string
  created_at: string
  updated_at: string
}

/**
 * Note with user profile info for display.
 */
export interface TaskNoteWithUser extends TaskNote {
  user: {
    id: string
    email: string
  }
}

// ============================================================================
// TASK ACTIVITY TYPES
// ============================================================================

/**
 * Task activity action types.
 * Semantic actions for better timeline display.
 */
export type TaskActivityAction =
  | 'created'
  | 'updated'
  | 'completed'
  | 'reopened'
  | 'due_date_changed'
  | 'deleted'
  | 'note_added'
  | 'note_updated'
  | 'note_deleted'

/**
 * Activity log entry for a task.
 * Immutable audit trail of all task changes.
 */
export interface TaskActivity {
  id: string
  task_id: string
  workspace_id: string
  user_id: string | null
  action: TaskActivityAction
  changes: Record<string, { old: unknown; new: unknown }> | null
  metadata: Record<string, unknown> | null
  created_at: string
}

/**
 * Activity with user profile info for display.
 */
export interface TaskActivityWithUser extends TaskActivity {
  user: {
    id: string
    email: string
  } | null
}
