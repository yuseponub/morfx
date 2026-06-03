'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Capa 1 — Realtime auth refresh (root cause 2a).
 *
 * @supabase/ssr refreshes the JWT (~hourly) for HTTP/PostgREST but does NOT
 * re-inject the new token into the Realtime WebSocket. Once the socket's JWT
 * expires, the server silently drops RLS-filtered postgres_changes events
 * (V3: policies use is_workspace_member(...) which evaluates the JWT) while the
 * channel still reports SUBSCRIBED — so the existing status-transition auto-heal
 * never fires (hole 2d). Re-injecting the fresh token on token-refresh / sign-in
 * keeps the shared socket authenticated.
 *
 * Mounted ONCE in the dashboard layout (D-04). Uses the browser-client singleton
 * (Plan 01) so this single setAuth re-authenticates every hook's channel.
 *
 * setAuth is async + token optional (D-05, @supabase/realtime-js@2.95.2):
 *   setAuth(token?: string | null): Promise<void>
 * We pass the session token explicitly and fire-and-forget with `void`.
 * The auth-change callback is intentionally NON-async (auth-js deadlock
 * warning) — do not await inside it. The token is never logged (threat T-rib-03).
 */
export function RealtimeAuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const supabase = createClient()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        // Re-inject the fresh JWT into the shared Realtime socket. Fire-and-forget.
        void supabase.realtime.setAuth(session?.access_token)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  return <>{children}</>
}
