/**
 * Sandbox Save Session API Route
 *
 * Persists sandbox sessions saved via the "Guardar" button. Mirror of
 * localStorage to enable cross-browser access and AI-assisted diagnosis.
 *
 * Fire-and-forget desde sandbox-session.ts:saveSandboxSession. Falla silent
 * si DB cae, localStorage queda como fallback intact.
 *
 * UPSERT por (user_id, session_id) — si el user clickea Guardar varias veces
 * en la misma session el row se reemplaza con la versión más reciente.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { SavedSandboxSession } from '@/lib/sandbox/types'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const session = (await request.json()) as SavedSandboxSession

    if (!session?.id || !session?.name || !session?.agentId) {
      return NextResponse.json({ error: 'invalid_session' }, { status: 400 })
    }

    const { error } = await supabase
      .from('sandbox_saved_sessions')
      .upsert(
        {
          user_id: user.id,
          session_id: session.id,
          name: session.name,
          agent_id: session.agentId,
          messages: session.messages ?? [],
          state: session.state ?? {},
          debug_turns: session.debugTurns ?? [],
          total_tokens: session.totalTokens ?? 0,
        },
        { onConflict: 'user_id,session_id' }
      )

    if (error) {
      console.error('[save-session] DB error:', error)
      return NextResponse.json({ error: 'db_error', details: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[save-session] unexpected:', err)
    return NextResponse.json({ error: 'unexpected' }, { status: 500 })
  }
}
