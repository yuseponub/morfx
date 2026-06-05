// e2e/visual/editorial-fidelity.spec.ts
// Standalone ui-redesign-editorial-core — Plan 04 (Wave 3), D-10 fidelity gate.
//
// WHAT: Screenshot the 3 real screens (with the per-workspace `ui_editorial_v3`
// flag ON) and the canonical mocks, compute a per-screen pixel-match ratio in
// light AND dark (6 cases), and gate each case at >= 95% (D-10). Plus a
// dark-palette smoke that proves the descendant selector `.dark
// .theme-editorial-v3` actually matches (D-02) — it would fail loudly if Plan
// 00 had authored the stale compound selector.
//
// FIDELITY METHODOLOGY (RESEARCH A2 / Open Q2): the mocks are STATIC HTML with
// placeholder data; the real renders carry live workspace data. A naive
// full-page content diff would false-fail on text. So the >= 95% gate is
// assessed on STABLE CHROME REGIONS — the top band (header / tabs / column
// chrome) where layout + color tokens dominate and placeholder text is minimal
// — captured via a fixed `clip` rectangle on BOTH the real render and the mock.
// When a case is under the gate the diff PNG is written to
// playwright-report/editorial-fidelity/<screen>-<mode>.diff.png for the human
// checkpoint to review against the HANDOFF §5 / UI-SPEC §11 checklist.
//
// PREREQUISITES (see 04-SUMMARY.md for the full operator runbook):
//   - Dev server on http://localhost:3020 (playwright.config webServer starts it).
//   - env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
//     SUPABASE_SERVICE_ROLE_KEY, TEST_WORKSPACE_ID, TEST_USER_EMAIL,
//     TEST_USER_PASSWORD (the fixture flips the flag on TEST_WORKSPACE_ID and
//     authenticateAsTestUser signs in).
//   - Run: pnpm test:e2e e2e/visual/editorial-fidelity.spec.ts

import { test, expect } from '@playwright/test'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  authenticateAsTestUser,
  enableEditorialV3OnTestWorkspace,
  disableEditorialV3OnTestWorkspace,
  setColorScheme,
  readVar,
  oklchLightness,
  V3_SCOPE_SELECTOR,
  SCREENS,
  type ColorScheme,
} from '../fixtures/editorial-v3'

const MOCK_DIR = path.resolve(
  '.planning/standalone/ui-redesign-editorial-core/handoff/ui_kits',
)
const ARTIFACT_DIR = path.resolve('playwright-report/editorial-fidelity')
const VIEWPORT = { width: 1440, height: 900 }
const GATE = 0.95 // >= 95% pixel-match (D-10)

// Stable-chrome clip rectangles per screen (RESEARCH A2). The top band carries
// the header/tab/column chrome where layout + the v3 color tokens dominate and
// placeholder content text is minimal — the region that meaningfully proves
// "ported to the editorial system" vs naive content diff. Tuned at 1440x900.
const STABLE_CLIP: Record<string, { x: number; y: number; width: number; height: number }> = {
  conversaciones: { x: 0, y: 0, width: 1440, height: 120 },
  contactos: { x: 0, y: 0, width: 1440, height: 200 },
  pedidos: { x: 0, y: 0, width: 1440, height: 200 },
}

function matchRatio(a: PNG, b: PNG): { ratio: number; diff: PNG } {
  // pixelmatch requires identical dimensions; clip rectangles are fixed so both
  // captures share width/height. Guard anyway for a clear failure message.
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(
      `dimension mismatch real=${a.width}x${a.height} mock=${b.width}x${b.height}`,
    )
  }
  const { width, height } = a
  const diff = new PNG({ width, height })
  const mismatched = pixelmatch(a.data, b.data, diff.data, width, height, {
    threshold: 0.1,
  })
  return { ratio: 1 - mismatched / (width * height), diff }
}

function writeDiff(screen: string, mode: ColorScheme, diff: PNG): string {
  mkdirSync(ARTIFACT_DIR, { recursive: true })
  const out = path.join(ARTIFACT_DIR, `${screen}-${mode}.diff.png`)
  writeFileSync(out, PNG.sync.write(diff))
  return out
}

