/**
 * Super-user detection helper.
 *
 * Decision #6 in `.planning/phases/42.1-observabilidad-bots-produccion/42.1-CONTEXT.md`:
 * the production observability panel is scoped to a single "super-user"
 * (the platform owner, Jose). There is no workspace-member role nor
 * user metadata flag that already models this concept in the repo, so
 * this helper introduces a minimal env-var gated check:
 *
 *   SUPER_USER_EMAIL=jose@morfx.app
 *
 * If the env var is unset the helper always returns `false`, which
 * means the debug panel becomes invisible to everyone (fail-closed).
 *
 * Plan 11 (runbook) MUST document adding this env var to Vercel
 * Production / Preview scopes. See 42.1-09-SUMMARY.md for the
 * full rationale + migration path to a role-based mechanism later.
 *
 * Usage: call from Server Components / Server Actions only. Reading
 * `auth.getUser()` requires the cookie store (Next 15 async cookies).
 */

import { createClient } from '@/lib/supabase/server'

/**
 * Env var that holds the single super-user's email address. Kept as a
 * named constant so tests / docs / runbooks can reference it.
 */
export const SUPER_USER_EMAIL_ENV = 'SUPER_USER_EMAIL' as const

/**
 * Returns the configured super-user email, or `null` if the env var
 * is missing / empty. Exported so UI helpers can display the exact
 * env var name in "disabled" messages without hardcoding the string.
 */
export function getSuperUserEmail(): string | null {
  const raw = process.env[SUPER_USER_EMAIL_ENV]
  if (!raw) return null
  const trimmed = raw.trim().toLowerCase()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Returns true if the currently authenticated user's email matches
 * `SUPER_USER_EMAIL`. Fails closed when:
 *
 *  - env var is unset
 *  - no authenticated user in the cookie store
 *  - user exists but email does not match
 *  - any exception talking to Supabase Auth
 *
 * Callable from Server Components + Server Actions (both have access
 * to the request cookie store through `createClient()`).
 */
export async function getIsSuperUser(): Promise<boolean> {
  const expected = getSuperUserEmail()
  if (!expected) return false
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.email) return false
    return user.email.trim().toLowerCase() === expected
  } catch {
    return false
  }
}

/**
 * Server-side assertion for use inside server actions that must be
 * gated to the super-user. Throws a generic `FORBIDDEN` error string
 * on failure so the client never learns the distinction between "not
 * logged in", "env var missing" and "wrong email".
 */
export async function assertSuperUser(): Promise<void> {
  const ok = await getIsSuperUser()
  if (!ok) throw new Error('FORBIDDEN')
}
