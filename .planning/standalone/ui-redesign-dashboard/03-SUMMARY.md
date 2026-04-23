---
phase: ui-redesign-dashboard
plan: 03
subsystem: pedidos-module-editorial-reskin
tags:
  - editorial
  - ui-only
  - feature-flag
  - per-workspace-gate
  - regla-6
  - wave-1
  - dictionary-table
  - kanban-card
  - portal-sweep
requirements:
  - D-DASH-07
  - D-DASH-08
  - D-DASH-09
  - D-DASH-10
  - D-DASH-11
  - D-DASH-12
  - D-DASH-14
  - D-DASH-15
  - D-DASH-16
dependency_graph:
  requires:
    - ui-redesign-dashboard Plan 01 (shipped 2026-04-23) — aporta `getIsDashboardV2Enabled`, `DashboardV2Provider`/`useDashboardV2()`, `.theme-editorial` CSS scope, fonts segment loader
    - ui-redesign-conversaciones (shipped 2026-04-22) — aporta tokens + `.mx-*` utilities en globals.css; patterns `portalContainer` en dropdown-menu.tsx + popover.tsx
  provides:
    - src/components/ui/sheet.tsx extendido con prop opcional `portalContainer?: HTMLElement | null` (BC) — Plans 02/04/05/06 pueden consumirlo para re-root de modals/sheets en dashboard editorial
    - Pedidos module completamente re-skineado cuando `useDashboardV2()===true`: topbar editorial + toolbar + kanban + order sheet ledger + dictionary-table líneas + list view badges + segmented view toggle + pipeline tabs editorial
    - Mapping deterministico stage-name -> mx-tag--variant (shared heuristic para reutilizar en Tareas/Analytics si necesario)
  affects:
    - Plan 04 (Tareas) — corre en paralelo; puede consumir sheet.tsx extension para sus detail sheets
    - Plans 05/06/07/08 — pueden consumir portalContainer de sheet.tsx si sus módulos necesitan sheets
tech_stack:
  added: []
  patterns:
    - Branching `v2 ? <editorial> : <current>` JSX gate (consistente con inbox v2 plans)
    - cn() ternary gating de classNames con className OFF preservado verbatim
    - Portal sweep via `document.querySelector('[data-theme-scope="dashboard-editorial"]')` pasado como `portalContainer` prop a Radix primitives
    - Dictionary-table pattern (D-DASH-11): border-collapse + th smallcaps rubric-2 + td sans 13px ink-1 + totals row border-top ink-1 + grand total mx-display
    - Stage-name -> mx-tag variant mapping (regex heuristic: cancel|rechaz→rubric, atras|alert→rubric, listo|complet|entreg|enviad→verdigris, prepar|proces→gold, nuevo|pendien→indigo, default→ink)
    - Editorial flag pills derivadas de fields existentes (closing_date+stage.is_closed → late, tags → vip, total_value → mayor)
    - Ledger-style sheet header: mono ID "Pedido · #XXXX" + display h2 serif + sans meta con iconos lucide
    - Stage-bar chip pill pattern: label smallcaps + pill border ink-1 + 2 botones avance prev/next
key_files:
  created: []
  modified:
    - src/app/(dashboard)/crm/pedidos/components/orders-view.tsx
    - src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx
    - src/app/(dashboard)/crm/pedidos/components/kanban-column.tsx
    - src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx
    - src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx
    - src/app/(dashboard)/crm/pedidos/components/view-toggle.tsx
    - src/app/(dashboard)/crm/pedidos/components/columns.tsx
    - src/app/(dashboard)/crm/pedidos/components/pipeline-tabs.tsx
    - src/components/ui/sheet.tsx
