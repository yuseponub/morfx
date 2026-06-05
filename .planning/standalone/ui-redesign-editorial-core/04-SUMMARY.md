---
phase: ui-redesign-editorial-core
plan: 04
subsystem: testing
tags: [playwright, pixelmatch, pngjs, visual-regression, fidelity-gate, next-themes, regla6]

# Dependency graph
requires:
  - phase: 00
    provides: ".theme-editorial-v3 scope + .dark descendant block + ui_editorial_v3 flag resolver"
  - phase: 01
    provides: "Conversaciones (/whatsapp) ported under .theme-editorial-v3"
  - phase: 02
    provides: "CRM Contactos (/crm/contactos) ported under .theme-editorial-v3"
  - phase: 03
    provides: "CRM Pedidos (/crm/pedidos) ported under .theme-editorial-v3"
provides:
  - "Playwright + pixelmatch fidelity harness: 3 screens x light/dark (6 cases) gated >=95% (D-10)"
  - "Dark-palette descendant-selector smoke proving .dark .theme-editorial-v3 renders charcoal-warm --bg-app (D-02)"
  - "Deterministic Regla 6 regression guard: legacy .theme-editorial block (globals.css lines 1..1012) byte-frozen via pinned SHA-256 (D-05)"
  - "Isolated TEST-workspace fixture that flips ui_editorial_v3.enabled=true (never prod)"
affects: [ui-redesign-editorial-core verify-work, ui-redesign sidebar follow-up, future editorial module rounds]

# Tech tracking
tech-stack:
  added: ["@types/pngjs (devDep — pngjs had no type decls, broke tsc strict)"]
  patterns:
    - "Region-scoped pixel diff on stable chrome (RESEARCH A2) — gate layout/color tokens, not placeholder content text"
    - "next-themes system mode → emulateMedia({colorScheme}) drives .dark on <html> (no theme cookie)"
    - "Deterministic static gate = pinned SHA-256 of a frozen file slice (Regla 6 byte-freeze without a running server)"
    - "oklch lightness extraction for serialization-robust dark-palette assertion"

key-files:
  created:
    - "e2e/fixtures/editorial-v3.ts"
    - "e2e/visual/editorial-fidelity.spec.ts"
    - "e2e/visual/regla6-regression.spec.ts"
  modified:
    - "package.json (devDep @types/pngjs)"
    - "pnpm-lock.yaml"

key-decisions:
  - "Legacy byte-freeze boundary is lines 1..1012 (line 1013 = first .theme-editorial-v3 comment header), pinned SHA-256 b0dfd8c1663c..."
  - "Fidelity gate assessed on per-screen stable-chrome clip rectangles (top band), not naive full-page content diff (RESEARCH A2 / Open Q2)"
  - "Dark proven via descendant selector + oklch lightness (light L~0.996 vs dark L~0.215), serialization-robust"

patterns-established:
  - "Pixelmatch fidelity harness with diff-PNG artifacts written to playwright-report/editorial-fidelity/ on sub-gate cases for the human checkpoint"
  - "Static-gate-first Regla 6 guard (pure node, no server) + best-effort DB/auth visual smoke that test.skip()s when env absent"

requirements-completed: [D-10, D-02, D-05]

# Metrics
duration: 20min
completed: 2026-06-05
---

# ui-redesign-editorial-core Plan 04: Headless Fidelity Harness + Regla 6 Guard Summary

**Playwright + pixelmatch harness (6 cases, region-scoped >=95% gate, dark descendant-selector smoke) plus a deterministic SHA-256 byte-freeze guard on the live legacy .theme-editorial block — the gate that turns "looks ported" into "verified", awaiting the operator's pixel-run + checklist sign-off.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-06-05T20:15:16Z
- **Completed:** 2026-06-05T20:35:19Z
- **Tasks:** 2 of 2 autonomous tasks complete; Task 3 is the blocking human-verify CHECKPOINT (awaiting operator)
- **Files modified:** 5 (3 created, 2 manifest)

## Accomplishments

