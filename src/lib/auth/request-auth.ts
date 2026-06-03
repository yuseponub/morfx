import { cache } from 'react'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export interface RequestAuth {
  userId: string
  email: string | null
  workspaceId: string
}

/**
 * Per-request auth resolution. Wrapped in React cache() so multiple Server
 * Actions in the SAME request share ONE local JWT verification + cookie read.
 * Uses getClaims() (local ES256 verify against cached JWKS — no network round-trip)
 * instead of getUser() (network round-trip to GoTrue).
 *
 * Refresh + revocation remain the middleware's job (D-04). RLS is enforced by
 * the JWT the anon client sends to Postgres, not by this helper.
 *
 * Returns null when unauthenticated OR no workspace selected — callers preserve
 * their existing not-authed behavior ([] / null / { error }).
 */
export const getRequestAuth = cache(async (): Promise<RequestAuth | null> => {
  const supabase = await createClient()

  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims?.sub) return null // cubre {data:null,error:null} Y la rama de error (Pitfall 2)

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return null

  return {
    userId: claims.sub,
    email: claims.email ?? null,
    workspaceId,
  }
})
