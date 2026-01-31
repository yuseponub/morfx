// Database types for morfx
// Auto-generate with: npx supabase gen types typescript --local > src/lib/types/database.ts

export type WorkspaceRole = 'owner' | 'admin' | 'agent'

export interface Workspace {
  id: string
  name: string
  slug: string
  business_type: string | null
  owner_id: string
  created_at: string
  updated_at: string
}

export interface WorkspaceMember {
  id: string
  workspace_id: string
  user_id: string
  role: WorkspaceRole
  permissions: Record<string, boolean>
  created_at: string
  updated_at: string
}

export interface WorkspaceInvitation {
  id: string
  workspace_id: string
  email: string
  role: Exclude<WorkspaceRole, 'owner'>
  token: string
  invited_by: string
  expires_at: string
  accepted_at: string | null
  created_at: string
}

// Joined types for UI
export interface WorkspaceWithRole extends Workspace {
  role: WorkspaceRole
}

export interface MemberWithUser extends WorkspaceMember {
  user: {
    id: string
    email: string
  }
}

export interface InvitationWithWorkspace extends WorkspaceInvitation {
  workspace: {
    id: string
    name: string
    slug: string
  }
}

// Form types
export interface CreateWorkspaceInput {
  name: string
  slug: string
  business_type?: string
}

export interface InviteMemberInput {
  email: string
  role: Exclude<WorkspaceRole, 'owner'>
}

export interface UpdateMemberInput {
  role?: Exclude<WorkspaceRole, 'owner'>
  permissions?: Record<string, boolean>
}

// ============================================================================
// Phase 4: Contacts & Tags
// ============================================================================

// Base entity types
export interface Tag {
  id: string
  workspace_id: string
  name: string
  color: string
  created_at: string
}

export interface Contact {
  id: string
  workspace_id: string
  name: string
  phone: string
  email: string | null
  address: string | null
  city: string | null
  /** Custom fields defined per workspace (Phase 5) */
  custom_fields: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface ContactTag {
  id: string
  contact_id: string
  tag_id: string
  created_at: string
}

// Joined types for UI
export interface ContactWithTags extends Contact {
  tags: Tag[]
}

// Form types for contacts
export interface CreateContactInput {
  name: string
  phone: string
  email?: string
  address?: string
  city?: string
}

export interface UpdateContactInput {
  name?: string
  phone?: string
  email?: string
  address?: string
  city?: string
}

// Form types for tags
export interface CreateTagInput {
  name: string
  color?: string
}

export interface UpdateTagInput {
  name?: string
  color?: string
}

// ============================================================================
// Phase 5: Custom Fields, Notes, Activity (re-exported from custom-fields)
// ============================================================================

export {
  type FieldType,
  type CustomFieldDefinition,
  type ContactNote,
  type ContactNoteWithUser,
  type ContactActivityAction,
  type ContactActivity,
  type ContactActivityWithUser,
  type CreateCustomFieldInput,
  type UpdateCustomFieldInput,
  type CreateNoteInput,
  type UpdateNoteInput,
} from '../custom-fields/types'
