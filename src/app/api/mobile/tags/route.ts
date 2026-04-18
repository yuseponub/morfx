// GET /api/mobile/tags — workspace-scoped list of all tags for the CRM
// drawer's TagEditor component.
//
// Phase 43 Plan 10a. Read-only endpoint (Regla 3 applies to mutations only).
// Uses createAdminClient to bypass RLS and filters by workspace_id.
//
// Contract: MobileTagsResponseSchema in shared/mobile-api/schemas.ts.
//
// Note: the `tags` table holds tags for both contacts AND orders (scope
// distinction is in the `scope` column). We return ALL tags here — the Plan
// 10b UI filters client-side if needed. Simpler than shipping two separate
// endpoints for the small payload size this entity has.

import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'

import {
  MobileTagsResponseSchema,
  type MobileTag,
} from '../../../../../shared/mobile-api/schemas'

import { requireMobileAuth } from '../_lib/auth'
import { toMobileErrorResponse } from '../_lib/errors'

export const dynamic = 'force-dynamic'

interface TagRow {
  id: string
  name: string
  color: string
}

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const { workspaceId } = await requireMobileAuth(req)
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('tags')
      .select('id, name, color')
      .eq('workspace_id', workspaceId)
      .order('name', { ascending: true })

    if (error) {
      console.error('[mobile-api/tags] query failed', error)
      throw error
    }

    const rows = (data ?? []) as unknown as TagRow[]
    const tags: MobileTag[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
    }))

    const body = MobileTagsResponseSchema.parse({ tags })

    return NextResponse.json(body, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    return toMobileErrorResponse(err)
  }
}
