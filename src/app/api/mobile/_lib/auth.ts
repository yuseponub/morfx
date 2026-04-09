// Mobile API authentication helper.
//
// Every authenticated mobile route MUST call `requireMobileAuth(req)` as
// its first step. The helper enforces:
//
//   1. `Authorization: Bearer <token>` — Supabase JWT
//   2. `x-workspace-id: <uuid>` — target workspace
//   3. The authenticated user is a member of that workspace
//      (MEMORY.md safety rule: workspace_members .single() MUST filter
//       by BOTH user_id AND workspace_id — never just user_id).
//
// On any failure it throws a `MobileAuthError`, which the route wrapper
// maps to `401 { error: 'unauthorized' }` via `toMobileErrorResponse`.

import type { User } from '@supabase/supabase-js'

import { createAdminClient } from '@/lib/supabase/admin'

import { MobileAuthError } from './errors'

export interface MobileMembership {
  workspace_id: string
  user_id: string
  role: string
}

export interface MobileAuthContext {
  user: User
  workspaceId: string
  membership: MobileMembership
}

function extractBearerToken(req: Request): string {
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization')
  if (!header) {
    throw new MobileAuthError('unauthorized', 'Missing Authorization header')
  }
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  if (!match || !match[1]) {
    throw new MobileAuthError('unauthorized', 'Malformed Authorization header')
  }
  return match[1].trim()
}

function extractWorkspaceId(req: Request): string {
  const workspaceId = req.headers.get('x-workspace-id')
  if (!workspaceId) {
    throw new MobileAuthError('unauthorized', 'Missing x-workspace-id header')
  }
  // Basic shape check — real UUID validation happens at the DB layer.
  if (workspaceId.length < 10) {
    throw new MobileAuthError('unauthorized', 'Invalid x-workspace-id header')
  }
  return workspaceId
}

/**
 * Validate caller credentials and workspace membership.
 *
 * Throws `MobileAuthError` on any failure. Returns `{ user, workspaceId,
 * membership }` on success so downstream code doesn't need to re-read
 * headers or re-query the DB.
 */
export async function requireMobileAuth(
  req: Request
): Promise<MobileAuthContext> {
  const token = extractBearerToken(req)
  const workspaceId = extractWorkspaceId(req)

  const admin = createAdminClient()

  // 1. Validate JWT and fetch the user.
  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData?.user) {
    throw new MobileAuthError('unauthorized', 'Invalid Supabase JWT')
  }
  const user = userData.user

  // 2. Confirm membership (MUST filter by BOTH user_id and workspace_id).
  const { data: membership, error: memberError } = await admin
    .from('workspace_members')
    .select('workspace_id, user_id, role')
    .eq('user_id', user.id)
    .eq('workspace_id', workspaceId)
    .single()

  if (memberError || !membership) {
    throw new MobileAuthError(
      'unauthorized',
      'User is not a member of this workspace'
    )
  }

  return {
    user,
    workspaceId,
    membership: membership as MobileMembership,
  }
}
