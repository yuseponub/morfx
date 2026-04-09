// GET /api/mobile/me — authenticated user + workspace memberships.
//
// Called once after login (and on workspace switch) so the mobile app
// can populate the workspace switcher, show the profile card and cache
// the role per workspace for permission gating. Read-only; any write
// that touches workspace_members goes through src/lib/domain (Regla 3).

import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'

import { MeResponseSchema } from '../../../../../shared/mobile-api/schemas'

import { requireMobileAuth } from '../_lib/auth'
import { toMobileErrorResponse } from '../_lib/errors'

export const dynamic = 'force-dynamic'

interface RawMembershipRow {
  role: string
  workspace: {
    id: string
    name: string
    slug: string | null
  } | null
}

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const { user } = await requireMobileAuth(req)

    const admin = createAdminClient()

    const { data, error } = await admin
      .from('workspace_members')
      .select(`
        role,
        workspace:workspaces (
          id,
          name,
          slug
        )
      `)
      .eq('user_id', user.id)

    if (error) {
      console.error('[mobile-api/me] workspace_members query failed', error)
      throw error
    }

    const rows = (data ?? []) as unknown as RawMembershipRow[]

    const memberships = rows
      .filter((row) => row.workspace !== null)
      .map((row) => ({
        workspace_id: row.workspace!.id,
        role: row.role,
        workspace: {
          id: row.workspace!.id,
          name: row.workspace!.name,
          slug: row.workspace!.slug,
        },
      }))

    const body = MeResponseSchema.parse({
      user: {
        id: user.id,
        email: user.email ?? null,
        created_at: user.created_at ?? null,
      },
      memberships,
    })

    return NextResponse.json(body, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    return toMobileErrorResponse(err)
  }
}