- **Fidelity harness (D-10):** `e2e/visual/editorial-fidelity.spec.ts` produces a per-screen pixel-match ratio for all 3 screens (`/whatsapp`, `/crm/contactos`, `/crm/pedidos`) x {light, dark} = 6 cases, gated `>= 0.95`. Mock data != real data, so the gate is assessed on per-screen **stable-chrome clip rectangles** (top header/tab/column band) per RESEARCH A2, not a naive full-page content diff. Sub-gate cases write a diff PNG to `playwright-report/editorial-fidelity/<screen>-<mode>.diff.png` for the human checkpoint.
- **Dark-palette proof (D-02):** a dedicated smoke reads the resolved `--bg-app` off the `.theme-editorial-v3` container in both schemes and asserts the dark oklch lightness is `< 0.4` (charcoal ~0.215) vs near-white light (~0.996), and that the two differ. A broken **compound** `.theme-editorial-v3.dark` selector (the mock's form, which never matches under next-themes `attribute="class"`) would leave the light value in place and **fail this loudly**.
- **Test fixture:** `e2e/fixtures/editorial-v3.ts` flips `workspaces.settings.ui_editorial_v3.enabled=true` on the ISOLATED `TEST_WORKSPACE_ID` only (service-role path, restored to false in `afterAll`), reuses `authenticateAsTestUser`, and exposes `setColorScheme` (emulateMedia, next-themes system mode) + `readVar`/`oklchLightness`.
- **Regla 6 guard (D-05):** `e2e/visual/regla6-regression.spec.ts` pins a SHA-256 of the legacy `.theme-editorial` slice (globals.css lines 1..1012) and fails on any edit — a deterministic, server-less protection for the LIVE Somnio inbox. Plus a second static gate (legacy keeps `#fcf7f0`, contains no `theme-editorial-v3`) and a best-effort visual smoke (ui_inbox_v2-only `/whatsapp` renders `.theme-editorial` warm-cream, not v3) that `test.skip()`s when DB/auth env is absent.

## Task Commits

1. **Task 1: fixture + pixelmatch fidelity spec** - `5feffca4` (test) — also added devDep `@types/pngjs` (Rule 3)
2. **Task 2: Regla 6 byte-frozen regression guard** - `88299148` (test)
3. **Task 3: human-verify checkpoint** - BLOCKING, awaiting operator (no commit)

**Plan metadata:** (this SUMMARY commit)

## Files Created/Modified

- `e2e/fixtures/editorial-v3.ts` - flag-ON TEST-workspace helper + setColorScheme + readVar/oklchLightness + Regla 6 inbox-v2-only provisioning + SCREENS table
- `e2e/visual/editorial-fidelity.spec.ts` - 6-case pixelmatch fidelity gate (region-scoped >=95%) + dark descendant-selector smoke + diff-PNG artifacts
- `e2e/visual/regla6-regression.spec.ts` - SHA-256 static byte-freeze gate (lines 1..1012) + warm-cream/isolation static gate + visual smoke
- `package.json` / `pnpm-lock.yaml` - devDep `@types/pngjs@^6.0.5`

## How To Run (operator runbook)

**Prerequisites:**
1. A real `.env.test` (copy `.env.test.example`) with at minimum:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `TEST_WORKSPACE_ID` (an **isolated** QA/test workspace — NEVER a production workspace)
   - `TEST_USER_EMAIL`, `TEST_USER_PASSWORD` (a user that is a member of `TEST_WORKSPACE_ID`)
2. Dev server: `pnpm dev` (port 3020). Playwright's `webServer` will also auto-start it (note: config `command` is `npm run dev` — repo is pnpm-only, so prefer starting `pnpm dev` yourself and let `reuseExistingServer` attach).

**Commands:**
```bash
# Fidelity gate (6 cases >=95%, D-10 + dark D-02). The fixture flips the v3 flag
# on TEST_WORKSPACE_ID for the run and restores it to false afterwards.
pnpm exec playwright test e2e/visual/editorial-fidelity.spec.ts

# Regla 6 regression. The two STATIC GATES run with NO server/DB; the VISUAL
# SMOKE auto-skips if the DB/auth env is absent.
pnpm exec playwright test e2e/visual/regla6-regression.spec.ts
```

Sub-gate diff PNGs land in `playwright-report/editorial-fidelity/`. The HTML report is in `playwright-report/`.

## Decisions Made

- **Byte-freeze boundary = lines 1..1012.** The plan text says "<=1011" loosely; the real boundary is line 1013 (the first `.theme-editorial-v3` comment header). Pinned the LF-normalized SHA-256 `b0dfd8c1663c4b9f5e029b3f4485cb54c048c85377b75c7648cd4ff2acae5875` and assert line 1013 still starts with `/* =` so a boundary shift is also caught.
- **Stable-chrome clip rectangles** chosen per screen (conversaciones top 120px; contactos/pedidos top 200px) — tuned at 1440x900. The executor/operator may widen/narrow these clips if a case false-fails on placeholder content; the gate metric is layout/color fidelity, not text.
- **emulateMedia, not a theme cookie:** next-themes is `defaultTheme="system" + enableSystem` (src/app/layout.tsx:34-36), so emulating the OS color-scheme flips `.dark` on `<html>` — exactly what the descendant selector needs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added devDependency `@types/pngjs`**
- **Found during:** Task 1 (fidelity spec typecheck)
- **Issue:** `pngjs@7` ships no type declarations → `tsc --noEmit` strict raised TS7016 (a NEW error beyond the 4 baseline), blocking the harness from typechecking.
- **Fix:** `pnpm add -D @types/pngjs` (pnpm-only per Pitfall 7; never npm). pixelmatch already ships its own `.d.ts`.
- **Files modified:** package.json, pnpm-lock.yaml
- **Verification:** `pnpm exec tsc --noEmit` back to exactly 4 pre-existing baseline errors; zero in the new files.
- **Committed in:** `5feffca4` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for the harness to typecheck under strict TS. No scope creep.

## Issues Encountered

- **Full harness run NOT feasible in this WSL session.** No real `.env.test` exists (only `.env.test.example`), so `TEST_WORKSPACE_ID` / `TEST_USER_*` are unavailable, and a real run would also require flipping the v3 flag on a live test workspace + an authed Supabase session — not safe/feasible to provision headlessly here, and the plan + CLAUDE.md forbid enabling v3 on any production workspace. **What WAS run here:** typecheck clean (4 baseline, 0 new); both specs resolve (`--list`) into the expected 7 + 3 tests; the deterministic Regla 6 static gate proven passing via a node mirror (hash matches baseline, legacy keeps `#fcf7f0`, legacy has no `theme-editorial-v3`). The ≥95% pixel verification + diff-PNG review is therefore the operator CHECKPOINT (Task 3).

## User Setup Required

To run the pixel gate the operator must provide a real `.env.test` with an **isolated** `TEST_WORKSPACE_ID` + a member `TEST_USER_EMAIL`/`TEST_USER_PASSWORD`, then run the two commands above. Do NOT enable `ui_editorial_v3` on any production workspace — the fixture seeds the test workspace only and restores the flag to false.

## Next Phase Readiness

- Harness + guard are committed, typecheck-clean, and runnable. Wave 1+2 ported all 3 screens behind the default-OFF flag.
- **Blocker:** Task 3 human-verify checkpoint is OPEN — the operator must run the pixel gate, review any sub-gate diff PNGs, and confirm the HANDOFF §5 / UI-SPEC §11 checklist (incl. sidebar unchanged D-06, legacy Conversaciones byte-identical) before `/gsd-verify-work`.

## Self-Check: PASSED

- FOUND: e2e/fixtures/editorial-v3.ts
- FOUND: e2e/visual/editorial-fidelity.spec.ts
- FOUND: e2e/visual/regla6-regression.spec.ts
- FOUND: .planning/standalone/ui-redesign-editorial-core/04-SUMMARY.md
- FOUND commit: 5feffca4 (Task 1)
- FOUND commit: 88299148 (Task 2)

---
*Phase: ui-redesign-editorial-core*
*Plan: 04*
*Completed (autonomous tasks): 2026-06-05 — human-verify checkpoint OPEN*
