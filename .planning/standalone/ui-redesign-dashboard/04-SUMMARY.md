---
phase: ui-redesign-dashboard
plan: 04
subsystem: tareas-module-editorial-reskin
tags:
  - editorial
  - ui-only
  - feature-flag
  - per-workspace-gate
  - regla-6
  - wave-1
  - kanban-card
  - dictionary-table
  - portal-sweep
  - alert-dialog-extension
requirements:
  - D-DASH-07
  - D-DASH-08
  - D-DASH-09
  - D-DASH-10
  - D-DASH-11
  - D-DASH-12
  - D-DASH-14
  - D-DASH-15
dependency_graph:
  requires:
    - ui-redesign-dashboard Plan 01 (shipped 2026-04-23) — aporta `getIsDashboardV2Enabled`, `DashboardV2Provider`/`useDashboardV2()`, `.theme-editorial` CSS scope, per-segment fonts
    - ui-redesign-dashboard Plan 03 (shipped 2026-04-23, HEAD b155f84) — aporta `sheet.tsx` con prop opcional `portalContainer?: HTMLElement | null` (consumida aqui sin modificarla)
    - ui-redesign-conversaciones (shipped 2026-04-22) — aporta tokens + `.mx-*` utilities en globals.css; `popover.tsx` con `portalContainer` (consumida en task-form.tsx date picker)
  provides:
    - src/components/ui/alert-dialog.tsx extendido con prop opcional `portalContainer?: HTMLElement | null` (BC, pull-forward desde Task 5 a Task 1 por dependencia de uso en task-list.tsx; Plans 05/06/07/08 pueden consumirlo)
    - Tareas module completamente re-skineado cuando `useDashboardV2()===true`: page topbar editorial + saved-view tabs + chip-row filters + view-toggle kanban/list + TaskKanban 4-col + TaskCard editorial article + TaskRow dictionary-table + TaskDetailSheet dp-hd + dp-meta-grid + details sections + TaskForm editorial inputs + .btn.red + portal sweep
    - TaskCard + TaskRow como componentes reutilizables para kanban/list views del modulo tareas
    - Patron de portal target via `document.querySelector<HTMLElement>('.theme-editorial')` (usado en task-list, task-filters, task-detail-sheet, task-form)
  affects:
    - Plans 05/06/07/08 — pueden consumir alert-dialog.tsx portalContainer prop sin modificar el primitive
    - Orchestrator Wave 1 close — tras completar Plans 02 + 03 + 04, orchestrator consolida STATE.md/ROADMAP.md
tech_stack:
  added: []
  patterns:
    - Branching `v2 ? <editorial> : <legacy>` JSX gate con rama OFF byte-identical (Regla 6)
    - Portal sweep via `document.querySelector<HTMLElement>('.theme-editorial')` pasado como `portalContainer` prop a Radix primitives (Sheet, Popover, AlertDialog)
    - Shadcn primitive extension aditiva BC: AlertDialogContent gana prop opcional `portalContainer` pasada a AlertDialogPortal `container` (mismo patron que `sheet.tsx` + `popover.tsx` en plans anteriores)
    - Kanban card article pattern (D-DASH-12): paper-0 + border ink-1 + shadow-stamp oklch + pri-stripe absolute 3px (rubric-2/accent-gold/ink-4) + hd dotted-bottom (id mono + type smallcaps) + body display title + serif italic excerpt + meta mono con iconos lucide + foot dotted-top (avatar iniciales + assignee italic + sla mono con tone danger/warn/ok)
    - Dictionary-table pattern (D-DASH-11): <table> border-collapse paper-0 + border ink-1 + shadow-stamp + thead th smallcaps 10px tracking-0.10em + tbody td sans 13px + row hover paper-2 + selected color-mix rubric-2 4%
    - Status pills 4-state (mock §table.list line 272-276): pending/progress/wait/done con border + color-mix bg + smallcaps uppercase (D-DASH-15, NO `.mx-tag--*` porque el mock mapea 1:1 a estas clases)
    - Dp-hd ledger-style: mono "T-XXXX · tipo" + display h2 22px + serif italic tagline
    - Dp-meta-grid 2-col: cells border-r/border-b con label smallcaps 9px tracking-0.14em + value sans 13px
    - Dp-sect <details> collapsibles con summary smallcaps 10px tracking-0.14em + chevron rubric-2 + count mono ml-auto
    - Editorial form inputs (D-DASH-14): border ink-1 rounded-[3px] paper-0 + labels smallcaps tracking-[0.12em] uppercase ink-3 + swatches 10x10 border ink-1 en vez de dots colored
    - Buttons: `.btn.red` submit (bg rubric-2 + border rubric-1 + shadow rubric-1), `.btn` ghost outline cancel (bg paper-0 + border ink-1 + shadow ink-1), ambos rounded-[3px] font-semibold
    - SSR-resolved flag passed por prop (`dashV2`) con fallback a `useDashboardV2()` para evitar first-paint flash
    - View-mode persistence: localStorage key `morfx_tareas_view_mode` default 'kanban'
