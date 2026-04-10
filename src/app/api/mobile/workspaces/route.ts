// GET /api/mobile/workspaces — list workspaces the caller belongs to.
//
// Sibling of /api/mobile/me but returns ONLY the workspace list, which
// is what the workspace-switcher screen needs after the initial login
// bootstrap. Kept as a separate endpoint so mobile can refresh just the
// list (e.g. after being added to a new workspace) without re-fetching
// user profile data.

import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'

import { WorkspacesResponseSchema } from '../../../../../shared/mobile-api/schemas'

import { MobileAuthError } from '../_lib/errors'
import { toMobileErrorResponse } from '../_lib/errors'

export const dynamic = 'force-dynamic'

interface RawWorkspaceRow {
  workspace: {
    id: string
    name: string
    slug: string | null
  } | null
}

/**
 * GET /api/mobile/workspaces
 *
 * This endpoint does NOT require x-workspace-id because it is the bootstrap
 * endpoint the mobile app calls to discover which workspaces the user belongs
 * to BEFORE a workspace has been selected. It only requires a valid JWT.
 */
export async function GET(req: Request): Promise<NextResponse> {
  try {
    // Authenticate via JWT only — no workspace required for this endpoint.
    const header = req.headers.get('authorization') ?? req.headers.get('Authorization')
    if (!header) throw new MobileAuthError('unauthorized', 'Missing Authorization header')
    const match = /^Bearer\s+(.+)$/i.exec(header.trim())
    if (!match?.[1]) throw new MobileAuthError('unauthorized', 'Malformed Authorization header')

    const admin = createAdminClient()
    const { data: userData, error: userError } = await admin.auth.getUser(match[1].trim())
    if (userError || !userData?.user) throw new MobileAuthError('unauthorized', 'Invalid JWT')

    const user = userData.user

    const { data, error } = await admin
      .from('workspace_members')
      .select(`
        workspace:workspaces (
          id,
          name,
          slug
        )
      `)
      .eq('user_id', user.id)

    if (error) {
      console.error('[mobile-api/workspaces] query failed', error)
      throw error
    }

    const rows = (data ?? []) as unknown as RawWorkspaceRow[]
    const workspaces = rows
      .filter((row) => row.workspace !== null)
      .map((row) => ({
        id: row.workspace!.id,
        name: row.workspace!.name,
        slug: row.workspace!.slug,
      }))

    const body = WorkspacesResponseSchema.parse({ workspaces })

    return NextResponse.json(body, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    return toMobileErrorResponse(err)
  }
}
