'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

function makeBrowserClient(): SupabaseClient {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

let browserClient: SupabaseClient | undefined

// Resolves once the shared Realtime socket has been primed with the current
// user JWT. Realtime hooks MUST await this before .subscribe() so the first
// phx_join carries the user token (not the anon fallback) — otherwise RLS
// (is_workspace_member(auth.uid())) drops every event silently while the
// channel still reports SUBSCRIBED (confirmed root cause; scripts/_diag-token-order.ts Phase A).
let realtimeAuthReady: Promise<void> | undefined

export function createClient(): SupabaseClient {
  if (!browserClient) {
    browserClient = makeBrowserClient()

    // Prime the Realtime socket token ONCE, at creation, before any hook subscribes.
    // No-arg setAuth() reads the current session via supabase-js's internal
    // access-token callback (which reads @supabase/ssr cookie storage). It keeps
    // CALLBACK/auto-refresh mode (Pitfall 4): a no-arg prime does NOT flip the
    // socket to manual-token mode, so the heartbeat/reconnect auth keeps working
    // and the kept RealtimeAuthProvider re-asserts on every TOKEN_REFRESHED.
    // whenRealtimeAuthReady() lets hooks wait for it to resolve.
    // We NEVER log the token (threat: token leakage — Security V7).
    realtimeAuthReady = browserClient.realtime
      .setAuth()
      .catch((e) => {
        // Fail-open: do not block subscribe forever if priming errors.
        // The kept RealtimeAuthProvider + useRealtimeReconnect remain as nets.
        console.warn('[realtime] initial setAuth failed', e)
      })
  }
  return browserClient
}

/** Await before subscribing any RLS-filtered Realtime channel (token-before-subscribe). */
export function whenRealtimeAuthReady(): Promise<void> {
  return realtimeAuthReady ?? Promise.resolve()
}