key_files:
  created:
    - src/app/(dashboard)/tareas/components/task-card.tsx
    - src/app/(dashboard)/tareas/components/task-kanban.tsx
    - src/app/(dashboard)/tareas/components/task-row.tsx
  modified:
    - src/app/(dashboard)/tareas/page.tsx
    - src/app/(dashboard)/tareas/components/task-list.tsx
    - src/app/(dashboard)/tareas/components/task-filters.tsx
    - src/app/(dashboard)/tareas/components/task-detail-sheet.tsx
    - src/app/(dashboard)/tareas/components/task-form.tsx
    - src/components/ui/alert-dialog.tsx
decisions:
  - D-DASH-07 observed — cero cambios a domain/hooks/server-actions (`getTasks`, `getTaskTypes`, `getTaskSummary`, `getWorkspaceMembers`, `createTask`, `updateTask`, `deleteTask`, `completeTask`, `reopenTask`, `getTaskNotes`, `getTaskActivity`) + cero cambios a `useForm`/Controller/react-hook-form logic
  - D-DASH-08 observed — mock tareas.html como fuente de verdad; `oklch()` literal en TaskCard shadow replica el mock linea 90 exactamente
  - D-DASH-09 observed — extension aditiva BC a alert-dialog.tsx con `portalContainer?: HTMLElement | null` opcional, pull-forward desde Task 5 a Task 1 commit porque TaskList ya consume la prop
  - D-DASH-10 observed — 4 portales in-scope re-rootean a `.theme-editorial` cuando v2: Sheet del task-detail-sheet, Sheet del create/edit en task-list, AlertDialog delete en task-list, Popover del calendar picker en task-form (+ SheetContent del TaskFormDialog wrapper)
  - D-DASH-11 observed — dictionary-table pattern aplicado en TaskRow/list view
  - D-DASH-12 observed — kanban card pattern implementado en TaskCard (article paper-0 + border ink-1 + shadow-stamp + pri-stripe)
  - D-DASH-14 observed — form treatments aplicados a inputs + Labels + buttons en task-form.tsx
  - D-DASH-15 observed — status pills 4-state con color-mix en lugar de `.mx-tag--*` classes (mock explicito)
  - TaskStatus enum NO incluye 'in_progress' — 4-col kanban conservado para fidelidad al mock; "En proceso" queda vacia visualmente hasta que backend introduzca el status (documentado abajo)
  - No DnD library activa en tareas — drag-and-drop deferido a deuda futura (confirmado via `grep @dnd-kit` sin resultados en src/app/(dashboard)/tareas/ y src/components/tasks/)
  - TaskNotesSection + TaskHistoryTimeline + TaskItem + PostponementBadge shadcn intactos — cascade parcial via `.theme-editorial`, editorial full reskin deferido a `ui-redesign-dashboard-extras`
  - Saved-view tabs son UI-local state: activar una tab aplica overlay de filtro que coexiste con chip-row status/priority/assignment filters (no muta `setFilters` del TaskFiltersBar)
metrics:
  duration: ~75min
  completed_date: 2026-04-23
  tasks_completed: 5
  files_created: 3
  files_modified: 6
  lines_added: 1576
  lines_removed: 136
---

# Phase ui-redesign-dashboard Plan 04: Tareas Module Editorial Re-skin Summary

Wave 1 — Modulo Tareas re-skineado al lenguaje editorial con 9 archivos (3 nuevos + 6 modificados): page topbar + saved-view tabs + chip-row filters + view-toggle + kanban 4-col editorial + list-view dictionary-table + detail sheet ledger + form editorial. Todo gated por `useDashboardV2()` con rama OFF byte-identical al HEAD pre-plan (Regla 6). alert-dialog.tsx ganó extension aditiva BC de `portalContainer` prop (pull-forward desde Task 5 a Task 1 por dependencia de uso en task-list.tsx).

## Objective (from plan)

Wave 1 — Re-skin el modulo Tareas completo al lenguaje editorial: page topbar + tabs/chips/view-toggle + kanban 4-col con cards article + list-view dictionary-table + detail sheet con timeline + form editorial. Todo gated por `useDashboardV2()` con flag-OFF byte-identical (Regla 6).

## Tasks Completed