test.describe('editorial-v3 fidelity (D-10)', () => {
  test.beforeAll(async () => {
    // Flip the v3 flag ON for the ISOLATED test workspace only (never prod).
    await enableEditorialV3OnTestWorkspace()
  })

  test.afterAll(async () => {
    // Always restore default-OFF — never leave the flag on.
    await disableEditorialV3OnTestWorkspace()
  })

  for (const screen of SCREENS) {
    for (const mode of ['light', 'dark'] as const) {
      test(`${screen.name} — ${mode} >= ${GATE * 100}%`, async ({ page }) => {
        const clip = STABLE_CLIP[screen.name]
        await page.setViewportSize(VIEWPORT)
        await setColorScheme(page, mode) // BEFORE navigation (D-02 first-paint)
        await authenticateAsTestUser(page)

        // --- real render (flag ON) ---
        await page.goto(screen.real, { waitUntil: 'networkidle' })
        // The v3 scope must actually be applied (flag ON + correct site).
        await expect(
          page.locator(V3_SCOPE_SELECTOR).first(),
          `${screen.real} should render under ${V3_SCOPE_SELECTOR} with the flag ON`,
        ).toBeAttached()
        const realPng = PNG.sync.read(await page.screenshot({ clip }))

        // --- canonical mock (static HTML via file://) ---
        const mockUrl = `file://${path.join(MOCK_DIR, screen.mock)}`
        // The mock authors dark as compound `.theme-editorial.dark`; for the
        // mock we emulate the same color-scheme so a dark real render is
        // compared against the dark mock intent. (Region-scoped, so exact
        // mock-dark wiring is not the gated surface — chrome layout/color is.)
        await page.goto(mockUrl, { waitUntil: 'networkidle' })
        const mockPng = PNG.sync.read(await page.screenshot({ clip }))

        // --- ratio + artifact on sub-gate ---
        const { ratio, diff } = matchRatio(realPng, mockPng)
        if (ratio < GATE) {
          const artifact = writeDiff(screen.name, mode, diff)
          console.log(
            `[editorial-fidelity] ${screen.name}/${mode} ratio=${ratio.toFixed(4)} ` +
              `< ${GATE} — diff written to ${artifact} (human checkpoint reviews this)`,
          )
        } else {
          console.log(
            `[editorial-fidelity] ${screen.name}/${mode} ratio=${ratio.toFixed(4)} >= ${GATE} OK`,
          )
        }
        expect(
          ratio,
          `${screen.name}/${mode} stable-chrome fidelity (review diff PNG if < gate)`,
        ).toBeGreaterThanOrEqual(GATE)
      })
    }
  }

  // D-02: prove the dark descendant selector `.dark .theme-editorial-v3`
  // genuinely renders the charcoal-warm palette. Read the resolved --bg-app off
  // the scoped container in BOTH schemes; dark lightness must be well below
  // light lightness (light ~0.996, dark ~0.215). A broken compound selector
  // would leave the LIGHT value in dark mode and FAIL this loudly.
  test('dark mode renders the charcoal-warm v3 --bg-app (descendant selector — D-02)', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORT)
    await authenticateAsTestUser(page)

    await setColorScheme(page, 'light')
    await page.goto(SCREENS[0].real, { waitUntil: 'networkidle' })
    await expect(page.locator(V3_SCOPE_SELECTOR).first()).toBeAttached()
    const lightBg = await readVar(page, V3_SCOPE_SELECTOR, '--bg-app')
    const lightL = oklchLightness(lightBg)

    await setColorScheme(page, 'dark')
    await page.goto(SCREENS[0].real, { waitUntil: 'networkidle' })
    await expect(page.locator(V3_SCOPE_SELECTOR).first()).toBeAttached()
    const darkBg = await readVar(page, V3_SCOPE_SELECTOR, '--bg-app')
    const darkL = oklchLightness(darkBg)

    console.log(`[editorial-fidelity] --bg-app light="${lightBg}" dark="${darkBg}"`)

    expect(lightBg, 'light --bg-app should resolve').not.toBe('')
    expect(darkBg, 'dark --bg-app should resolve').not.toBe('')
    // The dark value must differ from light (descendant selector matched) ...
    expect(darkBg, 'dark --bg-app must differ from light (descendant selector matched)').not.toBe(
      lightBg,
    )
    // ... and must be a genuinely dark (charcoal) lightness, well below light.
    expect(Number.isNaN(lightL) || lightL > 0.8, `light --bg-app should be near-white (${lightBg})`).toBe(
      true,
    )
    expect(darkL, `dark --bg-app should be charcoal (L<0.4) — got ${darkBg}`).toBeLessThan(0.4)
  })
})
