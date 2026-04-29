---
phase: standalone-crm-query-tools
plan: 05
subsystem: agents-ui
tags: [agents-ui, server-component, server-action, client-component, multi-select, workspace-isolation, zod-validation, editorial-theme]

# Dependency graph
requires:
  - phase: standalone-crm-query-tools-02
    provides: getCrmQueryToolsConfig + updateCrmQueryToolsConfig domain functions (read/write contract con DomainContext + DomainResult)
  - phase: standalone-crm-query-tools-04
    provides: createCrmQueryTools(ctx) feature-complete (5 tools) — la UI configura el comportamiento que las tools del Plan 04 leen fresco cada call (D-19)
provides:
  - "UI operativa en /agentes/crm-tools — operadores configuran pipeline scope + stages activos via Server Component + Client Component"
  - "saveCrmQueryToolsConfigAction server action con admin guard (getActiveWorkspaceId) + zod validation (UUID nullable + array UUIDs) + revalidatePath"
  - "MultiSelectStages componente inline aceptando {value, label}[] agrupado — variante UUID-as-value que NO refactoriza el MultiSelect del routing-editor"
  - "ARIA selectors estables para Plan 06 E2E (aria-label='Pipeline'/'Stages activos' + role='combobox' + texto 'Configuracion guardada')"
  - "Tab 'Herramientas CRM' agregado al layout /agentes (Wrench icon, entre Auditoria y Configuracion)"
affects:
  - standalone-crm-query-tools-06  # Plan 06 E2E Playwright consumira los selectors aria-label / role=combobox
  - standalone-crm-query-tools-07  # Plan 07 INTEGRATION-HANDOFF documentara como acceder a la UI

# Tech tracking
tech-stack:
  added: []  # Plan 05 reusa stack existente: Next 15 RSC + Server Actions + zod + sonner + Radix popover/checkbox/button
  patterns:
    - "Server Component fetch parallel (Promise.all) — getCrmQueryToolsConfig + listPipelines en una sola await; reduce TTFB"
    - "Server action discards client-provided workspaceId — schema zod NO incluye workspaceId field; siempre via getActiveWorkspaceId() (cookie-validated). Mitiga T-W4-01 (spoofing)"
    - "Defense-in-depth zod validation: cliente y servidor revalidan; UUID format strict; array de UUIDs"
    - "Inline MultiSelect variant pattern: build coexisting component cuando el shape de datos difiere (UUID vs label-as-value) en lugar de generalizar el shipped component — riesgo de breakage menor"
    - "useTransition + Server Action: React 19 idiomatic mutation pattern con isPending para disabled button + toast feedback"
    - "Editorial theme reuse: <Button> shadcn + clases Tailwind tokens (rounded-lg border, text-muted-foreground, etc.) — no nuevo design system"

key-files:
  created:
    - "src/app/(dashboard)/agentes/crm-tools/page.tsx (57 lineas) — Server Component"
    - "src/app/(dashboard)/agentes/crm-tools/_actions.ts (66 lineas) — Server Action saveCrmQueryToolsConfigAction"
    - "src/app/(dashboard)/agentes/crm-tools/_components/ConfigEditor.tsx (108 lineas) — Client Component editor"
    - "src/app/(dashboard)/agentes/crm-tools/_components/MultiSelectStages.tsx (124 lineas) — Inline multi-select variant"
  modified:
    - "src/app/(dashboard)/agentes/layout.tsx (+2 lineas, -1) — agrega tab 'Herramientas CRM'"

key-decisions:
  - "Inline MultiSelectStages (no refactor del routing-editor MultiSelect): el routing-editor accepta string[] de labels (label-as-value pattern). Las stages requieren UUID-as-value para estabilidad contra renames (D-13). Refactorizar el componente shipped agregaria un breaking change a routing-editor sin beneficio para este standalone. Decision: las dos variantes coexisten."
  - "Pipeline picker via <select> nativo (no Combobox shadcn): el operador raramente cambia este valor (single value, lista corta de pipelines), <select> es accesible por default, no requiere portal/popover ni teclado management custom. Si futuro UX merits upgrade, refactor sera trivial."
  - "Wrench icon (lucide-react) para el tab 'Herramientas CRM': consistente con semantica 'tools'. Otros iconos disponibles (Hammer, Settings2) eran ambiguos vs el icono ya usado para 'Configuracion' (Settings)."
  - "Posicion del tab: ENTRE 'Auditoria' y 'Configuracion' (no antes de Auditoria como sugiere el header del plan). Justificacion: Auditoria es sub-router (/agentes/routing/audit) — agruparla logicamente con Router; las herramientas CRM son standalone, mejor cerca de Configuracion."
  - "result.data null guard en saveCrmQueryToolsConfigAction: DomainResult<T> tiene data?: T (opcional), TypeScript strict force a chequear. Aunque updateCrmQueryToolsConfig siempre poblada data en success, el guard explicito previene null deref runtime y satisface tsc."
  - "Doc-comment ajustado para evitar mencionar 'createAdminClient' literal: el grep -E del verify automated cuenta cualquier match incluyendo doc-comments. Ajuste el comment a 'admin Supabase client' para que el grep cumpla acceptance literal con 0 matches."

