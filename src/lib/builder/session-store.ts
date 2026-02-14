// ============================================================================
// Phase 19: AI Automation Builder - Session Store
// CRUD functions for the builder_sessions table.
// All queries use createAdminClient() with workspace_id filtering for isolation.
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import type { BuilderSession } from '@/lib/builder/types'

// ============================================================================
// Create
// ============================================================================

/**
 * Creates a new builder session with empty messages.
 *
 * @param workspaceId - Workspace UUID for isolation
 * @param userId - User UUID who owns the session
 * @param title - Optional title (auto-generated from first message if omitted)
 * @returns The created BuilderSession or null on failure
 */
export async function createSession(
  workspaceId: string,
  userId: string,
  title?: string
): Promise<BuilderSession | null> {
  try {
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('builder_sessions')
      .insert({
        workspace_id: workspaceId,
        user_id: userId,
        title: title || null,
        messages: [],
        automations_created: [],
      })
      .select()
      .single()

    if (error) {
      console.error('[session-store] createSession error:', error.message)
      return null
    }

    return data as BuilderSession
  } catch (err) {
    console.error('[session-store] createSession unexpected error:', err)
    return null
  }
}

// ============================================================================
// Read
// ============================================================================

/**
 * Gets a single session by ID, filtered by workspace_id for security.
 *
 * @param sessionId - Session UUID
 * @param workspaceId - Workspace UUID for isolation
 * @returns The BuilderSession or null if not found
 */
export async function getSession(
  sessionId: string,
  workspaceId: string
): Promise<BuilderSession | null> {
  try {
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('builder_sessions')
      .select()
      .eq('id', sessionId)
      .eq('workspace_id', workspaceId)
      .single()

    if (error) {
      // .single() returns error when no rows found — not a real error
      if (error.code === 'PGRST116') return null
      console.error('[session-store] getSession error:', error.message)
      return null
    }

    return data as BuilderSession
  } catch (err) {
    console.error('[session-store] getSession unexpected error:', err)
    return null
  }
}

/**
 * Gets sessions for a user in a workspace, ordered by most recent first.
 * Returns a lightweight list for the sidebar/session picker.
 *
 * @param workspaceId - Workspace UUID for isolation
 * @param userId - User UUID to filter by
 * @param limit - Max sessions to return (default 20)
 * @returns Array of sessions (lightweight: id, title, dates, automations count)
 */
export async function getSessions(
  workspaceId: string,
  userId: string,
  limit: number = 20
): Promise<Pick<BuilderSession, 'id' | 'title' | 'created_at' | 'updated_at' | 'automations_created'>[]> {
  try {
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('builder_sessions')
      .select('id, title, created_at, updated_at, automations_created')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('[session-store] getSessions error:', error.message)
      return []
    }

    return (data || []) as Pick<BuilderSession, 'id' | 'title' | 'created_at' | 'updated_at' | 'automations_created'>[]
  } catch (err) {
    console.error('[session-store] getSessions unexpected error:', err)
    return []
  }
}

// ============================================================================
// Update
// ============================================================================

/**
 * Updates session fields. Only updates fields that are provided (not undefined).
 * The workspace_id filter ensures no cross-workspace updates.
 *
 * @param sessionId - Session UUID
 * @param workspaceId - Workspace UUID for isolation
 * @param data - Fields to update (messages, title, automations_created)
 * @returns The updated BuilderSession or null on failure
 */
export async function updateSession(
  sessionId: string,
  workspaceId: string,
  data: {
    messages?: unknown[]
    title?: string
    automations_created?: string[]
  }
): Promise<BuilderSession | null> {
  try {
    const supabase = createAdminClient()

    // Build update payload with only defined fields
    const updatePayload: Record<string, unknown> = {}
    if (data.messages !== undefined) updatePayload.messages = data.messages
    if (data.title !== undefined) updatePayload.title = data.title
    if (data.automations_created !== undefined) updatePayload.automations_created = data.automations_created

    // Nothing to update
    if (Object.keys(updatePayload).length === 0) return null

    const { data: updated, error } = await supabase
      .from('builder_sessions')
      .update(updatePayload)
      .eq('id', sessionId)
      .eq('workspace_id', workspaceId)
      .select()
      .single()

    if (error) {
      console.error('[session-store] updateSession error:', error.message)
      return null
    }

    return updated as BuilderSession
  } catch (err) {
    console.error('[session-store] updateSession unexpected error:', err)
    return null
  }
}

// ============================================================================
// Delete
// ============================================================================

/**
 * Deletes a session. The workspace_id filter ensures isolation.
 *
 * @param sessionId - Session UUID
 * @param workspaceId - Workspace UUID for isolation
 * @returns true if deleted, false on failure
 */
export async function deleteSession(
  sessionId: string,
  workspaceId: string
): Promise<boolean> {
  try {
    const supabase = createAdminClient()

    const { error } = await supabase
      .from('builder_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('workspace_id', workspaceId)

    if (error) {
      console.error('[session-store] deleteSession error:', error.message)
      return false
    }

    return true
  } catch (err) {
    console.error('[session-store] deleteSession unexpected error:', err)
    return false
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Appends an automation ID to the session's automations_created array.
 * Uses read-modify-write pattern to safely append to the JSONB array.
 *
 * @param sessionId - Session UUID
 * @param workspaceId - Workspace UUID for isolation
 * @param automationId - Automation UUID to append
 * @returns The updated BuilderSession or null on failure
 */
export async function addAutomationToSession(
  sessionId: string,
  workspaceId: string,
  automationId: string
): Promise<BuilderSession | null> {
  try {
    const supabase = createAdminClient()

    // Read current automations_created
    const { data: session, error: readError } = await supabase
      .from('builder_sessions')
      .select('automations_created')
      .eq('id', sessionId)
      .eq('workspace_id', workspaceId)
      .single()

    if (readError || !session) {
      console.error('[session-store] addAutomationToSession read error:', readError?.message)
      return null
    }

    const current = (session.automations_created as string[]) || []

    // Avoid duplicates
    if (current.includes(automationId)) {
      // Already tracked, return the full session
      return getSession(sessionId, workspaceId)
    }

    const updated = [...current, automationId]

    const { data: result, error: updateError } = await supabase
      .from('builder_sessions')
      .update({ automations_created: updated })
      .eq('id', sessionId)
      .eq('workspace_id', workspaceId)
      .select()
      .single()

    if (updateError) {
      console.error('[session-store] addAutomationToSession update error:', updateError.message)
      return null
    }

    return result as BuilderSession
  } catch (err) {
    console.error('[session-store] addAutomationToSession unexpected error:', err)
    return null
  }
}
