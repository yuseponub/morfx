// src/lib/tools/handlers/whatsapp/index.ts
import type { ToolHandler, ExecutionContext } from '../../types'

/**
 * WhatsApp Tool Handlers (Placeholders)
 *
 * Real implementations come in Phase 7.
 *
 * PHASE_7_CONTRACT: Replace placeholder handlers with real implementations.
 * Do NOT create new handler files - modify this file directly.
 * The registry in init.ts imports from this file.
 */

type PlaceholderOutput = {
  _placeholder: true
  _message: string
  [key: string]: unknown
}

function createPlaceholder(
  toolName: string,
  previewOutput: Record<string, unknown>
): ToolHandler {
  return async (
    input: unknown,
    context: ExecutionContext,
    dryRun: boolean
  ): Promise<PlaceholderOutput> => {
    if (dryRun) {
      return {
        _placeholder: true,
        _message: `[DRY RUN] Would execute ${toolName}`,
        ...previewOutput,
      }
    }

    return {
      _placeholder: true,
      _message: `Tool ${toolName} not implemented yet. Coming in Phase 7.`,
      ...previewOutput,
    }
  }
}

export const whatsappHandlers: Record<string, ToolHandler> = {
  'whatsapp.message.send': createPlaceholder('whatsapp.message.send', {
    messageId: 'placeholder-message-id',
    sent: true,
    timestamp: new Date().toISOString(),
  }),

  'whatsapp.message.list': createPlaceholder('whatsapp.message.list', {
    messages: [],
    hasMore: false,
  }),

  'whatsapp.template.send': createPlaceholder('whatsapp.template.send', {
    messageId: 'placeholder-message-id',
    sent: true,
    templateUsed: 'placeholder-template',
  }),

  'whatsapp.template.list': createPlaceholder('whatsapp.template.list', {
    templates: [],
  }),

  'whatsapp.conversation.list': createPlaceholder('whatsapp.conversation.list', {
    conversations: [],
    total: 0,
    page: 1,
    totalPages: 0,
  }),

  'whatsapp.conversation.assign': createPlaceholder('whatsapp.conversation.assign', {
    conversationId: 'placeholder-conversation-id',
    previousAgent: null,
    newAgent: 'placeholder-agent-id',
    assigned: true,
  }),

  'whatsapp.conversation.close': createPlaceholder('whatsapp.conversation.close', {
    conversationId: 'placeholder-conversation-id',
    closed: true,
    closedAt: new Date().toISOString(),
  }),
}
