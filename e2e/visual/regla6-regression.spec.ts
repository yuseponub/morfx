// e2e/visual/regla6-regression.spec.ts
// Standalone ui-redesign-editorial-core — Plan 04 (Wave 3), Regla 6 / D-05.
//
// WHAT: Prove this standalone did NOT regress the LIVE Somnio Conversaciones
// (which renders under the legacy `.theme-editorial` warm-cream system, gated
// by `ui_inbox_v2`). Two complementary checks:
//
//   1. STATIC GATE (deterministic, primary — MUST pass): the legacy
//      `.theme-editorial` block in src/app/globals.css (lines 1..1012, i.e.
//      everything BEFORE the appended `.theme-editorial-v3` comment header at
//      line 1013) is byte-frozen. We pin a baseline SHA-256 of that slice and
//      fail if it ever changes. This is the Regla 6 guard that needs no running
//      server and no DB — it catches any edit that would leak v3 tokens into
//      the live legacy scope (RESEARCH Pitfall 4 / T-editorial-05).
//
//   2. VISUAL SMOKE (secondary, best-effort): with a workspace that has ONLY
//      `ui_inbox_v2.enabled=true` (ui_editorial_v3 absent → resolver fails
//      closed to false), screenshot `/whatsapp` and confirm the rendered inbox
//      still carries `.theme-editorial` and the warm-cream `--bg-app`
//      (#fcf7f0), and does NOT carry `.theme-editorial-v3` — isolation by class
//      name. Requires the dev server + the editorial-v3 fixture env; skipped
//      gracefully if that env is absent so the static gate still runs in CI.
//
// PREREQUISITES for the visual smoke (see 04-SUMMARY.md):
//   - Dev server on http://localhost:3020.
//   - env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
//     SUPABASE_SERVICE_ROLE_KEY, TEST_WORKSPACE_ID, TEST_USER_EMAIL,
//     TEST_USER_PASSWORD.
//   - Run: pnpm test:e2e e2e/visual/regla6-regression.spec.ts

import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const GLOBALS_CSS = path.resolve('src/app/globals.css')

// The legacy `.theme-editorial` system occupies lines 1..LEGACY_BLOCK_END_LINE.
// Line 1013 is the first line of the appended `.theme-editorial-v3` comment
// header. Anything at/below 1012 is the byte-frozen legacy surface (tokens,
// `.dark .theme-editorial` at 309, `.mx-*`, sidebar `.sb/*`, kanban `.kcard`,
// the `--bg-app:#fcf7f0` re-open + `html:has(.theme-editorial) body`).
const LEGACY_BLOCK_END_LINE = 1012

// Baseline SHA-256 of the LF-normalized legacy slice (lines 1..1012), captured
// from the committed globals.css after Wave 1 appended the v3 block. If a future
// change edits ANY legacy line, this hash diverges and the gate fails — the
// deterministic Regla 6 protection for the LIVE Somnio inbox.
const LEGACY_BLOCK_SHA256 =
  'b0dfd8c1663c4b9f5e029b3f4485cb54c048c85377b75c7648cd4ff2acae5875'

function legacySliceHash(): { hash: string; lineCount: number; firstV3Line: string } {
  const lines = readFileSync(GLOBALS_CSS, 'utf8').split('\n')
  const legacy = lines.slice(0, LEGACY_BLOCK_END_LINE).join('\n')
  return {
    hash: createHash('sha256').update(legacy).digest('hex'),
    lineCount: lines.length,
    firstV3Line: lines[LEGACY_BLOCK_END_LINE] ?? '',
  }
}