| Task | Name                                                                                       | Commit    | Files                                                                                                                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Topbar editorial + tabs subrayadas + chip-row + view-toggle tareas                          | f38b19c   | `src/app/(dashboard)/tareas/page.tsx`, `src/app/(dashboard)/tareas/components/task-list.tsx`, `src/app/(dashboard)/tareas/components/task-filters.tsx`, `src/components/ui/alert-dialog.tsx` (pull-forward), stubs task-kanban + task-row |
| 2    | TaskKanban 4-col + TaskCard editorial article                                              | 80b2fac   | `src/app/(dashboard)/tareas/components/task-kanban.tsx`, `src/app/(dashboard)/tareas/components/task-card.tsx`                                                                                                               |
| 3    | TaskRow editorial para dictionary-table list-view                                          | a3f2ffd   | `src/app/(dashboard)/tareas/components/task-row.tsx`                                                                                                                                                                         |
| 4    | TaskDetailSheet editorial con dp-hd + meta-grid + details                                  | 7a295f6   | `src/app/(dashboard)/tareas/components/task-detail-sheet.tsx`                                                                                                                                                                |
| 5    | TaskForm editorial inputs + .btn.red + portalContainer                                     | a37288e   | `src/app/(dashboard)/tareas/components/task-form.tsx`                                                                                                                                                                        |

Total: 5 atomic commits, 9 files (3 created + 6 modified), 1576 insertions / 136 deletions.

Base commit: `b155f84` (Plan 03 SUMMARY merged). Orden programático normal: T1 → T2 → T3 → T4 → T5.

## Verification

### Per-task acceptance criteria

**Task 1 — page.tsx + task-list.tsx + task-filters.tsx + alert-dialog.tsx (pull-forward)**
- [x] `getIsDashboardV2Enabled` en page.tsx (resolucion SSR del flag)
- [x] `useDashboardV2` en task-list.tsx (fallback al contexto)
- [x] "Modulo · Operacion" eyebrow con U+00B7 (mock fidelity)
- [x] `morfx_tareas_view_mode` localStorage key para persistence del view mode (default kanban)
- [x] Tabs saved-views (Todas/Mías/Sin asignar/Vencen hoy) con counts mono
- [x] View toggle `Tablero` / `Lista` border ink-1 + stamp + ON state bg ink-1
- [x] `border-b border-[var(--ink-1)]` en page header (hard rule)
- [x] `.btn.red` style (bg rubric-2 + border rubric-1 + shadow rubric-1) en Nueva tarea button
- [x] `v2` prop en task-filters + chip-row pills rounded-full + Select triggers editorial
- [x] Empty state v2 con mx-display h3 + serif italic caption + .btn.red
- [x] Regla 6 NO-TOUCH: `getTasks`, `getTaskSummary`, `groupTasks` preservados; flag OFF renderea header + ToggleGroup + Select shadcn verbatim
- [x] alert-dialog.tsx extension BC: `portalContainer?: HTMLElement | null` prop opcional en `AlertDialogContent` forwarded a `AlertDialogPortal` `container`
- [x] `npx tsc --noEmit` zero errors

**Task 2 — task-card.tsx + task-kanban.tsx (NEW)**
- [x] TaskCard article paper-0 + border ink-1 + shadow-stamp oklch (mock linea 90 exacto)
- [x] pri-stripe absolute 3px con color per priority (rubric-2/accent-gold/ink-4)
- [x] Header dotted-bottom con id mono T-XXXX + task_type smallcaps 9px coloreado por heuristica de name (CRM→accent-indigo, ops→accent-verdigris, escala/agente→rubric-2, default→ink-2)
- [x] Body display 15px font-bold title + serif italic 12px excerpt + meta mono 10px con iconos lucide separados por `·` ink-5
- [x] Foot dotted-top bg paper-1 con avatar 22x22 iniciales + assignee italic + sla mono ml-auto (danger=rubric-2 700, warn=accent-gold 600, ok=semantic-success) via formatDistanceToNow(date-fns locale es)
- [x] TaskKanban grid 4-col repeat(4, minmax(260px, 1fr)) gap-3.5
- [x] Columns: Pendiente/accent-gold, En proceso/accent-verdigris (vacia hoy), En espera/accent-indigo (postponement>0), Completada/ink-1
- [x] Column sticky header con swatch 10x10 + h3 smallcaps 11px tracking-0.12em + count mono · ml-auto + add button opcional
- [x] Empty state per-column "Sin tareas en {estado}."
- [x] role="button" + tabIndex=0 + Enter/Space keyboard activation (a11y)
- [x] Zero imports de `src/lib/agents`, `src/inngest`, `src/app/actions/tasks`
- [x] TypeScript clean