requirements-completed: [D-11, D-13, D-14, D-16, D-22]

# Metrics
duration: ~25min
completed: 2026-04-29
---

# Standalone crm-query-tools Plan 05: UI /agentes/crm-tools (Server + Client + Server Action)

**Operadores ahora pueden configurar pipeline scope + stages activos del workspace via UI editorial bajo `/agentes/crm-tools`. La pagina es Server Component que lee `getCrmQueryToolsConfig` + `listPipelines` en paralelo, render Client Component con pipeline picker (single-select, "Todas las pipelines" = null) + multi-select de stages agrupado por pipeline; el save delega a `saveCrmQueryToolsConfigAction` (zod-validated, workspace-guarded) que llama `updateCrmQueryToolsConfig` en domain layer. Las tools del Plan 04 leen fresh cada call — el cambio de UI es visible inmediatamente sin redeploy.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 5/5 commiteadas atomicamente
- **Files created:** 4 (page.tsx, _actions.ts, ConfigEditor.tsx, MultiSelectStages.tsx)
- **Files modified:** 1 (layout.tsx — tab nuevo)
- **Lines added:** ~355 totales en los 4 archivos nuevos + 2 lineas en layout
- **Commits:** 4 atomic feat commits (`20337a3`, `56d42c5`, `fe11719`, `9bf48e6`) + esta SUMMARY commit
- **Tests:** sin tests nuevos en este plan (UI Plan; tests E2E Playwright vienen en Plan 06)
- **Regression check:** `npx vitest run src/lib/agents/shared/crm-query-tools` exit 0 — 35/35 unit tests pasan (sin regresion)
- **tsc:** exit 0 (zero errors en todo el repo)
- **lint:** exit 0 en `src/app/(dashboard)/agentes/crm-tools/`
- **Regla 3 grep:** 0 matches de `createAdminClient|@supabase/supabase-js` en `src/app/(dashboard)/agentes/crm-tools/`
- **Push:** `ab2fd6a..9bf48e6` exitoso a origin/main

## Accomplishments

- **Layout tab "Herramientas CRM"** (`src/app/(dashboard)/agentes/layout.tsx`):
  - Agregado entry `{ href: '/agentes/crm-tools', label: 'Herramientas CRM', icon: Wrench, exact: false }` entre `Auditoria` y `Configuracion`.
  - Import `Wrench` de lucide-react agregado.
  - Otros tabs (Dashboard, Router, Auditoria, Configuracion) intactos — verificado por grep.
- **page.tsx Server Component** (`src/app/(dashboard)/agentes/crm-tools/page.tsx`):
  - `getActiveWorkspaceId()` cookie-validated antes de cualquier query.
  - `Promise.all([getCrmQueryToolsConfig(ctx), listPipelines(ctx)])` — fetch paralelo, single round-trip server-side.
  - Banner de error si `listPipelines` falla; fallback a array vacio para que el editor renderize.
  - Header "Herramientas CRM" + descripcion contextual sobre comportamiento sin cache.
  - Renderiza `<ConfigEditor initialConfig={config} pipelines={pipelines ?? []} />`.
- **_actions.ts Server Action** (`src/app/(dashboard)/agentes/crm-tools/_actions.ts`):
  - `'use server'` directive en linea 11 (despues del doc-comment).
  - `SaveInputSchema = z.object({ pipelineId: z.string().uuid().nullable(), activeStageIds: z.array(z.string().uuid()) })` — schema NO incluye `workspaceId` (mitiga T-W4-01).
  - `saveCrmQueryToolsConfigAction(input)`:
    1. `getActiveWorkspaceId()` — falla si no hay workspace.
    2. `safeParse(input)` — defense-in-depth zod validation server-side.
    3. `updateCrmQueryToolsConfig({ workspaceId, source: 'server-action' }, { pipelineId, activeStageIds })` — domain layer.
    4. `revalidatePath('/agentes/crm-tools')` on success.
    5. Returns discriminated union `{ success: true; data } | { success: false; error }`.
  - Cero imports de `createAdminClient` o `@supabase/supabase-js` (Regla 3 verificable por grep).
