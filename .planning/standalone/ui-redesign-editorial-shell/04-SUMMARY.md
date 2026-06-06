---
phase: ui-redesign-editorial-shell
plan: 04
subsystem: ui
tags: [css, dark-mode, oklch, theme, editorial-v3, design-tokens]

# Dependency graph
requires:
  - phase: ui-redesign-editorial-shell Plan 01
    provides: sidebar v3 (<aside class="sb theme-editorial-v3">) cubierto por cascade dark
  - phase: ui-redesign-editorial-shell Plan 03
    provides: mobile-nav v3 (<SheetContent class="theme-editorial-v3 sb">) cubierto por cascade dark
  - phase: ui-redesign-editorial-core
    provides: bloque base .dark .theme-editorial-v3 (byte-idéntico al mock .theme-editorial.dark)
provides:
  - Auditoría dark token-por-token (D-06) de las 5 superficies v3 documentada en DARK-AUDIT.md
  - Override dark mínimo de --accent-indigo (legibilidad de tag sobre charcoal-warm)
  - Confirmación grain OFF en dark + base byte-idéntica al mock tras Plans 01/03
affects: [ui-redesign-editorial-shell Plan 05, futuros siblings editorial v3 dark]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Auditoría dark: confirmar base byte-idéntica al mock + auditar SOLO los acentos no-overrideados (delta real); override descendant-only dentro del bloque .dark .theme-editorial-v3"
    - "No sobre-ingenierizar (A4 RESEARCH): override SOLO donde el contraste/legibilidad falla; los demás acentos quedan OK heredando light por scope"

key-files:
  created:
    - .planning/standalone/ui-redesign-editorial-shell/DARK-AUDIT.md
  modified:
    - src/app/globals.css

key-decisions:
  - "Override dark de --accent-indigo (oklch(0.42→0.62) hue 260): el indigo light es demasiado oscuro como tinta de tag sobre charcoal-warm (paper-0=0.255); se aclara manteniendo hue — mismo principio con que el mock aclara --rubric en dark"
  - "6 acentos/grupos OK sin cambio (gold/verdigris/semantic-success/semantic-warning/paper-shadow/shadows): legibles o ausencia aceptable by-design en dark; no sobre-ingenierizar"
  - "Sombras de tarjetas ausentes-aceptables en dark: la separación de superficies va por los steps --paper-0..4 + --border, no por sombra (el mock no declara sombras dark = by-design)"

patterns-established:
  - "Dark audit pattern: confirmar base vs mock + auditar acentos no-overrideados + override descendant-only mínimo + grain OFF + Regla 6 estática (compound=0, legacy frozen)"

requirements-completed: [D-06]

# Metrics
duration: ~20min (Task 1 auto) + checkpoint humano (Task 2)
completed: 2026-06-06
---

# Phase ui-redesign-editorial-shell Plan 04: Auditoría Dark D-06 Summary

**Auditoría dark token-por-token de las 5 superficies v3 (3 pantallas + sidebar + mobile-nav): base confirmada byte-idéntica al mock, 1 override mínimo de --accent-indigo para legibilidad sobre charcoal, grain OFF — verificada visualmente por el usuario en light+dark.**

## Performance

- **Duration:** ~20 min (Task 1) + checkpoint humano (Task 2)
- **Completed:** 2026-06-06
- **Tasks:** 2 (1 auto + 1 checkpoint human-verify aprobado)
- **Files modified:** 2 (globals.css + DARK-AUDIT.md)

## Accomplishments
- **Auditoría dark D-06 completa** documentada en `DARK-AUDIT.md` (101 líneas): cada token base con veredicto "match con mock ✅", cada acento no-overrideado con veredicto "OK sin cambio" / "override agregado".
- **Bloque base dark confirmado byte-idéntico al mock** `.theme-editorial.dark` tras los cambios de Plans 01 (sidebar APPEND) y 03 (mobile-nav, 0 APPEND CSS) — no se reinventó nada.
- **Override dark mínimo de --accent-indigo** (`oklch(0.42 0.045 260)` → `oklch(0.62 0.07 260)`): el indigo light es demasiado oscuro como tinta de tag sobre el charcoal-warm; se aclara manteniendo hue 260.
- **Grain OFF confirmado** en las 5 superficies (`--paper-grain:none;--paper-fibers:none;background-image:none`).
- **Verificación visual humana (Task 2 — checkpoint blocking) APROBADA**: las 5 superficies (Conversaciones, Contactos, Pedidos, sidebar v3, mobile-nav v3) fieles al mock en light+dark, sin regresión.

## Task Commits

1. **Task 1: Auditar tokens dark de las 5 superficies + acentos no-overrideados; override SOLO donde falle (D-06)** - `c0bbd7f4` (feat)
2. **Task 2: Checkpoint — verificación visual dark de las 5 superficies** - APROBADO por el usuario ("approved") — sin commit (gate humano)

**Plan metadata:** (este commit docs)