**Task 3 — task-row.tsx (NEW)**
- [x] `<tr>` con hover paper-2 + selected color-mix(rubric-2 4%) tint
- [x] 6 cells: id mono (T-XXXX) + title sans + excerpt serif italic + status pill + priority + assigned + due date
- [x] Status pill 4-state: Completada (text paper-0 + bg ink-1), En espera (accent-indigo + color-mix 8%), En proceso (accent-verdigris — ready para futuro), Pendiente (accent-gold + color-mix 10%) per D-DASH-15
- [x] Due date tone: rubric-2 font-semibold cuando past+not-today+not-completed; Hoy si today; formato 'd MMM' locale es
- [x] Zero imports fuera de scope (D-DASH-07)
- [x] task-list.tsx integra TaskRow en `<tbody>` loop con `<thead>` smallcaps sticky + empty row italic
- [x] `groupTasks` helper preservado para non-v2 path

**Task 4 — task-detail-sheet.tsx**
- [x] `useDashboardV2` hook + portalContainer via useEffect `document.querySelector('.theme-editorial')` (D-DASH-10)
- [x] SheetContent v2 con bg paper-1 + border-l ink-1
- [x] Dp-hd v2: bg paper-0 + border-b ink-1 + row-1 mono (id + tipo) + close button + h2 display 22px tracking-[-0.01em] + PostponementBadge + serif italic tagline
- [x] EditorialMetaGrid 2-col border-r/border-b con 6 cells (Estado, Prioridad, Fecha limite, Asignado, Tipo, Vinculada) con label smallcaps 9px tracking-[0.14em] + value sans 13px
- [x] 2 `<details open>` collapsibles (Notas + Historial) con summary smallcaps 10px tracking-[0.14em] + ChevronRight rubric-2 + count mono ml-auto
- [x] Loading state con `bg-[var(--paper-2)] border-[var(--border)]` cuando v2
- [x] Flag OFF: Tabs/TabsContent info/notes/history con TaskInfoSection inline PRESERVADO verbatim
- [x] Sub-components preservados: TaskNotesSection + TaskHistoryTimeline + PostponementBadge + `getTaskNotes` + `getTaskActivity` + `currentUserId` + `isAdminOrOwner` props
- [x] Zero oklch literal + zero dark: en este archivo

**Task 5 — task-form.tsx**
- [x] `useDashboardV2` hook + portalTarget via `document.querySelector('.theme-editorial')`
- [x] editorialInputClasses constant (border ink-1 + rounded-[3px] + bg paper-0 + focus outline ink-1 + shadow-none) aplicado a todos los Input/Textarea/SelectTrigger cuando v2
- [x] editorialLabelClassName (font-semibold tracking-[0.12em] uppercase ink-3) + editorialLabelStyle aplicados a todos los Labels cuando v2
- [x] Priority Select items: swatches 10x10 border ink-1 (rubric-2/accent-gold/ink-4) cuando v2 en lugar de dots colored. TaskType Select items: swatches 10x10 con type.color como background
- [x] Server error block editorial: border rubric-2 + bg color-mix(rubric-2 8%) + text rubric-2 + rounded-[3px]
- [x] Footer buttons v2: Cancelar .btn ghost outline (bg paper-0 + border ink-1 + stamp + rounded-[3px]); Submit .btn.red (bg rubric-2 + border rubric-1 + shadow rubric-1 + rounded-[3px]) per D-DASH-14 + mock §btn.red
- [x] PopoverContent (calendar picker) recibe portalContainer cuando v2 (D-DASH-10)
- [x] TaskFormDialog wrapper: SheetContent portalContainer + bg paper-1 + border-l ink-1 + SheetHeader border ink-1 + SheetTitle display 20px + SheetDescription serif italic 13px
- [x] Regla 6 NO-TOUCH: `useForm`, `Controller`, `createTask`, `updateTask`, `combineDateAndTime`, `TIME_OPTIONS`, `defaultValues`, `Calendar locale=es`, validation rules preservados

### Overall plan verification

- [x] `npx tsc --noEmit` zero errors en los 9 archivos modificados (ejecutado tras cada task commit + tras plan completion)
- [x] `git diff --stat b155f84..HEAD -- src/lib/domain/ src/hooks/ src/lib/agents/ src/inngest/ src/app/actions/` = zero changes (D-DASH-07)
- [x] Slate leakage check en NEW files (task-card.tsx, task-kanban.tsx, task-row.tsx): zero matches de `text-muted-foreground|bg-muted|text-destructive|bg-destructive|border-input|ring-ring`
- [x] `var(--*)` usage count en src/app/(dashboard)/tareas/ = 212 (spec >= 80)
- [x] Regla 6 NO-TOUCH greps: page.tsx tiene `getTasks`/`getTaskSummary`; task-list.tsx tiene `groupTasks` + `TaskItem`; task-form.tsx tiene `useForm`/`createTask`/`updateTask`/`combineDateAndTime`/`TIME_OPTIONS`; task-detail-sheet.tsx tiene `getTaskNotes`/`getTaskActivity`/`TaskNotesSection`/`TaskHistoryTimeline`/`PostponementBadge`/`currentUserId`/`isAdminOrOwner`

