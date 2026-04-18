// GET /api/mobile/quick-replies — workspace-scoped list of saved quick
// replies for the / slash-command autocomplete in the mobile composer.
//
// Phase 43 Plan 09. Read-only endpoint (Regla 3 applies to mutations only).
// Uses createAdminClient to bypass RLS and filters by workspace_id from
// the authenticated membership.
//
// Contract: MobileQuickRepliesListResponseSchema in
// shared/mobile-api/schemas.ts.
//
// Shape translation from the DB row:
//   - `shortcut` column -> `trigger` wire field (matches Slack-style
//     terminology used in the plan + research docs).
//   - `content` column -> `body` wire field (the expanded text to splice
//     into the composer).
//   - `media_url` / `media_type` are surfaced so the composer can preview
//     an image-backed quick reply (Plan 09 Task 3 renders the attached
//     image inline when a user picks that reply).

import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'

import {
  MobileQuickRepliesListResponseSchema,
  type MobileQuickReply,
} from '../../../../../shared/mobile-api/schemas'

import { requireMobileAuth } from '../_lib/auth'
import { toMobileErrorResponse } from '../_lib/errors'

export const dynamic = 'force-dynamic'

type DbMediaType = 'image' | 'video' | 'document' | 'audio' | null

interface QuickReplyRow {
  id: string
  shortcut: string
  content: string
  category: string | null
  media_url: string | null
  media_type: DbMediaType
}

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const { workspaceId } = await requireMobileAuth(req)
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('quick_replies')
      .select('id, shortcut, content, category, media_url, media_type')
      .eq('workspace_id', workspaceId)
      .order('shortcut', { ascending: true })

    if (error) {
      console.error('[mobile-api/quick-replies] query failed', error)
      throw error
    }

    const rows = (data ?? []) as unknown as QuickReplyRow[]

    const quickReplies: MobileQuickReply[] = rows.map((r) => ({
      id: r.id,
      trigger: r.shortcut,
      body: r.content,
      category: r.category,
      mediaUrl: r.media_url,
      mediaType: r.media_type,
    }))

    const body = MobileQuickRepliesListResponseSchema.parse({ quickReplies })

    return NextResponse.json(body, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    return toMobileErrorResponse(err)
  }
}
