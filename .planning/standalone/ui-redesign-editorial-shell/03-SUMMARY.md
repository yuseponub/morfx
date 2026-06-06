---
phase: ui-redesign-editorial-shell
plan: 03
subsystem: ui-chrome
tags: [mobile-nav, editorial-v3, css-scope, regla-6, flag-gated, sheet]
requires:
  - "00 (WAVE0-DECISIONS — D-05/D-05b mount sites + threading prop v3)"
  - "01 (sidebar v3 + .theme-editorial-v3 .sb/.brand/.wm/.sub/nav.sb-nav CSS + v3={isEditorialV3} en layout.tsx)"
provides:
  - "MobileNav con prop v3?: boolean (default false) + branch editorial renderizable"
  - "Mount v3-only md:hidden de <MobileNav v3 /> en (dashboard)/layout.tsx (D-05b) — reskin alcanzable"
affects:
  - "src/components/layout/mobile-nav.tsx (prop + branch nuevo, path no-v3 byte-frozen)"
  - "src/app/(dashboard)/layout.tsx (import + bloque mount aditivo)"
tech-stack:
  added: []
  patterns:
    - "Coexistencia por branch gated + early-return (espeja Sidebar.v3 e inbox v2/v3)"
    - "Scope CSS Opción B: la clase theme-editorial-v3 vive en el <SheetContent> del branch v3"
    - "Reuso total de las clases del sidebar v3 (.sb/.brand/.wm/.sb-nav/.cat/li a.active) — sin CSS nuevo"
    - "Mount v3-only gated isEditorialV3 + md:hidden + wrapper fixed top-left para alcanzar el trigger"
key-files:
  created:
    - ".planning/standalone/ui-redesign-editorial-shell/03-SUMMARY.md"
  modified:
    - "src/components/layout/mobile-nav.tsx"
    - "src/app/(dashboard)/layout.tsx"
decisions:
  - "D-05: prop v3?: boolean default false en MobileNav; branch if (v3) ANTES del return legacy (byte-frozen)"
  - "D-05b: mount NUEVO md:hidden v3-only en (dashboard)/layout.tsx gated isEditorialV3 — reskin alcanzable, no dead-code"
  - "SheetContent del branch v3 lleva theme-editorial-v3 sb (Opción B — tokens resuelven; fondo plano editorial)"
  - "Reuso TOTAL de clases del sidebar v3 → Task 3 SIN APPEND (globals.css sin cambios en este plan)"
  - "Header de marketing (header.tsx) NO recibe v3 = byte-frozen; el dashboard estrena el primer mount de MobileNav"
  - "Wrapper fixed top-left z-50 (en vez de un header bar nuevo) — el Sheet provee su propio trigger; mínimo, sin chrome shadcn"
metrics:
  duration: "~15 min"
  completed: "2026-06-06"
  tasks: 3
  commits: 2
  files: 2
---

# Phase ui-redesign-editorial-shell Plan 03: Mobile-nav editorial v3 + mount D-05b Summary

`MobileNav` gana una prop `v3?: boolean` (default `false`) con un branch `if (v3)` que retorna un `<Sheet>` editorial cuyo `<SheetContent className="theme-editorial-v3 sb w-64 p-0">` reusa verbatim el lenguaje visual del sidebar v3 (wordmark tipográfico `morf·x`, nav `.sb-nav`/`.cat`/`li a.active`). El path no-v3 queda byte-frozen por early-return. El reskin se hace ALCANZABLE con un mount NUEVO `md:hidden` v3-only en `(dashboard)/layout.tsx` gated por `isEditorialV3` (D-05b) — antes el dashboard no montaba ningún mobile-nav en mobile. Para usuarios no-v3 el dashboard sigue exactamente igual que hoy (sin mobile-nav) y el componente renderiza byte-idéntico al actual (Regla 6). El `<MobileNav />` del header de marketing no recibe `v3` = byte-frozen. Task 3 (CSS) resultó SIN APPEND: el branch v3 reusa exclusivamente clases ya autorizadas en Plan 01, así que `globals.css` queda sin cambios en este plan.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Prop v3 + branch if (v3) reskin editorial en mobile-nav.tsx (D-05) | `ad544662` | src/components/layout/mobile-nav.tsx |
| 2 | Mount v3-only md:hidden de MobileNav en (dashboard)/layout.tsx (D-05b) | `24f19a61` | src/app/(dashboard)/layout.tsx |
| 3 | APPEND CSS mobile-nav v3 (condicional) | sin commit — sin APPEND necesario | (ninguno) |

## What Was Built

