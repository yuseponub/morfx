// ============================================================================
// Phase 19: AI Automation Builder - Sessions API Route
// GET: List sessions or fetch single session by ID.
// DELETE: Remove a session by ID.
// Both endpoints validate auth and workspace isolation.
// ============================================================================

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import {
  getSessions,
  getSession,
  deleteSession,
} from '@/lib/builder/session-store'
import { NextResponse } from 'next/server'

// ============================================================================
// Auth helper
// ============================================================================

async function getAuthCtx() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return null

  return { userId: user.id, workspaceId }
}

// ============================================================================
// GET /api/builder/sessions
// ?sessionId=xxx → single session with messages
// (no params)    → list of sessions (lightweight, no messages)
// ============================================================================

export async function GET(request: Request) {
  try {
    const ctx = await getAuthCtx()
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')

    if (sessionId) {
      // Return full session with messages
      const session = await getSession(sessionId, ctx.workspaceId)
      if (!session) {
        return NextResponse.json(
          { error: 'Session not found' },
          { status: 404 }
        )
      }
      return NextResponse.json(session)
    }

    // Return lightweight session list
    const sessions = await getSessions(ctx.workspaceId, ctx.userId, 20)
    return NextResponse.json(sessions)
  } catch (error) {
    console.error('[api/builder/sessions] GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// ============================================================================
// DELETE /api/builder/sessions?sessionId=xxx
// ============================================================================

export async function DELETE(request: Request) {
  try {
    const ctx = await getAuthCtx()
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Missing sessionId parameter' },
        { status: 400 }
      )
    }

    const success = await deleteSession(sessionId, ctx.workspaceId)
    if (!success) {
      return NextResponse.json(
        { error: 'Failed to delete session' },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/builder/sessions] DELETE error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
