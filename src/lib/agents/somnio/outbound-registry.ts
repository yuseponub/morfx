/**
 * Outbound Registry Builder
 * Phase 34: No-Repetition System - Plan 01, Task 2
 *
 * Reconstructs all outbound messages for a conversation from 3 DB sources:
 * 1. agent_templates (templates_enviados IDs) -> plantilla entries with minifrases
 * 2. messages (direction='outbound') -> human messages (not matched to AI turns)
 * 3. agent_turns (role='assistant') -> AI-generated messages
 *
 * Human vs AI disambiguation: outbound messages whose content does NOT appear
 * in any agent_turn are classified as 'humano'. Messages matching agent_turn
 * content are classified as 'ia'.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createModuleLogger } from '@/lib/audit/logger'
import type { OutboundEntry } from './no-repetition-types'

const logger = createModuleLogger('outbound-registry')

/**
 * Build the outbound registry for a conversation.
 * Reconstructs all sent messages (templates, human, AI) from existing DB tables.
 *
 * @param conversationId - Conversation to build registry for
 * @param sessionId - Agent session ID (for agent_turns query)
 * @param templatesEnviados - Template IDs already sent (from session_state)
 * @returns Array of OutboundEntry with tipo, id, and tema
 */
export async function buildOutboundRegistry(
  conversationId: string,
  sessionId: string,
  templatesEnviados: string[]
): Promise<OutboundEntry[]> {
  const supabase = createAdminClient()
  const entries: OutboundEntry[] = []

  // -------------------------------------------------------------------------
  // 1. Template entries — from agent_templates using templatesEnviados IDs
  // -------------------------------------------------------------------------
  if (templatesEnviados.length > 0) {
    const { data: templates, error: tplError } = await supabase
      .from('agent_templates')
      .select('id, minifrase, content')
      .in('id', templatesEnviados)

    if (tplError) {
      logger.error({ err: tplError, conversationId }, 'Failed to query agent_templates')
    }

    if (templates) {
      for (const tpl of templates) {
        entries.push({
          tipo: 'plantilla',
          id: tpl.id,
          tema: tpl.minifrase ?? '',
          // fullContent not needed for plantillas — Level 1 uses ID, Level 2 uses minifrase
        })
      }
    }
  }

  // -------------------------------------------------------------------------
  // 2. Outbound messages from messages table
  // -------------------------------------------------------------------------
  const { data: outboundMsgs, error: msgError } = await supabase
    .from('messages')
    .select('id, content, timestamp')
    .eq('conversation_id', conversationId)
    .eq('direction', 'outbound')
    .order('timestamp', { ascending: true })

  if (msgError) {
    logger.error({ err: msgError, conversationId }, 'Failed to query outbound messages')
  }

  // -------------------------------------------------------------------------
  // 3. Assistant turns from agent_turns table
  // -------------------------------------------------------------------------
  const { data: aiTurns, error: turnError } = await supabase
    .from('agent_turns')
    .select('id, content, created_at')
    .eq('session_id', sessionId)
    .eq('role', 'assistant')
    .order('created_at', { ascending: true })

  if (turnError) {
    logger.error({ err: turnError, sessionId }, 'Failed to query agent_turns')
  }

  // -------------------------------------------------------------------------
  // 4. Disambiguate human vs AI outbound messages
  // -------------------------------------------------------------------------

  // Build a set of AI turn contents for fast lookup
  const aiTurnContents = new Set<string>(
    (aiTurns ?? [])
      .map((t) => t.content)
      .filter((c): c is string => c != null && c.length > 0)
  )

  // Track which AI turn contents are matched to outbound messages
  const matchedAiContents = new Set<string>()

  // Extract text body from JSONB message content
  const extractBody = (content: unknown): string => {
    if (content == null) return ''
    if (typeof content === 'string') return content
    if (typeof content === 'object' && 'body' in (content as Record<string, unknown>)) {
      return String((content as Record<string, string>).body ?? '')
    }
    return ''
  }

  // Build set of template contents to exclude template messages from human/AI classification
  const templateContentSet = new Set<string>()
  if (templatesEnviados.length > 0) {
    const { data: tplContents } = await supabase
      .from('agent_templates')
      .select('content')
      .in('id', templatesEnviados)

    if (tplContents) {
      for (const t of tplContents) {
        if (t.content) templateContentSet.add(t.content.trim())
      }
    }
  }

  if (outboundMsgs) {
    for (const msg of outboundMsgs) {
      const body = extractBody(msg.content)
      if (!body) continue

      // Skip messages that are known template content (already captured above)
      if (templateContentSet.has(body.trim())) continue

      // Check if this outbound message matches an AI turn
      if (aiTurnContents.has(body)) {
        matchedAiContents.add(body)
        // This is an AI message — we'll capture it from aiTurns below
        continue
      }

      // Not a template and not AI -> human message
      entries.push({
        tipo: 'humano',
        id: null,
        tema: '', // Will be populated by Plan 02's minifrase generator
        fullContent: body,
      })
    }
  }

  // -------------------------------------------------------------------------
  // 5. AI entries — agent turns not already matched as template content
  // -------------------------------------------------------------------------
  if (aiTurns) {
    for (const turn of aiTurns) {
      if (!turn.content) continue

      // Skip if this is a known template content
      if (templateContentSet.has(turn.content.trim())) continue

      entries.push({
        tipo: 'ia',
        id: null,
        tema: '', // Will be populated by Plan 02's minifrase generator
        fullContent: turn.content,
      })
    }
  }

  // -------------------------------------------------------------------------
  // 6. Log summary
  // -------------------------------------------------------------------------
  const counts = {
    plantilla: entries.filter((e) => e.tipo === 'plantilla').length,
    humano: entries.filter((e) => e.tipo === 'humano').length,
    ia: entries.filter((e) => e.tipo === 'ia').length,
  }

  logger.info(
    { conversationId, sessionId, total: entries.length, ...counts },
    'Built outbound registry'
  )

  return entries
}