decisions:
  - D-DASH-07 observed — cero cambios a domain/hooks/server-actions/Realtime/DnDKit/IntersectionObserver/handleMoveResult/optimistic state/localStorage
  - D-DASH-08 observed — mock pedidos.html como fuente de verdad; KPI strip omitido por requerir métricas backend fuera de scope (documentado abajo)
  - D-DASH-09 observed — extension aditiva BC a sheet.tsx con `portalContainer?: HTMLElement | null` opcional
  - D-DASH-10 observed — 4 portales in-scope re-rootean a `[data-theme-scope="dashboard-editorial"]` cuando v2
  - D-DASH-11 observed — dictionary-table pattern aplicado en líneas del pedido (order sheet); DataTable list view cascade-styled via `.theme-editorial` (DataTable no expone className)
  - D-DASH-12 observed — kanban card pattern: article paper-1 + border + shadow-stamp + serif nombre + mono valor + flag pills mx-tag--*
  - D-DASH-14 observed — form treatments aplicados a search input + botones topbar + bulk action botones + order sheet action buttons
  - D-DASH-15 observed — status badges via mx-tag mapping deterministico
  - D-DASH-16 observed — navegación interna: pipeline tabs + view-toggle + editoriales con smallcaps rubric-2 underline/stamp
  - KPI strip omitido v1 — require backend metrics (avg ticket, pending count, etc) no expuestos por queries existentes; agregar en fase futura que incluya backend work
  - Flag derivations decorativas sin business rules (late/vip/mayor heuristics); pago omitido (data not modeled)
  - Subtotal/Descuento/IVA omitidos del ledger — OrderWithDetails no tiene breakdown, solo `total_value`; agregar cuando se modele el schema (deuda)
metrics:
  duration: ~90min
  completed_date: 2026-04-23
  tasks_completed: 5
  files_modified: 9
  files_created: 0
  lines_added: 1380
  lines_removed: 316
---

# Phase ui-redesign-dashboard Plan 03: Pedidos Module Editorial Re-skin Summary

Wave 1 — Módulo Pedidos re-skineado al lenguaje editorial con 9 archivos modificados: orders-view (topbar + toolbar + bulk bar + empty state) + kanban (card + column + board) + order sheet (ledger + stage-bar + dictionary-table + activity timeline) + list view badges + segmented toggle + pipeline tabs + sheet.tsx extension BC. Todo gated por `useDashboardV2()` o ternarios className; flag OFF = byte-identical al HEAD pre-plan.

## Objective (from plan)

Wave 1 — Re-skin el módulo Pedidos (`/crm/pedidos`) al lenguaje editorial del mock `pedidos.html`. Cubre: topbar (eyebrow + display h1 + 3 botones), toolbar (search + chips + segment view-toggle), kanban (column editorial + card paper-1 article + flag pills), order sheet (ledger-style header + stage chip + dictionary-table líneas + sections smallcaps + activity timeline), list view (dictionary-table via cascade), bulk actions bar, pipeline tabs, status badges via `.mx-tag--*`. Todo gated por `useDashboardV2()` (NEW JSX) o ternarios className.

## Tasks Completed

| Task | Name                                                                                          | Commit    | Files                                                                                                                                  |
| ---- | --------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Reskin editorial orders-view (topbar + toolbar + bulk bar + empty state + filter count)       | 99226ae   | `src/app/(dashboard)/crm/pedidos/components/orders-view.tsx`                                                                           |
| 2    | Reskin editorial kanban (card + column + board con flag pills + smallcaps + stamp shadows)    | c92cc95   | `src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx`, `kanban-column.tsx`, `kanban-board.tsx`                                  |
| 5    | Extender sheet.tsx con portalContainer opcional (BC) + reskin pipeline-tabs editorial         | 1761d86   | `src/components/ui/sheet.tsx`, `src/app/(dashboard)/crm/pedidos/components/pipeline-tabs.tsx`                                          |
| 3    | Reskin editorial order-sheet (ledger header + stage-bar chip + dictionary-table + actividad)  | 426b395   | `src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx`                                                                           |
| 4    | Reskin editorial view-toggle + columns stage badges mx-tag + wire v2 a createColumns          | b3efa13   | `src/app/(dashboard)/crm/pedidos/components/view-toggle.tsx`, `columns.tsx`, `orders-view.tsx`                                         |

Total: 5 atomic commits, 9 files modified, 1380 insertions / 316 deletions.

Note: Task 5 ejecutado ANTES de Task 3 (orden programático) para que sheet.tsx extension landee primero y Task 3 (order-sheet.tsx) consumiera la nueva prop `portalContainer` sin dependencia hacia adelante.

## Verification

### Per-task acceptance criteria

