---
phase: ui-redesign-editorial-shell
plan: 01
subsystem: ui-chrome
tags: [sidebar, editorial-v3, css-scope, regla-6, flag-gated]
requires:
  - "00 (WAVE0-DECISIONS — precedencia v3>v2, Opción B scope)"
  - "ui-redesign-editorial-core 00 (.theme-editorial-v3 block + getIsEditorialV3Enabled)"
provides:
  - "Sidebar editorial v3 renderizable bajo ui_editorial_v3 (branch if (v3), scope Opción B en el <aside>)"
  - "Reglas CSS .theme-editorial-v3 .sb/.brand/.wm/.sub/nav.sb-nav (re-autorizadas, APPEND)"
  - "Cableado v3={isEditorialV3} en (dashboard)/layout.tsx sin tocar <main>"
affects:
  - "src/components/layout/sidebar.tsx (branch nuevo, v2/legacy byte-frozen)"
  - "src/app/(dashboard)/layout.tsx (1 línea aditiva)"
  - "src/app/globals.css (APPEND post línea 1373)"
tech-stack:
  added: []
  patterns:
    - "Coexistencia por branch gated + early-return (espeja Sidebar.v2 e inbox v2/v3)"
    - "Scope CSS Opción B: la clase theme-editorial-v3 vive en el <aside> del branch v3 (no en root ni <main> extra)"
    - "Dark via descendant .dark .theme-editorial-v3 (cubre el <aside> por cascade, sin reglas dark nuevas)"
key-files:
  created:
    - ".planning/standalone/ui-redesign-editorial-shell/01-SUMMARY.md"
  modified:
    - "src/components/layout/sidebar.tsx"
    - "src/app/(dashboard)/layout.tsx"
    - "src/app/globals.css"
decisions:
  - "D-02: branch if (v3) NUEVO clonando la anatomía del v2 verbatim, coexiste byte-frozen con v2/legacy"
  - "D-03 (Opción B): el <aside> del branch v3 lleva theme-editorial-v3 — cero toque al <main> vivo, cero blast-radius"
  - "Precedencia: if (v3) ANTES de if (v2) ANTES del legacy (lockeada Wave 0)"
  - "D-07: SIN ThemeToggle en el sidebar v3 (el toggle vive en los topbars — Plan 02)"
  - "Wordmark tipográfico morf·x (NO <img>) igual que el v2"
  - ".theme-editorial-v3 .sb con background-image:none — anti grain-doble del scope"
metrics:
  duration: "~20 min"
  completed: "2026-06-06"
  tasks: 3
  commits: 3
  files: 3
---

# Phase ui-redesign-editorial-shell Plan 01: Sidebar editorial v3 (branch + scope Opción B + cableado) Summary

Branch `if (v3)` agregado a `sidebar.tsx` clonando verbatim la anatomía del branch v2 "Propuesta B", con la única diferencia estructural de que el `<aside>` lleva además `theme-editorial-v3` (Opción B / D-03). Cableado `v3={isEditorialV3}` en `(dashboard)/layout.tsx` (una línea) sin tocar el `<main>`. APPEND de las reglas `.theme-editorial-v3 .sb/.brand/.wm/.sub/nav.sb-nav` a `globals.css`. Con `ui_editorial_v3` ON el dashboard ya renderiza el sidebar editorial v3 bajo su propio scope; v2 y legacy quedan byte-frozen (Regla 6).

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Prop v3 + branch if (v3) clonando v2 (D-02/D-03/D-07) | `0cc33fd6` | src/components/layout/sidebar.tsx |
| 2 | Cablear v3={isEditorialV3} en layout.tsx sin tocar <main> (D-03) | `10e45e06` | src/app/(dashboard)/layout.tsx |
| 3 | APPEND reglas CSS sidebar v3 a globals.css (D-02/D-03) | `b2dbe828` | src/app/globals.css |

## What Was Built

- **Task 1 — `sidebar.tsx`:** `SidebarProps` gana `v3?: boolean` (JSDoc Opción B/D-07); firma `Sidebar({ ..., v2 = false, v3 = false })`. Branch `if (v3)` insertado en la línea ~235 (ANTES de `if (v2)` en ~418), clonando verbatim el v2: `filterItem` + `workspaceSubline` locales, `<aside className="sb theme-editorial-v3 hidden md:flex w-64 shrink-0">`, `<TooltipProvider>` + `.brand`/`.wm` (`morf<b>·</b>x` tipográfico, NO `<img>`)/`.sub`, `WorkspaceSwitcher`, `GlobalSearch`, `<nav className="sb-nav">` mapeando `navCategoriesV2` (4 categorías) con badges inline rubric-2/mono, y footer de usuario (avatar inicial + email split + `form action={logout}` con `LogOut`). **SIN ThemeToggle** (D-07).
- **Task 2 — `layout.tsx`:** una sola línea `v3={isEditorialV3}` añadida al `<Sidebar>` tras `v2={isDashboardV2}`. El `<main>` (`isEditorialV3 && 'theme-editorial-v3'`) y el `<div className="flex h-screen">` root quedan EXACTAMENTE igual (Opción B — el scope lo pone el `<aside>`, no el layout).
- **Task 3 — `globals.css`:** 16 líneas (comentario + 12 reglas) APPEND tras `.dark .theme-editorial-v3 .wm img{...}` (línea 1373) y antes de `@layer base {`. `.theme-editorial-v3 .sb { background:var(--paper-2); background-image:none; ... }` re-autoriza el sidebar plano (anti grain-doble); `.brand/.wm/.wm b/.sub/nav.sb-nav/ul/li a/:hover/.active/.cat` re-autorizadas verbatim bajo el scope v3. Dark cubierto por el bloque `.dark .theme-editorial-v3` global vía cascade — sin reglas dark nuevas, sin selector compound.

