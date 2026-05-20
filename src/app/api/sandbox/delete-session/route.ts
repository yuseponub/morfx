/**
 * Sandbox Delete Session API Route
 *
 * Deletes a sandbox session from DB when user clicks "Eliminar" in the
 * saved-sessions modal. Mirror of localStorage delete.
 *
 * Fire-and-forget desde sandbox-session.ts:deleteSandboxSession.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const { sessionId } = (await request.json()) as { sessionId?: string }
    if (!sessionId) {
      return NextResponse.json({ error: 'session_id_required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('sandbox_saved_sessions')
      .delete()
      .eq('user_id', user.id)
      .eq('session_id', sessionId)

    if (error) {
      console.error('[delete-session] DB error:', error)
      return NextResponse.json({ error: 'db_error', details: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[delete-session] unexpected:', err)
    return NextResponse.json({ error: 'unexpected' }, { status: 500 })
  }
}