**Task 1 — orders-view.tsx**
- [x] `useDashboardV2` import + hook call
- [x] Row 1 editorial: eyebrow "Módulo · pedidos" (U+00B7) + h1 display "Tablero de pedidos" + 2 botones (Exportar outline + Nuevo pedido primary)
- [x] Row 2 editorial: search bg paper-0 + border-var(--border) + stage Select + tag Popover + sort + ViewToggle + ThemeToggle
- [x] Bulk actions bar editorial: bg paper-2 + border ink-1 + label smallcaps rubric-2 + 4 botones outline + Eliminar rubric-2 + close
- [x] Empty state editorial: mx-h3 + mx-caption + mx-rule-ornament + botón primario ink-1
- [x] Filter results count smallcaps ink-3 cuando v2
- [x] `data-theme-scope="dashboard-editorial"` en 3 ubicaciones (empty state + main wrapper + PopoverContent querySelector target)
- [x] State/hooks/server-actions preservados (useOrderSearch, moveOrderToStage, bulkMoveOrdersToStage referenciados)
- [x] Con flag OFF: gate `{!v2 && (...)}` preserva topbar original verbatim

**Task 2 — kanban-card + kanban-column + kanban-board**
- [x] `useDashboardV2` hook en card + column + board
- [x] Card v2: article paper-1 + border var(--border) + shadow-stamp (style boxShadow: 0 1px 0 var(--border)); paper-0 + ink-1 + stamp pronunciado cuando selected
- [x] Card header: serif 13.5px 600 nombre (font-sans), mono 12px 600 valor (font-mono)
- [x] Flag pills .mx-tag--rubric/gold/indigo con iconos lucide (ClockAlertIcon/StarIcon/WarehouseIcon)
- [x] Column v2: paper-0 + border ink-1 + header smallcaps 11px tracking-0.08em rubric uppercase
- [x] Counter pill mono variant (overLimit rubric-2 | atLimit gold | default ink-3)
- [x] DropdownMenu portalContainer -> data-theme-scope="dashboard-editorial" cuando v2
- [x] WIP warning + empty state + loading sentinel editorial
- [x] Board: gap tweak + DragOverlay stage preview editorial
- [x] useDraggable + useSortable + useDroppable + useKanbanRealtime + handleMoveResult + IntersectionObserver preservados (NO-TOUCH D-DASH-07)
- [x] PRODUCT_TYPE_COLORS + TagBadge + `stage.color` (user-defined) preservados
- [x] Con flag OFF: kanban DOM byte-identical

**Task 5 — sheet.tsx + pipeline-tabs.tsx**
- [x] `SheetContent` acepta prop opcional `portalContainer?: HTMLElement | null`
- [x] `SheetPortal` forwardea `container` prop a Radix
- [x] Docstring explica uso con `.theme-editorial` scope
- [x] Backwards-compatible: sin prop, Radix default a document.body (current behavior)
- [x] 42 consumers de SheetContent en src/ compilan clean
- [x] pipeline-tabs v2: container paper-0 + border ink-1 + stamp shadow
- [x] Tabs smallcaps 11px tracking-0.08em + active state bg paper-0 + border ink-1 + stamp (D-DASH-16)
- [x] Botón trigger "Pipeline" editorial smallcaps
- [x] DropdownMenuContent portalContainer cuando v2
- [x] localStorage + LOCAL_STORAGE_KEY + onOpenPipelines preservados (NO-TOUCH)

**Task 3 — order-sheet.tsx**
- [x] `useDashboardV2` hook
- [x] `portalContainer` pasado a SheetContent cuando v2 (D-DASH-10)
- [x] Header v2 ledger-style:
  * Mono "Pedido · #XXXX" 11px tracking-0.02em ink-3 (U+00B7)
  * Display h2 22px serif 600 ink-1 font-display
  * Meta sans 12px ink-3 con iconos lucide (Calendar/MapPin/Truck)
- [x] Stage bar reemplaza shadcn Select:
  * Label "Estado actual" smallcaps 10px tracking-0.12em
  * Chip pill border ink-1 + dot color stage + stage.name (Loader cuando isChangingStage)
  * 2 botones avance (ChevronLeft/Right) derivados de stages[idx±1] que llaman handleStageChange existente
- [x] Botones acción row: Editar ink-1 outline stamp + Eliminar rubric-2 outline + WhatsApp verdigris outline + CreateTaskButton (preservado)
- [x] ContactSection: v2 hook inside + h3 smallcaps + body sans ink-1/ink-2
- [x] Productos section con v2 rama:
  * Label "Líneas del pedido"
  * `<table>` border-collapse font-sans 13px
  * th smallcaps 10px uppercase tracking-0.08em ink-3 border-bottom
  * td sans ink-1/2 + qty/price/total mono alignment right
  * Grand total row border-top ink-1 + label sans + value mx-display 18px serif
