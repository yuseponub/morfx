// e2e/fixtures/editorial-v3.ts
// Standalone ui-redesign-editorial-core — Plan 04 (Wave 3).
//
// Test fixture + helpers for the editorial-v3 fidelity harness (D-10) and the
// Regla 6 regression guard.
//
// Responsibilities:
//   1. enableEditorialV3OnTestWorkspace() — flip
//      `workspaces.settings.ui_editorial_v3.enabled = true` on the ISOLATED
//      TEST workspace (TEST_WORKSPACE_ID) via the supabase service-role path
//      used by seed.ts. NEVER touches a production workspace.
//   2. disableEditorialV3OnTestWorkspace() — restore default-OFF after the run.
//   3. enableInboxV2Only() / restoreFlags() — provision the legacy
//      `ui_inbox_v2`-live state for the Regla 6 regression guard
//      (ui_inbox_v2.enabled = true, ui_editorial_v3 absent/false).
//   4. setColorScheme(page, 'light'|'dark') — next-themes here is
//      attribute="class" + defaultTheme="system" + enableSystem
//      (src/app/layout.tsx:34-36), so emulateMedia({colorScheme}) drives the
//      `.dark` class on <html>. No theme cookie needed.
//   5. readVar(page, selector, prop) — read a resolved CSS custom property off
//      a rendered element (used to prove the v3 dark palette is in effect).
//
// Required env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//   TEST_WORKSPACE_ID (+ the auth env consumed by authenticateAsTestUser).
//
// Manual SQL equivalent of enableEditorialV3OnTestWorkspace (RESEARCH §Code
// Examples / Plan 00 Task 2), for the operator who runs the harness by hand:
//
//   UPDATE workspaces
//   SET settings = jsonb_set(coalesce(settings, '{}'::jsonb),
//                            '{ui_editorial_v3,enabled}', 'true'::jsonb, true)
//   WHERE id = '<TEST_WORKSPACE_ID>';
//   -- rollback: same with 'false'

import { type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export { authenticateAsTestUser } from './auth'

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const srk = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !srk) {
    throw new Error(
      'editorial-v3 fixture requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    )
  }
  return createClient(url, srk)
}

function requireTestWorkspaceId(): string {
  const ws = process.env.TEST_WORKSPACE_ID
  if (!ws) throw new Error('editorial-v3 fixture requires TEST_WORKSPACE_ID')
  return ws
}

/**
 * Reads the raw `settings` JSONB of the test workspace.
 */
async function readSettings(): Promise<Record<string, unknown>> {
  const supabase = admin()
  const ws = requireTestWorkspaceId()
  const { data, error } = await supabase
    .from('workspaces')
    .select('settings')
    .eq('id', ws)
    .single()
  if (error || !data) {
    throw new Error(`read workspace settings failed: ${error?.message ?? 'no row'}`)
  }
  return ((data.settings as Record<string, unknown> | null) ?? {}) as Record<string, unknown>
}

/**
 * Sets a single boolean flag sub-key (`ui_editorial_v3.enabled` /
 * `ui_inbox_v2.enabled`) on the TEST workspace settings JSONB, preserving the
 * rest of the object. Mirrors the production `jsonb_set` activation path but
 * scoped to TEST_WORKSPACE_ID only (T-editorial-04 trust boundary).
 */
async function setFlag(namespace: 'ui_editorial_v3' | 'ui_inbox_v2', enabled: boolean): Promise<void> {
  const supabase = admin()
  const ws = requireTestWorkspaceId()
  const settings = await readSettings()
  const ns = (settings[namespace] as Record<string, unknown> | undefined) ?? {}
  const next = { ...settings, [namespace]: { ...ns, enabled } }
  const { error } = await supabase
    .from('workspaces')
    .update({ settings: next })
    .eq('id', ws)
  if (error) throw new Error(`set ${namespace}.enabled=${enabled} failed: ${error.message}`)
}

/**
 * Removes a flag namespace entirely (so the resolver sees "absent" — fails
 * closed to false). Used by the Regla 6 guard to prove the legacy render when
 * ui_editorial_v3 is absent.
 */
