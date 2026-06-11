---
phase: 260611-w1a-contactos-v3-crud-tags
plan: 01
subsystem: crm-contactos-ui-v3
tags: [ui, crm, contactos, editorial-v3, regla-6]
requires: []
provides:
  - "Tabla v3 de contactos con menú de acciones por fila (Ver detalles / Editar / Eliminar)"
  - "Filtro dinámico multi-select por cualquier tag del workspace en la toolbar v3"
  - "Acceso al TagManager desde la toolbar v3 (botón Gestionar etiquetas)"
affects:
  - "src/app/(dashboard)/crm/contactos/components/contacts-table.tsx"
tech-stack:
  added: []
  patterns:
    - "Portal-scoping de Radix (DropdownMenu/Popover) al scope .theme-editorial-v3 vía portalContainer (clon del inbox v3)"
    - "Callbacks de fila extraídos a useCallback como single source of truth compartido por DataTable legacy y dropdown v3"
    - "Chip+popover de tags multi-select cableado al mismo estado URL ?tags= que el TagFilter legacy"
key-files:
  created: []
  modified:
    - "src/app/(dashboard)/crm/contactos/components/contacts-table.tsx"
decisions:
  - "Reuso de handlers (no duplicación): la lógica del memo columns se extrajo a 3 callbacks estables reusados por legacy y v3, evitando drift entre ramas"
  - "Botón Gestionar etiquetas alineado a la derecha (marginLeft:auto) dentro de la misma .toolbar; el TagManager ya estaba montado, solo faltaba cablear el trigger"
metrics:
  duration: "~15 min"
  completed: "2026-06-11"
  tasks: 2
  files: 1
---

# Phase 260611-w1a Plan 01: Contactos v3 — CRUD por fila + filtro de tags Summary

Restaura en la rama editorial v3 de CRM Contactos tres capacidades del UI legacy perdidas al reescribir el markup como `table.dict`: menú de acciones por fila (C-1), filtro dinámico por cualquier tag del workspace (C-2) y acceso al gestor de etiquetas (C-3). Todo aditivo dentro del `if (v3)`; legacy/v2 byte-idénticos (Regla 6).

## What Was Built

### Task 1 — Menú de acciones por fila (C-1) — commit `a2f7ea0b`
- Extraídos `onEdit`/`onDelete`/`onViewDetail` del memo `columns` a 3 callbacks estables (`handleEditContact`, `handleDeleteContact`, `handleViewDetail`) con `React.useCallback`. El memo `columns` ahora los consume → el DataTable legacy mantiene comportamiento idéntico, y el dropdown v3 reusa la MISMA lógica (single source of truth, sin duplicación de la mutación `deleteContact`).
- Añadido ref de portal-scoping `themeContainerRef` + efecto que resuelve `.theme-editorial-v3` solo cuando `v3` (else ref null → portal por defecto en body, legacy intacto).
- Columna de acciones en la tabla v3: `<th style={{width:40}} aria-hidden />` al final del thead; por fila una `<td>` con `<DropdownMenu>` (trigger `.btn` discreto con `MoreHorizontal`) y items Ver detalles / Editar / separador / Eliminar (en color destructivo). `colSpan` del empty row ajustado de 6 a 7.
- `DropdownMenuContent` re-rooteado al scope con `portalContainer={themeContainerRef.current ?? undefined}`.

### Task 2 — Filtro dinámico de tags + Gestionar etiquetas (C-2, C-3) — commit `c8c0c9d2`
- Chip "Etiqueta" + `<Popover>` multi-select en la `.toolbar` v3 después de los 4 chips rápidos. Toggle por tag (add/quita de `currentTagIds`), opción "Quitar filtro", estado "Sin etiquetas" cuando `tags.length === 0`. Cableado a `handleTagSelectionChange` → mismo estado URL `?tags=id,id` que el TagFilter legacy. El chip muestra `on` y el conteo cuando hay ≥1 tag activo.
- Los 4 chips rápidos (Todos/Clientes/Leads/Mayoristas) se conservan sin cambios.
- Botón "Gestionar etiquetas" (`.btn` + `Settings` icon, alineado a la derecha) que dispara `setTagManagerOpen(true)`; el `<TagManager>` ya estaba montado.
- `PopoverContent` re-rooteado al scope `.theme-editorial-v3`.

## Verification

- `tsc --noEmit` → 0 errores (ambas tareas). Nota de entorno: el worktree no tiene `node_modules` propio; se ejecutó `node <root>/node_modules/typescript/bin/tsc --noEmit -p <worktree>/tsconfig.json` (el wrapper `pnpm exec tsc` falla con EACCES en el worktree porque no hay `.bin` local).
- `git diff` confirma que el branch legacy (`<DataTable columns={columns}>`, `<TagFilter>`, dialogs legacy) y el componente v2 (`ContactsViewV2`, no tocado) quedan byte-idénticos en comportamiento. Los únicos cambios son: imports nuevos, estado/callbacks compartidos (que el legacy consume vía `createColumns` sin cambio de comportamiento) y JSX dentro del `if (v3)`.
- Sin deleciones de archivos; árbol limpio; flag `ui_editorial_v3` sigue OFF por defecto.

## Deviations from Plan

None - plan executed exactly as written.

## Success Criteria

- [x] C-1: dropdown de fila Ver detalles/Editar/Eliminar funcional en la tabla v3, reusando handlers existentes (cero duplicación de lógica de mutación).
- [x] C-2: filtro por cualquier tag del workspace vía chip+popover multi-select; 4 tabs rápidos conservados.
- [x] C-3: botón "Gestionar etiquetas" abre el TagManager ya montado.
- [x] Regla 6: legacy y v2 byte-idénticos en comportamiento; flag `ui_editorial_v3` OFF por defecto.
- [x] `tsc --noEmit` con 0 errores.

## Commits

- `a2f7ea0b` — feat(260611-w1a-01): menú de acciones por fila en tabla v3 de contactos (C-1)
- `c8c0c9d2` — feat(260611-w1a-01): filtro dinámico de tags + Gestionar etiquetas en toolbar v3 (C-2, C-3)

## Self-Check: PASSED

- FOUND: src/app/(dashboard)/crm/contactos/components/contacts-table.tsx
- FOUND: .planning/quick/260611-w1a-contactos-v3-crud-tags/260611-w1a-SUMMARY.md
- FOUND commit: a2f7ea0b
- FOUND commit: c8c0c9d2
- Contract patterns presentes: `tagManagerOpen` (3), `setTagManagerOpen(true)` (2), `handleTagSelectionChange` (6)