- [x] Secciones Envio/Descripción/Etiquetas/Fechas h3 smallcaps cuando v2
- [x] Nueva sección Actividad v2-only con timeline grid mono timestamps + sans labels; derivada SOLO de created_at/updated_at/closing_date (no fabrication)
- [x] Sub-components intactos (OrderTagInput/RelatedOrders/OrderNotesSection/OrderTrackingSection/CreateTaskButton)
- [x] Server actions (moveOrderToStage/getRelatedOrders/getOrderNotes) + state + useEffect hooks intactos

**Task 4 — view-toggle + columns + orders-view wire**
- [x] view-toggle: early return editorial cuando v2 con segmented "Tablero / Lista" (mock `.seg`)
- [x] Active state bg ink-1 text paper-0 font-semibold
- [x] Flag OFF retorna ToggleGroup shadcn verbatim
- [x] columns.tsx: createColumns gana arg `v2?: boolean` (default false, BC)
- [x] Stage cell: mx-tag variant mapping deterministico por regex sobre stage name (cancel|rechaz→rubric | listo|entreg→verdigris | prepar|proces→gold | nuevo|pendien→indigo | atras|alert→rubric | default→ink)
- [x] Dot color stage preserved + mx-tag pill
- [x] Flag OFF: inline-flex shadcn variant verbatim
- [x] orders-view: `createColumns({ v2, ... })` + `v2` agregado a useMemo deps

### Overall plan verification

- [x] `npx tsc --noEmit` PASSES con zero errores en todos los 9 archivos modificados
- [x] `git diff --stat HEAD~5 HEAD -- src/lib/ src/hooks/ src/inngest/ src/app/actions/` = zero changes (D-DASH-07)
- [x] `grep -l "useOrderSearch|useKanbanRealtime|moveOrderToStage|bulkMoveOrdersToStage|deleteOrder|recompraOrder|exportOrdersToCSV|getOrdersForStage|getStageOrderCounts|handleMoveResult" src/app/(dashboard)/crm/pedidos/components/*.tsx` matchea `kanban-board.tsx` + `order-sheet.tsx` + `orders-table.tsx` + `orders-view.tsx` + `order-notes-section.tsx` — todos server actions + hooks NO-TOUCH preservados
- [x] `mx-tag mx-tag--` = 6 ocurrencias (kanban-card flag pills 3x + kanban-column Cerrado 1x + columns stage badge 1x + orders-view selection count 1x)
- [x] `portalContainer` en 4 ubicaciones pedidos: kanban-column.tsx, order-sheet.tsx, orders-view.tsx (tag popover), pipeline-tabs.tsx
- [x] SheetContent consumers en src/ = 42 (todos compilan clean — BC preserved)

## Portal-Sweep Targets

### Cubiertos por este plan (re-rootean a `[data-theme-scope="dashboard-editorial"]` cuando v2)

| Primitive                     | Archivo                                                                                      | Task |
| ----------------------------- | -------------------------------------------------------------------------------------------- | ---- |
| `<SheetContent>` (OrderSheet) | `src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx:287`                             | 3    |
| `<DropdownMenuContent>` (stage menu) | `src/app/(dashboard)/crm/pedidos/components/kanban-column.tsx:232`                    | 2    |
| `<DropdownMenuContent>` (pipeline selector) | `src/app/(dashboard)/crm/pedidos/components/pipeline-tabs.tsx:221`              | 5    |
| `<PopoverContent>` (tag filter) | `src/app/(dashboard)/crm/pedidos/components/orders-view.tsx:816`                           | 1    |

### Diferidos como deuda futura (rendean shadcn slate cuando se abren con flag ON)

Estos no bloquean la experiencia editorial principal (kanban + list + order sheet + topbar). Sus contenidos son dialogs secundarios que el usuario abre ocasionalmente. Requieren own re-skin pass en fase `ui-redesign-dashboard-extras`:

