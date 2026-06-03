'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

function makeBrowserClient(): SupabaseClient {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Browser-client singleton (mirrors get-query-client.ts).
// All consumers of @/lib/supabase/client share ONE Supabase client and thus
// ONE multiplexed Realtime WebSocket. This is the prerequisite for Capa 1:
// a single supabase.realtime.setAuth() (Plan 02) re-authenticates every hook's
// socket at once. This module is 'use client', so the singleton is per-browser
// (never shared across users) and per-tab (browser-scoped) — safe.
let browserClient: SupabaseClient | undefined

export function createClient(): SupabaseClient {
  return (browserClient ??= makeBrowserClient())
}
