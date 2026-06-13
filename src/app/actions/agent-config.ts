'use server'

import { createClient } from '@/lib/supabase/server'
import { getRequestAuth } from '@/lib/auth/request-auth'
import {
  getWorkspaceAgentConfig,
  upsertWorkspaceAgentConfig,
  setConversationAgentOverride,
  closeActiveSessionsForConversation,
  isAgentEnabledForConversation,
  DEFAULT_AGENT_CONFIG,
  type AgentConfig,
} from '@/lib/agents/production/agent-config'
import { getIsSuperUser } from '@/lib/auth/super-user'
import { revalidatePath } from 'next/cache'

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get the current user and workspace from cookies.
 * Returns null if not authenticated or no workspace selected.
 */
async function getAuthContext() {
  const auth = await getRequestAuth()
  if (!auth) {
    return null
  }

  const supabase = await createClient()

  return { userId: auth.userId, workspaceId: auth.workspaceId, supabase }
}

/**
 * Check if the current user has owner/admin role in the workspace.
 */
async function isWorkspaceAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .single()

  return data?.role === 'owner' || data?.role === 'admin'
}

/**
 * Check if the current user is a member of the workspace.
 */
async function isWorkspaceMember(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .single()

  return !!data
}

// ============================================================================
// READ OPERATIONS
// ============================================================================

/**
 * Get the agent config for the current workspace.
 * Returns default values if no config row exists.
 */
export async function getAgentConfig(): Promise<
  | { success: true; data: AgentConfig }
  | { error: string }
> {
  const ctx = await getAuthContext()
  if (!ctx) {
    return { error: 'No autenticado o workspace no seleccionado' }
  }

  const config = await getWorkspaceAgentConfig(ctx.workspaceId)

  if (!config) {
    console.log('[agent-config] No row found for workspace:', ctx.workspaceId, '→ returning defaults')
    return {
      success: true,
      data: {
        ...DEFAULT_AGENT_CONFIG,
        workspace_id: ctx.workspaceId,
        created_at: '',
        updated_at: '',
      },
    }
  }

  console.log('[agent-config] Read config:', ctx.workspaceId, 'agent_enabled:', config.agent_enabled)
  return { success: true, data: config }
}

// ============================================================================
// WRITE OPERATIONS
// ============================================================================

/**
 * Update the agent config for the current workspace.
 * Requires owner/admin role.
 */
export async function updateAgentConfig(
  updates: Partial<Omit<AgentConfig, 'workspace_id' | 'created_at' | 'updated_at'>>
): Promise<
  | { success: true; data: AgentConfig }
  | { error: string }
> {
  const ctx = await getAuthContext()
  if (!ctx) {
    return { error: 'No autenticado o workspace no seleccionado' }
  }

  // Check owner/admin role
  const isAdmin = await isWorkspaceAdmin(ctx.supabase, ctx.workspaceId, ctx.userId)
  if (!isAdmin) {
    console.error('[agent-config] Not admin:', ctx.userId, ctx.workspaceId)
    return { error: 'Solo el propietario o administrador puede modificar la configuracion del agente' }
  }

  console.log('[agent-config] Saving for workspace:', ctx.workspaceId, 'updates:', updates)
  const result = await upsertWorkspaceAgentConfig(ctx.workspaceId, updates)
  if ('error' in result) {
    return { error: result.error }
  }

  console.log('[agent-config] Save result:', result.data.agent_enabled)
  return { success: true, data: result.data }
}

// ============================================================================
// PER-CONVERSATION TOGGLES
// ============================================================================

/**
 * Toggle the agent for a specific conversation.
 * - true = explicitly enable
 * - false = explicitly disable
 * - null = inherit global setting
 */
export async function toggleConversationAgent(
  conversationId: string,
  type: 'conversational' | 'crm',
  enabled: boolean | null
): Promise<
  | { success: true; data: undefined }
  | { error: string }