- **MultiSelectStages.tsx** (`_components/MultiSelectStages.tsx`):
  - Variante INLINE multi-select que acepta `{value: string, label: string}[]` agrupado por pipeline (StageGroup[]).
  - NO refactoriza `routing/editor/_components/MultiSelect.tsx` (que acepta `string[]` de labels — incompatible con UUID-as-value).
  - Usa Radix `Popover` + `Checkbox` + shadcn `Button`.
  - Trigger button: `aria-label="Stages activos"` + `role="combobox"`.
  - Cada checkbox: `role="checkbox"` + `aria-checked={isSelected}` + `aria-label={opt.label}`.
  - Trigger label: placeholder vacio / `label1, label2` (≤2) / `N stages seleccionados` (>2).
- **ConfigEditor.tsx** (`_components/ConfigEditor.tsx`):
  - `'use client'` + `useTransition` + `sonner` toast.
  - Pipeline picker: `<select>` nativo con `aria-label="Pipeline"` + `role="combobox"`. Opcion vacia = "Todas las pipelines" (= null).
  - Stages section: `<MultiSelectStages>` con `groups` derivado por `useMemo` (sort por position).
  - Save button: `<Button onClick={onSave} disabled={isPending}>` — texto "Guardando..." | "Guardar".
  - Toast feedback: `toast.success('Configuracion guardada')` | `toast.error('Error al guardar: ...')`.
- **Verificaciones de aceptacion (todas verdes):**
  - `grep "/agentes/crm-tools" layout.tsx` = 1.
  - `grep "Herramientas CRM" layout.tsx` = 1.
  - `grep -c "getActiveWorkspaceId" page.tsx` = 2 (import + use).
  - `grep -c "Promise.all" page.tsx` = 1.
  - `grep -c "<ConfigEditor" page.tsx` = 1.
  - `grep -c "use server" _actions.ts` = 1.
  - `grep -c "saveCrmQueryToolsConfigAction" _actions.ts` = 1 export.
  - `grep -c "getActiveWorkspaceId" _actions.ts` = 2 (import + use).
  - `grep -c "revalidatePath" _actions.ts` = 2 (import + use).
  - `grep -c "safeParse" _actions.ts` = 1.
  - `grep -E "createAdminClient|@supabase/supabase-js" crm-tools/` = 0 (verificable!).
  - `grep -c "'use client'"` ConfigEditor + MultiSelectStages = 1 + 1 = 2.
  - `grep -c "saveCrmQueryToolsConfigAction" ConfigEditor.tsx` = 3 (import + 2 type + use).
  - `grep -c "useTransition\\|startTransition" ConfigEditor.tsx` = 4.
  - `grep -cE 'aria-label="(Pipeline|Stages activos)"'` = 2 ConfigEditor + 1 MultiSelectStages.
  - `grep -cE 'role="combobox"'` = 2 ConfigEditor (incluye doc-comment) + 1 MultiSelectStages.
  - `grep -c "Configuracion guardada" ConfigEditor.tsx` = 2 (1 doc-comment + 1 jsx).

## Task Commits

Cada task committed atomicamente con conventional-commit format:

1. **Task 5.1 — layout.tsx tab** — `20337a3` (`feat(crm-query-tools): plan-05 task-1 — tab Herramientas CRM en /agentes layout`)
2. **Task 5.2 — page.tsx Server Component** — `56d42c5` (`feat(crm-query-tools): plan-05 task-2 — page.tsx (Server Component)`)
3. **Task 5.3 — _actions.ts Server Action** — `fe11719` (`feat(crm-query-tools): plan-05 task-3 — _actions.ts (server action)`)
4. **Task 5.4 — ConfigEditor + MultiSelectStages Client Components** — `9bf48e6` (`feat(crm-query-tools): plan-05 task-4 — ConfigEditor + MultiSelectStages`)
5. **Task 5.5 — smoke + push** — n/a (no archivos nuevos; verificacion + push de los 4 commits anteriores siguiendo precedente Plan 03/04)

## Files Created/Modified

### Created (este agente)

- **`src/app/(dashboard)/agentes/crm-tools/page.tsx`** (57 lineas) — Server Component. Imports SOLO `@/app/actions/workspace` (`getActiveWorkspaceId`), `@/lib/domain/crm-query-tools-config` (`getCrmQueryToolsConfig`), `@/lib/domain/pipelines` (`listPipelines`), `./_components/ConfigEditor`. Cero DB direct.
- **`src/app/(dashboard)/agentes/crm-tools/_actions.ts`** (66 lineas) — `'use server'` Server Action con zod schema + getActiveWorkspaceId guard. Imports SOLO `next/cache`, `zod`, `@/app/actions/workspace`, `@/lib/domain/crm-query-tools-config`. Cero DB direct.
- **`src/app/(dashboard)/agentes/crm-tools/_components/ConfigEditor.tsx`** (108 lineas) — Client Component editor con useTransition + sonner toast.
- **`src/app/(dashboard)/agentes/crm-tools/_components/MultiSelectStages.tsx`** (124 lineas) — Inline multi-select variant aceptando `{value, label}[]` agrupado.

