---
phase: ui-redesign-editorial-core
plan: 04
type: execute
wave: 3
depends_on: [00, 01, 02, 03]
files_modified:
  - e2e/visual/editorial-fidelity.spec.ts
  - e2e/visual/regla6-regression.spec.ts
  - e2e/fixtures/editorial-v3.ts
autonomous: false
requirements: [D-10, D-02, D-05]

must_haves:
  truths:
    - "A Playwright + pixelmatch harness produces a per-screen pixel-match ratio against the canonical mocks for all 3 screens in light AND dark (6 cases)"
    - "Each of the 6 cases meets the ≥95% fidelity gate (D-10), assessed on stable chrome regions per the harness practical notes"
    - "Dark mode visibly renders the charcoal-warm palette under .dark .theme-editorial-v3 (D-02) — the dark cases would fail if the descendant selector were wrong"
    - "A Regla 6 regression check confirms the legacy ui_inbox_v2-live Conversaciones renders byte-identical (legacy .theme-editorial untouched)"
    - "A human checkpoint reviews the diff PNGs and confirms the HANDOFF §5 / UI-SPEC §11 checklist before declaring done"
  artifacts:
    - path: "e2e/visual/editorial-fidelity.spec.ts"
      provides: "3 screens × light/dark pixel-match harness with the ≥95% gate"
      contains: "pixelmatch"
    - path: "e2e/visual/regla6-regression.spec.ts"
      provides: "Legacy Conversaciones byte-identical regression guard"
      contains: "theme-editorial"
    - path: "e2e/fixtures/editorial-v3.ts"
      provides: "Test workspace with ui_editorial_v3.enabled=true + authed session helper"
      contains: "ui_editorial_v3"
  key_links:
    - from: "e2e/visual/editorial-fidelity.spec.ts"
      to: "the canonical mocks + the real /whatsapp, /crm/contactos, /crm/pedidos routes"
      via: "Playwright screenshot of both + pixelmatch ratio"
      pattern: "pixelmatch|MOCK_DIR"
    - from: "e2e/visual/editorial-fidelity.spec.ts"
      to: ".dark .theme-editorial-v3 dark rendering"
      via: "emulateMedia colorScheme dark or theme cookie before navigation"
      pattern: "colorScheme|dark"
---

<objective>
Build the headless fidelity verification harness (D-10): a Playwright + pixelmatch spec that screenshots the 3 real screens (with the v3 flag ON) and the canonical mocks, computes a per-screen pixel-match ratio in light AND dark, and gates each of the 6 cases at ≥95%. Add a Regla 6 regression guard that the legacy `ui_inbox_v2`-live Conversaciones renders byte-identical, and a human checkpoint to review the diff PNGs against the HANDOFF §5 / UI-SPEC §11 checklist.