- **Task 1 — `mobile-nav.tsx`:** Firma `export function MobileNav({ v3 = false }: { v3?: boolean } = {})` con JSDoc (flag `ui_editorial_v3`, aditiva, default false byte-frozen; header de marketing sin `v3` → render intacto). Branch `if (v3)` insertado ANTES del return legacy: `<Sheet open onOpenChange>` con `<SheetTrigger asChild>` (botón Menu `md:hidden` + `<span className="sr-only">` conservado) y `<SheetContent side="left" className="theme-editorial-v3 sb w-64 p-0">`. Header: `<SheetHeader className="brand">` + `<SheetTitle className="wm" asChild><div>morf<b>·</b>x</div></SheetTitle>` (wordmark tipográfico, NO `<Image>` legacy; a11y preservada vía SheetTitle). Nav: `<nav className="sb-nav">` con `<div className="cat">Navegacion</div>` + `<ul>` mapeando el `navItems` plano local, cada `<Link className={isActive ? 'active' : ''} onClick={() => setOpen(false)}>` con icono `width/height={16}`. El `return` no-v3 quedó BYTE-FROZEN (único removal en el diff = la línea de firma, reemplazada por la versión con prop).
- **Task 2 — `(dashboard)/layout.tsx`:** Import `import { MobileNav } from '@/components/layout/mobile-nav'`. Bloque `{isEditorialV3 && (<div className="md:hidden fixed top-3 left-3 z-50"><MobileNav v3 /></div>)}` como PRIMER hijo del `<div className="flex h-screen">` (antes del `<Sidebar>`). Se usó un **wrapper `fixed top-3 left-3 z-50`** (no un header bar nuevo): el `<Sheet>` provee su propio trigger (botón Menu), así que el wrapper solo lo posiciona arriba-izquierda en mobile, alcanzable sobre el contenido y sin consumir ancho del flex row. El `<main>` (con `isEditorialV3 && 'theme-editorial-v3'`) y la prop `v3={isEditorialV3}` del `<Sidebar>` (Plan 01) quedaron SIN cambios; `header.tsx` no se tocó.
- **Task 3 — `globals.css`:** SIN APPEND. El branch v3 del mobile-nav reusa EXCLUSIVAMENTE clases ya autorizadas en Plan 01 (`.theme-editorial-v3 .sb`, `.brand`, `.wm`, `.wm b`, `nav.sb-nav`, `nav.sb-nav ul`, `nav.sb-nav li a`, `nav.sb-nav li a.active`, `nav.sb-nav .cat`). No se introdujo ninguna clase específica del mobile-nav → reuso total → `globals.css` queda sin cambios en este plan. Dark cubierto por el descendant `.dark .theme-editorial-v3` global vía cascade (el `<SheetContent>` es descendiente de `<html>.dark`); sin compound dark (Pitfall 3).

## Verification Results

- `pnpm exec tsc --noEmit`: 0 errores en los archivos tocados (mobile-nav.tsx, (dashboard)/layout.tsx). globals.css sin cambios.
- grep gates Task 1: `v3`=presente, `theme-editorial-v3`=presente en mobile-nav; clases v3 usadas = solo las autorizadas (`sb`, `brand`, `wm`, `sb-nav`, `cat` + `active` vía Link).
- grep gates Task 2: `import { MobileNav }`=1; proximidad awk `isEditorialV3 &&` ≤6 líneas antes de `<MobileNav`=OK; `md:hidden`=presente; diff = solo import + bloque mount (0 removals).
- grep gates Task 3: legacy `.theme-editorial` (sin guion) sin cambios (globals.css clean); compound `theme-editorial-v3.dark`=0.

## Regla 6 (byte-frozen) — VERIFIED

- `git diff ad544662^..HEAD --name-only` = SOLO 2 archivos (mobile-nav.tsx, (dashboard)/layout.tsx).
- `mobile-nav.tsx` único removal = la línea de firma `export function MobileNav() {` (reemplazada por la versión con prop `v3` + branch nuevo arriba). El return legacy (path no-v3) intacto → con `v3=false` (default) renderiza byte-idéntico a hoy.
- `(dashboard)/layout.tsx` removals = 0 (puro aditivo: import + bloque mount gated `isEditorialV3 &&`). `<main>` y `<Sidebar v3={isEditorialV3}>` intactos.
- `header.tsx` (mobile-nav de marketing) = byte-frozen (`git diff` vacío) — NO recibe `v3`.
- Dashboard no-v3: el bloque gated `{isEditorialV3 && ...}` garantiza que para usuarios no-v3 el dashboard NO monta ningún mobile-nav (igual que hoy).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Tooling] `pnpm exec tsc --noEmit` en vez de `pnpm typecheck`**
- **Found during:** Task 1
- **Issue:** El `<verify>` del plan invoca `pnpm typecheck`, pero el repo NO tiene script `typecheck` (constraint del entorno, documentado en planes previos).
- **Fix:** Usado `pnpm exec tsc --noEmit` (equivalente).
- **Files modified:** ninguno (solo el comando de verificación).

### Decisiones de implementación

- **Task 2 wrapper:** Se usó `<div className="md:hidden fixed top-3 left-3 z-50">` en vez de un header bar nuevo. Razón: el `<Sheet>` del MobileNav provee su propio `<SheetTrigger>` (botón Menu), por lo que solo hace falta posicionarlo; un `fixed top-left z-50` lo hace alcanzable sobre el contenido en mobile sin consumir ancho del flex row ni introducir chrome shadcn. El plan autoriza explícitamente este wrapper mínimo con posicionamiento.
- **Task 3 sin APPEND:** Reuso total de las clases del sidebar v3 → globals.css sin cambios (autorizado por el plan: "si reusa EXCLUSIVAMENTE clases ya autorizadas... NO se necesita CSS nuevo").

## Deferred Issues

Ninguno nuevo de este plan. (Errores `tsc` pre-existentes test-only ya documentados en planes 41-xx / editorial-core / Plan 01 — fuera de scope, no tocan archivos de este plan.)

## Known Stubs

Ninguno. El branch v3 reusa el `navItems` real + clases reales del sidebar v3; sin datos mockeados ni placeholders.

## Notes

- Fidelidad visual del Sheet v3 (light + dark, abierto desde el trigger del mount nuevo) se verifica en Wave 3 (Plan 04 dark audit) + QA visual del usuario. Este plan entrega el componente renderizable + montado + Regla 6.
- Una sutileza cosmética (la `.brand` aplicada sobre `<SheetHeader>` mergea con sus defaults shadcn de padding) queda para el dark audit / QA visual de Plan 04 — no afecta correctness ni Regla 6.
- NOT pushed (el push ocurre en Plan 05 — Regla 1/5).

## Self-Check: PASSED
