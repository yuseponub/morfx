---
phase: ui-redesign-dashboard
plan: 04
type: execute
wave: 1
depends_on: ['01']
files_modified:
  - src/app/(dashboard)/tareas/page.tsx
  - src/app/(dashboard)/tareas/components/task-list.tsx
  - src/app/(dashboard)/tareas/components/task-kanban.tsx
  - src/app/(dashboard)/tareas/components/task-card.tsx
  - src/app/(dashboard)/tareas/components/task-detail-sheet.tsx
  - src/app/(dashboard)/tareas/components/task-form.tsx
  - src/app/(dashboard)/tareas/components/task-filters.tsx
  - src/app/(dashboard)/tareas/components/task-row.tsx
autonomous: true
requirements:
  - D-DASH-07
  - D-DASH-08
  - D-DASH-11
  - D-DASH-12
  - D-DASH-14
  - D-DASH-15

must_haves:
  truths:
    - "Cuando `useDashboardV2()===true`, `/tareas` renderiza un topbar editorial: eyebrow `mx-smallcaps text-[var(--rubric-2)]` con texto `'Módulo · Operación'`, h1 `mx-display` 28px serif `'Tareas'` + `<em>` mono con summary inline (`· {pending} abiertas · {overdue} vencen hoy`), botón primario `'Nueva tarea'` estilo `.btn.red` (bg `var(--rubric-2)` + border `var(--rubric-1)` + shadow ink-1) per D-DASH-12 + D-DASH-14"
    - "Cuando `useDashboardV2()===false`, el header actual de `page.tsx` (h1 + p text-muted-foreground) y todo el render de `task-list.tsx` se preserva byte-identical (Regla 6)"
    - "Cuando v2: `task-list.tsx` se reorganiza en 3 zonas verticales — (1) tabs subrayadas saved-views (4 fijas: 'Todas' / 'Mías' / 'Sin asignar' / 'Vencen hoy') con `<span class='n'>` mono count contiguo, (2) chip-row de filtros (chip ON `bg-[var(--ink-1)] text-[var(--paper-0)]`, chip OFF `border-[var(--border)] text-[var(--ink-2)]` rounded-full px-2 py-1 font-sans 11px), (3) view toggle inline-flex con `view-toggle` border-[var(--ink-1)] shadow-stamp + 2 buttons `Tablero` / `Lista` per D-DASH-12 + mock §topbar"
    - "Cuando v2 + `viewMode==='kanban'`: render NEW `<TaskKanban>` con 4 columnas fijas (Pendiente / En proceso / En espera / Completada) en grid `repeat(4,minmax(260px,1fr))` gap-3.5; cada columna `bg-[var(--paper-2)] border border-[var(--border)] flex flex-col` con sticky header `col-hd bg-[var(--paper-1)] border-b border-[var(--border)]` que tiene swatch 10x10 según estado (pending=accent-gold, progress=accent-verdigris, wait=accent-indigo, done=ink-1), h3 mx-smallcaps 11px ink-1, count `<span class='n'>` mono ml-auto, y add button (lucide Plus); column body `flex flex-col gap-2.5 p-2.5 overflow-y-auto` per D-DASH-12"
    - "Cuando v2 + `viewMode==='list'`: render reskined `<TaskList>` como dictionary-table per D-DASH-11 — `<table>` border-collapse `bg-[var(--paper-0)] border border-[var(--ink-1)]` con shadow-stamp; `<thead><th>` smallcaps rubric-2/ink-3 uppercase 10px tracking-0.10em + sticky top-0 + `bg-[var(--paper-1)] border-b border-[var(--ink-1)]`; `<tbody><td>` font-sans 13px ink-1, hover `bg-[var(--paper-2)]`, selected `bg-[color-mix(in oklch,var(--rubric-2) 4%,var(--paper-0))]`; columns: `id` mono 11px ink-3, `title` font-semibold + excerpt en `<span class='excerpt'>` font-serif italic 12px ink-3, `status` con pill editorial, `prioridad`, `asignado`, `fecha`"
    - "Cuando v2: `<TaskCard>` (NEW component reskin de TaskItem para kanban) renderiza `<article>` `bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1),0_4px_12px_-10px_oklch(0.2_0.04_60/0.25)] cursor-pointer relative` per D-DASH-12, con: (a) `pri-stripe` absolute left-0 top-0 bottom-0 w-[3px] color según priority — high → `bg-[var(--rubric-2)]`, medium → `bg-[var(--accent-gold)]`, low → `bg-[var(--ink-4)]`; (b) `task-hd` con `id` mono 10px ink-3 + `type` ml-auto smallcaps 9px rubric-2/accent-indigo/accent-verdigris según task_type (border-b border-dotted border-[var(--border)] py-1.5 px-3); (c) `task-body` py-2 px-3: `task-title` `font-display 15px font-semibold ink-1 leading-[1.3] tracking-[-0.01em]` + `task-excerpt` `font-serif italic 12px ink-2 leading-[1.5] mt-1`; (d) `task-meta` flex flex-wrap gap-x-2 gap-y-1 mt-2 font-sans 10px ink-3 con cada `<span>` font-mono 10px (icono lucide 11x11 op-70 + label) separado por `·` ink-5; (e) `task-foot` border-t border-dotted border-[var(--border)] bg-[var(--paper-1)] py-2 px-3 con avatares overlap (-ml-1 first:ml-0) circle 22x22 + `sla` ml-auto font-mono 10px (danger → rubric-2 700, warn → accent-gold 600, ok → semantic-success)"
    - "Cuando v2 + tarea seleccionada (`detailSheetOpen===true`): `<TaskDetailSheet>` aplica `portalContainer` re-root al wrapper `.theme-editorial` (D-DASH-10 modals/sheets tema-respetuosos), header `dp-hd` `bg-[var(--paper-0)] border-b border-[var(--ink-1)] px-5 py-4` con `row-1` flex font-mono 11px ink-3 + close button ml-auto + `h2` font-display 22px font-semibold ink-1 tracking-[-0.01em] leading-[1.2] + `tagline` font-serif italic 13px ink-2 mt-1.5"
    - "Cuando v2 + detail sheet: `dp-meta-grid` grid grid-cols-2 con cells `border-r border-b border-[var(--border)]` (last-of-row `border-r-0`, last-row `border-b-0`) padding-y-2.5 px-5; cada cell tiene label `mx-smallcaps 9px ink-3 tracking-[0.14em]` + value `font-sans 13px font-medium ink-1 mt-1` per D-DASH-15"
    - "Cuando v2 + detail sheet: tabs Info/Notas/Historial preservan funcionalidad de fetch (`getTaskNotes`, `getTaskActivity` D-DASH-07) pero re-skinean con `<details class='dp-sect'><summary>` smallcaps 10px ink-3 tracking-[0.14em] uppercase border-b border-[var(--border)] hover:bg-[var(--paper-2)] + content `dp-body px-5 pb-4`; timeline events render con `tl` pseudo-line + `tl-ev::before` dot 8x8 border-2 con color según who (bot=rubric-2, human=accent-verdigris, system=accent-indigo)"
    - "Cuando v2 + `<TaskForm>` (Sheet portal): inputs reciben tratamiento editorial — `border border-[var(--ink-1)] rounded-[3px] bg-[var(--paper-0)] focus-visible:outline-2 focus-visible:outline-[var(--ink-1)]` per D-DASH-14; labels `font-sans 10px font-semibold tracking-[0.12em] uppercase text-[var(--ink-3)]`; primary submit button `bg-[var(--rubric-2)] text-[var(--paper-0)] border-[var(--rubric-1)] shadow-[0_1px_0_var(--rubric-1)]` (.btn.red); secondary cancel button `bg-[var(--paper-0)] border-[var(--ink-1)] text-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)]` (.btn ghost outline); priority select dots reemplazadas por swatches 10x10 border ink-1 con bg según priority (high=rubric-2, medium=accent-gold, low=ink-4)"
    - "Cuando v2 + `<TaskFiltersBar>`: ToggleGroup reemplazada por tabs subrayadas tipo `tabs.on` border-bottom 2px ink-1 + count mono ml-1; Select primitives (Priority + Asignación) reciben `border-[var(--ink-1)] rounded-[3px] bg-[var(--paper-0)] font-sans 13px text-[var(--ink-1)]` + Popover content via `portalContainer` D-DASH-10; XIcon clear button mantiene functionality pero re-styled `text-[var(--ink-3)] hover:text-[var(--rubric-2)]`"
    - "Cuando v2 + status pill (kanban swatches Y list pills): usar clases inline-equivalent del mock — `pill.pending text-[var(--accent-gold)] border-[var(--accent-gold)] bg-[color-mix(in_oklch,var(--accent-gold)_10%,var(--paper-0))]`, `pill.progress text-[var(--accent-verdigris)] border-[var(--accent-verdigris)] bg-[color-mix(in_oklch,var(--accent-verdigris)_8%,var(--paper-0))]`, `pill.wait text-[var(--accent-indigo)] border-[var(--accent-indigo)] bg-[color-mix(in_oklch,var(--accent-indigo)_8%,var(--paper-0))]`, `pill.done text-[var(--paper-0)] border-[var(--ink-1)] bg-[var(--ink-1)]` + font-sans 10px font-bold tracking-[0.10em] uppercase border per D-DASH-15 (NO usa `.mx-tag--*` directo porque las pills tienen 4 estados específicos del kanban; el mapping es 1:1 a las clases del mock)"
    - "Cuando v2 + view toggle: persistence del modo (kanban|list) en `localStorage` key `morfx_tareas_view_mode` (default 'kanban'); cambio re-renderea sin remount; chip-row + tabs row coexisten en ambos modos"
    - "Cuando v2 + empty state (sin tareas globales): render editorial — `mx-h3 'Sin tareas pendientes.'` + `mx-caption 'Crea tu primera tarea o espera a que un agente escale.'` + botón `'Nueva tarea'` estilo `.btn.red`; preserva `setFormSheetOpen(true)` handler"
    - "Cuando v2 + empty state (filtros activos sin matches en kanban): cada columna vacía muestra `<p class='mx-caption text-center py-6'>Sin tareas en {estado}.</p>` (NO oculta la columna, mantiene layout 4-col)"
    - "Cero cambios funcionales en: `getTasks`, `getTaskTypes`, `getTaskSummary`, `getWorkspaceMembers`, `createTask`, `updateTask`, `deleteTask`, `completeTask`, `reopenTask`, `getTaskNotes`, `getTaskActivity`, `useForm`, react-hook-form Controllers, date-fns helpers, groupTasks function (cuando v2 + list-view se ignora porque rendering pasa a tabla; cuando v2 + kanban se reemplaza por groupByStatus); preserve TaskWithDetails type (D-DASH-07)"
    - "Build clean: `npx tsc --noEmit` retorna zero errores en los 8 archivos modificados; con flag OFF git diff vs base commit muestra cambios SOLO en estos archivos in-scope (no en `src/lib`, `src/hooks`, `src/app/actions`)"
  artifacts:
    - path: "src/app/(dashboard)/tareas/page.tsx"
      provides: "Page wrapper con topbar editorial gated v2 + workspaceId resolution"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/tareas/components/task-list.tsx"
      provides: "Container que orquesta tabs + chips + view-toggle + kanban|list switching gated v2"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/tareas/components/task-kanban.tsx"
      provides: "NEW component — 4-col kanban con TaskCard render + groupByStatus"
      contains: "TaskKanban"
    - path: "src/app/(dashboard)/tareas/components/task-card.tsx"
      provides: "NEW component — editorial article card con pri-stripe + meta + foot avs"
      contains: "TaskCard"
    - path: "src/app/(dashboard)/tareas/components/task-row.tsx"
      provides: "NEW component — editorial table row para list-view dictionary-table"
      contains: "TaskRow"
    - path: "src/app/(dashboard)/tareas/components/task-detail-sheet.tsx"
      provides: "Detail sheet editorial con portalContainer + dp-hd + dp-meta-grid + tabs sect + timeline"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/tareas/components/task-form.tsx"
      provides: "Form editorial con inputs ink-1 border + .btn.red submit + portalContainer"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/tareas/components/task-filters.tsx"
      provides: "Tabs subrayadas + chip-row + view-toggle + Selects con portalContainer"
      contains: "useDashboardV2"
  key_links:
    - from: "src/app/(dashboard)/tareas/components/task-list.tsx"
      to: "src/components/layout/dashboard-v2-context.tsx"
      via: "useDashboardV2 hook"
      pattern: "useDashboardV2()"
    - from: "src/app/(dashboard)/tareas/components/task-kanban.tsx"
      to: "src/app/(dashboard)/tareas/components/task-card.tsx"
      via: "TaskCard import + props"
      pattern: "<TaskCard"
    - from: "src/app/(dashboard)/tareas/components/task-list.tsx"
      to: "src/app/(dashboard)/tareas/components/task-row.tsx"
      via: "TaskRow import + props (list-view path)"
      pattern: "<TaskRow"
    - from: "src/app/(dashboard)/tareas/components/task-detail-sheet.tsx"
      to: "src/components/ui/sheet"
      via: "portalContainer prop (D-DASH-10)"
      pattern: "portalContainer"
    - from: "src/app/(dashboard)/tareas/components/task-form.tsx"
      to: "src/app/actions/tasks"
      via: "createTask + updateTask (PRESERVED unchanged D-DASH-07)"
      pattern: "createTask|updateTask"