## Verification Results

- `pnpm exec tsc --noEmit`: 0 errores en los 3 archivos tocados. (4 errores pre-existentes test-only fuera de scope — ver abajo.)
- grep gates Task 1: `if (v3)`=1, `sb theme-editorial-v3`=1, orden v3(235)<v2(418), ThemeToggle en branch v3=0, `<Image`/`<img` en branch v3=0.
- grep gates Task 2: `v3={isEditorialV3}`=1 línea aditiva; root sin `theme-editorial-v3`=0; `<main>` intacto.
- grep gates Task 3: key rule `.theme-editorial-v3 .sb { background:var(--paper-2); background-image:none;`=1; `.active`=1; líneas `+` con selector legacy sin guion=0; compound dark=0; todas las líneas `+.` empiezan por `.theme-editorial-v3`.

## Regla 6 (byte-frozen) — VERIFIED

- `git diff 0cc33fd6^..HEAD --name-only` = SOLO 3 archivos (sidebar.tsx, layout.tsx, globals.css).
- `sidebar.tsx` removals = 1 línea: la firma `export function Sidebar(... v2 = false ...)` reemplazada por la versión con `v3 = false` (autorizado — adición de prop). El branch `if (v2)` (Propuesta B) y el return legacy quedan SIN cambios.
- `globals.css` removals = 0 (puro APPEND; legacy `.theme-editorial` 546-616 + bloque 1..1012 intactos).
- `layout.tsx` removals = 0 (una sola adición; `<main>` y root intactos).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reword del comentario CSS para no contener el selector legacy literal**
- **Found during:** Task 3
- **Issue:** El comentario del bloque APPEND contenía la cadena literal `.theme-editorial .sb/...` (sin guion), lo que hacía que el gate `git diff ... | grep '\.theme-editorial[^-]'` reportara un falso positivo (era texto de comentario, no una regla CSS legacy tocada).
- **Fix:** Reescrito el comentario a "Las reglas legacy del scope sin guion (546-616)" — sin la cadena literal del selector. Cero reglas CSS cambiadas. Mismo patrón que el core (00-SUMMARY del editorial-core).
- **Files modified:** src/app/globals.css
- **Commit:** `b2dbe828`

**2. [Rule 3 - Tooling] `pnpm exec tsc --noEmit` en vez de `pnpm typecheck`**
- **Found during:** Task 1
- **Issue:** El `<verify>` del plan invoca `pnpm typecheck`, pero el repo NO tiene script `typecheck` (constraint del entorno).
- **Fix:** Usado `pnpm exec tsc --noEmit` (equivalente). Documentado en entorno y plan anterior.

## Deferred Issues

4 errores `tsc` pre-existentes test-only, fuera de scope (ya documentados en planes 41-xx / editorial-core):
- `src/lib/domain/__tests__/conversations.test.ts:16` — `eqMock` implicit-any (TS7022/TS7024).
- `src/lib/instagram/__tests__/webhook-handler.test.ts:87` — `@/lib/inngest/client` resolution quirk (TS2307).
- `src/lib/messenger/__tests__/webhook-handler.test.ts:83` — mismo quirk (TS2307).

Ninguno toca archivos de este plan. No se re-corrió el build buscando más issues (límite de scope).

## Known Stubs

Ninguno. El branch v3 reusa componentes reales (WorkspaceSwitcher, GlobalSearch, navCategoriesV2, logout) — sin datos mockeados ni placeholders.

## Notes

- Fidelidad visual del sidebar v3 (light + dark) se verifica en Wave 3 (Plan 04 dark audit) + QA visual del usuario. Este plan entrega el sidebar renderizable + Regla 6; la confirmación visual es downstream.
- NOT pushed (el push ocurre en Plan 05 — Regla 1/5).
- Plan 03 también edita `(dashboard)/layout.tsx` (mount mobile-nav v3-only) y `depends_on` Plan 01 — se serializan.

## Self-Check: PASSED