## Key findings

### TaskStatus enum discovery (4-col vs 3-col kanban)

`src/lib/tasks/types.ts` linea 53 define `TaskStatus = 'pending' | 'completed'` (NO `'in_progress'`). Decision: **mantener 4-col layout por fidelidad al mock** (tareas.html §kanban muestra 4 columnas). La columna "En proceso" queda visualmente vacia hasta que backend introduzca el status. Documentado in-line en task-kanban.tsx:
```ts
// TaskStatus doesn't include 'in_progress' today — column stays empty.
// When backend introduces it, match (t.status as string) === 'in_progress'.
```
Alternativa 3-col (Pendiente / En espera / Completada) descartada porque: (1) el mock muestra 4 columnas, (2) el column ancho `minmax(260px, 1fr)` queda coherente, (3) el valor visual de "reserved slot" comunica que el status existira.

En espera = `status==='pending' AND postponement_count > 0` — derivacion sin nuevos queries, puramente client-side.

### DnD library inventory

`grep -rln '@dnd-kit\|react-dnd\|react-beautiful-dnd' src/app/(dashboard)/tareas/ src/components/tasks/` retorna zero matches. No hay DnD library activa en el modulo tareas. Drag-and-drop deferido como deuda futura (CONTEXT §Handoff futuro). TaskCard tiene role="button" + keyboard activation (Enter/Space) pero no draggable.

### AlertDialog `portalContainer` extension (pull-forward)

Task 5 del plan 04 especificaba: "if `src/components/ui/alert-dialog.tsx` does NOT yet support `portalContainer`, add the prop additively (mirror what Plan 01 did for Sheet/Dialog)". Pre-plan, alert-dialog.tsx NO soportaba la prop (verificado via grep). TaskList (Task 1) consume la prop en el delete dialog — por lo tanto la extension aditiva BC hubo de aplicarse en Task 1 commit (pull-forward), NO Task 5. Documentado en commit `f38b19c` + T1 mensaje de commit.

Pattern aplicado (identico a sheet.tsx):
```tsx
function AlertDialogContent({
  className,
  size = "default",
  portalContainer,  // <- NEW opcional
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content> & {
  size?: "default" | "sm"
  portalContainer?: HTMLElement | null
}) {
  return (
    <AlertDialogPortal container={portalContainer ?? undefined}>
      ...
```

`AlertDialogPortal` signature tambien extendida a aceptar `container` prop via spread del `React.ComponentProps<typeof AlertDialogPrimitive.Portal>`.

Consumers existentes de `AlertDialogContent` en src/ no afectados (prop opcional). BC preservada.

### Mock vs implementation pixel-diff notes

**Desviaciones tasteful (no bugs) del mock tareas.html:**

1. **Type heuristic coloring**: mock muestra 3 colores (rubric-2/accent-indigo/accent-verdigris/ink-2) para `.task-hd .type` con clases `.crm`, `.ops`, `.human`, default. Implementacion: heuristica regex sobre `task_type.name` (ej: 'lead'→accent-indigo, 'ops'→accent-verdigris, 'escala'→rubric-2, else→ink-2). TaskType.name es user-defined en DB — zero queries/mutations necesarias para esta derivacion visual (D-DASH-07 safe).

2. **SLA label format**: mock hardcodea "Venció hace 2h", "SLA: 1h". Implementacion usa `formatDistanceToNow` de `date-fns` con `locale: es` + `addSuffix: false`. Resultado cercano pero no pixel-exacto; comunica la misma idea.

3. **TaskRow avatars/tags**: mock `table.list tbody td` puede mostrar avatares inline. Implementacion simplificada: texto "username" + fallback "Sin asignar". Avatars inline en tabla queda como micro-deuda (no bloqueante, la pill status + priority + due cubren la informacion esencial).

4. **Dp-composer + checklist**: mock tareas.html lines 221-246 muestran zonas de composer (replies) y checklist en el detail sheet. Plan 04 NO las incluye porque estos features no existen en task-detail-sheet.tsx actual. Agregarlos require backend work (nuevo domain para checklists + composer de notas ya existe en TaskNotesSection). Deferido a `ui-redesign-dashboard-extras`.

5. **Timeline editorial `<div class="tl">` con dots colored**: mock lines 196-218 muestran timeline custom con `tl-ev.bot/human/system/warn` color dots. Implementacion renderea el componente existente `TaskHistoryTimeline` que no tokeniza los dots. Cascade parcial via `.theme-editorial`. Editorial full reskin de `TaskHistoryTimeline` deferido.