---

<objective>
Wave 1 — Re-skin el módulo Tareas completo al lenguaje editorial: page topbar + tabs/chips/view-toggle + kanban 4-col con cards article + list-view dictionary-table + detail sheet con timeline + form editorial. Todo gated por `useDashboardV2()` con flag-OFF byte-identical (Regla 6).

**Purpose:** Tareas es el módulo de bandeja humana — el más usado por operadores. Hoy renderea como `space-y-6` vertical con groupTasks por proximidad de fecha (overdue/today/tomorrow/...). El mock v2.1 lo reorganiza en kanban por estado (Pendiente / En proceso / En espera / Completada) con toggle a vista lista. Esta fase entrega ambas vistas + detail sheet + form, todos editoriales, sin tocar domain/hooks/actions.

**Output:** 5 tasks atómicos:
1. Page topbar + filters bar (tabs subrayadas + chips + view-toggle)
2. Kanban grid 4-col + TaskCard component (NEW)
3. List view dictionary-table + TaskRow component (NEW)
4. Detail sheet editorial (dp-hd + dp-meta-grid + dp-sect tabs + timeline + portalContainer)
5. Form + dialogs editorial (.btn.red submit + ink-1 inputs + portalContainer)

DnD libraries (si existen `@dnd-kit/*`) NO se tocan funcionalmente — solo se ajustan classNames de los wrappers presentational. Si el código actual NO usa dnd-kit (verificar con grep en read_first), simplemente no se toca y se documenta. Drag-and-drop futuro queda como deuda.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/ui-redesign-dashboard/CONTEXT.md
@.planning/standalone/ui-redesign-dashboard/PLAN.md
@.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/tareas.html
@.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/colors_and_type.css
@.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/README.md

# Source files in scope:
@src/app/(dashboard)/tareas/page.tsx
@src/app/(dashboard)/tareas/components/task-list.tsx
@src/app/(dashboard)/tareas/components/task-detail-sheet.tsx
@src/app/(dashboard)/tareas/components/task-form.tsx
@src/app/(dashboard)/tareas/components/task-filters.tsx

# Out-of-scope but read-only references:
@src/components/tasks/task-item.tsx
@src/components/tasks/task-history.tsx
@src/components/tasks/task-notes.tsx
@src/lib/tasks/types.ts

# Wave 0 outputs (already shipped per Plan 01):
@src/lib/auth/dashboard-v2.ts
@src/components/layout/dashboard-v2-context.tsx
@src/app/(dashboard)/fonts.ts
@src/app/(dashboard)/layout.tsx

<interfaces>
<!-- From Wave 0 (Plan 01) — already shipped: -->

useDashboardV2 hook:
```typescript
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
const v2 = useDashboardV2()  // boolean, default false outside provider
```

`.theme-editorial` CSS scope (already in globals.css from ui-redesign-conversaciones Plan 01) provides:
- `mx-smallcaps`, `mx-display`, `mx-h3`, `mx-h4`, `mx-caption`, `mx-mono`, `mx-rule-ornament` utilities
- `mx-tag mx-tag--{rubric|gold|indigo|verdigris|ink}` utilities
- All shadcn token overrides (--background → paper-1, --primary → ink-1, --border → ink-4, etc.)
- CSS vars: `--paper-0..3`, `--ink-1..5`, `--rubric-1`, `--rubric-2`, `--accent-gold`, `--accent-verdigris`, `--accent-indigo`, `--border`, `--semantic-success`, `--font-display`, `--font-sans`, `--font-mono`, `--font-serif`, `--radius-2`, `--radius-3`

Existing types (preserve):
```typescript
// from src/lib/tasks/types.ts
type TaskStatus = 'pending' | 'in_progress' | 'completed' | ...
type TaskPriority = 'high' | 'medium' | 'low'
interface TaskWithDetails {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  due_date: string | null
  task_type_id: string | null
  task_type?: { id, name, color }
  assigned_to: string | null
  assigned_user?: { email }
  contact?: { name }
  order?: { total_value }
  conversation?: { phone }
  postponement_count: number
  completed_at: string | null
}
interface TaskFilters { status?, priority?, assigned_to? }
interface TaskType { id, name, color }
```

Existing actions (PRESERVE unchanged D-DASH-07):
```typescript
// from src/app/actions/tasks
async function getTasks(filters): Promise<TaskWithDetails[]>
async function getTaskTypes(): Promise<TaskType[]>
async function getTaskSummary(): Promise<{ pending: number, overdue: number }>
async function createTask(data): Promise<{ id } | { error }>
async function updateTask(id, data): Promise<{ id } | { error }>
async function deleteTask(id): Promise<{ ok: true } | { error }>
async function completeTask(id), reopenTask(id)

// from src/app/actions/task-notes, src/app/actions/task-activity
async function getTaskNotes(taskId): Promise<TaskNoteWithUser[]>
async function getTaskActivity(taskId): Promise<TaskActivityWithUser[]>
```

Sheet primitive needs `portalContainer` prop (D-DASH-10):
- Verify `src/components/ui/sheet.tsx` already supports `portalContainer` prop (added in ui-redesign-conversaciones Plan 01).
- If NOT supported, fallback: read from MEMORY that the conversaciones fase shipped portalContainer extension via aditive prop. Re-confirm en read_first.
</interfaces>

<status_to_view_mapping>
The current `task-list.tsx` uses `groupTasks(tasks)` to group BY DUE DATE proximity (overdue/today/tomorrow/week/upcoming/no-date). The kanban v2 groups BY STATUS instead (4 cols). Mapping:

| Mock column | TaskStatus value | Swatch color |
|-------------|------------------|--------------|
| Pendiente | `'pending'` | `var(--accent-gold)` |
| En proceso | `'in_progress'` (if exists, else group with pending) | `var(--accent-verdigris)` |
| En espera | tasks marked as postponed (`postponement_count > 0` AND not completed) | `var(--accent-indigo)` |
| Completada | `'completed'` | `var(--ink-1)` |