test.describe('Regla 6 — legacy .theme-editorial byte-frozen (D-05)', () => {
  test('STATIC GATE: legacy globals.css block (lines 1..1012) is byte-frozen', () => {
    const { hash, firstV3Line } = legacySliceHash()

    // Boundary sanity: line 1013 must still be the v3 comment header start, so
    // the slice [0,1012) genuinely excludes the v3 block. If someone inserts
    // lines above the v3 block this assertion catches the boundary shift.
    expect(
      firstV3Line.startsWith('/* ='),
      `expected the v3 comment header to start at line ${LEGACY_BLOCK_END_LINE + 1}; ` +
        `got: ${JSON.stringify(firstV3Line)} — boundary shifted, re-verify the frozen range`,
    ).toBe(true)

    expect(
      hash,
      'legacy .theme-editorial block changed — Regla 6 violation (live Somnio ' +
        'Conversaciones at risk). The v3 system MUST be appended only; never ' +
        'edit lines <= 1012. If this change is intentional + verified safe, ' +
        're-baseline LEGACY_BLOCK_SHA256.',
    ).toBe(LEGACY_BLOCK_SHA256)
  })

  test('STATIC GATE: legacy block contains the warm-cream token, NOT the v3 white-paper one', () => {
    const lines = readFileSync(GLOBALS_CSS, 'utf8').split('\n')
    const legacy = lines.slice(0, LEGACY_BLOCK_END_LINE).join('\n')
    // Legacy warm-cream --bg-app (#fcf7f0) lives inside the frozen block.
    expect(legacy.includes('#fcf7f0'), 'legacy warm-cream --bg-app:#fcf7f0 must remain').toBe(true)
    // The v3 scope class must NOT appear inside the legacy slice (isolation).
    expect(
      legacy.includes('theme-editorial-v3'),
      'v3 scope class must NOT leak into the frozen legacy block',
    ).toBe(false)
  })

  // VISUAL SMOKE — best-effort confirmation of the live legacy render.
  // Skipped if the harness env is absent so the static gate stands alone in CI.
  test('VISUAL SMOKE: ui_inbox_v2-only /whatsapp renders legacy warm-cream, NOT v3', async ({
    page,
  }) => {
    const haveEnv =
      !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
      !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
      !!process.env.TEST_WORKSPACE_ID &&
      !!process.env.TEST_USER_EMAIL &&
      !!process.env.TEST_USER_PASSWORD
    test.skip(!haveEnv, 'visual smoke requires the editorial-v3 fixture env (DB + auth)')

    // Lazy-import so the static gate doesn't pull DB deps when env is absent.
    const {
      authenticateAsTestUser,
      enableInboxV2Only,
      restoreFlags,
    } = await import('../fixtures/editorial-v3')

    try {
      await enableInboxV2Only() // ui_inbox_v2 ON, ui_editorial_v3 absent
      await page.setViewportSize({ width: 1440, height: 900 })
      await authenticateAsTestUser(page)
      await page.goto('/whatsapp', { waitUntil: 'networkidle' })

      // Legacy class present on the inbox container; v3 class absent.
      await expect(
        page.locator('.theme-editorial').first(),
        'legacy .theme-editorial must be applied when only ui_inbox_v2 is on',
      ).toBeAttached()
      await expect(
        page.locator('.theme-editorial-v3'),
        'v3 scope must NOT appear on the legacy live render',
      ).toHaveCount(0)

      // Warm-cream --bg-app on the legacy container (distinct from v3 white-paper).
      const legacyBg = await page.evaluate(() => {
        const el = document.querySelector('.theme-editorial')
        return el ? getComputedStyle(el).getPropertyValue('--bg-app').trim() : ''
      })
      console.log(`[regla6] legacy --bg-app="${legacyBg}"`)
      expect(legacyBg, 'legacy --bg-app should resolve').not.toBe('')
      // #fcf7f0 serializes to rgb(252, 247, 240) — assert it is NOT the v3
      // near-white oklch(0.996 …). The legacy value is warm-cream, the v3 value
      // is white-paper; they must differ.
      expect(
        legacyBg.includes('oklch(0.996'),
        `legacy --bg-app must NOT be the v3 white-paper token (got ${legacyBg})`,
      ).toBe(false)
    } finally {
      await restoreFlags()
    }
  })
})
