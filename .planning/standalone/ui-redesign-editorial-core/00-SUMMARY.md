---
phase: ui-redesign-editorial-core
plan: 00
subsystem: ui-theme-isolation
tags: [css, theme-isolation, feature-flag, dark-mode, tailwind-v4, reskin]
requires: []
provides:
  - ".theme-editorial-v3 scoped token + component CSS (light + descendant dark)"
  - "getIsEditorialV3Enabled per-workspace flag resolver (fail-closed)"
  - "isEditorialV3 wired on the dashboard <main> wrapper (sidebar excluded)"
  - "pixelmatch + pngjs devDependencies for the Wave 3 screenshot-diff harness"
affects:
  - "src/app/(dashboard)/layout.tsx (additive className gate on <main>)"
tech-stack:
  added: [pixelmatch@7.2.0, pngjs@7.0.0]
  patterns:
    - "Theme isolation by distinct scope class (.theme-editorial-v3) — legacy block byte-frozen"
    - "Descendant dark selector (.dark .theme-editorial-v3) for next-themes attribute=class"
    - "JSONB sub-key flag on workspaces.settings — zero migration (Regla 5)"
key-files:
  created:
    - src/lib/auth/editorial-v3.ts
    - src/lib/auth/__tests__/editorial-v3.test.ts
  modified:
    - src/app/globals.css
    - "src/app/(dashboard)/layout.tsx"
    - package.json
    - pnpm-lock.yaml
decisions:
  - "Applied .theme-editorial-v3 on the <main> wrapper (Pitfall 6 / D-06) to structurally exclude the deferred sidebar, instead of the shell root"
  - "Authored dark as descendant .dark .theme-editorial-v3 (D-02) — the mock's compound form never matches under next-themes attribute=class"
  - "Added mx-tag--success additively (color-mix over --semantic-success) for kanban confirmed-stage tags"
metrics:
  duration: ~25min
  completed: 2026-06-05
  tasks: 4
  files: 6
  commits: 5
---

# Phase ui-redesign-editorial-core Plan 00: Isolation Foundation Summary

Built the editorial-v3 reskin isolation foundation: a fully-scoped `.theme-editorial-v3` token + component CSS block (light + charcoal-warm dark) appended to globals.css without touching the production-live legacy `.theme-editorial` block, a fail-closed per-workspace flag resolver, the wired scope class on the dashboard `<main>` wrapper (sidebar excluded), and the two screenshot-diff devDependencies — a green field for the Wave 2 per-screen ports.

## What Was Built

1. **pixelmatch@7.2.0 + pngjs@7.0.0** installed via `pnpm add -D` (pnpm-lock.yaml updated; package-lock.json untouched — Pitfall 7 respected).
2. **`getIsEditorialV3Enabled(workspaceId)`** — a structural clone of `getIsInboxV2Enabled` reading `workspaces.settings.ui_editorial_v3.enabled`, fails closed to `false` on any error/null/missing/non-strict-true. Zero migration (Regla 5 — JSONB sub-key on the existing column). Covered by a 10-case Vitest suite (D-04).
3. **`.theme-editorial-v3` CSS block** (348 lines) appended after globals.css line 1011, before `@layer base`:
   - Light token scope (mock-winning: `--fs-display:44px`, `--primary:var(--ink-1)`, `color-scheme:light dark`, `--paper-grain:none` deferred).
   - `.mx-*` typography utilities (`.mx-display` weight **800**, not 700), rules/ornaments.
   - All 5 `mx-tag--*` variants (rubric/gold/indigo/verdigris/ink) + additive `mx-tag--success`, color-mix over tokens.
   - Chrome: btn/chip/tabs/search/icon-btn/pager/topbar/eye.
   - Contactos `table.dict`; Conversaciones inbox (3-col, conv row, thread, Helvetica-Neue bubbles, composer, ficha, ped-card); Pedidos kanban (246px hairline columns, loose cards, kempty, stage dots, pipes).
   - Descendant dark block `.dark .theme-editorial-v3` + logo rules (D-02).
4. **Layout wiring** — `isEditorialV3` resolved fail-closed and applied via `cn(..., isEditorialV3 && 'theme-editorial-v3')` on the `<main>` wrapper only; legacy `isDashboardV2 && 'theme-editorial'` on the shell root left intact (sidebar excluded — D-06).

