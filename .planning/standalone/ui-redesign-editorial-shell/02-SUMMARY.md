---
phase: ui-redesign-editorial-shell
plan: 02
subsystem: ui-shell-theme-toggle
tags: [ui, editorial-v3, theme-toggle, regla-6, D-04]
requires:
  - "ui_editorial_v3 flag + .theme-editorial-v3 tokens (ui-redesign-editorial-core Plan 00)"
  - "Topbars v3 con datos (inbox-layout / contacts-table if (v3) / orders-view if (v3 && !isEmpty))"
  - "src/components/layout/theme-toggle.tsx (componente base, sin props)"
provides:
  - "<ThemeToggle /> en los 3 topbars v3 con datos: Conversaciones (ya estaba) + Contactos + Pedidos"
  - "Comentario del inbox alineado a D-04 (toggle permanente en el topbar, no en el sidebar)"
affects:
  - "src/app/(dashboard)/crm/contactos/components/contacts-table.tsx"
  - "src/app/(dashboard)/crm/pedidos/components/orders-view.tsx"
  - "src/app/(dashboard)/whatsapp/components/inbox-layout.tsx"
tech-stack:
  added: []
  patterns:
    - "Aditivo v3-gated: el toggle solo se inserta dentro de las ramas if (v3) — paths no-v3 byte-frozen (Regla 6)"
    - "El toggle vive en .actions del topbar de cada módulo (D-04/D-07), no en el sidebar"
key-files:
  created:
    - ".planning/standalone/ui-redesign-editorial-shell/02-SUMMARY.md"
  modified:
    - "src/app/(dashboard)/crm/contactos/components/contacts-table.tsx"
    - "src/app/(dashboard)/crm/pedidos/components/orders-view.tsx"
    - "src/app/(dashboard)/whatsapp/components/inbox-layout.tsx"
decisions:
  - "D-04: el ThemeToggle vive en el topbar del módulo de forma definitiva; empty-states v3 sin topbar = sin toggle"
  - "Pitfall 1 honrado: contacts-view-v2.tsx (rama v2) intacto"
  - "Pitfall 2 honrado: el <ThemeToggle /> de orders-view.tsx (rama v2/legacy, ~1349) preservado; se AGREGÓ uno nuevo en el topbar v3 (~952)"
metrics:
  duration: "~10 min"
  completed: "2026-06-06"
  tasks: 3
  files: 3
  commits: 3
---

# Phase ui-redesign-editorial-shell Plan 02: ThemeToggle en topbars v3 Summary

Extiende el `<ThemeToggle />` (light/dark/system) a los topbars editoriales v3 de Contactos y Pedidos (Conversaciones ya lo tenía), dejándolo consistente en las 3 pantallas v3 con datos, y corrige el comentario obsoleto del inbox que decía que el toggle "irá en el sidebar" — D-04 lo confirma permanentemente en el topbar.

## Lo construido

- **Contactos (`contacts-table.tsx`):** import `ThemeToggle` desde `@/components/layout/theme-toggle` + `<ThemeToggle />` como primer hijo del `.actions` de la rama `if (v3)` (~286), antes de "Importar". Posicionalmente verificado: la primera aparición del toggle (286) cae ANTES del segundo `.actions` (498, rama no-v3).
- **Pedidos (`orders-view.tsx`):** `<ThemeToggle />` NUEVO como primer hijo del `.actions` de la rama `if (v3 && !isEmpty)` (~952), antes de "Exportar". El import ya existía (línea 48). El `<ThemeToggle />` de la rama v2/legacy (~1349) se PRESERVÓ — `grep -c ThemeToggle` = 3 (import + v3 + legacy).
- **Inbox (`inbox-layout.tsx`):** reemplazado el comentario obsoleto "irá en el sidebar" por uno que refleja D-04 (toggle permanente en el topbar, consistente en las 3 pantallas v3, NO en el sidebar — D-07). Solo cambio de comentario; el `<ThemeToggle />` y el resto del topbar intactos.

## Commits

- `48119054` — feat: ThemeToggle en topbar v3 de Contactos (D-04)
- `f20a3aaa` — feat: ThemeToggle nuevo en topbar v3 de Pedidos (D-04)
- `874224b4` — docs: corrige comentario obsoleto del ThemeToggle en inbox (D-04)

## Verificación

- **Task 1 positional:** `OK-toggle-in-v3-actions` (toggle@286 < segundo `.actions`@498); `import { ThemeToggle }` presente.
- **Task 2 count:** `grep -c ThemeToggle orders-view.tsx` = 3 (import@48 + v3@952 + legacy@1349 preservado).
- **Task 3:** `ThemeToggle` presente; `irá en el sidebar` removido (grep negativo); `git diff` muestra SOLO el cambio de comentario.
- **Typecheck:** `pnpm exec tsc --noEmit` 0 errores en los 3 archivos tocados (no existe script `typecheck` → se usa `tsc --noEmit` directo).
- **Regla 6 (`git diff 48119054^..HEAD`):** SOLO los 3 archivos del plan cambiados. `contacts-view-v2.tsx` diff = 0 líneas (Pitfall 1). `src/components/layout/theme-toggle.tsx` diff = 0 líneas (componente base intacto). El `<ThemeToggle />` legacy de orders-view (1349) preservado (Pitfall 2). Empty-states sin toggle (Wave 0 / D-04).

## Deviations from Plan

### Auto-fixed Issues

Ninguno material. Una sola adaptación de entorno (ya establecida en la cadena del standalone):

**1. [Rule 3 - Blocking] `pnpm exec tsc --noEmit` en vez de `pnpm typecheck`**
- **Found during:** Tasks 1-3 (gate de verificación)
- **Issue:** El plan invoca `pnpm typecheck` pero el repo no tiene ese script (pnpm-only, sin script `typecheck`).
- **Fix:** Se corrió `pnpm exec tsc --noEmit` y se filtró por el archivo tocado — mismo patrón que Plans 00/01 de este standalone.
- **Files modified:** ninguno (solo gate)
- **Commit:** n/a

## Notas operativas

- NOT pushed — el push ocurre en Plan 05 (instrucción del orquestador + STATE.md).
- Styling editorial fino del toggle dejado discrecional (RESEARCH §Pattern 3): por defecto ghost shadcn, encaja razonablemente en `.actions`; el QA visual decide si requiere wrapper `.icon-btn`.

## Known Stubs

Ninguno.

## Self-Check: PASSED

- FOUND: `.planning/standalone/ui-redesign-editorial-shell/02-SUMMARY.md`
- FOUND commit `48119054`
- FOUND commit `f20a3aaa`
- FOUND commit `874224b4`