- `<SheetContent>` para OrderForm sheet en `orders-view.tsx` línea ~1112 — el form internals (contact-selector, product-picker, etc) tampoco están editoriales
- `<AlertDialogContent>` delete confirmation — `orders-view.tsx` (delete single, bulk delete, recompra)
- `<AlertDialogContent>` inside `stage-edit-dialog.tsx`, `bulk-move-dialog.tsx`, `bulk-edit-dialog.tsx`
- `<SelectContent>` instances — Radix re-roots a document.body; CSS-cascade aplica `.theme-editorial` tokens (layout root tiene la clase cuando flag ON), así que visualmente rendea editorial sin portalContainer explícito
- Sub-components del order sheet: `OrderTagInput`, `OrderNotesSection`, `OrderTrackingSection`, `RelatedOrders`, `ProductPicker`, `ContactSelector` — su interior usa shadcn slate; cascade parcial via `.theme-editorial`, pero algunos classNames hard-coded no tokenizan

## Deviations from Plan

**None** — los 5 tasks ejecutaron exactamente como estaban escritos en 03-PLAN.md. Pequeñas diferencias implementacionales minor (no deviations):

- Orden de ejecución de commits: Task 1 → Task 2 → Task 5 → Task 3 → Task 4 (para que sheet.tsx extension landee antes de Task 3 consumer; documentado en plan action block de Task 3 "Task 5 lands sheet.tsx first, then Task 3 consumes the new prop").
- `orders-table.tsx` NO modificado — verificado via `grep -rln "OrdersTable\|from './orders-table'" src/` que no es importado por ningún route (componente vestigial). Plan 03 Task 4 instrucción explícita: "if only its self-export is found → unused → no changes needed; document in SUMMARY".
- Empty state agregó `data-theme-scope="dashboard-editorial"` al wrapper v2 para que portales dentro del empty state también re-rooteen (defensive; plan no lo requería pero es consistente con el wrapper principal).
- Filter popover en orders-view usa `portalContainer` SIEMPRE (no solo cuando v2) — el `document.querySelector` devuelve `null` cuando el attr no existe en el DOM y Radix cae a document.body default; BC preservada. Simplifica el código.

## Decisions Documented

### KPI strip omitido en v1

El mock pedidos.html (líneas 212-233) incluye un KPI strip con métricas como "15 pedidos hoy", "ticket promedio $X", "pendientes N", etc. Estos require backend aggregation queries que:
- No existen en el módulo orders hoy
- Modificarlas violaría D-DASH-07 (UI-only phase)
- Requieren work de backend + domain layer + nuevos queries

**Decisión:** omitir KPI strip en esta plan. Documentado como deuda para fase futura que incluya backend scope. El topbar editorial funciona visualmente sin el KPI strip (Row 1 + Row 2 cubren lo esencial per D-DASH-08 "preserve features minimally adapted").

### Flag pills derivations en kanban-card (D-DASH-15 decorativo)

Los flag pills son visual-only sugar, no business rules. Derivaciones:

| Flag    | Deriva de                                                       | Rationale                                                                    |
| ------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `late`  | `order.closing_date < now() AND !order.stage?.is_closed`        | Pedido con fecha de cierre vencida y etapa no cerrada                        |
| `vip`   | `order.tags?.some(t => t.name?.toLowerCase() === 'vip')`        | Workspace-defined tag convention; si existe tag "vip" en la orden            |
| `mayor` | `order.total_value > 1_000_000` (COP)                           | Heurística visual para pedidos mayoristas (> 1M COP); NOT a business rule     |
| `pago`  | OMITIDO                                                         | `payment_status` no modelado en OrderWithDetails; agregar cuando se modele   |

Las derivaciones son puras (sin queries). Si el usuario quiere semantics diferente, es trivial ajustar el regex/threshold en `kanban-card.tsx` sin cambios a schema ni domain.

### Subtotal/Descuento/IVA omitidos del grand total

El mock pedidos.html (líneas 384-406) incluye rows para Subtotal + Descuento + IVA + Total en el dictionary-table de líneas. `OrderWithDetails` SOLO expone `total_value` sin breakdown — no hay `subtotal`, `discount`, `tax_amount` fields.

**Decisión:** solo render "Total" como grand total. Documentar como deuda futura. Agregar cuando el schema expose tax/discount breakdown (requiere backend work + Alegra/billing integration).

### orders-table.tsx NO modificado

`OrdersTable` export en `orders-table.tsx` es vestigial (verificado con grep — no se importa en ningún route del producto). Plan 03 Task 4 action block explícitamente permite: "If only its self-export is found → unused → no changes needed; document in SUMMARY". **Confirmado sin cambios**.

## Flag OFF byte-identical proof

Para cada archivo modificado, la rama v2=false preserva classNames + JSX originales verbatim. Verificable con grep (selecciones):