## Key Decisions

- **`<main>` wrapper, not shell root** — structurally excludes the deferred sidebar (Pitfall 6 / D-06). The font `--font-*` vars on the shell root cascade into `<main>`, so v3 still resolves fonts (D-03, no font work).
- **Descendant dark selector** — next-themes is `attribute="class"` (puts `.dark` on `<html>`); the mock's compound form would never match here. Only the selector form deviates from the mock; palette values are verbatim (D-02).
- **`mx-tag--success` added additively** — color-mix over `--semantic-success`, consistent with the other 5 variants' recipe (UI-SPEC §7 kanban note).

## Deviations from Plan

### Comment rewording for the Regla-6 grep gate (not a behavior change)
The plan's automated gate is `! grep -q '.theme-editorial-v3.dark'`. My explanatory comments originally contained the literal compound string `.theme-editorial-v3.dark` (to document why NOT to use it). Because the gate's regex `.` matches any char, the comments would have tripped the gate. **Fix:** reworded the two comments to describe the compound form in prose ("scope class + dark on the SAME element") instead of writing the literal string. No CSS rule changed; the descendant-only dark contract is intact. Tracked as `[Rule 3 - blocking] grep-gate-safe comment wording`.

### No `typecheck` npm script exists
The plan's verify steps reference `pnpm typecheck`, but `package.json` has no such script (only `dev/build/lint/test/test:e2e`). Used `pnpm exec tsc --noEmit` instead. Tracked as `[Rule 3 - blocking] use tsc --noEmit`.

## Authentication Gates

None.

## Verification Results

- **D-04 (fail-closed flag):** `pnpm vitest run src/lib/auth/__tests__/editorial-v3.test.ts` — **10/10 pass**.
- **D-05 / Regla 6 (legacy block byte-frozen):** `git diff -U0` on globals.css across the plan shows a single hunk `@@ -1012,0 +1013,348 @@` — zero lines removed, insertion only after line 1012. Lines 1–1011 byte-identical.
- **D-02 (dark wiring):** `.dark .theme-editorial-v3` present; no literal compound `.theme-editorial-v3.dark` CSS rule (grep clean after comment reword).
- **CSS build:** `pnpm exec next build` — **"✓ Compiled successfully in 2.2min"**, exit 0, no `@theme`/CSS error. (Pre-existing `MISSING_MESSAGE: DataDeletion` i18n prerender warnings are unrelated and predate this plan.)
- **Typecheck:** `pnpm exec tsc --noEmit` — my changed files (globals.css/editorial-v3.ts/layout.tsx) are clean. 4 pre-existing errors in unrelated test files logged to `deferred-items.md` (out of scope).
- **Grep gates (all OK):** mx-display present + weight 800; fs-display 44px; primary=ink-1; all 5 tag variants; kcol 246px + first-child border clear; kempty; Helvetica Neue bubbles; descendant dark; no nested @theme; layout imports + main className gate + legacy class coexistence; inbox-layout.tsx unchanged.

## Known Stubs

None — this is the isolation foundation. The `.wm` logo rules are authored for correctness even though the sidebar is deferred (D-06); that is intentional and documented in the CSS comment, not a stub.

## Commits

- `0a55d2df` chore: instalar pixelmatch + pngjs via pnpm
- `9bb6359e` test: test fail-closed para getIsEditorialV3Enabled (RED)
- `736b120a` feat: resolver getIsEditorialV3Enabled (fail-closed) (GREEN)
- `f76c2fbd` feat: bloque .theme-editorial-v3 (light + dark descendant)
- `4e115a3a` feat: cablear flag editorial-v3 en el layout (sidebar excluido)

## Self-Check: PASSED

Created files verified present:
- FOUND: src/lib/auth/editorial-v3.ts
- FOUND: src/lib/auth/__tests__/editorial-v3.test.ts
- FOUND: src/app/globals.css (.theme-editorial-v3 block)
- FOUND: src/app/(dashboard)/layout.tsx (isEditorialV3 wiring)

Commits verified in git log:
- FOUND: 0a55d2df, 9bb6359e, 736b120a, f76c2fbd, 4e115a3a