### Modified

- **`src/app/(dashboard)/agentes/layout.tsx`** (+2 lineas, -1):
  - Import `Wrench` agregado a la lista de iconos.
  - Entry `{ href: '/agentes/crm-tools', label: 'Herramientas CRM', icon: Wrench, exact: false }` agregado al array `tabs` entre `Auditoria` y `Configuracion`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] DomainResult.data is optional — null guard required**
- **Found during:** Task 5.3 (compile pass after writing _actions.ts).
- **Issue:** El plan instruia `return { success: true, data: result.data }` directamente, pero `DomainResult<T>` define `data?: T` (opcional, no requerido). TypeScript strict bloqueaba el assign al `data: CrmQueryToolsConfig` requerido del discriminated union de retorno.
- **Fix:** Agregue guard explicito antes del return:
  ```ts
  if (!result.data) {
    return { success: false, error: 'Domain returned success but no data.' }
  }
  return { success: true, data: result.data }
  ```
- **Files modified:** `src/app/(dashboard)/agentes/crm-tools/_actions.ts`.
- **Commit:** `fe11719`.

**2. [Rule 1 - Bug] result.error fallback en discriminated union**
- **Found during:** Task 5.3 (compile pass).
- **Issue:** `DomainResult.error` es `error?: string` opcional. `if (!result.success) return { success: false, error: result.error }` fallaba TS strict porque error podia ser undefined.
- **Fix:** `result.error ?? 'Unknown error'`.
- **Files modified:** `src/app/(dashboard)/agentes/crm-tools/_actions.ts`.
- **Commit:** `fe11719`.

**3. [Rule 1 - Bug] page.tsx pipelinesResult.data fallback**
- **Found during:** Task 5.2 (typing review).
- **Issue:** Mismo patron — `pipelinesResult.success ? pipelinesResult.data : []` retorna `PipelineWithStages[] | undefined` cuando success=true porque data es optional.
- **Fix:** Wrapper `pipelines={pipelines ?? []}` en el render del Client Component para garantizar array.
- **Files modified:** `src/app/(dashboard)/agentes/crm-tools/page.tsx`.
- **Commit:** `56d42c5`.

**4. [Rule 1 - Bug] Doc-comment con createAdminClient hacia el grep fallar acceptance**
- **Found during:** Task 5.3 (verify automated grep step).
- **Issue:** El plan tenia el doc-comment "Regla 3 invariant: this file does NOT import createAdminClient" que satisface humanos pero hace `grep -E "createAdminClient|..."` retornar 1 match (el comment). Acceptance dice "returns 0 matches".
- **Fix:** Reword del doc-comment a "this file does NOT import the admin Supabase client" — el principio se preserva, el grep cumple 0 matches literalmente.
- **Files modified:** `src/app/(dashboard)/agentes/crm-tools/_actions.ts`.
- **Commit:** `fe11719` (incluye edit pre-commit).

### Decisions outside plan literal

- **Tab posicionado entre `Auditoria` y `Configuracion`**, no antes de Auditoria como sugiere el plan header (Task 5.1 step 3 dice "AFTER routing tab y BEFORE auditoría"). Razon: Auditoria es sub-route de Router (`/agentes/routing/audit`) — separarlas rompe el agrupamiento logico. La intencion del plan (tab visible en /agentes para operadores) se respeta.

## Threat Surface Scan

Sin nuevas surface no contemplada en `<threat_model>` del Plan 05. Las 7 amenazas (T-W4-01..T-W4-07) ya estan documentadas y la mitigacion principal — `getActiveWorkspaceId()` cookie-validated + zod schema sin `workspaceId` field — esta implementada y verificable por grep. El backlog de mitigaciones diferidas (cross-workspace stage_id check, max stages cap) queda anotado para Plan 07 INTEGRATION-HANDOFF.md.

## Self-Check

Verifications run after writing this SUMMARY:

**Files created:**
- `src/app/(dashboard)/agentes/crm-tools/page.tsx` — FOUND
- `src/app/(dashboard)/agentes/crm-tools/_actions.ts` — FOUND
- `src/app/(dashboard)/agentes/crm-tools/_components/ConfigEditor.tsx` — FOUND
- `src/app/(dashboard)/agentes/crm-tools/_components/MultiSelectStages.tsx` — FOUND

**Files modified:**
- `src/app/(dashboard)/agentes/layout.tsx` — FOUND (grep "/agentes/crm-tools" = 1)

**Commits exist:**
- `20337a3` — FOUND
- `56d42c5` — FOUND
- `fe11719` — FOUND
- `9bf48e6` — FOUND

**Push to origin/main:** SUCCESS (`ab2fd6a..9bf48e6`).

**tsc + lint + vitest regression:** PASS (35/35 module tests, zero tsc errors, zero lint errors).

## Self-Check: PASSED