> {
  const ctx = await getAuthContext()
  if (!ctx) {
    return { error: 'No autenticado o workspace no seleccionado' }
  }

  // Verify user is a member of the workspace
  const isMember = await isWorkspaceMember(ctx.supabase, ctx.workspaceId, ctx.userId)
  if (!isMember) {
    return { error: 'No eres miembro de este workspace' }
  }

  // Verify conversation belongs to this workspace
  const { data: conversation } = await ctx.supabase
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('workspace_id', ctx.workspaceId)
    .single()

  if (!conversation) {
    return { error: 'Conversacion no encontrada' }
  }

  const success = await setConversationAgentOverride(conversationId, type, enabled)
  if (!success) {
    return { error: 'Error al cambiar la configuracion del agente para esta conversacion' }
  }

  return { success: true, data: undefined }
}

// ============================================================================
// SESSION RESTART (owner-only testing tool)
// ============================================================================

/**
 * Restart the bot session for a conversation so the next message starts fresh.
 *
 * Owner-only (platform super-user, MORFX_OWNER_USER_ID) — temporary testing
 * tool for the v4 canary. Does two things:
 *   1. Turns the conversational agent back ON for this conversation
 *      (clears any handoff override → `agent_conversational = true`).
 *   2. Closes all active agent sessions → the next inbound message creates a
 *      fresh session (clean state machine + captured data = greeting from zero).
 *
 * Channel-agnostic: works for WhatsApp / FB / IG (shared tables).
 */
export async function restartConversationSession(
  conversationId: string
): Promise<
  | { success: true; data: { sessionsClosed: number } }
  | { error: string }
> {
  // Owner-only enforcement (server-side security boundary)
  const isOwner = await getIsSuperUser()
  if (!isOwner) {
    return { error: 'Solo el propietario de la plataforma puede reiniciar sesiones' }
  }

  const ctx = await getAuthContext()
  if (!ctx) {
    return { error: 'No autenticado o workspace no seleccionado' }
  }

  // Verify conversation belongs to this workspace (isolation)
  const { data: conversation } = await ctx.supabase
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('workspace_id', ctx.workspaceId)
    .single()

  if (!conversation) {
    return { error: 'Conversacion no encontrada' }
  }

  // 1. Turn the bot back ON for this conversation
  const turnedOn = await setConversationAgentOverride(conversationId, 'conversational', true)
  if (!turnedOn) {
    return { error: 'Error al reactivar el agente para esta conversacion' }
  }

  // 2. Close active sessions → next message starts fresh
  const sessionsClosed = await closeActiveSessionsForConversation(conversationId)

  revalidatePath('/whatsapp')

  return { success: true, data: { sessionsClosed } }
}

// ============================================================================
// CONVERSATION AGENT STATUS
// ============================================================================

/**
 * Get the resolved agent status for a conversation.
 * Returns both conversational and CRM toggle states, plus global state.
 */
export async function getConversationAgentStatus(
  conversationId: string
): Promise<
  | {
      success: true
      data: {
        globalEnabled: boolean
        conversationalEnabled: boolean
        crmEnabled: boolean
        conversationalOverride: boolean | null
        crmOverride: boolean | null
      }
    }
  | { error: string }
> {
  const ctx = await getAuthContext()
  if (!ctx) {
    return { error: 'No autenticado o workspace no seleccionado' }
  }

  // Verify user is a member
  const isMember = await isWorkspaceMember(ctx.supabase, ctx.workspaceId, ctx.userId)
  if (!isMember) {
    return { error: 'No eres miembro de este workspace' }
  }

  // Get global config
  const config = await getWorkspaceAgentConfig(ctx.workspaceId)
  const globalEnabled = config?.agent_enabled ?? false

  // Get per-conversation overrides
  const { data: conversation } = await ctx.supabase
    .from('conversations')
    .select('agent_conversational, agent_crm')
    .eq('id', conversationId)
    .eq('workspace_id', ctx.workspaceId)
    .single()

  if (!conversation) {
    return { error: 'Conversacion no encontrada' }
  }

  // Resolve both types
  const conversationalEnabled = await isAgentEnabledForConversation(
    conversationId,
    ctx.workspaceId,
    'conversational'
  )
  const crmEnabled = await isAgentEnabledForConversation(
    conversationId,
    ctx.workspaceId,
    'crm'
  )

  return {
    success: true,
    data: {
      globalEnabled,
      conversationalEnabled,
      crmEnabled,
      conversationalOverride: conversation.agent_conversational,
      crmOverride: conversation.agent_crm,
    },
  }
}
