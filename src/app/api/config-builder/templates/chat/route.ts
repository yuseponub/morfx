// ============================================================================
// Standalone: whatsapp-template-ai-builder — Plan 03
// Chat streaming endpoint para el Config Builder > WhatsApp Templates.
//
// Clon near-verbatim de /api/builder/chat con 4 swaps:
//   1. buildSystemPrompt      -> buildTemplatesSystemPrompt
//   2. createBuilderTools     -> createTemplateBuilderTools
//   3. stepCountIs(5)         -> stepCountIs(6) (6 tools)
//   4. createSession(..., kind='template') + guard existing.kind !== 'template'
//
// Regla 6: NO modifica /api/builder/chat — ambos coexisten.
// ============================================================================

import { streamText, convertToModelMessages, stepCountIs } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { buildTemplatesSystemPrompt } from '@/lib/config-builder/templates/system-prompt'
import { createTemplateBuilderTools } from '@/lib/config-builder/templates/tools'
import {
  createSession,
  getSession,
  updateSession,
} from '@/lib/builder/session-store'
import type { UIMessage } from 'ai'

// ============================================================================
// POST /api/config-builder/templates/chat
// ============================================================================

export async function POST(request: Request) {
  try {
    // 1. Auth: verificar sesion
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return new Response('Unauthorized', { status: 401 })

    // 2. Workspace: cookie
    const cookieStore = await cookies()
    const workspaceId = cookieStore.get('morfx_workspace')?.value
    if (!workspaceId) return new Response('No workspace selected', { status: 400 })

    // 3. Membership: filter por BOTH workspace_id AND user_id
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single()
    if (!membership) return new Response('Forbidden', { status: 403 })

    // 4. Parse body
    const body = await request.json()
    const { messages, sessionId: requestedSessionId } = body as {
      messages: UIMessage[]
      sessionId?: string
    }
    if (!messages || !Array.isArray(messages)) {
      return new Response('Missing messages array', { status: 400 })
    }

    // 5. Session: load existente (con kind guard) o crear nuevo con kind='template'
    let sessionId = requestedSessionId
    if (sessionId) {
      const existing = await getSession(sessionId, workspaceId)
      if (!existing) return new Response('Session not found', { status: 404 })
      if (existing.kind !== 'template') {
        return new Response(
          'Session is not a template-builder session',
          { status: 400 },
        )
      }
    } else {
      const firstUserMessage = messages.find((m) => m.role === 'user')
      const textPart = firstUserMessage?.parts?.find((p) => p.type === 'text') as
        | { text?: string }
        | undefined
      const rawTitle = textPart?.text || 'Nuevo template'
      const title =
        rawTitle.length > 60 ? rawTitle.slice(0, 60) + '...' : rawTitle
      const session = await createSession(workspaceId, user.id, title, 'template')
      if (!session) {
        return Response.json(
          { error: 'Failed to create session' },
          { status: 500 },
        )
      }
      sessionId = session.id
    }

    // 6. Convert UI messages a ModelMessage para streamText
    const modelMessages = await convertToModelMessages(messages)

    // 7. Stream con AI SDK
    const tools = createTemplateBuilderTools({
      workspaceId,
      userId: user.id,
    })
    const systemPrompt = buildTemplatesSystemPrompt(workspaceId)

    const result = streamText({
      model: anthropic('claude-sonnet-4-20250514'),
      system: systemPrompt,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(15),
      onFinish: async () => {
        // Persistir las UIMessages tal cual vienen del cliente.
        // Mismo patron que /api/builder/chat.
        await updateSession(sessionId!, workspaceId, {
          messages: messages as unknown[],
        })
      },
    })

    // 8. Return streaming response con session header
    const response = result.toUIMessageStreamResponse()
    response.headers.set('X-Session-Id', sessionId!)
    return response
  } catch (error) {
    console.error('[config-builder/templates/chat] Error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
