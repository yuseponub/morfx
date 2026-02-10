// ============================================================================
// Phase 16: Agent Production Config
// Resolution logic for workspace-level and per-conversation agent settings.
// Uses createAdminClient for all DB operations (bypasses RLS, workspace
// isolation enforced via explicit filters).
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Workspace agent configuration matching the workspace_agent_config table.
 */
export interface AgentConfig {
  workspace_id: string
  agent_enabled: boolean
  conversational_agent_id: string
  crm_agents_enabled: Record<string, boolean>
  handoff_message: string
  timer_preset: 'real' | 'rapido' | 'instantaneo'
  response_speed: number
  created_at: string
  updated_at: string
}

/**
 * Default values for workspace agent config (used when no row exists yet).
 */
export const DEFAULT_AGENT_CONFIG: Omit<AgentConfig, 'workspace_id' | 'created_at' | 'updated_at'> = {
  agent_enabled: false,
  conversational_agent_id: 'somnio-sales-v1',
  crm_agents_enabled: { 'order-manager': true },
  handoff_message: 'Regalame 1 min, ya te comunico con un asesor',
  timer_preset: 'real',
  response_speed: 1.0,
}

// ============================================================================
// READ OPERATIONS
// ============================================================================

/**
 * Get workspace agent config. Returns null if no config row exists.
 */
export async function getWorkspaceAgentConfig(
  workspaceId: string
): Promise<AgentConfig | null> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('workspace_agent_config')
    .select('*')
    .eq('workspace_id', workspaceId)
    .single()

  if (error || !data) {
    // PGRST116 = no rows found, which is expected for workspaces without config
    if (error?.code !== 'PGRST116') {
      console.error('Error fetching workspace agent config:', error)
    }
    return null
  }

  return data as AgentConfig
}

// ============================================================================
// WRITE OPERATIONS
// ============================================================================

/**
 * Upsert workspace agent config. Creates or updates the config row.
 * Always sets updated_at to current timestamp.
 */
export async function upsertWorkspaceAgentConfig(
  workspaceId: string,
  updates: Partial<Omit<AgentConfig, 'workspace_id' | 'created_at' | 'updated_at'>>
): Promise<AgentConfig | null> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('workspace_agent_config')
    .upsert(
      {
        workspace_id: workspaceId,
        ...updates,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'workspace_id' }
    )
    .select('*')
    .single()

  if (error) {
    console.error('Error upserting workspace agent config:', error)
    return null
  }

  return data as AgentConfig
}

// ============================================================================
// RESOLUTION LOGIC
// ============================================================================

/**
 * Resolve whether the agent is enabled for a specific conversation.
 *
 * Resolution order:
 * 1. Global agent_enabled OFF -> false (all conversations disabled)
 * 2. Per-conversation explicit OFF -> false
 * 3. For CRM type, also check crm_agents_enabled JSONB
 * 4. Otherwise -> true (global ON, per-chat not explicitly OFF)
 */
export async function isAgentEnabledForConversation(
  conversationId: string,
  workspaceId: string,
  type: 'conversational' | 'crm' = 'conversational'
): Promise<boolean> {
  const supabase = createAdminClient()

  // Step 1: Check global config
  const config = await getWorkspaceAgentConfig(workspaceId)
  if (!config || !config.agent_enabled) {
    return false
  }

  // Step 2: Check per-conversation override
  const { data: conversation, error } = await supabase
    .from('conversations')
    .select('agent_conversational, agent_crm')
    .eq('id', conversationId)
    .single()

  if (error || !conversation) {
    console.error('Error fetching conversation agent status:', error)
    return false
  }

  const column = type === 'conversational'
    ? conversation.agent_conversational
    : conversation.agent_crm

  // Explicit false = disabled for this conversation
  if (column === false) {
    return false
  }

  // Step 3: For CRM type, check if the specific agent type is enabled globally
  if (type === 'crm') {
    const crmEnabled = config.crm_agents_enabled as Record<string, boolean>
    // If crm_agents_enabled has no truthy entries, CRM is effectively off
    const anyEnabled = Object.values(crmEnabled).some(v => v === true)
    if (!anyEnabled) {
      return false
    }
  }

  // Step 4: Global ON + per-chat not explicitly OFF = enabled
  return true
}

// ============================================================================
// PER-CONVERSATION OVERRIDE
// ============================================================================

/**
 * Set or clear the agent override for a specific conversation.
 * - true = explicitly enable agent for this conversation
 * - false = explicitly disable agent for this conversation
 * - null = inherit global setting (remove override)
 */
export async function setConversationAgentOverride(
  conversationId: string,
  type: 'conversational' | 'crm',
  enabled: boolean | null
): Promise<boolean> {
  const supabase = createAdminClient()

  const column = type === 'conversational'
    ? 'agent_conversational'
    : 'agent_crm'

  const { error } = await supabase
    .from('conversations')
    .update({ [column]: enabled })
    .eq('id', conversationId)

  if (error) {
    console.error('Error setting conversation agent override:', error)
    return false
  }

  return true
}
