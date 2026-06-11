---
status: complete
---

# Quick Task 260611-w3c — Inbox filtros + mobile-nav 14 módulos (C-6, C-7, M-1)

**Ejecutado:** 2026-06-11 (gsd-executor en worktree, mergeado a main en `892eda69`)
**Gaps cerrados:** C-6 (mobile-nav v3 con 9 módulos inaccesibles), C-7 (filtros Sin asignar/Sin respuesta), M-1 (toggle de orden) — auditoría `.planning/standalone/ui-v3-parity-audit/AUDIT.md`

## Commits

- `95b71090` — refactor(260611-w3c): extraer navCategoriesV2 a nav-items.ts compartido
- `f3c2fd04` — feat(260611-w3c): mobile-nav v3 deriva los 14 modulos de navCategoriesV2 (gap C-6)
- `ea1fbae6` — feat(260611-w3c): chips Sin asignar/Sin respuesta + toggle de orden en inbox v3 (C-7, M-1)

## Qué se hizo

- **Task 1 (refactor puro):** nuevo `src/components/layout/nav-items.ts` con `NavItem`, `SidebarCategoryV2`, `CAT_SLUG`, `navCategoriesV2` (verbatim) + helper puro `filterNavItem(item, ctx)`. `sidebar.tsx` los importa y reusa `filterNavItem` en sus 3 ramas; `navItems` flat legacy intacto; import `FlaskConical` sin uso eliminado.
- **Task 2 (C-6):** `MobileNav` acepta `currentWorkspace` opcional; la rama v3 quedó aislada en sub-componente `MobileNavV3` que deriva los 14 módulos de `navCategoriesV2` con el MISMO filtrado admin/settingsKey/hidden_modules del sidebar + badges tasks/automations. `(dashboard)/layout.tsx` pasa `currentWorkspace`. El `<MobileNav />` de marketing (header.tsx) quedó byte-frozen.
- **Task 3 (C-7 + M-1):** chips "Sin asignar"/"Sin respuesta" cableados al `setFilter` existente + chip de toggle de orden alternando `sortMode`. El Popover del tag filter (commit 5c358db1) no se tocó.

## Verificación

- `tsc --noEmit` proyecto completo: 0 errores.
- 0 archivos borrados; solo los 5 archivos planeados.
- Regla 6: header.tsx sin cambios, mobile-nav legacy intacto, cambios aditivos a ramas v3, flag `ui_editorial_v3` OFF.

## Nota de merge

Conflicto trivial de imports en `sidebar.tsx` con commit concurrente `240a546a` (firstGrapheme, otra sesión) — resuelto conservando ambos imports en el merge `892eda69`.

*(SUMMARY reconstruido por el orquestador: el original quedó sin commitear en el worktree y se perdió en el cleanup — el contenido proviene del reporte final del ejecutor.)*
