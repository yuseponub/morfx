// e2e/fixtures/auth.ts
// Bootstrapped Wave 0 (Plan 01). Body verified against src/lib/supabase/server.ts cookie convention.
// Required env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, TEST_USER_EMAIL, TEST_USER_PASSWORD.

import { type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

/**
 * Logs in via @supabase/supabase-js (anon key) and sets the session cookie
 * on the Playwright page so server components see an authenticated user.
 *
 * Cookie name: sb-<projectRef>-auth-token (Supabase SSR convention).
 * IMPORTANT: Plan 06 (Wave 5) verifies this name against src/lib/supabase/server.ts
 * before first E2E run. If the project customized cookie name, update here.
 */
export async function authenticateAsTestUser(page: Page): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const email = process.env.TEST_USER_EMAIL
  const password = process.env.TEST_USER_PASSWORD
  if (!url || !anon || !email || !password) {
    throw new Error('e2e auth requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, TEST_USER_EMAIL, TEST_USER_PASSWORD')
  }

  const supabase = createClient(url, anon)
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.session) throw new Error(`auth failed: ${error?.message ?? 'no session'}`)

  const projectRef = new URL(url).hostname.split('.')[0]
  await page.context().addCookies([
    {
      name: `sb-${projectRef}-auth-token`,
      value: JSON.stringify({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      }),
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ])
}