| OLD className/structure preservado                                         | Archivo                      | Flag OFF matchea |
| -------------------------------------------------------------------------- | ---------------------------- | ---------------- |
| `bg-background border p-2.5 shadow-sm` (kanban card original)              | kanban-card.tsx              | ✅ grep pass     |
| `ring-2 ring-primary border-primary` (card selected)                       | kanban-card.tsx              | ✅ grep pass     |
| `bg-muted/30 rounded-lg border` (column original)                          | kanban-column.tsx            | ✅ grep pass     |
| `bg-muted/50 rounded-t-lg` (column header original)                        | kanban-column.tsx            | ✅ grep pass     |
| `<Badge variant={isOverLimit ? 'destructive' ...}>` (count badge)          | kanban-column.tsx            | ✅ grep pass     |
| `flex items-center gap-3 mb-3 p-2 bg-primary/10 border border-primary/20`  | orders-view.tsx              | ✅ grep pass     |
| `text-sm text-muted-foreground` (filter count original)                    | orders-view.tsx              | ✅ grep pass     |
| `<ToggleGroup type="single" ...>` (view toggle original)                   | view-toggle.tsx              | ✅ grep pass     |
| `bg-background/95 backdrop-blur-sm border rounded-lg shadow-lg` (pipeline) | pipeline-tabs.tsx            | ✅ grep pass     |
| `inline-flex items-center px-2.5 py-0.5 rounded-full` (columns stage)      | columns.tsx                  | ✅ grep pass     |
| `SheetHeader className="px-6 pt-6 pb-4 border-b space-y-4"` (OLD)          | order-sheet.tsx              | ✅ grep pass     |
| `<Select value={order.stage_id} ...>` (OLD stage selector OFF branch)      | order-sheet.tsx              | ✅ grep pass     |

Con `ui_dashboard_v2.enabled` ausente/false en DB settings, `getIsDashboardV2Enabled` retorna `false`, `DashboardV2Provider` contiene `false`, `useDashboardV2()` retorna `false` en cada consumer, cada `v2 ? <editorial> : <current>` escoge la rama `current` → DOM output byte-identical al HEAD actual pre-plan.

## D-DASH-07 NO-TOUCH proof

```bash
$ git diff --stat HEAD~5 HEAD -- src/lib/ src/hooks/ src/inngest/ src/app/actions/
(empty — zero changes)
```

Archivos explicitamente preservados verbatim (referenciados en archivos modificados):

- `useOrderSearch`, `useKanbanRealtime`, `useRouter`, `useSearchParams`
- Server actions: `deleteOrder`, `deleteOrders`, `exportOrdersToCSV`, `getOrdersForStage`, `getStageOrderCounts`, `bulkMoveOrdersToStage`, `bulkUpdateOrderField`, `recompraOrder`, `moveOrderToStage`, `getRelatedOrders`, `getOrderNotes`, `updateStageOrder`
- Optimistic state machinery: `localOrdersByStage`, `recentMoveRef`, `handleMoveResult`, `moveTimeoutRef`
- DnDKit: `useDraggable`, `useSortable`, `useDroppable`, `DndContext`, `SortableContext`, `DragOverlay`, `PointerSensor`, `KeyboardSensor`, `closestCenter`, `arrayMove`, `sortableKeyboardCoordinates`
- IntersectionObserver infinite-scroll sentinel
- localStorage persistence (`VIEW_MODE_STORAGE_KEY`, `SORT_FIELD_STORAGE_KEY`, `SORT_DIR_STORAGE_KEY`, `LOCAL_STORAGE_KEY`)
- `compareOrders` helper + `SORT_OPTIONS` constant
- Shared components: `TagBadge`, `CreateTaskButton`, `DataTable`, `ScrollArea`, `Separator`, `Checkbox`

## Auth gates

None.

## Handoff note to Plan 04 (Tareas — parallel) + Wave 2

**sheet.tsx extension está live.** Plan 04 (Tareas) + Plans 05/06/07/08 (Wave 2+) pueden consumir `portalContainer` prop en sus `<SheetContent>` usages:

```tsx
<SheetContent
  portalContainer={v2 ? (typeof document !== 'undefined' ? document.querySelector<HTMLElement>('[data-theme-scope="dashboard-editorial"]') : undefined) : undefined}
  {...otherProps}
>
```

