---
phase: ui-redesign-dashboard
plan: master
type: standalone-mega-multi-plan
status: ready-to-execute
wave_count: 4
plan_count: 8 (Wave 0 + 7 módulos + Wave final close-out)
base_commit: 9642e36
dependencies_existing:
  - ui-redesign-conversaciones (shipped 2026-04-22) — aporta .theme-editorial tokens + .mx-* utilities + InboxV2Provider pattern
  - ui-redesign-landing (shipped 2026-04-22 + 2026-04-23 realignment) — aporta patterns confirmed (wordmark, rubric-2 CTAs, dashboard mocks como source of truth)
---

# PLAN — UI Redesign Dashboard (mega-fase)

## Arquitectura del plan

Esta fase reskinea los 7 módulos del dashboard en paralelo con flag maestro. Wave 0 planta infraestructura (flag + fonts + layout + sidebar). Waves 1-4 re-skinean los 7 módulos en paralelo (3+2+2). Wave 5 cierra con DoD + LEARNINGS + activación QA.

### Wave 0 — Infraestructura compartida (Plan 01)

**Objetivo:** planta el switch `.theme-editorial` gated por flag `ui_dashboard_v2.enabled` + fuentes editoriales + chrome global (sidebar + header).

**Files modified (5-7 archivos):**
- `src/lib/auth/dashboard-v2.ts` (NEW) — clon de `inbox-v2.ts` con el nuevo flag path
- `src/app/(dashboard)/fonts.ts` (NEW) — loader de 3 fuentes (EB Garamond + Inter + JetBrains Mono)
- `src/app/(dashboard)/layout.tsx` (MODIFY) — aplicar font vars + `cn('...', dashV2 && 'theme-editorial')`
- `src/components/layout/sidebar.tsx` (MODIFY) — re-skin editorial conditional gated
- `src/components/layout/header.tsx` o topbar (MODIFY si existe — verificar primero)
- `src/components/layout/dashboard-v2-context.tsx` (NEW) — `DashboardV2Provider` + `useDashboardV2()` hook
- `docs/analysis/04-estado-actual-plataforma.md` — nota del feature flag nuevo (al cierre en Wave 5)

**Tasks:**
- T1: Flag resolver + hook/provider (`getIsDashboardV2Enabled` + DashboardV2Provider/Context + useDashboardV2)
- T2: Fonts loader dashboard segment
- T3: Dashboard layout wire-up (aplicación conditional del tema)
- T4: Sidebar editorial re-skin (gated)
- T5: Header/topbar editorial si aplica (verificar existencia primero)

**Success criteria Plan 01:**
- `npx tsc --noEmit` clean en los archivos nuevos/modificados
- `grep -q "getIsDashboardV2Enabled"` PASS
- `grep -q "theme-editorial" src/app/(dashboard)/layout.tsx` PASS
- Flag OFF path byte-identical al actual (verificable con activar/apagar el flag en DevTools via temporary cookie override)
- Cero cambios en módulos individuales — el trabajo por módulo es de Waves siguientes

### Wave 1 — CRM + Pedidos + Tareas (Plans 02, 03, 04 — paralelos)

Tres módulos de flujo comercial que se usan juntos. Mocks: `crm.html`, `pedidos.html`, `tareas.html`.

**Plan 02 — CRM (`src/app/(dashboard)/crm/**`)**
Files: `page.tsx`, `contactos/page.tsx`, `contactos/components/*.tsx`, `productos/page.tsx`, sus columnas, dialogs, forms. Mock `crm.html` es dictionary-table heavy — filas con definición tipo diccionario.
Tasks estimadas: 5-7 (listing page + contactos + productos + cada dialog/form modal re-skineado con editorial).

**Plan 03 — Pedidos (`src/app/(dashboard)/crm/pedidos/**`)**
Files: `pedidos/page.tsx`, `pedidos/[id]/page.tsx`, `components/*.tsx`. Mock `pedidos.html` tiene pattern de ledger-style para pedido detail + timeline con rule ornaments + status badges mx-tag.
Tasks estimadas: 4-5 (list view + detail sheet + timeline + status pills + bulk actions).

