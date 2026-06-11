---
phase: quick-260611-clj
plan: 01
subsystem: ui
tags: [whatsapp, inbox, tags, editorial-v3, radix-popover, react]

requires:
  - phase: ui-redesign-conversaciones
    provides: "Branch v3 (.conv-col / .conv-filters) del inbox editorial"
provides:
  - "Filtro por etiqueta (tags) funcional en el inbox v3 editorial, con paridad respecto a v2/legacy"
affects: [whatsapp-inbox, ui-editorial-v3]

tech-stack:
  added: []
  patterns:
    - "Reuso de state compartido (tagFilter/tagFilterOpen/availableTags) entre los tres branches de render"
    - "Radix Popover re-rooteado en [data-module=whatsapp] vía portalContainer en scope editorial"
    - "Trigger estilo .chip/.on (idioma v3) envolviendo PopoverContent idéntico a v2 (paridad funcional)"

key-files:
  created: []
  modified:
    - "src/app/(dashboard)/whatsapp/components/conversation-list.tsx"

key-decisions:
  - "Solo se añadió UI en el branch v3 — el state, lazy-load, filtrado client-side, isFiltered y 'Limpiar filtros' ya contemplaban tags"
  - "El trigger usa la clase .chip editorial (no IconButton shadcn) pero el panel del Popover se mantiene como v2 (sin tokens v3 específicos para su interior)"
  - "portalContainer={themeContainerRef.current ?? undefined} — ya se resuelve en v3 (useEffect corre cuando v2 || v3)"

patterns-established:
  - "Cambio puramente aditivo dentro de un branch de render para honrar Regla 6 (50 inserciones, 0 borrados)"

requirements-completed: [QUICK-TAG-V3-01]

duration: 8min
completed: 2026-06-11
---

# Quick 260611-clj: Filtro de etiquetas en inbox v3 Summary

**El inbox v3 (editorial) ahora tiene un chip de filtro por etiqueta en la fila `.conv-filters`, con paridad funcional total respecto a v2/legacy y reusando el state compartido ya existente.**

## Performance

- **Duration:** ~8 min
- **Tasks:** 1 completada
- **Files modified:** 1

## Accomplishments

- Añadido un `Popover` de filtro por etiqueta como último hijo de `.conv-filters` en el branch `if (v3)`.
- El trigger es un `.chip` editorial (con `.on` cuando hay tag activo) que muestra el icono `Tag` + el nombre del tag activo o "Etiqueta".
- El `PopoverContent` reusa el contenido exacto de v2: "Quitar filtro", punto de color por tag, estado "Sin etiquetas", selección que cierra el popover.
- Las etiquetas se cargan lazy al abrir (el `useEffect` que escucha `tagFilterOpen` ya disparaba para v3).
- El filtrado se aplica vía el `filteredConversations` useMemo ya existente (`tagFilter` ya contemplado).

## Verification

- `pnpm exec tsc --noEmit`: 0 errores totales (sin errores nuevos en el archivo).
- `git diff --stat`: 50 inserciones, 0 borrados → cambio puramente aditivo dentro del branch v3.
- Regla 6: ramas v2 (~377-526) y legacy (~529-626) byte-idénticas — verificado por diff (NO-DELETIONS).
- Sin state nuevo, sin imports nuevos, sin tocar el hook `useConversations`, sin migración.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Commits

- `5c358db1`: feat(quick-260611-clj): portar filtro de etiquetas al inbox v3 editorial

## Self-Check: PASSED

- FOUND: src/app/(dashboard)/whatsapp/components/conversation-list.tsx
- FOUND commit: 5c358db1
- contains "tagFilterOpen" in v3 branch: confirmed
