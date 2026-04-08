/**
 * Super-user detection helper.
 *
 * Decision #6 in `.planning/phases/42.1-observabilidad-bots-produccion/42.1-CONTEXT.md`:
 * the production observability panel is scoped to a single "super-user"
 * (the platform owner, Jose).
 *
 * REUSES the existing platform mechanism already used by /super-admin
 * (`src/app/actions/super-admin.ts`, `src/app/super-admin/layout.tsx`,
 * `src/app/actions/usage.ts`, `src/app/actions/sms-admin.ts`):
 *
 *   MORFX_OWNER_USER_ID=<supabase auth.users.id of the platform owner>
 *
 * Comparison is `user.id === MORFX_OWNER_USER_ID` (UUID match), NOT email.
 *
 * If the env var is unset the helper always returns `false`, which
 * means the debug panel becomes invisible to everyone (fail-closed).
 *
 * Usage: call from Server Components / Server Actions only. Reading
 * `auth.getUser()` requires the cookie store (Next 15 async cookies).
 */

import { createClient } from '@/lib/supabase/server'

/**
 * Env var that holds the single super-user's Supabase auth user id.
 * Named constant so tests / docs / runbooks can reference it.
 */
export const SUPER_USER_ID_ENV = 'MORFX_OWNER_USER_ID' as const

/**
 * Returns the configured super-user id, or `null` if the env var
 * is missing / empty. Exported so UI helpers can display the exact
 * env var name in "disabled" messages without hardcoding the string.
 */
export function getSuperUserId(): string | null {
  const raw = process.env[SUPER_USER_ID_ENV]
  if (!raw) return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Returns true if the currently authenticated user's id matches
 * `MORFX_OWNER_USER_ID`. Fails closed when:
 *
 *  - env var is unset
 *  - no authenticated user in the cookie store
 *  - user exists but id does not match
 *  - any exception talking to Supabase Auth
 *
 * Callable from Server Components + Server Actions (both have access
 * to the request cookie store through `createClient()`).
 */
export async function getIsSuperUser(): Promise<boolean> {
  const expected = getSuperUserId()
  if (!expected) return false
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return false
    return user.id === expected
  } catch {
    return false
  }
}

/**
 * Server-side assertion for use inside server actions that must be
 * gated to the super-user. Throws a generic `FORBIDDEN` error string
 * on failure so the client never learns the distinction between "not
 * logged in", "env var missing" and "wrong user".
 */
export async function assertSuperUser(): Promise<void> {
  const ok = await getIsSuperUser()
  if (!ok) throw new Error('FORBIDDEN')
}