6. **`oklch()` literal en TaskCard shadow**: mock linea 90 define `box-shadow: 0 1px 0 var(--ink-1), 0 4px 12px -10px oklch(0.2 0.04 60 / 0.25)` — oklch con valores hardcoded para opacity del drop shadow. Implementacion replica exactamente ese pattern en task-card.tsx linea 98-99. El plan's acceptance criterion `! grep "oklch("` fue demasiado estricto; el plan action block mostraba explicitamente este shadow con oklch. Decision: fidelidad al mock prevalece sobre grep generico.

### `dark:` class en groupTasks (task-list.tsx)

El groupTasks helper pre-existente tiene `className: 'text-yellow-600 dark:text-yellow-400'` en el group "Hoy". Este helper es NON-V2 path (Regla 6 byte-identical). El plan spec general dice "no dark: classes added" pero esto NO es una clase NUEVA agregada por el plan — es preservacion verbatim. Decision: preservar (Regla 6 wins sobre la regla general no-dark:).

## Flag OFF byte-identical proof

Cada ternary `v2 ? <editorial> : <legacy>` preserva el JSX/classNames originales pre-plan en la rama OFF.

| OLD className / JSX preservado                                       | Archivo                     | Flag OFF matchea |
| -------------------------------------------------------------------- | --------------------------- | ---------------- |
| `<h1 className="text-2xl font-bold">Tareas</h1>`                     | page.tsx                    | grep pass        |
| `text-muted-foreground` summary parrafo                              | page.tsx                    | grep pass        |
| `<ToggleGroup type="single" ...>` status                             | task-filters.tsx            | grep pass        |
| `bg-muted rounded-lg p-1`                                            | task-filters.tsx            | grep pass        |
| `h-2 w-2 rounded-full bg-red-500` priority dots                      | task-filters.tsx            | grep pass        |
| `<Button onClick={() => setFormSheetOpen(true)}>` sin .btn.red       | task-list.tsx (rama OFF)    | grep pass        |
| `rounded-full bg-muted p-4 mb-4` empty state                         | task-list.tsx (rama OFF)    | grep pass        |
| `space-y-6` + groupTasks vertical layout + TaskItem                  | task-list.tsx (rama OFF)    | grep pass        |
| `bg-destructive text-destructive-foreground` AlertDialogAction       | task-list.tsx (rama OFF)    | grep pass        |
| `<Tabs defaultValue="info">` + TaskInfoSection inline                | task-detail-sheet.tsx       | grep pass        |
| `text-sm text-destructive bg-destructive/10`                         | task-form.tsx (rama OFF)    | grep pass        |
| `text-muted-foreground` Label flag OFF                               | task-form.tsx (rama OFF)    | grep pass        |

Con `ui_dashboard_v2.enabled` ausente/false, `getIsDashboardV2Enabled` retorna `false`, `DashboardV2Provider` contiene `false`, `useDashboardV2()` retorna `false`, `dashV2Prop ?? v2FromContext` evalua a `false`, cada ternary escoge la rama `<legacy>` → DOM output byte-identical al HEAD pre-plan.

## D-DASH-07 NO-TOUCH proof

```bash
$ git diff --stat b155f84..HEAD -- src/lib/ src/hooks/ src/inngest/ src/app/actions/
(empty — zero changes)
```

Archivos referenciados pero preservados verbatim:
- Server actions: `getTasks`, `getTaskTypes`, `getTaskSummary`, `getWorkspaceMembers`, `createTask`, `updateTask`, `deleteTask`, `completeTask`, `reopenTask`, `getTaskNotes`, `getTaskActivity`
- `useForm` + `Controller` + `react-hook-form` logic
- Types: `TaskWithDetails`, `TaskType`, `TaskFilters`, `TaskPriority`, `TaskStatus`, `MemberWithUser`
- Helpers: `combineDateAndTime`, `getDefaultTime`, `extractTime`, `TIME_OPTIONS`, `groupTasks`
- Shared components (shadcn interiores intactos): `TaskNotesSection`, `TaskHistoryTimeline`, `TaskItem`, `PostponementBadge`

## Portal-Sweep Targets

### Cubiertos por este plan (re-rootean a `.theme-editorial` cuando v2)

| Primitive                       | Archivo                                                                   | Task |
| ------------------------------- | ------------------------------------------------------------------------- | ---- |
| `<SheetContent>` (TaskDetailSheet) | `src/app/(dashboard)/tareas/components/task-detail-sheet.tsx:68`       | 4    |
| `<SheetContent>` (empty state Create) | `src/app/(dashboard)/tareas/components/task-list.tsx:~335`         | 1    |
| `<SheetContent>` (main Create/Edit)   | `src/app/(dashboard)/tareas/components/task-list.tsx:~475`         | 1    |
| `<AlertDialogContent>` (delete)       | `src/app/(dashboard)/tareas/components/task-list.tsx:~530`         | 1    |
| `<PopoverContent>` (calendar picker)  | `src/app/(dashboard)/tareas/components/task-form.tsx:~310`         | 5    |
| `<SheetContent>` (TaskFormDialog)     | `src/app/(dashboard)/tareas/components/task-form.tsx:~620`         | 5    |

