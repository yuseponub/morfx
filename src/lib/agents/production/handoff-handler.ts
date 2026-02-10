/**
 * Handoff Handler
 * Phase 16: WhatsApp Agent Integration - Plan 02
 *
 * Executes the handoff workflow when SomnioEngine signals mode='handoff'.
 *
 * Responsibilities:
 * 1. Send handoff message to customer via WhatsApp
 * 2. Toggle OFF conversational agent only (CRM agents stay active)
 * 3. Create a task for the next available human agent (round-robin)
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createModuleLogger } from '@/lib/audit/logger'
import { setConversationAgentOverride } from './agent-config'

const logger = createModuleLogger('handoff-handler')

// ============================================================================
// Types
// ============================================================================

interface HandoffConfig {
  /** Message to send to customer when handing off */
  handoffMessage: string
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Execute the full handoff workflow.
 *
 * 1. Send handoff message via WhatsApp (using executeToolFromAgent)
 * 2. Toggle OFF conversational agent for this conversation only
 * 3. Create a task assigned to the next available human agent
 *
 * @param conversationId - The conversation being handed off
 * @param workspaceId - Workspace for isolation
 * @param config - Handoff configuration (message text, etc.)
 */
export async function executeHandoff(
  conversationId: string,
  workspaceId: string,
  config: HandoffConfig
): Promise<void> {
  logger.info(
    { conversationId, workspaceId },
    'Executing handoff workflow'
  )

  const supabase = createAdminClient()

  // 1. Get conversation details (phone for sending message)
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('id, phone, contact_id, profile_name')
    .eq('id', conversationId)
    .single()

  if (convError || !conversation) {
    logger.error(
      { conversationId, error: convError },
      'Cannot execute handoff: conversation not found'
    )
    throw new Error(`Conversation ${conversationId} not found for handoff`)
  }

  // 2. Send handoff message to customer
  try {
    const { executeToolFromAgent } = await import('@/lib/tools/executor')
    await executeToolFromAgent(
      'whatsapp.message.send',
      {
        contactId: conversation.contact_id,
        message: config.handoffMessage,
      },
      workspaceId,
      `handoff-${conversationId}`
    )

    // Mark the handoff message as sent_by_agent
    // (Get the most recent outbound message for this conversation)
    const { data: recentMsg } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('direction', 'outbound')
      .order('timestamp', { ascending: false })
      .limit(1)
      .single()

    if (recentMsg) {
      await supabase
        .from('messages')
        .update({ sent_by_agent: true })
        .eq('id', recentMsg.id)
    }

    logger.info({ conversationId }, 'Handoff message sent')
  } catch (sendError) {
    // Log but continue with handoff - the toggle and task are more important
    logger.error(
      { error: sendError, conversationId },
      'Failed to send handoff message, continuing with toggle and task'
    )
  }

  // 3. Toggle OFF conversational agent ONLY (CRM stays active)
  const toggleResult = await setConversationAgentOverride(
    conversationId,
    'conversational',
    false
  )

  if (!toggleResult) {
    logger.error(
      { conversationId },
      'Failed to toggle off conversational agent'
    )
  } else {
    logger.info(
      { conversationId },
      'Conversational agent toggled OFF for conversation'
    )
  }

  // 4. Find next available agent via round-robin
  const agentId = await getNextAvailableAgent(workspaceId)

  // 5. Create task for human agent
  try {
    const contactName = conversation.profile_name ?? conversation.phone
    const { error: taskError } = await supabase
      .from('tasks')
      .insert({
        workspace_id: workspaceId,
        title: `Handoff: Atender conversacion de ${contactName}`,
        description: `El agente de IA transfirio esta conversacion a un asesor humano. Por favor, revisa el historial y continua la atencion.`,
        priority: 'high',
        status: 'pending',
        conversation_id: conversationId,
        contact_id: conversation.contact_id,
        assigned_to: agentId,
        created_by: null, // System-created (no user context)
      })

    if (taskError) {
      logger.error(
        { error: taskError, conversationId },
        'Failed to create handoff task'
      )
    } else {
      logger.info(
        { conversationId, assignedTo: agentId },
        'Handoff task created'
      )
    }
  } catch (taskError) {
    logger.error(
      { error: taskError, conversationId },
      'Unexpected error creating handoff task'
    )
  }

  logger.info(
    { conversationId, assignedTo: agentId },
    'Handoff workflow complete'
  )
}

// ============================================================================
// Round-Robin Agent Assignment
// ============================================================================

/**
 * Get the next available agent using round-robin assignment.
 *
 * Strategy:
 * - Query team_members that are online
 * - Order by last_assigned_at ASC, NULLS FIRST (least recently assigned first)
 * - Select the first one
 * - Update their last_assigned_at timestamp
 *
 * @returns Agent user ID, or null if no online agents available
 */
export async function getNextAvailableAgent(
  workspaceId: string
): Promise<string | null> {
  const supabase = createAdminClient()

  // Get online team members for this workspace, ordered by last_assigned_at
  // NULLS FIRST ensures new team members get assigned first
  const { data: members, error } = await supabase
    .from('team_members')
    .select(`
      id,
      user_id,
      last_assigned_at,
      teams!inner(workspace_id)
    `)
    .eq('is_online', true)
    .eq('teams.workspace_id', workspaceId)
    .order('last_assigned_at', { ascending: true, nullsFirst: true })
    .limit(1)

  if (error) {
    logger.error(
      { error, workspaceId },
      'Failed to query available agents'
    )
    return null
  }

  if (!members || members.length === 0) {
    logger.warn(
      { workspaceId },
      'No online agents available for handoff assignment'
    )
    return null
  }

  const selectedMember = members[0]

  // Update last_assigned_at for fair rotation
  await supabase
    .from('team_members')
    .update({ last_assigned_at: new Date().toISOString() })
    .eq('id', selectedMember.id)

  logger.info(
    { userId: selectedMember.user_id, memberId: selectedMember.id },
    'Selected agent for handoff via round-robin'
  )

  return selectedMember.user_id
}
