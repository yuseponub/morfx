---
phase: ui-redesign-editorial-shell
plan: 00
subsystem: ui-chrome / planning-decisions
tags: [editorial-v3, sidebar, mobile-nav, theme-toggle, decisions, wave-0]
requires: []
provides:
  - WAVE0-DECISIONS.md (decisiones lockeadas que consumen Plan 01-04)
affects:
  - Plan 01 (sidebar v3 — precedencia v3>v2)
  - Plan 02 (theme toggle — alcance: 3 topbars con datos)
  - Plan 03 (mobile-nav v3 + mount D-05b en (dashboard)/layout.tsx; depends_on Plan 01)
tech-stack:
  added: []
  patterns:
    - "Threading del flag v3 via prop (default false) + early-return byte-frozen — sin nuevo provider"
    - "Opción B: scope .theme-editorial-v3 en el <aside>/SheetContent del branch v3"
key-files:
  created:
    - .planning/standalone/ui-redesign-editorial-shell/WAVE0-DECISIONS.md
  modified: []
decisions:
  - "D-05/D-05b: MobileNav recibe prop v3?: boolean default false; mount nuevo md:hidden v3-only en (dashboard)/layout.tsx; header.tsx marketing byte-frozen"
  - "D-03: precedencia if(v3) ANTES de if(v2) ANTES de legacy en sidebar.tsx (v3 gana)"
  - "D-04: empty-states v3 sin topbar editorial -> theme toggle solo en los 3 topbars con datos (inbox, contactos if(v3), pedidos if(v3 && !isEmpty))"
metrics:
  duration: "~10 min"
  completed: "2026-06-06"
  tasks: 2
  commits: 1
  files: 1
---

# Phase ui-redesign-editorial-shell Plan 00: Wave 0 Decisions Summary

Wave 0 decisiones-only: lockea las 3 Wave 0 Gaps del RESEARCH (mount sites de MobileNav, precedencia v3/v2 en el sidebar, empty-states con/sin topbar) + la enmienda D-05b (mount real v3-only en el dashboard), en `WAVE0-DECISIONS.md` que las waves 1-4 citan verbatim. Cero código tocado.

## What Was Built

Un único artefacto: `.planning/standalone/ui-redesign-editorial-shell/WAVE0-DECISIONS.md` (125 líneas), con todas las decisiones grounded en grep real del codebase live (2026-06-06).

### Task 1 — Mount sites MobileNav + threading + D-05b
- **Grep verificado:** `grep -rn 'MobileNav' src/` = **3 líneas, 2 archivos** (def `mobile-nav.tsx:46`, import `header.tsx:4`, render `header.tsx:11`). `<Header />` SOLO en `(marketing)/[locale]/layout.tsx:43`. El dashboard NO monta MobileNav hoy.
- **Threading lockeado:** prop `v3?: boolean` default false en MobileNav; branch reskin gated; path no-v3 byte-frozen por early-return; **NO** nuevo provider (`isEditorialV3` ya en el RSC del layout, se pasa directo).
- **D-05b lockeado:** mount NUEVO `md:hidden` v3-only en `(dashboard)/layout.tsx` → `{isEditorialV3 && <div className="md:hidden"><MobileNav v3 /></div>}`. No-v3 = dashboard igual que hoy (Regla 6); header.tsx marketing byte-frozen. Plan 03 lo implementa; Plan 03 `depends_on` Plan 01 (ambos editan `layout.tsx`).

### Task 2 — Precedencia sidebar + empty-states
- **Precedencia lockeada (Pitfall 7):** `if (v3)` ANTES de `if (v2)` ANTES del return legacy. Verificado: `sidebar.tsx` prop `v2 = false` (194), `if (v2)` (220), legacy return (398), 591 líneas totales. v2/legacy byte-frozen.
- **Empty-states lockeado (Open Question #3):** ningún empty-state v3 renderiza topbar editorial — contactos `empty-state.tsx:18 if(v3)` → `<section className="page">` (sin topbar); pedidos empty `orders-view.tsx:1176` = bloque legacy shadcn (sin topbar). El topbar v3 de pedidos solo existe en `if (v3 && !isEmpty)` (940). → El theme toggle (D-04) va SOLO en los 3 topbars con datos (inbox, contactos, pedidos-con-datos); empty-states fuera de scope.

## Verification

- `wc -l WAVE0-DECISIONS.md` = 125 (≥ 25 min_lines exigido).
- `grep -qi 'precedencia' WAVE0-DECISIONS.md` = OK (gate Task 2).
- `grep -rn 'MobileNav' src/ | wc -l` = 3 (conteo pre-implementación: 1 def + 1 import + 1 render marketing — esperado).
- `test -f WAVE0-DECISIONS.md && grep -qi 'precedencia'` = OK.
- must_haves truths: las 4 quedan documentadas en el artefacto.

## Deviations from Plan

None — plan ejecutado exactamente como fue escrito. Las 2 tasks producen el mismo artefacto único (`WAVE0-DECISIONS.md`); por ser una wave decisiones-only se commiteó en un solo commit atómico que cubre ambos scopes (es la unidad atómica de la wave). No hay código que separar.

## Known Stubs

None.

## Notes para Plan 01-04

- Plan 01 (sidebar): branch `if (v3)` ANTES de `if (v2)`; `<aside>` lleva `theme-editorial-v3` (Opción B); cablear `v3={isEditorialV3}` en `<Sidebar>` (layout.tsx 67-72); NO mover la clase de `<main>`.
- Plan 02 (toggle): agregar `<ThemeToggle />` en los `.actions` de los 3 topbars con datos; NO mover el de la rama v2/legacy en orders-view (~1348).
- Plan 03 (mobile-nav): prop `v3?: boolean` + branch + mount `md:hidden` v3-only en layout.tsx; `depends_on` Plan 01.

## Self-Check: PASSED

- FOUND: WAVE0-DECISIONS.md
- FOUND: 00-SUMMARY.md
- FOUND commit: 5ef4a482