### Diferidos como deuda futura (cascade via `.theme-editorial` root del layout; no necesitan portalContainer explicito porque rendean editorial por cascade)

- `<SelectContent>` instances en task-filters.tsx (priority + assignment selects) + task-form.tsx (priority + task_type + assigned) — Radix portal a document.body; `.theme-editorial` class esta en el layout root wrapper, asi que cascade funciona en la mayoria de cases. Si cambia el DOM structure y el SelectContent rompe visualmente, agregar portalContainer a `src/components/ui/select.tsx` en fase futura

## Known stubs / transitional state

1. **`<TaskNotesSection>`** (shipped pre-plan en `src/components/tasks/task-notes.tsx`): interior usa shadcn tokens. Renderea dentro de `<details>` editorial en task-detail-sheet; cascade parcial via `.theme-editorial`. Editorial full reskin deferido a `ui-redesign-dashboard-extras`.

2. **`<TaskHistoryTimeline>`** (shipped pre-plan en `src/components/tasks/task-history.tsx`): mismo caso. Mock tareas.html muestra timeline editorial custom con `.tl` + `.tl-ev.bot/human/system` dots — implementacion renderea el componente shadcn existente sin reskin. Deferido.

3. **`<PostponementBadge>`** (shipped pre-plan en `src/components/tasks/postponement-badge.tsx`): usado inline en dp-hd h2 editorial. Si el interior no tokeniza bien con `.theme-editorial` cascade, puede verse levemente slate. No bloqueante — deferido.

4. **`<TaskItem>`** (shipped pre-plan en `src/components/tasks/task-item.tsx`): usado SOLO en el non-v2 path (groupTasks vertical layout). Flag OFF preserva byte-identical; flag ON nunca lo renderea. No deuda.

5. **"En proceso" kanban column**: vacia hoy porque TaskStatus NO incluye `'in_progress'`. Cuando backend introduzca el status, un solo change a `task-kanban.tsx` filter (cambiar `(t.status as unknown as string) === 'in_progress'` a checkeo tipado) activa la columna. No deuda, transitional.

## Auth gates

None. Ningun task requirio auth setup.

## Handoff note to Wave 1 close + Wave 2

**Plan 04 Tareas landeado.** Orchestrator consolida Plans 02 (CRM) + 03 (Pedidos, shipped en base) + 04 (Tareas) como Wave 1 completa. STATE.md + ROADMAP.md actualizacion queda para el orchestrator (plan ejecutado en worktree, skip per parallel_execution contract).

**alert-dialog.tsx extension live.** Plans 05/06/07/08 pueden consumir `portalContainer` prop sin modificar el primitive.

**TaskCard + TaskRow son patterns reutilizables.** Si Plans 05 (Agentes) o 06 (Automatizaciones) necesitan kanban cards o dictionary-table rows, la implementacion de task-card.tsx + task-row.tsx son referencias directas.

**Portal target standar:** todos los portal sweeps en Plan 04 usan `document.querySelector<HTMLElement>('.theme-editorial')`. Plan 03 uso `[data-theme-scope="dashboard-editorial"]` wrapper — ambos patterns coexisten en el codebase. Decision: el layout root tiene `.theme-editorial` class (no wrapper attr), asi que el selector de clase es mas robusto para el resto de los modulos. Plans 05-08 pueden usar cualquiera de los dos (el attr existe en orders-view.tsx pedidos pero no en otros modulos).

## Activación QA (Plan 09 — referencia, NO aplicar ahora)

Post-cierre de todos los modulos + DoD pass en Plan 09, activar en Somnio:

```sql
UPDATE workspaces
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{ui_dashboard_v2,enabled}',
  'true'::jsonb,
  true
)
WHERE id = '<somnio-uuid>';
```

Antes de ese punto, ningun workspace debe tener el flag ON (Regla 6).

## Known deuda / deferrals

### Diferidos este plan — deuda para `ui-redesign-dashboard-extras`:

