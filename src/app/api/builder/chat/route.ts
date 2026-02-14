// ============================================================================
// Phase 19: AI Automation Builder - Chat API Route
// Streaming endpoint for the builder chat using AI SDK streamText.
// Handles auth, workspace isolation, session persistence, and tool execution.
// ============================================================================

import { streamText, convertToModelMessages, stepCountIs } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { buildSystemPrompt } from '@/lib/builder/system-prompt'
import { createBuilderTools } from '@/lib/builder/tools'
import {
  createSession,
  getSession,
  updateSession,
} from '@/lib/builder/session-store'
import type { UIMessage } from 'ai'

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extracts the text content from the first user message for auto-title generation.
 * AI SDK v6 UIMessage uses `parts` array (not `content` string).
 */
function extractTitleFromMessages(messages: UIMessage[]): string {
  const firstUserMessage = messages.find((m) => m.role === 'user')
  if (!firstUserMessage) return 'Nueva conversacion'

  const textPart = firstUserMessage.parts.find((p) => p.type === 'text')
  const rawTitle = textPart && 'text' in textPart ? textPart.text : 'Nueva conversacion'

  return rawTitle.length > 60 ? rawTitle.slice(0, 60) + '...' : rawTitle
}

// ============================================================================
// POST /api/builder/chat
// ============================================================================

export async function POST(request: Request) {
  try {
    // ------------------------------------------------------------------
    // 1. Auth: Verify user is logged in
    // ------------------------------------------------------------------
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return new Response('Unauthorized', { status: 401 })
    }

    // ------------------------------------------------------------------
    // 2. Workspace: Extract from cookie and verify membership
    // ------------------------------------------------------------------
    const cookieStore = await cookies()
    const workspaceId = cookieStore.get('morfx_workspace')?.value

    if (!workspaceId) {
      return new Response('No workspace selected', { status: 400 })
    }

    // Verify workspace membership (filter by BOTH workspace_id AND user_id)
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single()

    if (!membership) {
      return new Response('Forbidden', { status: 403 })
    }

    // ------------------------------------------------------------------
    // 3. Parse request body
    // ------------------------------------------------------------------
    const body = await request.json()
    const { messages, sessionId: requestedSessionId } = body as {
      messages: UIMessage[]
      sessionId?: string
    }

    if (!messages || !Array.isArray(messages)) {
      return new Response('Missing messages array', { status: 400 })
    }

    // ------------------------------------------------------------------
    // 4. Session management: load existing or create new
    // ------------------------------------------------------------------
    let sessionId = requestedSessionId

    if (sessionId) {
      // Verify session exists and belongs to this workspace
      const existing = await getSession(sessionId, workspaceId)
      if (!existing) {
        return new Response('Session not found', { status: 404 })
      }
    } else {
      // Create new session with auto-generated title from first user message
      const title = extractTitleFromMessages(messages)
      const session = await createSession(workspaceId, user.id, title)
      if (!session) {
        return Response.json(
          { error: 'Failed to create session' },
          { status: 500 }
        )
      }
      sessionId = session.id
    }

    // ------------------------------------------------------------------
    // 5. Convert UI messages to model messages for streamText
    // ------------------------------------------------------------------
    // AI SDK v6: useChat sends UIMessage[] (with parts), but streamText
    // expects ModelMessage[] (with content). convertToModelMessages bridges this.
    const modelMessages = await convertToModelMessages(messages)

    // ------------------------------------------------------------------
    // 6. Stream with AI SDK
    // ------------------------------------------------------------------
    const ctx = { workspaceId, userId: user.id }
    const tools = createBuilderTools(ctx)
    const systemPrompt = buildSystemPrompt(workspaceId)

    const result = streamText({
      model: anthropic('claude-sonnet-4-20250514'),
      system: systemPrompt,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(5),
      onFinish: async () => {
        // Save the UIMessages from the client as-is.
        // The frontend sends the full conversation history on each request,
        // so we just persist what the client sent. The response for this turn
        // will be included in the NEXT request's messages array automatically
        // by useChat. This avoids mixing UIMessage and ModelMessage formats.
        await updateSession(sessionId!, workspaceId, {
          messages: messages as unknown[],
        })
      },
    })

    // ------------------------------------------------------------------
    // 7. Return streaming response with session ID header
    // ------------------------------------------------------------------
    const response = result.toUIMessageStreamResponse()

    // Add session ID header so the frontend can track the session
    response.headers.set('X-Session-Id', sessionId!)

    return response
  } catch (error) {
    console.error('[builder/chat] Error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
