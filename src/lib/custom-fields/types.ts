// ============================================================================
// Phase 5: Custom Fields, Notes, and Activity Types
// ============================================================================

/**
 * Supported field types for custom field definitions.
 * These cover the most common CRM field types.
 */
export type FieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'select'
  | 'checkbox'
  | 'url'
  | 'email'
  | 'phone'
  | 'currency'
  | 'percentage'
  | 'file'
  | 'contact_relation'

/**
 * Custom field definition for a workspace.
 * Defines the schema for custom fields that can be added to contacts.
 */
export interface CustomFieldDefinition {
  id: string
  workspace_id: string
  /** Display name shown in UI (e.g., "Fecha de cumpleanos") */
  name: string
  /** Storage key in custom_fields JSONB (e.g., "fecha_cumpleanos") */
  key: string
  field_type: FieldType
  /** Options for select type fields */
  options?: string[]
  is_required: boolean
  display_order: number
  created_at: string
}

/**
 * Note attached to a contact.
 * All workspace members can see notes, but only the author (or admin/owner) can edit/delete.
 */
export interface ContactNote {
  id: string
  contact_id: string
  workspace_id: string
  user_id: string
  content: string
  created_at: string
  updated_at: string
}

/**
 * Activity action types for contact history tracking.
 */
export type ContactActivityAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'note_added'
  | 'note_updated'
  | 'note_deleted'
  | 'tag_added'
  | 'tag_removed'

/**
 * Activity log entry for a contact.
 * Automatically recorded via PostgreSQL trigger for contact changes.
 * Note activities are logged by application code.
 */
export interface ContactActivity {
  id: string
  contact_id: string
  workspace_id: string
  /** User who performed the action (null for system/trigger operations) */
  user_id: string | null
  action: ContactActivityAction
  /** JSONB diff of changed fields (for 'updated' action) */
  changes: Record<string, { old: unknown; new: unknown }> | null
  /** Additional metadata about the activity */
  metadata: Record<string, unknown> | null
  created_at: string
}

/**
 * Activity with user profile info for display in UI.
 */
export interface ContactActivityWithUser extends ContactActivity {
  user: {
    id: string
    email: string
  } | null
}

/**
 * Note with user profile info for display in UI.
 */
export interface ContactNoteWithUser extends ContactNote {
  user: {
    id: string
    email: string
  }
}

// ============================================================================
// Form Types
// ============================================================================

export interface CreateCustomFieldInput {
  name: string
  key: string
  field_type: FieldType
  options?: string[]
  is_required?: boolean
  display_order?: number
}

export interface UpdateCustomFieldInput {
  name?: string
  options?: string[]
  is_required?: boolean
  display_order?: number
}

export interface CreateNoteInput {
  contact_id: string
  content: string
}

export interface UpdateNoteInput {
  content: string
}