## Files Created/Modified
- `src/app/globals.css` - +6 líneas dentro del bloque `.dark .theme-editorial-v3 { ... }` (~1363-1378): override `--accent-indigo:oklch(0.62 0.07 260)` + comentario explicativo D-06. Bloque base dark, bloque light y legacy intactos.
- `.planning/standalone/ui-redesign-editorial-shell/DARK-AUDIT.md` - Checklist de la auditoría dark (101 líneas): tabla token-por-token vs mock, auditoría de acentos no-overrideados, confirmación grain OFF, resultado por superficie, verificación estática Regla 6.

## Auditoría — Resultado

**Bloque base dark** (`.dark .theme-editorial-v3` ~1363-1378): CONFIRMADO byte-idéntico al mock `.theme-editorial.dark` (--bg-app/--paper-0..4/--ink-1..5/--border/--rubric-1..2/--paper-grain/--paper-fibers/background-image/.wm img → TODOS match). Plans 01/03 NO tocaron el bloque dark (solo APPEND de reglas LIGHT del sidebar que heredan estos tokens por cascade).

**Acentos no-overrideados** (heredan light por scope): 6 OK sin cambio · 1 override agregado.
- `--accent-gold` → OK sin cambio (L=0.68 + mix con ink-1 claro lo hace legible).
- `--accent-verdigris` → OK sin cambio (L=0.52, marginal pero legible; no sobre-ingenierizar).
- **`--accent-indigo` → override agregado: `oklch(0.62 0.07 260)`** (L=0.42 demasiado oscuro como tinta sobre charcoal).
- `--semantic-success` → OK sin cambio (mix con ink-1 claro lo eleva).
- `--semantic-warning` → OK sin cambio (L=0.58 + croma alto).
- `--paper-shadow` → OK sin cambio (sin uso visual relevante en dark).
- `--shadow-card`/`--shadow-page`/`--shadow-raised`/`--shadow-hair` → OK sin cambio (sombras ausentes-aceptables; separación por --paper/--border, by-design del mock).

**Grain:** OFF en dark en las 5 superficies.

## Verificación Regla 6 (estática)
- `grep -n 'theme-editorial-v3\.dark' src/app/globals.css` → **VACÍO** (descendant-only, sin compound — Pitfall 3).
- `git diff c0bbd7f4^..c0bbd7f4 -- src/app/globals.css | grep '^+' | grep -E '\.theme-editorial[^-]'` → **VACÍO** (legacy frozen).
- El único cambio en globals.css es el override `--accent-indigo` (+comentario) **dentro** del bloque `.dark .theme-editorial-v3 { ... }` existente — custom property, no selector nuevo. Bloque light `.theme-editorial-v3` (1031+) intacto.
- `--paper-grain:none;--paper-fibers:none;background-image:none` preservado.
- Solo 2 archivos tocados por `c0bbd7f4` (globals.css + DARK-AUDIT.md).
- `pnpm exec tsc --noEmit` → 0 errores nuevos (cambio CSS puro).

## Decisions Made
- Override dark mínimo SOLO para `--accent-indigo` (legibilidad como tinta de tag sobre charcoal). Los demás 6 acentos/grupos quedan OK heredando light — no sobre-ingenierizar (A4 RESEARCH).
- Sombras dark ausentes = aceptable by-design (el mock no las declara; la separación va por --paper/--border).

## Deviations from Plan

**1. [Rule 3 - Blocking] `pnpm exec tsc --noEmit` en vez de `pnpm typecheck`**
- **Found during:** Task 1 (gate `<automated>` del plan referencia `pnpm typecheck`)
- **Issue:** El repo no tiene script `typecheck` en package.json (mismo patrón que Plans 00/01/02/03 de este standalone)
- **Fix:** Se corrió `pnpm exec tsc --noEmit` (typecheck directo) — 0 errores nuevos en archivos tocados
- **Files modified:** ninguno (solo el comando de verificación)
- **Committed in:** N/A (deviation de proceso, sin user action)

---

**Total deviations:** 1 auto-fixed (1 blocking de proceso)
**Impact on plan:** Sin scope creep. El cambio CSS es mínimo y descendant-only; Regla 6 verificada estática + visualmente.

## Issues Encountered
None - el bloque base ya matcheaba el mock (RESEARCH lo había confirmado); el delta real fue auditar los acentos y aplicar 1 override.

## User Setup Required
None - no requiere configuración de servicio externo. El tema editorial v3 se activa per-workspace via `ui_editorial_v3.enabled=true` (SQL D-08), no en este plan.

## Next Phase Readiness
- **Wave 4 = Plan 05** (Regla 6 final verify + push) — listo para ejecutar. Plan 05 hace el push de TODO el trabajo Waves 0-4 (NOT pushed aún por diseño).
- Dark v3 auditado y aprobado visualmente; sin overrides pendientes.

## Self-Check: PASSED
- `src/app/globals.css` → FOUND (override --accent-indigo línea 1373 dentro del bloque dark)
- `.planning/standalone/ui-redesign-editorial-shell/DARK-AUDIT.md` → FOUND (101 líneas)
- Commit `c0bbd7f4` → FOUND (git log)
- Gates Regla 6: compound dark = VACÍO ✅; legacy frozen = VACÍO ✅; grain OFF preservado ✅

---
*Phase: ui-redesign-editorial-shell*
*Completed: 2026-06-06*