If `TaskStatus` enum does NOT include `'in_progress'` (CHECK in read_first via grep on `src/lib/tasks/types.ts`), then collapse to 3 cols (Pendiente / En espera / Completada). Document this in Task 2 read_first findings BEFORE creating TaskKanban — do not assume status values.
</status_to_view_mapping>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Re-skin page.tsx topbar + task-filters.tsx (tabs subrayadas + chip-row + view-toggle)</name>
  <files>src/app/(dashboard)/tareas/page.tsx, src/app/(dashboard)/tareas/components/task-filters.tsx, src/app/(dashboard)/tareas/components/task-list.tsx</files>
  <read_first>
    - src/app/(dashboard)/tareas/page.tsx (full ~52 LOC)
    - src/app/(dashboard)/tareas/components/task-filters.tsx (full ~163 LOC — pay attention to ToggleGroup usage at lines 70-96 + Select primitives at lines 98-148)
    - src/app/(dashboard)/tareas/components/task-list.tsx (full ~382 LOC — pay attention to header at lines 256-275 + grouping at lines 277-325)
    - src/lib/auth/dashboard-v2.ts (Plan 01 output — confirm getIsDashboardV2Enabled signature)
    - src/components/layout/dashboard-v2-context.tsx (Plan 01 output — confirm useDashboardV2 hook export)
    - src/lib/tasks/types.ts (full — confirm TaskStatus enum values; document if 'in_progress' exists or not)
    - .planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/tareas.html lines 28-58 (topbar + tabs + chips + view-toggle CSS) and lines 306-337 (DOM structure of topbar)
    - grep -r 'portalContainer' src/components/ui/sheet.tsx src/components/ui/dialog.tsx src/components/ui/select.tsx src/components/ui/popover.tsx — document which primitives already have it
  </read_first>
  <action>
    Three files in this task — page.tsx (server component header), task-list.tsx (orchestrator), task-filters.tsx (filter bar reskin).

    **Step 1 — `src/app/(dashboard)/tareas/page.tsx`:**

    Add gated editorial topbar. Page is a Server Component, so import `getIsDashboardV2Enabled` from `@/lib/auth/dashboard-v2` (NOT the hook — hooks are client-only). Resolve flag SSR with the workspaceId already in scope.

    ```typescript
    import { getIsDashboardV2Enabled } from '@/lib/auth/dashboard-v2'
    // ... existing imports

    export default async function TareasPage() {
      const cookieStore = await cookies()
      const workspaceId = cookieStore.get('morfx_workspace')?.value
      if (!workspaceId) { /* unchanged early return */ }

      const [tasks, taskTypes, members, summary, dashV2] = await Promise.all([
        getTasks({ status: 'all' }),
        getTaskTypes(),
        getWorkspaceMembers(workspaceId),
        getTaskSummary(),
        getIsDashboardV2Enabled(workspaceId),
      ])

      return (
        <div className="container py-6 space-y-6">
          {dashV2 ? (
            <div className="flex items-end justify-between gap-3 pb-3 border-b border-[var(--ink-1)]">
              <div>
                <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--rubric-2)]" style={{ fontFamily: 'var(--font-sans)' }}>
                  Módulo · Operación
                </span>
                <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-[-0.015em] text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>
                  Tareas
                  <em className="ml-2 not-italic text-[14px] font-normal text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-sans)' }}>
                    {`· ${summary.pending} abierta${summary.pending !== 1 ? 's' : ''}`}
                    {summary.overdue > 0 && ` · ${summary.overdue} vencen hoy`}
                  </em>
                </h1>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              {/* preserve existing header verbatim */}
              <div>
                <h1 className="text-2xl font-bold">Tareas</h1>
                <p className="text-muted-foreground">{/* ...existing summary text... */}</p>
              </div>
            </div>
          )}
          <TaskList initialTasks={tasks} taskTypes={taskTypes} members={members} dashV2={dashV2} />
        </div>
      )
    }
    ```

    Add `dashV2: boolean` prop to TaskList interface so the client component receives the SSR-resolved flag (avoids context flash on first paint). Inside TaskList, fall back to `useDashboardV2()` if `dashV2` prop is undefined (BC for any other caller).

    **Step 2 — `src/app/(dashboard)/tareas/components/task-list.tsx`:**

    Wire the new prop + add view-mode state + hoist filter+view bar:

    ```typescript
    interface TaskListProps {
      initialTasks: TaskWithDetails[]
      taskTypes: TaskType[]
      members: MemberWithUser[]
      dashV2?: boolean  // SSR-resolved flag from page.tsx
    }

    export function TaskList({ initialTasks, taskTypes, members, dashV2: dashV2Prop }: TaskListProps) {
      const v2FromContext = useDashboardV2()
      const v2 = dashV2Prop ?? v2FromContext
      // ... existing state

      // NEW: view mode persisted in localStorage (kanban|list)
      const [viewMode, setViewMode] = React.useState<'kanban' | 'list'>('kanban')
      React.useEffect(() => {
        const saved = localStorage.getItem('morfx_tareas_view_mode')
        if (saved === 'kanban' || saved === 'list') setViewMode(saved)
      }, [])
      const handleViewModeChange = (mode: 'kanban' | 'list') => {
        setViewMode(mode)
        localStorage.setItem('morfx_tareas_view_mode', mode)
      }
    ```

    Add tabs row (saved-views) ABOVE the existing FiltersBar+CTA flex when v2:

    ```tsx
    {v2 && (
      <div className="flex gap-5 px-0 border-b border-[var(--border)] items-center" role="tablist" aria-label="Vistas guardadas">
        {([
          { id: 'all', label: 'Todas', count: tasks.length },
          { id: 'mine', label: 'Mías', count: tasks.filter(t => t.assigned_to === currentUserId).length },
          { id: 'unassigned', label: 'Sin asignar', count: tasks.filter(t => !t.assigned_to).length },
          { id: 'today', label: 'Vencen hoy', count: tasks.filter(t => t.due_date && isToday(parseISO(t.due_date)) && t.status !== 'completed').length },
        ] as const).map((tab) => {
          const isActive = (filters.status === 'all' && tab.id === 'all') || /* derived match */
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => { /* map tab.id → setFilters(...) */ }}
              className={cn(
                'pb-2.5 pt-2.5 inline-flex items-center gap-1.5 transition-colors text-[13px]',
                'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ink-1)]',
                isActive
                  ? 'font-semibold text-[var(--ink-1)] border-b-2 border-[var(--ink-1)]'
                  : 'font-medium text-[var(--ink-3)] hover:text-[var(--ink-1)] border-b-2 border-transparent'
              )}
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              {tab.label}
              <span className={cn('text-[11px] font-medium', isActive ? 'text-[var(--rubric-2)]' : 'text-[var(--ink-3)]')} style={{ fontFamily: 'var(--font-mono)' }}>
                {tab.count}
              </span>
            </button>
          )
        })}
      </div>
    )}
    ```

    Wrap the existing `<div className="flex flex-wrap items-center justify-between gap-4">` (Filters + Nueva tarea button) so when v2 the inner Button uses `.btn.red` styles + adds the view toggle:

    ```tsx
    <div className="flex flex-wrap items-center justify-between gap-3">
      <TaskFiltersBar filters={filters} onFiltersChange={setFilters} members={members} v2={v2} />
      {v2 ? (
        <div className="flex items-center gap-2">
          <div className="inline-flex border border-[var(--ink-1)] rounded-[3px] overflow-hidden shadow-[0_1px_0_var(--ink-1)]">
            {(['kanban', 'list'] as const).map((mode, idx) => (
              <button
                key={mode}
                type="button"
                onClick={() => handleViewModeChange(mode)}
                aria-pressed={viewMode === mode}
                className={cn(
                  'px-3 py-1.5 text-[12px] font-semibold inline-flex items-center gap-1.5 transition-colors',
                  idx === 0 && 'border-r border-[var(--ink-1)]',
                  viewMode === mode
                    ? 'bg-[var(--ink-1)] text-[var(--paper-0)]'
                    : 'bg-[var(--paper-0)] text-[var(--ink-2)] hover:bg-[var(--paper-2)]'
                )}
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                {mode === 'kanban' ? <><Columns3Icon className="h-[13px] w-[13px]" />Tablero</> : <><ListIcon className="h-[13px] w-[13px]" />Lista</>}
              </button>
            ))}
          </div>
          <Button
            onClick={() => setFormSheetOpen(true)}
            className="bg-[var(--rubric-2)] text-[var(--paper-0)] border border-[var(--rubric-1)] shadow-[0_1px_0_var(--rubric-1)] hover:bg-[var(--rubric-1)] rounded-[3px] px-3 py-1.5 text-[13px] font-semibold inline-flex items-center gap-1.5"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            <PlusIcon className="h-[14px] w-[14px]" />
            Nueva tarea
          </Button>
        </div>
      ) : (
        <Button onClick={() => setFormSheetOpen(true)}>
          <PlusIcon className="h-4 w-4 mr-2" />
          Nueva tarea
        </Button>
      )}
    </div>
    ```

    Add Columns3Icon + ListIcon imports from lucide-react. Pass `v2={v2}` and `viewMode={viewMode}` props down. Replace the body switching logic — when `v2 && viewMode==='kanban'` render `<TaskKanban tasks={filteredTasks} taskTypes={taskTypes} onSelectTask={handleViewDetails} />` (Task 2 builds it). When `v2 && viewMode==='list'` render `<TaskTable tasks={filteredTasks} onSelectTask={handleViewDetails} onEdit={handleEdit} onDelete={handleDelete} />` (Task 3 builds it). When `!v2` preserve existing groupTasks vertical layout untouched.

    Empty-state v2: replace the `<div className="rounded-full bg-muted p-4 mb-4">` block with `mx-h3 'Sin tareas pendientes.'` + `mx-caption 'Crea tu primera tarea o espera a que un agente escale.'` + the new `.btn.red` Button as above.

    **Step 3 — `src/app/(dashboard)/tareas/components/task-filters.tsx`:**

    Add `v2?: boolean` prop. When v2:
    - Replace ToggleGroup (status all|pending|completed) with editorial chip-row pills (rounded-full bg ON ink-1 text paper-0, OFF border-[var(--border)] text ink-2, font-sans 11px font-medium px-2.5 py-1).
    - Wrap Select primitives (Priority + Asignación) with `<Select>` overrides — keep functionality intact, only swap classes on `<SelectTrigger className=...>` to `border-[var(--ink-1)] rounded-[3px] bg-[var(--paper-0)] text-[var(--ink-1)] font-sans 13px font-normal px-2.5 py-1`.
    - On `<SelectContent portalContainer={...}>` — pass a ref to the dashboard root via `document.querySelector('.theme-editorial')` lazily (or read from a Context provided by Plan 01 if it exposes one — check read_first).
    - Replace XIcon clear button with editorial: `text-[var(--ink-3)] hover:text-[var(--rubric-2)]`.
    - Color dots in priority items: 10x10 swatch border ink-1 instead of `h-2 w-2 rounded-full bg-red-500` etc:
      ```tsx
      <span className="w-2.5 h-2.5 border border-[var(--ink-1)]" style={{ background: 'var(--rubric-2)' }} />
      ```
    - Add view-toggle is OUT of this filter component (lives in task-list.tsx topbar — see Step 2).

    When `!v2`: render existing component verbatim.

    **DO NOT MODIFY (Regla 6 + D-DASH-07):**
    - `getTasks`, `getTaskTypes`, `getTaskSummary`, `getWorkspaceMembers` server actions
    - `groupTasks` function (used only for non-v2 path)
    - `useForm`, react-hook-form Controllers
    - `TaskWithDetails` / `TaskFilters` / `TaskType` / `MemberWithUser` types
    - `setFilter`/`setFilters` setter signatures
    - `handleDelete`, `handleDeleteConfirm`, `handleEdit`, `handleFormSuccess`, `handleFormClose`, `handleViewDetails`, `handleDetailSheetClose` handlers
    - The `<TaskItem>` component usage in non-v2 path (preserve byte-identical)
    - The AlertDialog for delete (re-skin in Task 5 only its className surface)
  </action>
  <verify>
    <automated>grep -q "getIsDashboardV2Enabled" src/app/\(dashboard\)/tareas/page.tsx && grep -q "useDashboardV2" src/app/\(dashboard\)/tareas/components/task-list.tsx && grep -q "Módulo · Operación" src/app/\(dashboard\)/tareas/page.tsx && grep -q "morfx_tareas_view_mode" src/app/\(dashboard\)/tareas/components/task-list.tsx && grep -q "viewMode" src/app/\(dashboard\)/tareas/components/task-list.tsx && grep -q "var(--rubric-2)" src/app/\(dashboard\)/tareas/components/task-list.tsx && grep -q "v2" src/app/\(dashboard\)/tareas/components/task-filters.tsx && grep -q "border-\[var(--ink-1)\]" src/app/\(dashboard\)/tareas/components/task-filters.tsx && grep -q "groupTasks" src/app/\(dashboard\)/tareas/components/task-list.tsx && grep -q "getTasks" src/app/\(dashboard\)/tareas/page.tsx && npx tsc --noEmit 2>&1 | grep -E "tareas/(page|components/task-(list|filters))" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "getIsDashboardV2Enabled" src/app/\(dashboard\)/tareas/page.tsx` (SSR flag resolution).
    - `grep -q "useDashboardV2" src/app/\(dashboard\)/tareas/components/task-list.tsx` (hook fallback).
    - `grep -q "Módulo · Operación" src/app/\(dashboard\)/tareas/page.tsx` (eyebrow texto exact con U+00B7 medium dot).
    - `grep -q "morfx_tareas_view_mode" src/app/\(dashboard\)/tareas/components/task-list.tsx` (localStorage persistence).
    - `grep -q "Tablero" src/app/\(dashboard\)/tareas/components/task-list.tsx && grep -q "Lista" src/app/\(dashboard\)/tareas/components/task-list.tsx` (view toggle labels).
    - `grep -q "border-b border-\[var(--ink-1)\]" src/app/\(dashboard\)/tareas/page.tsx` (header hard rule).
    - `grep -q "bg-\[var(--rubric-2)\]" src/app/\(dashboard\)/tareas/components/task-list.tsx` (.btn.red style).
    - `grep -q "v2" src/app/\(dashboard\)/tareas/components/task-filters.tsx` (prop wired).
    - `grep -q "border-\[var(--ink-1)\]" src/app/\(dashboard\)/tareas/components/task-filters.tsx` (editorial select trigger).
    - `! grep "oklch(" src/app/\(dashboard\)/tareas/page.tsx src/app/\(dashboard\)/tareas/components/task-list.tsx src/app/\(dashboard\)/tareas/components/task-filters.tsx` (no hardcoded oklch — must use var).
    - `! grep "dark:" src/app/\(dashboard\)/tareas/page.tsx` (no dark mode classes added — D-DASH light-only).
    - The files STILL contain (verify Regla 6 NO-TOUCH guards): `getTasks`, `getTaskSummary`, `groupTasks`, `useForm` references unchanged.
    - `npx tsc --noEmit` reports zero errors in the 3 modified files.
    - Manual check: with flag OFF, page renders byte-identical to current main (verifiable via screenshot diff).
  </acceptance_criteria>
  <done>Page topbar editorial cuando v2 (eyebrow + h1 display + summary mono inline). TaskList orquesta tabs subrayadas (4 saved-views) + chip-row + view-toggle persistido + .btn.red CTA. TaskFiltersBar re-renderea como chips + selects ink-1. Flag-OFF preserva todo verbatim. Build clean.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Build TaskKanban + TaskCard components (4-col grid + editorial article cards)</name>
  <files>src/app/(dashboard)/tareas/components/task-kanban.tsx, src/app/(dashboard)/tareas/components/task-card.tsx</files>
  <read_first>
    - src/components/tasks/task-item.tsx (full ~250 LOC — extract priorityColors mapping, getDueDateStyle, getInitials helpers; document which can be reused vs need editorial swap)
    - src/lib/tasks/types.ts (re-confirm TaskStatus enum exact values for column mapping)
    - .planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/tareas.html lines 64-148 (kanban col + task card CSS) and lines 343-475 (DOM examples — first 3 cards minimum)
    - grep -rn '@dnd-kit\|react-dnd\|react-beautiful-dnd' src/app/\(dashboard\)/tareas/ src/components/tasks/ — document if any DnD library is in use today; if NONE, no DnD work needed (drag-and-drop is deuda futura, NOT this plan's scope)
  </read_first>
  <action>
    Two NEW client components, both in `src/app/(dashboard)/tareas/components/`.

    **Step 1 — Create `task-card.tsx`:**

    NEW component reskin de TaskItem para kanban view. Editorial article card. Receives task + click handlers, renders pri-stripe + hd + body + meta + foot per mock §kanban-card.

    ```typescript
    'use client'
    import * as React from 'react'
    import { isPast, parseISO, formatDistanceToNow } from 'date-fns'
    import { es } from 'date-fns/locale'
    import { UserIcon, MessageSquareIcon, PackageIcon, AlarmClockIcon, ArrowUpRightIcon } from 'lucide-react'
    import { cn } from '@/lib/utils'
    import type { TaskWithDetails } from '@/lib/tasks/types'

    interface TaskCardProps {
      task: TaskWithDetails
      isSelected?: boolean
      onClick?: (task: TaskWithDetails) => void
    }

    function getPriStripeColor(priority: string): string {
      switch (priority) {
        case 'high': return 'var(--rubric-2)'
        case 'medium': return 'var(--accent-gold)'
        case 'low': return 'var(--ink-4)'
        default: return 'var(--ink-4)'
      }
    }

    function getInitials(name: string): string {
      return name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
    }

    function getSlaStyling(dueDate: string | null, isCompleted: boolean) {
      if (!dueDate || isCompleted) return null
      const d = parseISO(dueDate)
      if (isPast(d)) return { tone: 'danger' as const, label: `Vencida ${formatDistanceToNow(d, { locale: es, addSuffix: false })}` }
      const distance = formatDistanceToNow(d, { locale: es, addSuffix: false })
      const ms = d.getTime() - Date.now()
      if (ms < 4 * 60 * 60 * 1000) return { tone: 'warn' as const, label: `SLA: ${distance}` }
      return { tone: 'ok' as const, label: distance }
    }

    export function TaskCard({ task, isSelected = false, onClick }: TaskCardProps) {
      const sla = getSlaStyling(task.due_date, task.status === 'completed')
      const taskTypeName = task.task_type?.name?.toLowerCase() || ''
      const typeColor = taskTypeName.includes('lead') || taskTypeName.includes('venta')
        ? 'var(--accent-indigo)'
        : taskTypeName.includes('logist') || taskTypeName.includes('ops')
        ? 'var(--accent-verdigris)'
        : taskTypeName.includes('escala') || taskTypeName.includes('agente')
        ? 'var(--rubric-2)'
        : 'var(--ink-2)'

      return (
        <article
          onClick={() => onClick?.(task)}
          className={cn(
            'relative bg-[var(--paper-0)] border border-[var(--ink-1)] cursor-pointer transition-shadow',
            'shadow-[0_1px_0_var(--ink-1),0_4px_12px_-10px_oklch(0.2_0.04_60_/_0.25)]',
            'hover:shadow-[0_1px_0_var(--ink-1),0_8px_20px_-12px_oklch(0.2_0.04_60_/_0.35)]',
            isSelected && 'outline outline-2 outline-offset-2 outline-[var(--rubric-2)]'
          )}
          role="button"
          tabIndex={0}
          aria-label={`Tarea: ${task.title}`}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(task) } }}
        >
          {/* Priority stripe */}
          <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: getPriStripeColor(task.priority) }} aria-hidden />

          {/* Header */}
          <div className="flex items-baseline gap-2 px-3 pt-2.5 pb-1.5 border-b border-dotted border-[var(--border)]">
            <span className="text-[10px] font-medium text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-mono)' }}>
              T-{task.id.slice(0, 4).toUpperCase()}
            </span>
            {task.task_type?.name && (
              <span className="ml-auto text-[9px] font-bold uppercase tracking-[0.12em]" style={{ fontFamily: 'var(--font-sans)', color: typeColor }}>
                {task.task_type.name}
              </span>
            )}
          </div>

          {/* Body */}
          <div className="px-3 py-2 pl-3.5">
            <div className="text-[15px] font-bold leading-[1.3] tracking-[-0.01em] text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>
              {task.title}
            </div>
            {task.description && (
              <div className="mt-1 text-[12px] italic leading-[1.5] text-[var(--ink-2)]" style={{ fontFamily: 'var(--font-serif)' }}>
                {task.description}
              </div>
            )}
            <div className="flex flex-wrap gap-x-2 gap-y-1 mt-2 text-[10px] items-center" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink-3)' }}>
              {task.assigned_user?.email && (
                <>
                  <span className="inline-flex items-center gap-1" style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
                    <UserIcon className="h-[11px] w-[11px] opacity-70" />{task.assigned_user.email.split('@')[0]}
                  </span>
                </>
              )}
              {task.contact && (
                <>
                  <span className="text-[var(--ink-5)]">·</span>
                  <span className="inline-flex items-center gap-1" style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
                    <UserIcon className="h-[11px] w-[11px] opacity-70" />{task.contact.name}
                  </span>
                </>
              )}
              {task.conversation && (
                <>
                  <span className="text-[var(--ink-5)]">·</span>
                  <span className="inline-flex items-center gap-1" style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
                    <MessageSquareIcon className="h-[11px] w-[11px] opacity-70" />conv
                  </span>
                </>
              )}
              {task.order && (
                <>
                  <span className="text-[var(--ink-5)]">·</span>
                  <span className="inline-flex items-center gap-1" style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
                    <PackageIcon className="h-[11px] w-[11px] opacity-70" />pedido
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Foot */}
          <div className="flex items-center gap-2 px-3 pb-2.5 pt-2 border-t border-dotted border-[var(--border)] bg-[var(--paper-1)]">
            <div className="inline-flex">
              {task.assigned_user ? (
                <div className="w-[22px] h-[22px] rounded-full bg-[var(--paper-3)] border-[1.5px] border-[var(--paper-0)] grid place-items-center" style={{ fontFamily: 'var(--font-display)', fontSize: '10px', fontWeight: 700, color: 'var(--ink-1)' }}>
                  {getInitials(task.assigned_user.email.split('@')[0])}
                </div>
              ) : (
                <div className="w-[22px] h-[22px] rounded-full border-[1.5px] grid place-items-center" style={{ background: 'color-mix(in oklch, var(--rubric-2) 20%, var(--paper-0))', color: 'var(--rubric-2)', borderColor: 'var(--rubric-2)', fontFamily: 'var(--font-display)', fontSize: '10px', fontWeight: 700 }}>
                  ?
                </div>
              )}
            </div>
            <span className="text-[11px] italic" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink-3)', fontWeight: 500 }}>
              {task.assigned_user?.email.split('@')[0] || 'Sin asignar'}
            </span>
            {sla && (
              <span
                className={cn(
                  'ml-auto text-[10px] inline-flex items-center gap-1',
                  sla.tone === 'danger' && 'text-[var(--rubric-2)] font-bold',
                  sla.tone === 'warn' && 'text-[var(--accent-gold)] font-semibold',
                  sla.tone === 'ok' && 'text-[var(--semantic-success)]'
                )}
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                <AlarmClockIcon className="h-[11px] w-[11px]" />
                {sla.label}
              </span>
            )}
          </div>
        </article>
      )
    }
    ```

    **Step 2 — Create `task-kanban.tsx`:**

    NEW client component. 4-col grid (or 3-col fallback if `'in_progress'` doesn't exist in TaskStatus enum — use Task 1's read_first finding).

    ```typescript
    'use client'
    import * as React from 'react'
    import { PlusIcon } from 'lucide-react'
    import { TaskCard } from './task-card'
    import { cn } from '@/lib/utils'
    import type { TaskWithDetails } from '@/lib/tasks/types'

    interface TaskKanbanProps {
      tasks: TaskWithDetails[]
      onSelectTask?: (task: TaskWithDetails) => void
      onAddTask?: (status: string) => void
      selectedTaskId?: string | null
    }

    interface ColumnDef {
      id: 'pending' | 'in_progress' | 'waiting' | 'completed'
      label: string
      swatch: string  // CSS color
      filter: (t: TaskWithDetails) => boolean
    }

    const COLUMNS: ColumnDef[] = [
      { id: 'pending', label: 'Pendiente', swatch: 'var(--accent-gold)', filter: (t) => t.status === 'pending' && (!t.postponement_count || t.postponement_count === 0) },
      { id: 'in_progress', label: 'En proceso', swatch: 'var(--accent-verdigris)', filter: (t) => (t.status as string) === 'in_progress' },
      { id: 'waiting', label: 'En espera', swatch: 'var(--accent-indigo)', filter: (t) => t.status === 'pending' && (t.postponement_count ?? 0) > 0 },
      { id: 'completed', label: 'Completada', swatch: 'var(--ink-1)', filter: (t) => t.status === 'completed' },
    ]

    export function TaskKanban({ tasks, onSelectTask, onAddTask, selectedTaskId }: TaskKanbanProps) {
      const grouped = React.useMemo(() => {
        return COLUMNS.map((col) => ({ ...col, items: tasks.filter(col.filter) }))
      }, [tasks])

      return (
        <div className="overflow-auto pb-4">
          <div className="grid gap-3.5 min-h-[400px]" style={{ gridTemplateColumns: 'repeat(4, minmax(260px, 1fr))' }}>
            {grouped.map((col) => (
              <div key={col.id} className="bg-[var(--paper-2)] border border-[var(--border)] flex flex-col min-h-full">
                <div className="px-3.5 py-2.5 border-b border-[var(--border)] bg-[var(--paper-1)] flex items-center gap-2 sticky top-0 z-[1]">
                  <span className="w-2.5 h-2.5 border border-[var(--ink-1)] flex-shrink-0" style={{ background: col.swatch }} aria-hidden />
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--ink-1)] m-0" style={{ fontFamily: 'var(--font-sans)' }}>
                    {col.label}
                  </h3>
                  <span className="ml-auto text-[11px] text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-mono)' }}>
                    · {col.items.length}
                  </span>
                  {onAddTask && (
                    <button
                      type="button"
                      onClick={() => onAddTask(col.id)}
                      className="border-0 bg-transparent cursor-pointer text-[var(--ink-3)] hover:text-[var(--ink-1)] p-1 inline-flex"
                      aria-label={`Agregar tarea en ${col.label}`}
                    >
                      <PlusIcon className="h-[14px] w-[14px]" />
                    </button>
                  )}
                </div>
                <div className="flex-1 p-2.5 flex flex-col gap-2.5 overflow-y-auto">
                  {col.items.length === 0 ? (
                    <p className="text-[12px] text-center py-6" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink-3)' }}>
                      Sin tareas en {col.label.toLowerCase()}.
                    </p>
                  ) : (
                    col.items.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        isSelected={selectedTaskId === task.id}
                        onClick={onSelectTask}
                      />
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )
    }
    ```

    **CRITICAL — TaskStatus enum verification:** if read_first found that TaskStatus does NOT include `'in_progress'` as a string literal, then either:
    1. Drop the `in_progress` column (3-col layout: Pendiente / En espera / Completada) — adjust `gridTemplateColumns: 'repeat(3, ...)'`, OR
    2. Keep 4-col but the 'En proceso' column will always be empty (acceptable transitional state until backend introduces the status).
    Document the choice in the SUMMARY at end of plan execution.

    **DO NOT MODIFY:**
    - `src/components/tasks/task-item.tsx` (legacy component — only used by non-v2 path; preserved verbatim)
    - Any actions/hooks/types
    - DnD library wiring (none expected; if found, leave intact and skip drag-related styles since no drag is in mock)
  </action>
  <verify>
    <automated>test -f src/app/\(dashboard\)/tareas/components/task-card.tsx && test -f src/app/\(dashboard\)/tareas/components/task-kanban.tsx && grep -q "TaskCard" src/app/\(dashboard\)/tareas/components/task-card.tsx && grep -q "TaskKanban" src/app/\(dashboard\)/tareas/components/task-kanban.tsx && grep -q "Pendiente" src/app/\(dashboard\)/tareas/components/task-kanban.tsx && grep -q "Completada" src/app/\(dashboard\)/tareas/components/task-kanban.tsx && grep -q "var(--accent-gold)" src/app/\(dashboard\)/tareas/components/task-kanban.tsx && grep -q "var(--accent-verdigris)" src/app/\(dashboard\)/tareas/components/task-kanban.tsx && grep -q "var(--accent-indigo)" src/app/\(dashboard\)/tareas/components/task-kanban.tsx && grep -q "border border-\[var(--ink-1)\]" src/app/\(dashboard\)/tareas/components/task-card.tsx && grep -q "var(--font-display)" src/app/\(dashboard\)/tareas/components/task-card.tsx && grep -q "var(--font-serif)" src/app/\(dashboard\)/tareas/components/task-card.tsx && grep -q "var(--font-mono)" src/app/\(dashboard\)/tareas/components/task-card.tsx && grep -q "border-dotted border-\[var(--border)\]" src/app/\(dashboard\)/tareas/components/task-card.tsx && grep -q "AlarmClockIcon" src/app/\(dashboard\)/tareas/components/task-card.tsx && grep -q "role=\"button\"" src/app/\(dashboard\)/tareas/components/task-card.tsx && npx tsc --noEmit 2>&1 | grep -E "tareas/components/task-(kanban|card)" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - `test -f src/app/\(dashboard\)/tareas/components/task-card.tsx` (NEW file exists).
    - `test -f src/app/\(dashboard\)/tareas/components/task-kanban.tsx` (NEW file exists).
    - `grep -q "Pendiente.*Completada" src/app/\(dashboard\)/tareas/components/task-kanban.tsx` no — instead verify ambos labels exist con greps independientes.
    - `grep -c "var(--accent-" src/app/\(dashboard\)/tareas/components/task-kanban.tsx` ≥ 3 (gold + verdigris + indigo swatches).
    - `grep -q "border border-\[var(--ink-1)\]" src/app/\(dashboard\)/tareas/components/task-card.tsx` (article border per D-DASH-12).
    - `grep -q "absolute left-0 top-0 bottom-0 w-\[3px\]" src/app/\(dashboard\)/tareas/components/task-card.tsx` (pri-stripe).
    - `grep -q "border-t border-dotted border-\[var(--border)\]" src/app/\(dashboard\)/tareas/components/task-card.tsx` (foot dotted rule per mock).
    - `grep -q "var(--font-display)" src/app/\(dashboard\)/tareas/components/task-card.tsx` (title uses display font 15px).
    - `grep -q "var(--font-serif)" src/app/\(dashboard\)/tareas/components/task-card.tsx` (excerpt uses serif italic).
    - `grep -q "var(--font-mono)" src/app/\(dashboard\)/tareas/components/task-card.tsx` (id + meta + sla mono).
    - `grep -q "role=\"button\"" src/app/\(dashboard\)/tareas/components/task-card.tsx && grep -q "tabIndex" src/app/\(dashboard\)/tareas/components/task-card.tsx` (a11y article-as-button).
    - `grep -q "minmax(260px" src/app/\(dashboard\)/tareas/components/task-kanban.tsx` (column min-width per mock).
    - `grep -q "sticky top-0" src/app/\(dashboard\)/tareas/components/task-kanban.tsx` (col header sticky).
    - `! grep "dark:" src/app/\(dashboard\)/tareas/components/task-card.tsx src/app/\(dashboard\)/tareas/components/task-kanban.tsx` (no dark mode).
    - `npx tsc --noEmit` reports zero errors in the 2 new files.
    - The 2 NEW files do NOT import from `src/lib/agents`, `src/inngest`, `src/app/actions/tasks` (verify with grep — D-DASH-07 UI-only).
  </acceptance_criteria>
  <done>TaskKanban renderea 4 columnas (o 3 fallback documentado) con swatches por estado. TaskCard renderea article editorial con pri-stripe + hd con id+type + body display title + serif italic excerpt + mono meta + foot avatar+sla. Build clean. Zero deps a domain/actions.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Build TaskRow + table list-view (dictionary-table per D-DASH-11)</name>
  <files>src/app/(dashboard)/tareas/components/task-row.tsx, src/app/(dashboard)/tareas/components/task-list.tsx</files>
  <read_first>
    - src/app/(dashboard)/tareas/components/task-list.tsx (post-Task-1 state — pay attention to dónde quedó el fork v2 + viewMode==='list')
    - .planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/tareas.html lines 248-277 (table.list CSS) — pixel-perfect dictionary-table styling
    - src/components/tasks/task-item.tsx lines 60-95 (priority/due-date helpers — extract for re-use)
  </read_first>
  <action>
    Two files: TaskRow component (NEW) + wire it into TaskList list-view fork.

    **Step 1 — Create `src/app/(dashboard)/tareas/components/task-row.tsx`:**

    ```typescript
    'use client'
    import * as React from 'react'
    import { format, parseISO, isPast, isToday } from 'date-fns'
    import { es } from 'date-fns/locale'
    import { cn } from '@/lib/utils'
    import type { TaskWithDetails } from '@/lib/tasks/types'

    interface TaskRowProps {
      task: TaskWithDetails
      isSelected?: boolean
      onClick?: (task: TaskWithDetails) => void
    }

    function getStatusPillClasses(status: string, postponed: boolean): { label: string; classes: string } {
      if (status === 'completed') return {
        label: 'Completada',
        classes: 'text-[var(--paper-0)] border-[var(--ink-1)] bg-[var(--ink-1)]'
      }
      if (postponed) return {
        label: 'En espera',
        classes: 'text-[var(--accent-indigo)] border-[var(--accent-indigo)]',
      }
      // pending → distinguish in_progress when applicable
      if ((status as string) === 'in_progress') return {
        label: 'En proceso',
        classes: 'text-[var(--accent-verdigris)] border-[var(--accent-verdigris)]',
      }
      return {
        label: 'Pendiente',
        classes: 'text-[var(--accent-gold)] border-[var(--accent-gold)]',
      }
    }

    const PRIORITY_LABEL: Record<string, string> = { high: 'Alta', medium: 'Media', low: 'Baja' }

    export function TaskRow({ task, isSelected, onClick }: TaskRowProps) {
      const pill = getStatusPillClasses(task.status, (task.postponement_count ?? 0) > 0)
      const dueDate = task.due_date ? parseISO(task.due_date) : null
      const dueLabel = dueDate
        ? (isToday(dueDate) ? 'Hoy' : format(dueDate, "d MMM", { locale: es }))
        : '—'
      const dueTone = dueDate && isPast(dueDate) && !isToday(dueDate) && task.status !== 'completed'
        ? 'text-[var(--rubric-2)] font-semibold'
        : 'text-[var(--ink-2)]'

      return (
        <tr
          onClick={() => onClick?.(task)}
          className={cn(
            'cursor-pointer transition-colors',
            isSelected
              ? 'bg-[color-mix(in_oklch,var(--rubric-2)_4%,var(--paper-0))]'
              : 'hover:bg-[var(--paper-2)]'
          )}
          aria-selected={isSelected}
        >
          <td className="px-3.5 py-2.5 border-b border-[var(--border)] text-[11px] text-[var(--ink-3)] align-middle" style={{ fontFamily: 'var(--font-mono)' }}>
            T-{task.id.slice(0, 4).toUpperCase()}
          </td>
          <td className="px-3.5 py-2.5 border-b border-[var(--border)] text-[13px] text-[var(--ink-1)] font-semibold max-w-[320px]" style={{ fontFamily: 'var(--font-sans)' }}>
            {task.title}
            {task.description && (
              <span className="block mt-0.5 text-[12px] italic font-normal text-[var(--ink-3)] truncate" style={{ fontFamily: 'var(--font-serif)' }}>
                {task.description}
              </span>
            )}
          </td>
          <td className="px-3.5 py-2.5 border-b border-[var(--border)] align-middle">
            <span className={cn('inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.10em] border', pill.classes)} style={{ fontFamily: 'var(--font-sans)' }}>
              {pill.label}
            </span>
          </td>
          <td className="px-3.5 py-2.5 border-b border-[var(--border)] text-[13px] text-[var(--ink-2)] align-middle" style={{ fontFamily: 'var(--font-sans)' }}>
            {PRIORITY_LABEL[task.priority] ?? task.priority}
          </td>
          <td className="px-3.5 py-2.5 border-b border-[var(--border)] text-[13px] text-[var(--ink-2)] align-middle" style={{ fontFamily: 'var(--font-sans)' }}>
            {task.assigned_user?.email.split('@')[0] ?? 'Sin asignar'}
          </td>
          <td className={cn('px-3.5 py-2.5 border-b border-[var(--border)] text-[12px] align-middle', dueTone)} style={{ fontFamily: 'var(--font-mono)' }}>
            {dueLabel}
          </td>
        </tr>
      )
    }
    ```

    **Step 2 — In `src/app/(dashboard)/tareas/components/task-list.tsx`:**

    Inside the v2 + viewMode==='list' branch (placeholder added in Task 1), render the dictionary-table:

    ```tsx
    {v2 && viewMode === 'list' && (
      <div className="overflow-auto">
        <table className="w-full border-collapse bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)]">
          <thead>
            <tr>
              {[
                { id: 'id', label: 'ID' },
                { id: 'title', label: 'Tarea' },
                { id: 'status', label: 'Estado' },
                { id: 'priority', label: 'Prioridad' },
                { id: 'assigned', label: 'Asignado' },
                { id: 'due', label: 'Vence' },
              ].map((col) => (
                <th
                  key={col.id}
                  className="text-left px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-[0.10em] text-[var(--ink-3)] bg-[var(--paper-1)] border-b border-[var(--ink-1)] sticky top-0"
                  style={{ fontFamily: 'var(--font-sans)' }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredTasks.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-[13px] text-[var(--ink-3)] italic" style={{ fontFamily: 'var(--font-serif)' }}>
                  Nada coincide con los filtros activos.
                </td>
              </tr>
            ) : (
              filteredTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  isSelected={selectedTask?.id === task.id}
                  onClick={handleViewDetails}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    )}
    ```

    Add `import { TaskRow } from './task-row'` at top of task-list.tsx.

    **DO NOT MODIFY:**
    - `groupTasks` helper (still used by non-v2 path — preserve)
    - `<TaskItem>` import (still used by non-v2 path)
    - Any handlers / state / setters
  </action>
  <verify>
    <automated>test -f src/app/\(dashboard\)/tareas/components/task-row.tsx && grep -q "TaskRow" src/app/\(dashboard\)/tareas/components/task-row.tsx && grep -q "TaskRow" src/app/\(dashboard\)/tareas/components/task-list.tsx && grep -q "border-collapse" src/app/\(dashboard\)/tareas/components/task-list.tsx && grep -q "tracking-\[0.10em\]" src/app/\(dashboard\)/tareas/components/task-list.tsx && grep -q "shadow-\[0_1px_0_var(--ink-1)\]" src/app/\(dashboard\)/tareas/components/task-list.tsx && grep -q "var(--paper-0)" src/app/\(dashboard\)/tareas/components/task-row.tsx && grep -q "var(--accent-gold)\|var(--accent-verdigris)\|var(--accent-indigo)" src/app/\(dashboard\)/tareas/components/task-row.tsx && grep -q "Sin asignar" src/app/\(dashboard\)/tareas/components/task-row.tsx && grep -q "groupTasks" src/app/\(dashboard\)/tareas/components/task-list.tsx && npx tsc --noEmit 2>&1 | grep -E "tareas/components/task-(row|list)" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - `test -f src/app/\(dashboard\)/tareas/components/task-row.tsx` (NEW file).
    - `grep -q "border-collapse" src/app/\(dashboard\)/tareas/components/task-list.tsx` (table editorial per D-DASH-11).
    - `grep -q "shadow-\[0_1px_0_var(--ink-1)\]" src/app/\(dashboard\)/tareas/components/task-list.tsx` (shadow-stamp).
    - `grep -q "tracking-\[0.10em\]" src/app/\(dashboard\)/tareas/components/task-list.tsx` (smallcaps headers).
    - `grep -q "border-b border-\[var(--ink-1)\]" src/app/\(dashboard\)/tareas/components/task-list.tsx` (header bottom rule).
    - `grep -q "var(--font-mono)" src/app/\(dashboard\)/tareas/components/task-row.tsx` (id + due cells mono).
    - `grep -q "var(--font-serif)" src/app/\(dashboard\)/tareas/components/task-row.tsx` (description italic excerpt).
    - `grep -q "color-mix(in_oklch,var(--rubric-2)_4%" src/app/\(dashboard\)/tareas/components/task-row.tsx` (selected row tint).
    - `grep -q "groupTasks" src/app/\(dashboard\)/tareas/components/task-list.tsx` (legacy helper preserved for non-v2).
    - `! grep "dark:" src/app/\(dashboard\)/tareas/components/task-row.tsx`.
    - `npx tsc --noEmit` reports zero errors in both files.
    - TaskRow does NOT import from `src/lib/agents`, `src/inngest`, `src/app/actions` (D-DASH-07 UI-only).
  </acceptance_criteria>
  <done>List-view dictionary-table renderea cuando v2+list mode. TaskRow editorial con pill estado + cells border-bottom + hover paper-2 + selected tint rubric-2. Build clean.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 4: Re-skin task-detail-sheet.tsx (dp-hd + dp-meta-grid + dp-sect tabs + timeline + portalContainer D-DASH-10)</name>
  <files>src/app/(dashboard)/tareas/components/task-detail-sheet.tsx</files>
  <read_first>
    - src/app/(dashboard)/tareas/components/task-detail-sheet.tsx (full ~187 LOC)
    - src/components/tasks/task-history.tsx (full — reference for timeline rendering pattern; do NOT modify, just understand the props)
    - src/components/tasks/task-notes.tsx (full — same; do NOT modify)
    - src/components/ui/sheet.tsx (verify portalContainer prop signature — added in conversaciones Plan 01)
    - .planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/tareas.html lines 150-218 (detail panel CSS — dp-hd, dp-meta-grid, dp-sect, tl, tl-ev)
  </read_first>
  <action>
    Re-skin TaskDetailSheet entirely gated by useDashboardV2. Add `portalContainer` re-root for D-DASH-10.

    **Step 1 — Add imports:**

    ```typescript
    import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
    import { ChevronRightIcon, XIcon } from 'lucide-react'
    ```

    **Step 2 — Inside component, hook + portal target:**

    ```typescript
    const v2 = useDashboardV2()
    const [portalTarget, setPortalTarget] = React.useState<HTMLElement | null>(null)
    React.useEffect(() => {
      if (!v2) return
      const target = document.querySelector<HTMLElement>('.theme-editorial')
      setPortalTarget(target)
    }, [v2])
    ```

    **Step 3 — Sheet wrapper with portalContainer:**

    ```tsx
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        portalContainer={v2 ? portalTarget ?? undefined : undefined}
        className={cn(
          'flex flex-col h-full',
          v2
            ? 'sm:max-w-[600px] p-0 bg-[var(--paper-1)] border-l border-[var(--ink-1)]'
            : 'sm:max-w-[600px]'
        )}
      >
    ```

    **Step 4 — Replace SheetHeader with editorial dp-hd when v2:**

    ```tsx
    {v2 ? (
      <div className="bg-[var(--paper-0)] border-b border-[var(--ink-1)] px-5 py-4">
        <div className="flex items-center gap-2 mb-1.5 text-[11px] text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-mono)' }}>
          <span>T-{task.id.slice(0, 4).toUpperCase()}</span>
          <span>·</span>
          <span>{task.task_type?.name ?? 'Tarea'}</span>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="ml-auto bg-transparent border-0 cursor-pointer text-[var(--ink-3)] hover:text-[var(--ink-1)] p-0"
            aria-label="Cerrar"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
        <h2 className="text-[22px] font-bold tracking-[-0.01em] leading-[1.2] text-[var(--ink-1)] flex items-center gap-2 m-0" style={{ fontFamily: 'var(--font-display)' }}>
          {task.title}
          <PostponementBadge count={task.postponement_count} />
        </h2>
        {task.description && (
          <p className="mt-1.5 text-[13px] italic text-[var(--ink-2)] leading-[1.5]" style={{ fontFamily: 'var(--font-serif)' }}>
            {task.description}
          </p>
        )}
      </div>
    ) : (
      <SheetHeader>
        {/* existing SheetTitle preserved verbatim */}
        <SheetTitle className="flex items-center gap-2">
          {task.title}
          <PostponementBadge count={task.postponement_count} />
        </SheetTitle>
      </SheetHeader>
    )}
    ```

    **Step 5 — Replace TaskInfoSection with dp-meta-grid when v2:**

    Add a v2-only render path. Build a 2-col grid with cells border-r/border-b:

    ```tsx
    function EditorialMetaGrid({ task }: { task: TaskWithDetails }) {
      const cells: Array<{ label: string; value: React.ReactNode }> = [
        {
          label: 'Estado',
          value: task.status === 'completed' ? 'Completada' : 'Pendiente',
        },
        {
          label: 'Prioridad',
          value: task.priority === 'high' ? 'Alta' : task.priority === 'medium' ? 'Media' : 'Baja',
        },
        {
          label: 'Fecha límite',
          value: task.due_date
            ? new Date(task.due_date).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' })
            : '—',
        },
        {
          label: 'Asignado',
          value: task.assigned_user?.email.split('@')[0] ?? 'Sin asignar',
        },
        {
          label: 'Tipo',
          value: task.task_type?.name ?? 'General',
        },
        {
          label: 'Vinculada',
          value: task.contact?.name ?? task.order ? `Pedido #${task.id.slice(0, 6)}` : task.conversation?.phone ?? '—',
        },
      ]
      return (
        <div className="grid grid-cols-2 border-b border-[var(--border)]">
          {cells.map((c, i) => (
            <div
              key={c.label}
              className={cn(
                'px-5 py-2.5',
                i % 2 === 0 && 'border-r border-[var(--border)]',
                i < cells.length - 2 && 'border-b border-[var(--border)]'
              )}
            >
              <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-sans)' }}>
                {c.label}
              </div>
              <div className="text-[13px] font-medium text-[var(--ink-1)] mt-1 flex items-center gap-1.5" style={{ fontFamily: 'var(--font-sans)' }}>
                {c.value}
              </div>
            </div>
          ))}
        </div>
      )
    }
    ```

    **Step 6 — Replace Tabs with `<details class='dp-sect'>` editorial when v2.** Each section is a `<details open={...}>` with summary smallcaps + content:

    ```tsx
    {v2 ? (
      <div className="flex-1 overflow-y-auto">
        <EditorialMetaGrid task={task} />

        <details open className="border-b border-[var(--border)]">
          <summary className="list-none cursor-pointer px-5 py-3 flex items-center gap-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-1)] hover:bg-[var(--paper-2)]" style={{ fontFamily: 'var(--font-sans)' }}>
            <ChevronRightIcon className="h-3 w-3 text-[var(--rubric-2)] transition-transform [details[open]_&]:rotate-90" />
            <span className="flex-1">Notas</span>
            <span className="text-[10px] text-[var(--ink-3)] font-medium normal-case tracking-normal" style={{ fontFamily: 'var(--font-mono)' }}>
              {notes.length}
            </span>
          </summary>
          <div className="px-5 pb-4">
            {loading ? (
              <div className="space-y-2">
                <div className="h-16 bg-[var(--paper-2)] border border-[var(--border)]" />
              </div>
            ) : (
              <TaskNotesSection
                taskId={task.id}
                initialNotes={notes}
                currentUserId={currentUserId}
                isAdminOrOwner={isAdminOrOwner}
              />
            )}
          </div>
        </details>

        <details open className="border-b border-[var(--border)]">
          <summary className="list-none cursor-pointer px-5 py-3 flex items-center gap-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-1)] hover:bg-[var(--paper-2)]" style={{ fontFamily: 'var(--font-sans)' }}>
            <ChevronRightIcon className="h-3 w-3 text-[var(--rubric-2)] transition-transform" />
            <span className="flex-1">Historial</span>
            <span className="text-[10px] text-[var(--ink-3)] font-medium normal-case tracking-normal" style={{ fontFamily: 'var(--font-mono)' }}>
              {activities.length}
            </span>
          </summary>
          <div className="px-5 pb-4">
            {loading ? (
              <div className="h-16 bg-[var(--paper-2)] border border-[var(--border)]" />
            ) : (
              <TaskHistoryTimeline activities={activities} />
            )}
          </div>
        </details>
      </div>
    ) : (
      // PRESERVE existing Tabs rendering verbatim
      <Tabs defaultValue="info" className="flex-1 flex flex-col min-h-0 mt-4">
        {/* ...existing TabsList + TabsContent... */}
      </Tabs>
    )}
    ```

    **Step 7 — DO NOT MODIFY:**
    - `getTaskNotes`, `getTaskActivity` server actions
    - `TaskNotesSection`, `TaskHistoryTimeline`, `PostponementBadge` components (out-of-scope; their internals stay shadcn until later phases — acceptable transitional state per D-DASH-17)
    - `useEffect` data fetching logic (only refactor classNames around it)
    - Sheet onOpenChange callback signature
    - `currentUserId`, `isAdminOrOwner` prop wiring

    **NOTE on TaskNotesSection / TaskHistoryTimeline rendering INSIDE editorial sheet:** these components render with shadcn tokens but inherit the `.theme-editorial` cascade (D-DASH-04). They'll look "almost editorial" — acceptable per CONTEXT scope. Full editorial reskin of these shared components is deuda futura (e.g., `ui-redesign-dashboard-extras` per CONTEXT handoff).
  </action>
  <verify>
    <automated>grep -q "useDashboardV2" src/app/\(dashboard\)/tareas/components/task-detail-sheet.tsx && grep -q "portalContainer" src/app/\(dashboard\)/tareas/components/task-detail-sheet.tsx && grep -q "theme-editorial" src/app/\(dashboard\)/tareas/components/task-detail-sheet.tsx && grep -q "border-b border-\[var(--ink-1)\]" src/app/\(dashboard\)/tareas/components/task-detail-sheet.tsx && grep -q "var(--font-display)" src/app/\(dashboard\)/tareas/components/task-detail-sheet.tsx && grep -q "tracking-\[-0.01em\]" src/app/\(dashboard\)/tareas/components/task-detail-sheet.tsx && grep -q "tracking-\[0.14em\]" src/app/\(dashboard\)/tareas/components/task-detail-sheet.tsx && grep -q "EditorialMetaGrid\|grid-cols-2" src/app/\(dashboard\)/tareas/components/task-detail-sheet.tsx && grep -q "<details" src/app/\(dashboard\)/tareas/components/task-detail-sheet.tsx && grep -q "getTaskNotes" src/app/\(dashboard\)/tareas/components/task-detail-sheet.tsx && grep -q "getTaskActivity" src/app/\(dashboard\)/tareas/components/task-detail-sheet.tsx && grep -q "TaskNotesSection" src/app/\(dashboard\)/tareas/components/task-detail-sheet.tsx && grep -q "TaskHistoryTimeline" src/app/\(dashboard\)/tareas/components/task-detail-sheet.tsx && npx tsc --noEmit 2>&1 | grep "task-detail-sheet" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "useDashboardV2" src/app/\(dashboard\)/tareas/components/task-detail-sheet.tsx`.
    - `grep -q "portalContainer" src/app/\(dashboard\)/tareas/components/task-detail-sheet.tsx` (D-DASH-10).
    - `grep -q "querySelector.*theme-editorial" src/app/\(dashboard\)/tareas/components/task-detail-sheet.tsx` (portal target lookup).
    - `grep -q "border-b border-\[var(--ink-1)\]" src/app/\(dashboard\)/tareas/components/task-detail-sheet.tsx` (dp-hd hard rule).
    - `grep -q "var(--font-display)" src/app/\(dashboard\)/tareas/components/task-detail-sheet.tsx` (h2 display 22px).
    - `grep -q "var(--font-serif)" src/app/\(dashboard\)/tareas/components/task-detail-sheet.tsx` (tagline italic).
    - `grep -q "tracking-\[0.14em\]" src/app/\(dashboard\)/tareas/components/task-detail-sheet.tsx` (smallcaps labels in meta-grid + sect summaries).
    - `grep -q "<details" src/app/\(dashboard\)/tareas/components/task-detail-sheet.tsx` (sect collapsibles).
    - `grep -q "grid-cols-2" src/app/\(dashboard\)/tareas/components/task-detail-sheet.tsx` (dp-meta-grid).
    - The file STILL contains: `getTaskNotes`, `getTaskActivity`, `TaskNotesSection`, `TaskHistoryTimeline`, `PostponementBadge`, `currentUserId`, `isAdminOrOwner` (Regla 6 NO-TOUCH preserved).
    - `! grep "oklch(" src/app/\(dashboard\)/tareas/components/task-detail-sheet.tsx`.
    - `! grep "dark:" src/app/\(dashboard\)/tareas/components/task-detail-sheet.tsx`.
    - `npx tsc --noEmit` reports zero errors in this file.
    - Manual: with flag OFF, the sheet renders byte-identical (Tabs structure preserved verbatim).
  </acceptance_criteria>
  <done>Detail sheet editorial cuando v2: dp-hd con id+type+close + h2 display + serif tagline + grid-cols-2 meta + dp-sect collapsibles para Notas/Historial + portalContainer re-root al wrapper editorial. Flag-OFF preserva Tabs UI verbatim. Build clean. Internal Notes/History components unchanged (transitional, acceptable).</done>
</task>

<task type="auto" tdd="false">
  <name>Task 5: Re-skin task-form.tsx + AlertDialog (forms editorial D-DASH-14 + .btn.red submit + portalContainer)</name>
  <files>src/app/(dashboard)/tareas/components/task-form.tsx, src/app/(dashboard)/tareas/components/task-list.tsx</files>
  <read_first>
    - src/app/(dashboard)/tareas/components/task-form.tsx (full ~478 LOC — pay attention to inputs at lines 184-196, date+time at lines 209-296, priority/type/assigned Selects at lines 299-402, footer buttons at lines 418-429, dialog wrapper at lines 442-477)
    - src/app/(dashboard)/tareas/components/task-list.tsx (post-Task-1+3 state — find Sheet wrapper at lines 327-349 + AlertDialog at lines 351-372 + Sheet for empty state at lines 235-251)
    - src/components/ui/alert-dialog.tsx (verify portalContainer signature; if absent, follow same pattern as Sheet)
    - .planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/tareas.html lines 32-46 (.btn variants — pri, red, ghost, sm) — pixel-perfect button styling
  </read_first>
  <action>
    Two files: task-form.tsx (form inputs + buttons editorial) + task-list.tsx (Sheet wrappers + AlertDialog re-skin).

    **Step 1 — `src/app/(dashboard)/tareas/components/task-form.tsx`:**

    Add useDashboardV2 hook + branch styling for inputs, labels, buttons:

    ```typescript
    import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
    // ... existing imports

    export function TaskForm({ mode, task, taskTypes, members, onSuccess, onCancel }: TaskFormProps) {
      const v2 = useDashboardV2()
      // ... existing state + form setup
    ```

    Helper class strings:
    ```typescript
    const editorialInputClasses = v2
      ? 'border border-[var(--ink-1)] rounded-[3px] bg-[var(--paper-0)] text-[var(--ink-1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-1)] focus-visible:ring-0'
      : ''
    const editorialLabelStyle = v2
      ? { fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--ink-3)' }
      : undefined
    ```

    Apply to each `<Label>` via inline style + each `<Input>`/`<Textarea>`/`<SelectTrigger>` via `className={cn('...', editorialInputClasses)}`.

    Replace footer buttons (lines 418-429) with v2 branch:

    ```tsx
    <div className="flex items-center justify-end gap-3 p-4 border-t" style={v2 ? { borderTopColor: 'var(--ink-1)', background: 'var(--paper-1)' } : undefined}>
      {onCancel && (
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isPending}
          className={cn(v2 && 'bg-[var(--paper-0)] border-[var(--ink-1)] text-[var(--ink-1)] hover:bg-[var(--paper-2)] shadow-[0_1px_0_var(--ink-1)] rounded-[3px] font-semibold')}
          style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
        >
          Cancelar
        </Button>
      )}
      <Button
        type="submit"
        disabled={isPending}
        className={cn(v2 && 'bg-[var(--rubric-2)] text-[var(--paper-0)] border border-[var(--rubric-1)] shadow-[0_1px_0_var(--rubric-1)] hover:bg-[var(--rubric-1)] rounded-[3px] font-semibold')}
        style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
      >
        {isPending && <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />}
        {mode === 'edit' ? 'Guardar cambios' : 'Crear tarea'}
      </Button>
    </div>
    ```

    Priority select dots (lines 314-330) — replace `bg-red-500 / bg-yellow-500 / bg-gray-400` with editorial swatches when v2:

    ```tsx
    <SelectItem value="high">
      <div className="flex items-center gap-2">
        <span className={cn('h-2 w-2 rounded-full', v2 ? 'rounded-none w-2.5 h-2.5 border border-[var(--ink-1)]' : 'bg-red-500')} style={v2 ? { background: 'var(--rubric-2)' } : undefined} />
        Alta
      </div>
    </SelectItem>
    ```
    (Repeat for medium = `var(--accent-gold)` and low = `var(--ink-4)`.)

    Same swap for the task_type_id Select dots (lines 357-365): when v2, replace `style={{ backgroundColor: type.color }}` round dot with a 10x10 square swatch border ink-1 keeping the type color as background.

    Server error block (lines 176-180): when v2 use editorial styles:
    ```tsx
    <div className={cn(
      'text-sm p-3',
      v2 ? 'border border-[var(--rubric-2)] bg-[color-mix(in_oklch,var(--rubric-2)_8%,var(--paper-0))] text-[var(--rubric-2)] rounded-[3px]' : 'text-destructive bg-destructive/10 rounded-md'
    )}>
      {serverError}
    </div>
    ```

    Form error messages (form.formState.errors.title): when v2 → text-[var(--rubric-2)].

    Date picker Popover content (line 235): pass `portalContainer` when v2:
    ```tsx
    <PopoverContent className="w-auto p-0" align="start" portalContainer={v2 ? document.querySelector<HTMLElement>('.theme-editorial') ?? undefined : undefined}>
    ```
    (Note: querySelector at render time is OK for Popover since it mounts on open; if linter complains about SSR, wrap in `typeof document !== 'undefined'`.)

    For the SAME `TaskFormDialog` wrapper (lines 442-477), add v2 hook + pass `portalContainer` to SheetContent:
    ```tsx
    const v2 = useDashboardV2()
    const portalTarget = typeof document !== 'undefined' ? document.querySelector<HTMLElement>('.theme-editorial') : null
    // ...
    <SheetContent
      portalContainer={v2 && portalTarget ? portalTarget : undefined}
      className={cn(
        'sm:max-w-[500px] p-0 flex flex-col h-full max-h-screen overflow-hidden',
        v2 && 'bg-[var(--paper-1)] border-l border-[var(--ink-1)]'
      )}
    >
    ```

    SheetTitle / SheetDescription when v2 — apply editorial fonts:
    ```tsx
    <SheetHeader className={cn('px-6 pt-6 pb-4 border-b', v2 && 'border-[var(--ink-1)] bg-[var(--paper-0)]')}>
      <SheetTitle className={cn(v2 && 'text-[20px] font-bold tracking-[-0.01em]')} style={v2 ? { fontFamily: 'var(--font-display)' } : undefined}>
        Nueva tarea
      </SheetTitle>
      <SheetDescription className={cn(v2 && 'italic text-[13px] text-[var(--ink-2)]')} style={v2 ? { fontFamily: 'var(--font-serif)' } : undefined}>
        Crea una nueva tarea para hacer seguimiento
      </SheetDescription>
    </SheetHeader>
    ```

    **Step 2 — `src/app/(dashboard)/tareas/components/task-list.tsx`:**

    The two Sheet wrappers (empty-state at lines 235-251 + main create/edit at lines 327-349) — apply same `portalContainer` + editorial header pattern as Step 1 SheetContent block. Add `useDashboardV2` is already in scope from Task 1.

    The AlertDialog at lines 351-372:
    ```tsx
    <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
      <AlertDialogContent
        portalContainer={v2 ? portalTarget ?? undefined : undefined}
        className={cn(v2 && 'bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)] rounded-[3px]')}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className={cn(v2 && 'text-[18px] font-bold tracking-[-0.01em] text-[var(--ink-1)]')} style={v2 ? { fontFamily: 'var(--font-display)' } : undefined}>
            Eliminar tarea
          </AlertDialogTitle>
          <AlertDialogDescription className={cn(v2 && 'text-[13px] italic text-[var(--ink-2)]')} style={v2 ? { fontFamily: 'var(--font-serif)' } : undefined}>
            Estas seguro que deseas eliminar la tarea &quot;{taskToDelete?.title}&quot;?
            Esta accion no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting} className={cn(v2 && 'bg-[var(--paper-0)] border-[var(--ink-1)] text-[var(--ink-1)] hover:bg-[var(--paper-2)] rounded-[3px] font-semibold shadow-[0_1px_0_var(--ink-1)]')}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDeleteConfirm}
            disabled={isDeleting}
            className={cn(
              v2
                ? 'bg-[var(--rubric-2)] text-[var(--paper-0)] border border-[var(--rubric-1)] shadow-[0_1px_0_var(--rubric-1)] hover:bg-[var(--rubric-1)] rounded-[3px] font-semibold'
                : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
            )}
            style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
          >
            {isDeleting ? 'Eliminando...' : 'Eliminar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    ```

    Hoist a `portalTarget` constant near the top of TaskList component:
    ```typescript
    const portalTarget = typeof document !== 'undefined' ? document.querySelector<HTMLElement>('.theme-editorial') : null
    ```
    (For perf, memo to a state or single useEffect — but document.querySelector at render is acceptable since AlertDialog/Sheet mount on open, not on every paint.)

    **CRITICAL — AlertDialog `portalContainer` prop:** if `src/components/ui/alert-dialog.tsx` does NOT yet support `portalContainer` (it's a Radix wrapper), add the prop additively (mirror what Plan 01 did for Sheet/Dialog in conversaciones — extend AlertDialogPortal forwarding). Update the file with a 1-line additive change at the AlertDialogContent definition. Document in the SUMMARY if this extension was needed.

    **DO NOT MODIFY:**
    - `createTask`, `updateTask`, `deleteTask` server action calls
    - `useForm`, react-hook-form Controller usage
    - `combineDateAndTime`, `getDefaultTime`, `extractTime` helpers
    - The form data type / submit handler logic
    - `TIME_OPTIONS` constant
    - `defaultValues` useMemo + form initialization
    - Calendar component / locale
    - Validation rules (required, etc.)
    - The `TaskFormDialog` exported function (only its className/portal additions)
  </action>
  <verify>
    <automated>grep -q "useDashboardV2" src/app/\(dashboard\)/tareas/components/task-form.tsx && grep -q "var(--rubric-2)" src/app/\(dashboard\)/tareas/components/task-form.tsx && grep -q "var(--rubric-1)" src/app/\(dashboard\)/tareas/components/task-form.tsx && grep -q "border border-\[var(--ink-1)\]" src/app/\(dashboard\)/tareas/components/task-form.tsx && grep -q "tracking-\[0.12em\]" src/app/\(dashboard\)/tareas/components/task-form.tsx && grep -q "portalContainer" src/app/\(dashboard\)/tareas/components/task-form.tsx && grep -q "portalContainer" src/app/\(dashboard\)/tareas/components/task-list.tsx && grep -q "createTask\|updateTask" src/app/\(dashboard\)/tareas/components/task-form.tsx && grep -q "TIME_OPTIONS" src/app/\(dashboard\)/tareas/components/task-form.tsx && grep -q "useForm" src/app/\(dashboard\)/tareas/components/task-form.tsx && grep -q "AlertDialog" src/app/\(dashboard\)/tareas/components/task-list.tsx && npx tsc --noEmit 2>&1 | grep -E "tareas/components/task-(form|list)" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "useDashboardV2" src/app/\(dashboard\)/tareas/components/task-form.tsx` (hook added).
    - `grep -q "var(--rubric-2)" src/app/\(dashboard\)/tareas/components/task-form.tsx` (.btn.red bg).
    - `grep -q "var(--rubric-1)" src/app/\(dashboard\)/tareas/components/task-form.tsx` (.btn.red border + shadow).
    - `grep -q "border border-\[var(--ink-1)\]" src/app/\(dashboard\)/tareas/components/task-form.tsx` (input borders D-DASH-14).
    - `grep -q "rounded-\[3px\]" src/app/\(dashboard\)/tareas/components/task-form.tsx` (editorial radius D-DASH-14).
    - `grep -q "tracking-\[0.12em\]" src/app/\(dashboard\)/tareas/components/task-form.tsx` (smallcaps labels D-DASH-14).
    - `grep -q "portalContainer" src/app/\(dashboard\)/tareas/components/task-form.tsx` (Popover + Sheet portal D-DASH-10).
    - `grep -q "portalContainer" src/app/\(dashboard\)/tareas/components/task-list.tsx` (Sheet + AlertDialog portal D-DASH-10).
    - The form file STILL contains: `useForm`, `Controller`, `createTask`, `updateTask`, `combineDateAndTime`, `TIME_OPTIONS`, `defaultValues` (Regla 6 NO-TOUCH).
    - The list file STILL contains: `deleteTask`, `handleDeleteConfirm`, `setFormSheetOpen`, `setEditingTask` (Regla 6 NO-TOUCH).
    - `! grep "oklch(" src/app/\(dashboard\)/tareas/components/task-form.tsx`.
    - `! grep "dark:" src/app/\(dashboard\)/tareas/components/task-form.tsx`.
    - `npx tsc --noEmit` reports zero errors in both files.
    - Manual: with flag OFF, form + delete dialog render byte-identical to current.
    - Manual: with flag ON, submit button is rubric-2 red, inputs have ink-1 borders + 3px radius, labels are smallcaps uppercase ink-3, popovers/sheets/alert-dialog re-root inside `.theme-editorial`.
  </acceptance_criteria>
  <done>Form editorial cuando v2 con inputs ink-1 + labels smallcaps + .btn.red submit + .btn ghost-outline cancel + swatches priority en lugar de dots colored. AlertDialog delete editorial. Todos los portales (Sheet, Popover, AlertDialog) re-root via portalContainer al wrapper `.theme-editorial`. Flag-OFF preserva todo verbatim. Build clean. createTask/updateTask/useForm intactos.</done>
</task>

</tasks>

<verification>
After all 5 tasks:

1. **TypeScript clean:** `npx tsc --noEmit 2>&1 | grep -E "tareas/" | (! grep -E "error|Error")` returns 0.

2. **Slate leakage check** (only flag-ON path; flag-OFF is byte-identical so any slate is current debt):
   - `grep -rE "(text-muted-foreground|bg-muted|text-destructive|bg-destructive|border-input|ring-ring)" src/app/\(dashboard\)/tareas/components/task-card.tsx src/app/\(dashboard\)/tareas/components/task-kanban.tsx src/app/\(dashboard\)/tareas/components/task-row.tsx` → MUST return zero (NEW files have zero slate).

3. **No dark mode classes added:** `! grep -r "dark:" src/app/\(dashboard\)/tareas/`.

4. **No hardcoded oklch():** `! grep -r "oklch(" src/app/\(dashboard\)/tareas/`.

5. **mx-* / var(--*) usage count:** `grep -rE "var\(--(paper|ink|rubric|accent|font|border|semantic)" src/app/\(dashboard\)/tareas/ | wc -l` should be ≥ 80.

6. **Regla 6 NO-TOUCH verifications via grep on each file:**
   - page.tsx still imports/uses `getTasks`, `getTaskTypes`, `getTaskSummary`, `getWorkspaceMembers`.
   - task-list.tsx still has `groupTasks` (legacy non-v2 path), `<TaskItem>` import (preserve non-v2), `useConversations`-style hooks unchanged (none in this file but verify).
   - task-form.tsx still has `useForm`, `Controller`, `createTask`, `updateTask`, `combineDateAndTime`, `TIME_OPTIONS`, react-hook-form behavior.
   - task-detail-sheet.tsx still has `getTaskNotes`, `getTaskActivity`, `TaskNotesSection`, `TaskHistoryTimeline`, `PostponementBadge`.
   - task-filters.tsx still has all `setFilter` setters + `<Select>` primitives wired.

7. **Manual smoke (with flag enabled in dev DB):**
   - `/tareas` topbar shows "Módulo · Operación" eyebrow + "Tareas · N abiertas · M vencen hoy" h1.
   - Tabs row renders 4 saved-views with active = ink-1 underline.
   - Chip-row shows status filters as pills.
   - View toggle "Tablero" / "Lista" buttons render with ink-1 border + ON state ink-1 bg.
   - Default view = kanban, persisted in localStorage.
   - Kanban renders 4 (or 3) columns con swatches según estado.
   - Cada TaskCard tiene pri-stripe izquierda (red urgent / gold high / indigo medium / ink-4 low — verify mapping in code matches mock).
   - Hover en TaskCard cambia shadow. Click abre detail sheet.
   - Detail sheet portal está dentro del wrapper editorial (verify via DevTools — el `[data-radix-portal]` queda dentro de `.theme-editorial`).
   - dp-hd shows id + type + h2 display title + close button + serif tagline.
   - dp-meta-grid muestra 6 cells border-r/border-b con labels smallcaps + values font-sans 13px.
   - 2 `<details>` collapsibles (Notas + Historial) con counts mono ml-auto.
   - Click "Lista" → tabla dictionary-style con headers smallcaps + rows hover paper-2.
   - "Nueva tarea" abre Sheet portal-rooted al wrapper editorial; inputs ink-1 border 3px radius; labels smallcaps; submit button bg rubric-2 / border rubric-1.
   - Delete confirmation dialog también editorial + portal-rooted.

8. **Manual flag-OFF check:** ALL the above should look IDENTICAL to current main when flag is OFF (groupTasks vertical layout, slate styles, default shadcn portals).

9. **Git diff check:** `git diff --stat main` muestra cambios SOLO en los 8 files-modified declarados en frontmatter — zero changes en `src/lib/`, `src/hooks/`, `src/app/actions/`, `src/components/tasks/` (estos shared components se reskinean en `ui-redesign-dashboard-extras` futuro per CONTEXT handoff).

10. **DnD verification (if applicable):** if `@dnd-kit` was found in read_first, verify NONE of its imports/wrappers were touched (only presentational classNames). If NOT found, document in SUMMARY that drag-and-drop is deuda futura.
</verification>

<success_criteria>
- All 5 tasks pass automated verify.
- Build clean (zero TS errors in modified files).
- With flag ON, `/tareas` matches mock `tareas.html` (kanban 4-col + list dictionary-table + detail sheet con dp-hd/dp-meta-grid/dp-sect).
- With flag OFF, `/tareas` is byte-identical to current main (Regla 6).
- All Radix portals (Sheet, Popover, AlertDialog) re-root inside `.theme-editorial` via portalContainer prop (D-DASH-10).
- Cero changes funcionales (D-DASH-07 verifiable via git diff de archivos out-of-scope).
- D-DASH-12 (kanban cards) + D-DASH-11 (dictionary-table) + D-DASH-14 (forms) + D-DASH-15 (status pills) + D-DASH-08 (mock fidelity) cubiertos en truths del frontmatter.
</success_criteria>

<output>
After completion, create `.planning/standalone/ui-redesign-dashboard/04-SUMMARY.md` with:
- Commits (one per task — 5 atomic commits with `feat(ui-redesign-dashboard-04-T{N}): ...` mensajes)
- TaskStatus enum finding (3-col vs 4-col kanban — what was decided + why)
- DnD library inventory (if any found + how it was preserved)
- AlertDialog `portalContainer` extension (was it needed? did Plan 01 already extend it?)
- Mock vs implementation pixel-diff notes (any tasteful deviations from `tareas.html` + rationale)
- Confirmation that `getTasks`, `getTaskNotes`, `getTaskActivity`, `createTask`, `updateTask`, `deleteTask`, `useForm`, `groupTasks` están all unchanged (Regla 6)
- Confirmation que TaskNotesSection + TaskHistoryTimeline + TaskItem + PostponementBadge en `src/components/tasks/**` están unchanged (transitional shadcn-on-paper, deferred a `ui-redesign-dashboard-extras`)
- Handoff to Wave 2: tareas done; agentes + automatizaciones come next.
</output>
