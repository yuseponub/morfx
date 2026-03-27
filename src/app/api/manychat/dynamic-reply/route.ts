// ============================================================================
// ManyChat Dynamic Reply Endpoint
// Called by ManyChat Dynamic Content block inside a Flow triggered via sendFlow.
// Returns the pending agent reply for an Instagram subscriber in ManyChat
// Dynamic Block v2 format.
//
// Flow: Agent generates reply → saves to manychat_pending_replies → calls
// sendFlow → ManyChat calls this endpoint → returns reply as Dynamic Content
// → ManyChat sends it to the IG subscriber.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 10

/**
 * ManyChat Dynamic Block v2 response format.
 */
function buildDynamicResponse(text: string) {
  return {
    version: 'v2',
    content: {
      messages: [{ type: 'text', text }],
      actions: [],
      quick_replies: [],
    },
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const subscriberId = String(body.subscriber_id)
    const workspaceId = body.workspace_id

    if (!subscriberId || !workspaceId) {
      return NextResponse.json(
        buildDynamicResponse('Error: datos incompletos'),
        { status: 200 }
      )
    }

    const supabase = createAdminClient()
    const phoneIdentifier = `mc-${subscriberId}`

    // Find pending reply for this subscriber
    const { data: pending } = await supabase
      .from('manychat_pending_replies')
      .select('id, reply_text')
      .eq('workspace_id', workspaceId)
      .eq('subscriber_id', subscriberId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    if (!pending) {
      console.warn(`[dynamic-reply] No pending reply for subscriber ${subscriberId}`)
      // Return empty — ManyChat will just not send anything meaningful
      // This shouldn't happen in normal flow
      return NextResponse.json(
        buildDynamicResponse('¡Hola! En un momento te atenderemos.'),
        { status: 200 }
      )
    }

    // Mark as sent
    await supabase
      .from('manychat_pending_replies')
      .update({ status: 'sent' })
      .eq('id', pending.id)

    console.log(`[dynamic-reply] Serving reply for subscriber ${subscriberId}: ${pending.reply_text.substring(0, 50)}...`)

    return NextResponse.json(
      buildDynamicResponse(pending.reply_text),
      { status: 200 }
    )
  } catch (error) {
    console.error('[dynamic-reply] Error:', error)
    return NextResponse.json(
      buildDynamicResponse('Disculpa, hubo un error. Por favor intenta de nuevo.'),
      { status: 200 }
    )
  }
}
