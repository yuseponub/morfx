// Supabase Admin Client (bypasses RLS)
// ONLY use for server-side operations that need elevated permissions
// like webhook handlers, background jobs, etc.
//
// As of Phase 42.1 Plan 03, the default factory `createAdminClient()`
// returns an instrumented client whose `global.fetch` is wrapped by
// `makeObservableFetch(...)`. When no observability collector is active
// in the AsyncLocalStorage context (i.e. feature flag OFF or no agent
// turn in progress) the wrapper takes a fast-path that forwards to the
// underlying fetch with zero overhead. The signature is unchanged, so
// every existing consumer in the repo keeps working transparently.
//
// `createRawAdminClient()` is reserved for INTERNAL use of the
// observability module itself (flush, repository, purge cron). Using
// the instrumented client from inside the module would create infinite
// recursion when the collector tries to persist its own writes
// (Pitfall 1 in 42.1-RESEARCH.md). Domain layer, server actions, tool
// handlers and webhooks must NOT call `createRawAdminClient()`.

import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

import { makeObservableFetch } from '@/lib/observability/fetch-wrapper'

function readEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  }
  return { url, key }
}

/**
 * Default admin client used by every consumer in the repo.
 *
 * The fetch override is the ONLY difference vs the legacy
 * implementation. Auth options are preserved exactly:
 * `autoRefreshToken: false`, `persistSession: false`. When no
 * observability collector is active the wrapper is a transparent
 * no-op, so behaviour with `OBSERVABILITY_ENABLED` unset is identical
 * to the previous version (one extra arrow-function call per fetch).
 */
export function createAdminClient(): SupabaseClient {
  const { url, key } = readEnv()
  return createSupabaseClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: makeObservableFetch(fetch, 'supabase'),
    },
  })
}

/**
 * Raw admin client WITHOUT observability instrumentation.
 *
 * EXCLUSIVE for internal use of `src/lib/observability/*` to break the
 * recursion loop when the collector flushes its own data (Pitfall 1).
 *
 * DO NOT USE from:
 *   - Domain layer (`src/lib/domain/*`)
 *   - Server actions (`src/app/actions/*`)
 *   - Tool handlers (`src/lib/agents/**`)
 *   - Webhooks (`src/app/api/webhooks/*`)
 *   - Inngest functions (`src/inngest/*`)
 *
 * If you find yourself needing this, you almost certainly want
 * `createAdminClient()` instead.
 */
export function createRawAdminClient(): SupabaseClient {
  const { url, key } = readEnv()
  return createSupabaseClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
