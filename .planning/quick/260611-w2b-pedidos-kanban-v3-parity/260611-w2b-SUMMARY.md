---
phase: 260611-w2b-pedidos-kanban-v3-parity
plan: 01
subsystem: ui-crm-pedidos
tags: [ui-editorial-v3, kanban, regla-6, parity]
requires: [ui-redesign-editorial-core, crm-duplicate-order-products-integrity]
provides: [pedidos-v3-parity-c4, pedidos-v3-parity-c5, pedidos-v3-parity-m4, pedidos-v3-parity-m5, pedidos-v3-parity-m7]
affects: [crm-pedidos-kanban]
tech-stack:
  added: []
  patterns: [additive-v3-branch, css-scoped-theme-editorial-v3, stopPropagation-P8-P9]
key-files:
  created: []
  modified:
    - src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx
    - src/app/(dashboard)/crm/pedidos/components/kanban-column.tsx
    - src/app/(dashboard)/crm/pedidos/components/orders-view.tsx
    - src/app/globals.css
decisions:
  - "Empty state v3 vive DENTRO del shell editorial (topbar+sub-nav+toolbar+pipeline), sustituyendo solo el contenido central por .kempty-v3 — consistencia visual que era justo el gap M-7"
  - "Contador WIP usa solo color (warn/over) + sufijo /N en vez del banner rojo separado del legacy — más limpio para el idioma editorial v3"
  - "globals.css se escribió en un solo bloque ADITIVO al final (las 5 capacidades) en el commit de Task 1; reglas inertes hasta que el JSX las referencia"
metrics:
  duration: ~15min
  completed: 2026-06-11
requirements: [C-4, C-5, M-4, M-5, M-7]
---

# Phase 260611-w2b Plan 01: Pedidos Kanban v3 Parity Summary

Restauradas en la rama editorial v3 de CRM Pedidos cinco capacidades que existían en la card/columna legacy pero se omitieron al reescribir el markup v3, todas como cambios ADITIVOS dentro de ramas `if (v3)` y clases CSS scopeadas a `.theme-editorial-v3` (Regla 6: legacy/v2 byte-idénticos).

## What Was Built

- **C-4 — Badge de error de duplicado en card v3:** Popover completo (detalle de productos esperados + link a pedido origen + AlertDialog "Marcar resuelto") reutilizando el estado/handlers ya compartidos (`duplicateError`, `isClearing`, `handleResolveDuplicateError`). Trigger pill editorial `.err-trigger`. Todos los interactives con `stopPropagation` (P-8/P-9) para no disparar el drag.
- **M-5 — Tracking en card v3:** Fila `.track` con número de guía (mono) + carrier (uppercase) cuando `order.tracking_number` existe.
- **C-5 — WIP en columna v3:** Contador `{count}/{wipLimit}` cuando hay `wip_limit`, con clase `warn` (at-limit) / `over` (over-limit) que comunica el estado por color.
- **M-4 — Grip de drag en cabecera de columna v3:** `GripVerticalIcon` como primer hijo de `.kcol-head` (visual; los listeners del sortable ya viven en el head). CSS pasó de `display:none` a visible-al-hover con cursor grab.
- **M-7 — Empty state v3 propio:** Condición de la rama v3 de `v3 && !isEmpty` a `v3`. Con 0 pedidos renderiza `.kempty-v3` (ícono + "Sin pedidos" + copy serif + CTA "Crear pedido" → mismo sheet) dentro del shell editorial, en vez de caer al markup legacy shadcn.

## Commits

- f3f70799: feat(260611-w2b): card v3 — badge error duplicado (C-4) + tracking (M-5)
- a3e6b5ac: feat(260611-w2b): columna v3 — WIP {count}/{wipLimit} (C-5) + grip drag (M-4)
- ba77ca62: feat(260611-w2b): empty state v3 propio dentro del shell editorial (M-7)

## Deviations from Plan

None - plan executed exactly as written.

Nota de empaquetado: todo el CSS nuevo de globals.css (las 5 capacidades) se escribió en un único bloque aditivo al final del archivo durante el commit de Task 1, en vez de repartirlo por commit. Las reglas son inertes hasta que el JSX correspondiente (Tasks 2/3) las referencia, así que no afecta el comportamiento intermedio ni la atomicidad funcional. Esto minimiza también los conflictos de merge con sesiones concurrentes (constraint: globals.css ADITIVO).

## Verification

- `tsc --noEmit` → 0 errores tras cada tarea (ejecutado con el binario del checkout principal contra el tsconfig del worktree, ya que el worktree no tiene node_modules propio).
- `grep duplicateError` aparece dentro de la rama v3 de kanban-card (líneas 203-300).
- `grep wipLimit` aparece dentro de la rama v3 de kanban-column (líneas 206-209).
- `grep "if (v3)"` en orders-view sin `!isEmpty` (línea 920).
- Legacy badge (`bg-destructive/10 text-destructive border`) intacto en kanban-card línea 468.
- 0 file deletions; solo 4 archivos modificados (los del scope asignado).

## Known Stubs

None.

## Self-Check: PASSED

- Files modified exist: kanban-card.tsx, kanban-column.tsx, orders-view.tsx, globals.css — all FOUND.
- Commits FOUND: f3f70799, a3e6b5ac, ba77ca62.