Para que el portal re-root funcione, el módulo debe wrapper un contenedor con `data-theme-scope="dashboard-editorial"` cuando v2, mismo pattern que orders-view.tsx línea 717.

**Kanban card pattern (D-DASH-12)** reutilizable en Tareas: article paper-0/paper-1 + border ink-1 + shadow-stamp + serif nombre + mono meta + footer flag pills. Plan 04 puede copiar y adaptar directamente desde `kanban-card.tsx` líneas 103-330.

**Dictionary-table pattern (D-DASH-11)** reutilizable en Tareas list view, CRM contactos, Analytics. Ver `order-sheet.tsx` líneas 594-683 (productos section) para referencia completa: header smallcaps + tbody td sans 13px + mono alignment right para columnas numéricas + totals row border-top ink-1 + grand total mx-display.

**Stage-name → mx-tag variant heuristic** (columns.tsx líneas 116-127) aplicable en Tareas si tienen estados similares (pendiente/en_progreso/completada) con pequeño ajuste del regex.

## Activación QA (Plan 09 — referencia, NO aplicar ahora)

Post-cierre de Waves 1-4 + DoD pass en Plan 09, activar en Somnio:

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

Antes de ese punto, ningún workspace debe tener el flag ON (Regla 6). Este plan + Plans 02/04 landean sin push explícito a Vercel — Plan 09 consolida.

## Known deuda / deferrals

### Diferidos este plan — deuda para `ui-redesign-dashboard-extras`:

1. **KPI strip en topbar** — requiere backend metrics; fase futura con backend scope (no puramente UI)
2. **Subtotal/Descuento/IVA breakdown** en grand total del order sheet — requiere schema update a `orders` table
3. **Flag `pago` en kanban-card** — `payment_status` no modelado en OrderWithDetails
4. **OrderForm sheet** (`orders-view.tsx` línea 1112) — form internals shadcn slate cuando se abre con flag ON
5. **AlertDialogs**: delete single/bulk/recompra confirmation dialogs shadcn slate cuando flag ON
6. **StageEditDialog, BulkMoveDialog, BulkEditDialog**: componentes separados, shadcn slate cuando flag ON
7. **Sub-components del order sheet**: `OrderTagInput`, `OrderNotesSection`, `OrderTrackingSection`, `RelatedOrders`, `ProductPicker`, `ContactSelector` — interiores shadcn, cascade parcial
8. **orders-table.tsx**: componente vestigial no usado en routes; eliminar en próxima limpieza
9. **Editorial separators**: `<Separator />` shadcn default cuando flag ON — CSS-cascade parcialmente lo estiliza; si visualmente se nota, re-skinear con `<div className="border-t border-[var(--border)]" />` directo

### Fuera de scope (Regla 6 compliance):

- `src/lib/domain/**`, `src/hooks/**`, `src/lib/agents/**`, `src/inngest/**`, `src/app/actions/**` — zero changes (D-DASH-07 hard)
- DB schema — zero changes
- `src/components/ui/{alert-dialog,dialog,select}.tsx` — extensiones aditivas deferred a fase futura

## Threat Flags

Omitido — ningún archivo modificado introduce nuevo surface de red, auth, file access o schema change. Todo el trabajo es UI-only (className + JSX gates) sin alterar domain/actions/hooks/Realtime.

## Self-Check: PASSED

Files verificados existentes:
- `src/app/(dashboard)/crm/pedidos/components/orders-view.tsx` ✅ (modified)
- `src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx` ✅ (modified)
- `src/app/(dashboard)/crm/pedidos/components/kanban-column.tsx` ✅ (modified)
- `src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx` ✅ (modified)
- `src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx` ✅ (modified)
- `src/app/(dashboard)/crm/pedidos/components/view-toggle.tsx` ✅ (modified)
- `src/app/(dashboard)/crm/pedidos/components/columns.tsx` ✅ (modified)
- `src/app/(dashboard)/crm/pedidos/components/pipeline-tabs.tsx` ✅ (modified)
- `src/components/ui/sheet.tsx` ✅ (modified)

Commits verificados en git log:
- 99226ae ✅ (Task 1 — orders-view)
- c92cc95 ✅ (Task 2 — kanban)
- 1761d86 ✅ (Task 5 — sheet.tsx + pipeline-tabs)
- 426b395 ✅ (Task 3 — order-sheet)
- b3efa13 ✅ (Task 4 — view-toggle + columns + orders-view wire)