**Plan 04 — Tareas (`src/app/(dashboard)/tareas/**`)**
Files: `page.tsx`, `components/task-*.tsx`. Mock `tareas.html` tiene kanban 4-col + toggle vista lista + detail sheet con timeline + checklist.
Tasks estimadas: 5 (kanban cards + task list view + task detail sheet + task form + filters).

**Wave 1 files overlap check:** CRM/Pedidos comparten filesystem pero NO archivos (pedidos vive en subfolder). Tareas es totalmente disjoint. Seguros para ejecución paralela en 3 worktrees.

### Wave 2 — Agentes + Automatizaciones (Plans 05, 06 — paralelos)

Dos módulos de configuración IA, más complejos.

**Plan 05 — Agentes (`src/app/(dashboard)/agentes/**`)**
Mock `agentes.html`: agent cards + prompt editor + guardrails + knowledge base + metrics per agent.
Tasks estimadas: 5-6.

**Plan 06 — Automatizaciones (`src/app/(dashboard)/automatizaciones/**`)**
Mock `automatizaciones.html`: flow canvas + inspector + list + wizard steps.
Tasks estimadas: 6-8 (más grande — builder de flows es denso).

### Wave 3 — Analytics + Configuración (Plans 07, 08 — paralelos)

**Plan 07 — Analytics/Métricas (`src/app/(dashboard)/analytics/**` + `metricas/**`)**
Mock `analytics.html`: metric cards + charts + period selector + filter dropdowns.
Tasks estimadas: 4-5.

**Plan 08 — Configuración (`src/app/(dashboard)/configuracion/**`)**
Mock `configuracion.html`: settings pages + integrations + users + roles.
Tasks estimadas: 5-7.

### Wave 4 — Cierre (Plan 09)

**Plan 09 — DoD + LEARNINGS + Push**
- T1: DoD grep suite (slate leakage por módulo, hsl antipattern, dark:, mx-* count ≥ 50, TS clean, NO-TOUCH Regla 6, flag-OFF byte-identical diff vs base commit)
- T2: LEARNINGS con 7 patterns (dictionary-table, kanban card, editorial charts, form treatments, portal sweep extensions shadcn, module consistency guidelines, activation playbook)
- T3: Platform doc update + SQL snippet de activación + push único a Vercel
- T4: User test flag flip on Somnio post-Vercel-ready (or decidir deferral si necesita QA extra)

## Ejecución

Sin el `/clear`, arrancamos después de una nueva sesión limpia con `/gsd-execute-phase ui-redesign-dashboard`. La nueva sesión:

1. Lee `MEMORY.md` (entry ya actualizada de esta fase).
2. Lee este `PLAN.md` + `CONTEXT.md`.
3. Spawnea Wave 0 (Plan 01) single-plan en worktree.
4. Tras merge Wave 0, spawn 3 executors paralelos de Wave 1 (Plans 02/03/04) siguiendo el safe dispatch sequential.
5. Merge Wave 1, spawn 2 executors paralelos Wave 2 (Plans 05/06).
6. Merge Wave 2, spawn 2 executors paralelos Wave 3 (Plans 07/08).
7. Merge Wave 3, spawn Plan 09 final single-agent (DoD + LEARNINGS + push).

Estimación total: **~6-8 horas de ejecución** (con paralelización). Sin paralelización, ~18-20h sequential.

## Notas de retomar

- Empezar sesión con: `/gsd-progress` → ver estado → `/gsd-execute-phase ui-redesign-dashboard`.
- Si el user quiere review intermedio (ej. después de Wave 1), se hace manual — el plan es ejecutable de corrido pero con checkpoints naturales entre waves.
- Si aparece un archivo `landing.html` v2.2 o cualquier mock actualizado durante la ejecución, PARAR y re-evaluar scope (lesson learned del landing realignment).