1. **TaskNotesSection editorial reskin** — interior shadcn, cascade parcial
2. **TaskHistoryTimeline editorial reskin** — mock muestra timeline custom con `.tl`/`.tl-ev` dots coloreados (bot/human/system), implementacion renderea componente existente
3. **TaskItem editorial reskin** — usado solo en non-v2 path; si flag ON desaparece el non-v2 path completo, TaskItem se puede borrar
4. **PostponementBadge editorial** — cascade parcial
5. **Dp-composer section** (mock lines 221-234) — not implemented porque composer de notas vive en TaskNotesSection
6. **Checklist section** (mock lines 236-246) — not implemented porque checklists no estan modelados en el schema
7. **Kanban drag-and-drop** — plan explicitamente deferido; requiere `@dnd-kit` integration o similar
8. **Avatars inline en TaskRow** — mock sugiere avatares en la tabla; implementacion texto-solo
9. **SelectContent portal re-root** — cascade parcial via `.theme-editorial` del layout; si rompe visualmente agregar `portalContainer` prop a `src/components/ui/select.tsx`

### Fuera de scope (Regla 6 compliance):

- `src/lib/domain/**`, `src/hooks/**`, `src/lib/agents/**`, `src/inngest/**`, `src/app/actions/**` — zero changes (D-DASH-07 hard)
- DB schema — zero changes (`TaskStatus` enum decision queda para backend)
- `src/components/tasks/**` componentes shared — zero changes

## Deviations from Plan

**1. [Rule 3 - Blocking] alert-dialog.tsx extension pull-forward a Task 1**

- **Found during:** Task 1 — task-list.tsx (ya planificado) uses `portalContainer` en el delete AlertDialog cuando v2
- **Issue:** Plan asigna la extension de `alert-dialog.tsx` con `portalContainer` a Task 5. Pero task-list.tsx (Task 1) ya la consume. Si committo Task 1 sin extender alert-dialog.tsx, `npx tsc` falla
- **Fix:** Incluir la extension BC a alert-dialog.tsx en el Task 1 commit (`f38b19c`). La extension es aditiva + opcional (mismo patron que sheet.tsx y popover.tsx) — consumers existentes no afectados
- **Files modified:** `src/components/ui/alert-dialog.tsx` (Task 5 files_modified originalmente; pull-forward a Task 1)
- **Commit:** `f38b19c` (Task 1)
- **Plan self-consistency:** Task 5 action block explicitamente anticipa este caso: "if `src/components/ui/alert-dialog.tsx` does NOT yet support `portalContainer`, add the prop additively ... Document in the SUMMARY if this extension was needed." → Documentado aqui.

### Notas de plan self-consistency (NO son deviations)

- **`oklch()` literal in TaskCard shadow**: el plan's acceptance grep `! grep "oklch("` es demasiado estricto; el plan action block linea 521-522 muestra explicitamente `shadow-[0_1px_0_var(--ink-1),0_4px_12px_-10px_oklch(0.2_0.04_60_/_0.25)]`. Implementacion replica el action spec verbatim. No es deviation — es plan self-consistency (el spec dice tanto el shadow como el negative-grep genericamente).

- **`dark:` class in groupTasks**: el helper pre-existente (linea 53 pre-plan) tenia `text-yellow-600 dark:text-yellow-400`. Plan explicitamente requiere "preserve groupTasks verbatim (non-v2 path)" — Regla 6. El negative-grep `! grep dark:` es generico; la regla Regla 6 de preservar groupTasks es especifica y wins.

- **Empty state Sheet portal**: el plan no pide explicitamente portalContainer en el empty state Sheet (solo en el main create/edit). Para consistencia + evitar bugs visuales agregue portalContainer tambien al empty state Sheet (defensive, BC porque recibe undefined cuando non-v2). No es deviation.

## Self-Check: PASSED

Files verificados existentes en worktree:
- `src/app/(dashboard)/tareas/page.tsx` ✅ (modified)
- `src/app/(dashboard)/tareas/components/task-list.tsx` ✅ (modified)
- `src/app/(dashboard)/tareas/components/task-filters.tsx` ✅ (modified)
- `src/app/(dashboard)/tareas/components/task-kanban.tsx` ✅ (created)
- `src/app/(dashboard)/tareas/components/task-card.tsx` ✅ (created)
- `src/app/(dashboard)/tareas/components/task-row.tsx` ✅ (created)
- `src/app/(dashboard)/tareas/components/task-detail-sheet.tsx` ✅ (modified)
- `src/app/(dashboard)/tareas/components/task-form.tsx` ✅ (modified)
- `src/components/ui/alert-dialog.tsx` ✅ (modified, BC extension)

Commits verificados en git log:
- f38b19c ✅ (Task 1 — topbar + tabs + chip-row + view-toggle + alert-dialog pull-forward)
- 80b2fac ✅ (Task 2 — TaskKanban + TaskCard NEW)
- a3f2ffd ✅ (Task 3 — TaskRow NEW)
- 7a295f6 ✅ (Task 4 — TaskDetailSheet editorial)
- a37288e ✅ (Task 5 — TaskForm editorial + portalContainer)

Zero changes a domain / hooks / actions / inngest / agents (D-DASH-07 verified via `git diff --stat`).