async function removeFlag(namespace: 'ui_editorial_v3' | 'ui_inbox_v2'): Promise<void> {
  const supabase = admin()
  const ws = requireTestWorkspaceId()
  const settings = await readSettings()
  if (!(namespace in settings)) return
  const next = { ...settings }
  delete next[namespace]
  const { error } = await supabase
    .from('workspaces')
    .update({ settings: next })
    .eq('id', ws)
  if (error) throw new Error(`remove ${namespace} failed: ${error.message}`)
}

/** D-04 / D-10 — flip the v3 flag ON for the TEST workspace (fidelity harness). */
export async function enableEditorialV3OnTestWorkspace(): Promise<void> {
  await setFlag('ui_editorial_v3', true)
}

/** Restore default-OFF after the fidelity run (never leave the flag on). */
export async function disableEditorialV3OnTestWorkspace(): Promise<void> {
  await setFlag('ui_editorial_v3', false)
}

/**
 * Regla 6 guard provisioning: legacy `ui_inbox_v2`-live state.
 * ui_inbox_v2.enabled = true, ui_editorial_v3 absent (so the resolver fails
 * closed to false and the legacy `.theme-editorial` warm-cream render shows).
 */
export async function enableInboxV2Only(): Promise<void> {
  await removeFlag('ui_editorial_v3')
  await setFlag('ui_inbox_v2', true)
}

/** Restore both flags to default-OFF / absent after the regression run. */
export async function restoreFlags(): Promise<void> {
  await setFlag('ui_editorial_v3', false)
  await setFlag('ui_inbox_v2', false)
}

export type ColorScheme = 'light' | 'dark'

/**
 * Drives light/dark. next-themes is attribute="class" + defaultTheme="system"
 * + enableSystem (src/app/layout.tsx:34-36), so emulating the OS color-scheme
 * flips the `.dark` class on <html> — which the descendant selector
 * `.dark .theme-editorial-v3` (D-02) relies on. MUST be called BEFORE
 * navigation so the first paint already reflects the scheme.
 */
export async function setColorScheme(page: Page, scheme: ColorScheme): Promise<void> {
  await page.emulateMedia({ colorScheme: scheme })
}

/**
 * Reads a resolved CSS custom property (e.g. `--bg-app`) off the first element
 * matching `selector`. Returns the serialized computed value (the browser
 * serializes oklch as `oklch(L C H)`), or '' if no element matched.
 *
 * Used to prove the v3 charcoal-warm dark palette is genuinely in effect under
 * `.dark .theme-editorial-v3` — a broken (compound) descendant selector would
 * leave the LIGHT value in place and this assertion would fail loudly (D-02).
 */
export async function readVar(page: Page, selector: string, prop: string): Promise<string> {
  return page.evaluate(
    ([sel, p]) => {
      const el = document.querySelector(sel)
      if (!el) return ''
      return getComputedStyle(el).getPropertyValue(p).trim()
    },
    [selector, prop] as const,
  )
}

/**
 * Extracts the oklch lightness component (the `L` in `oklch(L C H)`) from a
 * serialized computed value. Returns NaN if it is not an oklch string.
 *
 * The v3 light `--bg-app` is `oklch(0.996 …)` (white-paper, L≈1) and the v3
 * dark `--bg-app` is `oklch(0.215 …)` (charcoal-warm, L≈0.2). Asserting the
 * dark lightness is well below the light one is serialization-robust (avoids
 * brittle exact-string equality across browser oklch normalization).
 */
export function oklchLightness(serialized: string): number {
  const m = /oklch\(\s*([0-9.]+)/i.exec(serialized)
  return m ? Number(m[1]) : NaN
}

/** The screen container under the v3 scope (set by inbox-layout / dashboard layout). */
export const V3_SCOPE_SELECTOR = '.theme-editorial-v3'

export const SCREENS = [
  {
    name: 'conversaciones',
    real: '/whatsapp',
    mock: 'conversaciones/index.html',
  },
  {
    name: 'contactos',
    real: '/crm/contactos',
    mock: 'crm/crm-editorial.html',
  },
  {
    name: 'pedidos',
    real: '/crm/pedidos',
    mock: 'pedidos/pedidos-editorial.html',
  },
] as const