Purpose: This is the gate that turns "looks ported" into "verified ≥95% fidelity" — the lesson from the 35% dashboard failure. It also proves the dark-mode descendant selector actually matches (the dark cases fail if Plan 00's `.dark .theme-editorial-v3` were authored as the stale compound selector) and proves production isolation (Regla 6).

Output: a green 6-case fidelity gate + a byte-identical legacy regression + operator sign-off.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/ui-redesign-editorial-core/UI-SPEC.md
@.planning/standalone/ui-redesign-editorial-core/RESEARCH.md

<interfaces>
From playwright.config.ts (existing — reuse):
- testDir './e2e', baseURL `process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3020'`, single worker, chromium
- webServer command `npm run dev` (repo runs dev on :3020)

From e2e/fixtures/auth.ts (existing — reuse the login helper):

    export async function authenticateAsTestUser(page: Page): Promise<void>
    // signs in via supabase-js anon key + sets the sb-<ref>-auth-token cookie on the page

From RESEARCH §Code Examples (the harness skeleton) + §Validation Architecture (practical notes):
- pixelmatch(a.data, b.data, diff.data, w, h, { threshold: 0.1 }) → mismatched count; ratio = 1 - mismatched/(w*h)
- GATE = 0.95
- mocks are STATIC with placeholder data → gate on stable chrome/color REGIONS (topbar, tabs, kanban column heads, tag pills, table frame), NOT naive full-page content diff (RESEARCH A2 / Open Q2)
- dark: emulateMedia({colorScheme:'dark'}) works only if next-themes is 'system'; otherwise set the theme cookie/localStorage to 'dark' before navigation
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Build the test fixture (flag-ON workspace) + the pixelmatch fidelity spec</name>
  <read_first>
    - e2e/fixtures/auth.ts (reuse authenticateAsTestUser — the cookie/login pattern)
    - e2e/fixtures/seed.ts (existing seed helpers — pattern for setting up test workspace data)
    - playwright.config.ts (baseURL, webServer, single worker)
    - src/lib/auth/editorial-v3.ts (Plan 00 — the flag path `ui_editorial_v3.enabled` the fixture must set true on the test workspace)
    - RESEARCH §Code Examples (the harness skeleton) + §Validation Architecture (Sampling Rate + Wave 0 Gaps + the practical notes: region-scoping, test workspace flag ON, dark via emulateMedia/cookie)
    - src/components/providers/theme-provider.tsx (confirm next-themes mode — drives whether dark uses emulateMedia 'system' or a forced theme cookie)
  </read_first>
  <action>
    Create `e2e/fixtures/editorial-v3.ts`: a helper that ensures the test workspace has `workspaces.settings.ui_editorial_v3.enabled = true` (via the supabase admin/service path used by seed.ts, or document the manual SQL `UPDATE workspaces SET settings = jsonb_set(coalesce(settings,'{}'::jsonb),'{ui_editorial_v3,enabled}','true'::jsonb,true) WHERE id='<test-uuid>'` and set it in the fixture) and reuses `authenticateAsTestUser` to produce an authed page pointed at that workspace. Also expose a `setColorScheme(page, 'light'|'dark')` helper that, depending on the confirmed next-themes mode, either calls `page.emulateMedia({colorScheme})` (if 'system') or sets the `theme` cookie/localStorage to the value before navigation.

    Create `e2e/visual/editorial-fidelity.spec.ts` per the RESEARCH skeleton. For each of the 3 screens × {light, dark} (6 cases):
    - `MOCK_DIR = '.planning/standalone/ui-redesign-editorial-core/handoff/ui_kits'`; screens: conversaciones → `/whatsapp` + `conversaciones/index.html`; contactos → `/crm/contactos` + `crm/crm-editorial.html`; pedidos → `/crm/pedidos` + `pedidos-editorial.html`.
    - VIEWPORT `{ width: 1440, height: 900 }`; GATE `0.95`.
    - Authenticate + ensure flag ON; set color scheme; screenshot the real route; screenshot the mock via `file://` absolute path.
    - Compute ratio with pixelmatch (threshold 0.1) over `pngjs` buffers. Because mock data ≠ real data, scope the diff to STABLE chrome/color REGIONS per screen (clip to topbar band, tabs/divider, kanban column heads, tag pills, table frame — use Playwright `clip` or `locator.screenshot()` on stable selectors), NOT a naive full-page content diff (RESEARCH A2). When ratio < GATE, write the diff PNG to a `playwright-report`/artifacts path for the human checkpoint.
    - `expect(ratio).toBeGreaterThanOrEqual(GATE)` per case.
    Also assert a dark-mode smoke for the v3 scope: at least one dark case confirms the rendered background is the charcoal-warm `--bg-app` (e.g. sample a pixel / computed style) so a broken descendant selector fails loudly (D-02).
  </action>
  <verify>
    <automated>test -f e2e/visual/editorial-fidelity.spec.ts && test -f e2e/fixtures/editorial-v3.ts && grep -q "pixelmatch" e2e/visual/editorial-fidelity.spec.ts && grep -Eq "colorScheme|theme" e2e/visual/editorial-fidelity.spec.ts</automated>
  </verify>
  <acceptance_criteria>
    - `e2e/fixtures/editorial-v3.ts` exists and sets/asserts `ui_editorial_v3.enabled=true` on the test workspace + reuses `authenticateAsTestUser`
    - `e2e/visual/editorial-fidelity.spec.ts` exists, imports `pixelmatch` and `pngjs`, and references all 3 screens (`/whatsapp`, `/crm/contactos`, `/crm/pedidos`) × light/dark (6 cases)
    - The spec gates each case `>= 0.95` and writes a diff PNG artifact on failure
    - The spec sets the color scheme (emulateMedia or theme cookie) so dark cases actually render the v3 dark palette
    - At least one dark case asserts the charcoal-warm `--bg-app` is in effect (proves the descendant dark selector matches — D-02)
    - `pnpm test:e2e e2e/visual/editorial-fidelity.spec.ts` runs (executor may iterate region clips until all 6 cases pass ≥95%)
  </acceptance_criteria>
  <done>Fixture + 6-case pixelmatch fidelity spec exist; region-scoped ≥95% gate; dark cases render the v3 charcoal palette; runnable against localhost:3020.</done>
</task>

<task type="auto">
  <name>Task 2: Build the Regla 6 legacy-regression guard</name>
  <read_first>
    - src/app/(dashboard)/whatsapp/components/inbox-layout.tsx lines 152-156 (the legacy `.theme-editorial` application site, gated by `v2`/ui_inbox_v2 — the live path that must stay byte-identical)
    - src/lib/auth/inbox-v2.ts (the ui_inbox_v2 flag that gates the live legacy render)
    - e2e/fixtures/auth.ts + seed.ts (set up a workspace with ui_inbox_v2.enabled=true, ui_editorial_v3 absent/false)
    - RESEARCH §Validation Architecture (Regla 6 regression row) + Pitfall 4 (frozen legacy block) + UI-SPEC §11 Regression guard
  </read_first>
  <action>
    Create `e2e/visual/regla6-regression.spec.ts`: with a workspace that has `ui_inbox_v2.enabled=true` and `ui_editorial_v3` absent/false, screenshot `/whatsapp` and assert it renders the LEGACY warm-cream editorial inbox (the live Somnio look), unchanged by this standalone. Two complementary checks:
    1. STATIC gate (fast, primary): assert the legacy `.theme-editorial` block in `src/app/globals.css` is byte-frozen — read the file, confirm the lines at/above 1011 are unchanged vs the committed baseline (e.g. compare a slice hash, or shell out to `git diff -U0 --exit-code` scoped to the legacy range and assert no hunk touches lines ≤1011). This is the deterministic Regla 6 guard.
    2. VISUAL smoke (secondary): screenshot legacy `/whatsapp` and confirm the inbox-layout still carries `.theme-editorial` (and NOT `.theme-editorial-v3`) — e.g. assert the rendered DOM has the legacy class on the inbox container and a warm-cream computed `--bg-app` (legacy `#fcf7f0`), distinct from the v3 white-paper value.
    The static gate is the must-pass; the visual smoke is best-effort confirmation.
  </action>
  <verify>
    <automated>test -f e2e/visual/regla6-regression.spec.ts && grep -q "theme-editorial" e2e/visual/regla6-regression.spec.ts && git diff -U0 --exit-code -- src/app/globals.css | head -1; echo "static-gate-check-defined"</automated>
  </verify>
  <acceptance_criteria>
    - `e2e/visual/regla6-regression.spec.ts` exists and references the legacy `theme-editorial` (NOT v3) live path
    - The spec includes a deterministic static gate proving the legacy globals.css block (lines ≤1011) is byte-frozen
    - The spec confirms the legacy `/whatsapp` inbox still uses `.theme-editorial` and the warm-cream `--bg-app` (distinct from v3 white-paper) when only ui_inbox_v2 is on
    - The v3 class does NOT appear on the legacy live render (isolation by class name)
  </acceptance_criteria>
  <done>Regla 6 regression guard exists: static byte-frozen gate + legacy-render visual smoke proving the live Conversaciones is untouched.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    The full editorial v3 reskin (3 screens, light + dark) under the per-workspace `ui_editorial_v3` flag, plus the automated fidelity harness (6 pixel-match cases ≥95%) and the Regla 6 regression guard. The executor has run `pnpm test:e2e e2e/visual/editorial-fidelity.spec.ts` and `pnpm test:e2e e2e/visual/regla6-regression.spec.ts` and captured diff PNG artifacts for any case under the gate.
  </what-built>
  <how-to-verify>
    1. Ensure dev server is up on http://localhost:3020 and a test/QA workspace has `ui_editorial_v3.enabled=true` (SQL in Plan 00 Task 2 comment).
    2. Visit each screen with the flag ON, in BOTH light and dark (toggle the theme switcher):
       - http://localhost:3020/whatsapp
       - http://localhost:3020/crm/contactos
       - http://localhost:3020/crm/pedidos
    3. Compare side-by-side with the canonical mocks (open the `handoff/ui_kits/.../*.html` files in a browser) and run the HANDOFF §5 / UI-SPEC §11 checklist:
       - Background white-paper neutral (NOT beige); content header bands align to the 84.6px switcher standard.
       - Tags use scale colors (mx-tag--*), NOT legacy hardcoded .tg.*.
       - Kanban: hairlines between stages, no boxes; loose cards; "Sin pedidos" in empty columns.
       - Chat bubbles in Helvetica Neue; order card renders as a card.
       - Thin scrollbars, no arrows; no improper horizontal scroll.
       - `.mx-display` renders at font-weight 800.
       - Dark mode charcoal-warm with persistent toggle; logo rule correct (the sidebar is deferred — verify the v3 dark logo RULE exists, sidebar chrome unchanged).
       - SIDEBAR renders UNCHANGED with the flag on (D-06 deferred — confirm no sidebar font/color change).
    4. Review any diff PNG artifacts the harness wrote for cases under 95%.
    5. Confirm Regla 6: a workspace with only `ui_inbox_v2` on still shows the legacy warm-cream Conversaciones, unchanged.
  </how-to-verify>
  <resume-signal>Type "approved" if all 6 cases pass the ≥95% gate, the checklist is satisfied, the sidebar is unchanged, and the legacy Conversaciones is byte-identical — or describe the failing screen/region so the relevant Wave 2 plan can be revised.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| test harness → DB | Fixture sets the flag on a TEST workspace only; never touches production workspace settings |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-editorial-04 | Tampering | Fidelity gate false-passing on naive full-page diff | mitigate | Region-scoped diff on stable chrome (RESEARCH A2) + human checkpoint reviewing diff PNGs against the HANDOFF §5 checklist |
| T-editorial-05 | Availability | Regla 6 — legacy Conversaciones regressed by this round | mitigate | Deterministic static byte-frozen gate on globals.css ≤1011 + legacy-render visual smoke + class-name isolation |
</threat_model>

<verification>
- `pnpm test:e2e e2e/visual/editorial-fidelity.spec.ts` — 6 cases ≥95% (D-10), dark cases prove the descendant selector (D-02)
- `pnpm test:e2e e2e/visual/regla6-regression.spec.ts` — legacy block byte-frozen + legacy render unchanged (D-05 / Regla 6)
- Human checkpoint: HANDOFF §5 / UI-SPEC §11 checklist satisfied + sidebar unchanged (D-06) + diff PNGs reviewed
</verification>

<success_criteria>
- All 3 screens × light/dark meet ≥95% pixel-match against the canonical mocks (D-10)
- Dark mode renders the charcoal-warm v3 palette (descendant selector verified — D-02)
- Legacy ui_inbox_v2-live Conversaciones byte-identical; legacy globals.css block frozen (Regla 6 / D-05)
- Operator sign-off on the HANDOFF §5 / UI-SPEC §11 checklist with sidebar unchanged
</success_criteria>

<output>
After completion, create `.planning/standalone/ui-redesign-editorial-core/04-SUMMARY.md`
</output>
