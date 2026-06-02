---
phase: ui-redesign-dashboard
plan: 03
type: execute
wave: 1
depends_on: ['01']
files_modified:
  - src/app/(dashboard)/crm/pedidos/components/orders-view.tsx
  - src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx
  - src/app/(dashboard)/crm/pedidos/components/kanban-column.tsx
  - src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx
  - src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx
  - src/app/(dashboard)/crm/pedidos/components/orders-table.tsx
  - src/app/(dashboard)/crm/pedidos/components/columns.tsx
  - src/app/(dashboard)/crm/pedidos/components/pipeline-tabs.tsx
  - src/app/(dashboard)/crm/pedidos/components/view-toggle.tsx
  - src/components/ui/sheet.tsx
autonomous: true
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

must_haves:
  truths:
    - "Cuando `useDashboardV2()===true` en `/crm/pedidos`, el topbar muestra eyebrow `mx-smallcaps` color rubric-2 'Módulo · pedidos' + h1 mx-display 30px serif 'Tablero de pedidos' (per mock pedidos.html lines 199-208 + D-DASH-08)"
    - "Cuando v2, los 3 botones del topbar (Imprimir hoja de ruta / Exportar / Nuevo pedido) usan editorial buttons: outline = border ink-1 + bg paper-0 + shadow stamp; primary 'Nuevo pedido' = bg ink-1 text paper-0 (per D-DASH-14, mock lines 36-39)"
    - "Cuando v2, el toolbar (search + filtros + view toggle) renderiza con: search border ink-1 + bg paper-0 + ícono Search lucide left-positioned, chips redondos border ink-1, view toggle segmented inline-flex con `.on` state bg ink-1 text paper-0 (mock lines 53-62, D-DASH-16)"
    - "Cuando v2 + viewMode==='kanban', cada `KanbanColumn` se ve editorial: bg paper-0, border ink-1, header con dot color stage + título smallcaps rubric-2 uppercase 11px tracking-0.08em + counter mono pill (per D-DASH-12, mock lines 69-82)"
    - "Cuando v2, cada `KanbanCard` es `<article>` paper-1 + border `var(--border)` + shadow-stamp (0 1px 0 border); selected state cambia a paper-0 + border ink-1 + shadow más pronunciada (per D-DASH-12, mock lines 84-101)"
    - "Cuando v2, el card header serif 13.5px font-weight 600 tracking-[-0.005em] (nombre del pedido) + value mono 12px font-weight 600 (total); footer mono 10-11px ink-3 con date + iconos + flag pills `.mx-tag--*` para tags shipping/late/vip"
    - "Cuando v2 + `<OrderSheet>` abierto, el header del sheet renderea: ID 'Pedido · #XXXX' mono 11px ink-3 letter-spacing 0.02em + h2 nombre mx-display serif 22px ink-1 + meta sans 12px ink-3 con íconos lucide (calendar/map-pin/truck) (per mock lines 254-266)"
    - "Cuando v2, el order sheet usa stage-bar editorial con label 'Estado actual' smallcaps rubric-2 + stage-chip pill border ink-1 + dot color stage + 2 botones avance editorial; reemplaza el shadcn `<Select>` actual (mock lines 269-276)"
    - "Cuando v2, las secciones del sheet (Cliente / Líneas / Notas / Actividad) usan h3 smallcaps rubric-2 10px tracking-0.12em uppercase + body sans 13px ink-1/ink-2 + separators border `var(--border)` (mock lines 128-130, 156-165)"
    - "Cuando v2, la tabla de líneas del pedido usa pattern dictionary-table (D-DASH-11): th smallcaps rubric-2 uppercase 10px tracking-0.08em + td font-sans 13px ink-1 + qty/price/total font-mono 12px alignment right + totals row con border-top ink-1 + grand total mx-display 18px serif (mock lines 132-145)"
    - "Cuando v2 + viewMode==='list', `<DataTable>` renderiza header smallcaps rubric-2 uppercase + rows serif 13-14px + hover paper-1 (D-DASH-11)"
    - "Cuando v2, status badges (stage de cada pedido en columns.tsx + selection pill + WIP overlimit warning) usan `.mx-tag--*` mapeados según D-DASH-15 (verde→verdigris, amarillo→gold, rojo→rubric, azul→indigo, neutro→ink)"
    - "Cuando v2, la barra de bulk actions (selectedOrderIds.size > 0) renderea editorial: bg paper-2 + border ink-1 + label smallcaps rubric-2 + 4 botones outline ink-1 + close icon-button"
    - "Cuando v2, los tabs inferiores `<PipelineTabs>` usan smallcaps rubric-2 uppercase + active tab bg paper-0 + border ink-1 + shadow stamp (D-DASH-16, mock-equivalente al .seg pattern)"
    - "Cuando v2, los 4 dialogs/sheets in-scope (OrderSheet, OrderForm Sheet, BulkMoveDialog, BulkEditDialog, StageEditDialog, AlertDialogs) re-rootean su Portal dentro de `[data-theme-scope='dashboard-editorial']` via prop `portalContainer` (D-DASH-10) — Sheet primitive extiende sheet.tsx aditivamente con `portalContainer` opcional BC"
    - "Cuando `useDashboardV2()===false`, todos los componentes renderean byte-identical a HEAD (verificable con git diff de DOM render): el branching es siempre `v2 ? <editorial> : <current>` o ternarios className"
    - "Cero cambios funcionales en: hooks (`useOrderSearch`, `useKanbanRealtime`), domain layer (`@/lib/domain/*`), server actions (`moveOrderToStage`, `bulkMoveOrdersToStage`, `bulkUpdateOrderField`, `deleteOrder`, `recompraOrder`, `exportOrdersToCSV`, `getOrdersForStage`, `getStageOrderCounts`), DnDKit drag/drop logic, `handleMoveResult` pure helper, optimistic state, infinite scroll IntersectionObserver, Realtime subscriptions, localStorage persistence (D-DASH-07)"
    - "Build pasa: `npx tsc --noEmit` clean en todos los archivos modificados; con flag OFF el git diff de pedido functionality es zero (toggling el flag en DevTools no afecta queries/mutations)"
  artifacts:
    - path: "src/app/(dashboard)/crm/pedidos/components/orders-view.tsx"
      provides: "Editorial topbar (eyebrow + h1 + actions) + KPI strip opcional + toolbar editorial (search + chips + segment view-toggle) + bulk-actions bar editorial — todo gated por useDashboardV2"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx"
      provides: "Editorial article card paper-1 + border + shadow-stamp; serif name + mono value; flag-pills .mx-tag--* en footer"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/crm/pedidos/components/kanban-column.tsx"
      provides: "Editorial column paper-0 + border ink-1; header smallcaps rubric-2 + stage dot + counter pill mono"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx"
      provides: "Ledger-style sheet header + stage-bar pill chip + dictionary-table líneas + sections smallcaps + actividad timeline"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/crm/pedidos/components/orders-table.tsx"
      provides: "List view dictionary-table editorial cuando v2"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/crm/pedidos/components/columns.tsx"
      provides: "Stage badge en cada row usa MxTag-equivalent classes cuando v2"
      contains: "v2"
    - path: "src/app/(dashboard)/crm/pedidos/components/pipeline-tabs.tsx"
      provides: "Tabs editorial smallcaps rubric-2 + active state stamp"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/crm/pedidos/components/view-toggle.tsx"
      provides: "Segmented control editorial cuando v2 (.seg .on pattern del mock)"
      contains: "useDashboardV2"
    - path: "src/components/ui/sheet.tsx"
      provides: "Aditive `portalContainer?: HTMLElement | null` prop opcional (D-DASH-09 + D-DASH-10) BC"
      contains: "portalContainer"
  key_links:
    - from: "src/app/(dashboard)/crm/pedidos/components/orders-view.tsx"
      to: "src/components/layout/dashboard-v2-context.tsx"
      via: "useDashboardV2 hook (Wave 0 Plan 01)"
      pattern: "useDashboardV2()"
    - from: "src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx"
      to: "src/components/layout/dashboard-v2-context.tsx"
      via: "useDashboardV2 hook"
      pattern: "useDashboardV2()"
    - from: "src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx"
      to: "src/components/layout/dashboard-v2-context.tsx"
      via: "useDashboardV2 hook + Sheet portalContainer prop"
      pattern: "portalContainer"
    - from: "src/components/ui/sheet.tsx"
      to: "@radix-ui/react-dialog"
      via: "SheetPrimitive.Portal container={portalContainer ?? undefined}"
      pattern: "SheetPrimitive.Portal"
---

<objective>
Wave 1 — Re-skin el módulo Pedidos (`/crm/pedidos`) al lenguaje editorial del mock `pedidos.html`. Cubre: topbar (eyebrow + display h1 + 3 botones), toolbar (search + chips + segment view-toggle), KPI strip opcional, kanban (column editorial + card paper-1 article + flag pills), order sheet (ledger-style header + stage chip + dictionary-table líneas + sections smallcaps + activity timeline), list view (dictionary-table), bulk actions bar, pipeline tabs, status badges via .mx-tag--*. Todo gated por `useDashboardV2()` (NEW JSX) o ternarios className.

**Purpose:** Pedidos es el módulo operativo más usado del producto (junto a inbox). Después de Wave 0 (chrome global) + Plan 02 (CRM contactos/productos) + ESTE PLAN (Pedidos), un usuario que ya tiene `ui_inbox_v2.enabled=true` y prende el flag dashboard verá coherencia visual end-to-end en el flujo comercial completo: WhatsApp → CRM → Pedidos. Plan 04 (Tareas) corre en paralelo a este; juntos cierran Wave 1.

**Output:** 9 componentes pedidos re-skineados condicionalmente + extensión BC de `sheet.tsx` para portal sweep. Cuando flag ON: topbar editorial, kanban editorial, order sheet ledger, list dictionary-table, bulk bar editorial, pipeline tabs editorial, status badges via mx-tag. Cuando flag OFF: todo byte-identical al HEAD actual. Cero cambios a domain/queries/mutations/hooks/Realtime/DnD logic (D-DASH-07).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/ui-redesign-dashboard/CONTEXT.md
@.planning/standalone/ui-redesign-dashboard/PLAN.md
@.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/pedidos.html
@.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/colors_and_type.css
@.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/README.md

# Wave 0 Plan 01 outputs (already shipped — interfaces below):
@src/components/layout/dashboard-v2-context.tsx
@src/lib/auth/dashboard-v2.ts

# Pedidos module files in scope (read full content during execute):
@src/app/(dashboard)/crm/pedidos/page.tsx
@src/app/(dashboard)/crm/pedidos/components/orders-view.tsx
@src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx
@src/app/(dashboard)/crm/pedidos/components/kanban-column.tsx
@src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx
@src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx
@src/app/(dashboard)/crm/pedidos/components/orders-table.tsx
@src/app/(dashboard)/crm/pedidos/components/columns.tsx
@src/app/(dashboard)/crm/pedidos/components/pipeline-tabs.tsx
@src/app/(dashboard)/crm/pedidos/components/view-toggle.tsx

# Shadcn primitives in scope (only sheet.tsx will be modified — aditive BC):
@src/components/ui/sheet.tsx

# Reference: prior portal sweep pattern (Plan 04 + Plan 05 inbox v2):
@src/components/ui/dropdown-menu.tsx
@src/components/ui/popover.tsx

# Reference plan format (sister phase Plan 02 — list panel inbox):
@.planning/standalone/ui-redesign-conversaciones/02-PLAN.md
@.planning/standalone/ui-redesign-conversaciones/LEARNINGS.md

<interfaces>
<!-- From Wave 0 Plan 01 (already shipped) — assumed contracts: -->

useDashboardV2 hook (analog to useInboxV2):
```typescript
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
const v2 = useDashboardV2()  // boolean, default false outside provider
```

`.theme-editorial` CSS scope (already in globals.css from `ui-redesign-conversaciones`) provides:
- Tokens: `--paper-0`, `--paper-1`, `--paper-2`, `--paper-3`, `--ink-1`, `--ink-2`, `--ink-3`, `--ink-4`, `--border`, `--rubric-1`, `--rubric-2`, `--accent-gold`, `--accent-verdigris`, `--accent-indigo`, `--semantic-success`, `--radius-2`, `--radius-3`
- Fonts: `--font-display` (EB Garamond), `--font-sans` (Inter), `--font-mono` (JetBrains Mono)
- Utilities: `mx-smallcaps`, `mx-display`, `mx-h3`, `mx-h4`, `mx-caption`, `mx-mono`, `mx-rule-ornament`
- Tag classes: `mx-tag mx-tag--{rubric|gold|indigo|verdigris|ink}`

Existing `OrdersView` props (preserve):
```typescript
interface OrdersViewProps {
  orders: OrderWithDetails[]
  pipelines: PipelineWithStages[]
  products: Product[]
  tags: Tag[]
  defaultPipelineId?: string
  defaultStageId?: string
  user: User | null
  currentUserId?: string
  isAdminOrOwner?: boolean
}
```

Existing `KanbanCard` props (preserve):
```typescript
interface KanbanCardProps {
  order: OrderWithDetails
  isDragging?: boolean
  onClick?: () => void
  isSelected?: boolean
  onSelectChange?: (selected: boolean) => void
  onRecompra?: (order: OrderWithDetails) => void
}
```

Existing `KanbanColumn` props (preserve — DnDKit useSortable + useDroppable + IntersectionObserver out-of-scope):
```typescript
interface KanbanColumnProps {
  stage: PipelineStage
  orders: OrderWithDetails[]
  onOrderClick: (order: OrderWithDetails) => void
  onEditStage?: (stage: PipelineStage) => void
  onDeleteStage?: (stage: PipelineStage) => void
  onAddStage?: () => void
  selectedOrderIds?: Set<string>
  onOrderSelectChange?: (orderId: string, selected: boolean) => void
  onRecompra?: (order: OrderWithDetails) => void
  totalCount?: number
  hasMore?: boolean
  isLoadingMore?: boolean
  onLoadMore?: () => void
}
```

Existing `OrderSheet` props (preserve):
```typescript
interface OrderSheetProps {
  order: OrderWithDetails | null
  open: boolean
  stages: PipelineStage[]
  allOrders?: OrderWithDetails[]
  onClose: () => void
  onEdit: (order: OrderWithDetails) => void
  onDelete: (order: OrderWithDetails) => void
  onViewOrder?: (order: OrderWithDetails) => void
  currentUserId?: string
  isAdminOrOwner?: boolean
  availableTags?: Array<{ id: string; name: string; color: string }>
}
```

Sheet primitive after extension (this plan's Task 5):
```typescript
function SheetContent({
  className,
  children,
  side = 'right',
  portalContainer,  // NEW — opcional BC
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: 'top' | 'right' | 'bottom' | 'left'
  portalContainer?: HTMLElement | null  // NEW
}) { ... }
```

Mock pedidos.html stage→tag color mapping (D-DASH-15 + mock lines 70-79, 119-122):
- "nuevo" / "Nuevo" → `accent-indigo` → `mx-tag--indigo`
- "preparando" / "prep" → `accent-gold` → `mx-tag--gold`
- "listo" → `accent-verdigris` → `mx-tag--verdigris`
- "entregado" / "ent" / "completado" → `semantic-success` → `mx-tag--verdigris` (most-similar; no separate green class)
- "cancelado" / "rechazado" → `mx-tag--rubric` (red)
- "pendiente" / fallback → `mx-tag--ink` (neutral)

Mock pedidos.html flag→tag mapping (mock lines 95-101, 351-352):
- `late` (atrasado) → `mx-tag--rubric` con icono `clock-alert`
- `vip` → `mx-tag--gold` con icono `star`
- `mayor` (mayorista) → `mx-tag--indigo` con icono `warehouse`
- `pago` (por pagar) → `mx-tag--ink` con icono `credit-card`
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Re-skin orders-view.tsx — editorial topbar (eyebrow + h1 + actions) + toolbar (search + filtros + segment) + bulk-actions bar + empty state</name>
  <files>src/app/(dashboard)/crm/pedidos/components/orders-view.tsx</files>
  <read_first>
    - src/app/(dashboard)/crm/pedidos/components/orders-view.tsx (full 1139 LOC — pay attention to: state declarations lines 140-330, empty state lines 678-693, top bar lines 695-852, selection bar lines 854-898, filter results count lines 900-905, content lines 907-944, dialogs lines 994-1107, OrderForm sheet lines 1112-1136)
    - .planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/pedidos.html lines 30-247 (topbar 199-209, KPIs 212-233, toolbar 236-247)
    - .planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/colors_and_type.css (verify token names — paper-0/1/2/3, ink-1/2/3, rubric-2, accent-* etc)
    - .planning/standalone/ui-redesign-conversaciones/02-PLAN.md Task 1 (sister pattern: header eyebrow + h1 + tabs + search)
  </read_first>
  <action>
    Modify `src/app/(dashboard)/crm/pedidos/components/orders-view.tsx`. Add `useDashboardV2` import and branch the rendering of: (a) empty state, (b) main top bar block (lines ~695-852), (c) selection bar (lines ~854-898), (d) filter results count text (lines ~900-905). Preserve all state, hooks, callbacks, dialogs, sheet renders byte-identical.

    **Step 1 — Add imports at top of file:**
    ```typescript
    import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
    ```

    **Step 2 — Inside `OrdersView` component body, near the top of state declarations (after the `useRouter` / `useSearchParams` calls at line ~141):**
    ```typescript
    const v2 = useDashboardV2()
    ```

    **Step 3 — Branch the EMPTY STATE (currently lines 679-692).** Wrap with v2 conditional:
    ```tsx
    {isEmpty ? (
      v2 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="mx-h3">Sin pedidos todavía.</p>
          <p className="mx-caption mt-2">Crea tu primer pedido para comenzar a gestionar tus ventas.</p>
          <p className="mx-rule-ornament my-4">· · ·</p>
          <button
            type="button"
            onClick={() => setFormSheetOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-[3px] bg-[var(--ink-1)] text-[var(--paper-0)] text-[13px] font-semibold hover:bg-[var(--ink-2)] transition-colors"
            style={{ fontFamily: 'var(--font-sans)', boxShadow: '0 1px 0 var(--ink-1)' }}
          >
            <PlusIcon className="h-4 w-4" />
            Nuevo pedido
          </button>
        </div>
      ) : (
        // CURRENT empty state — preserve verbatim (lines 679-692)
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <ShoppingCartIcon className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Sin pedidos</h3>
          <p className="text-muted-foreground mb-6 max-w-sm">
            Crea tu primer pedido para comenzar a gestionar tus ventas.
          </p>
          <Button onClick={() => setFormSheetOpen(true)}>
            <PlusIcon className="h-4 w-4 mr-2" />
            Nuevo Pedido
          </Button>
        </div>
      )
    ) : ( ... )}
    ```

    **Step 4 — Branch the MAIN TOPBAR (currently lines 695-852).** Wrap the existing `<div className="flex items-center gap-3 mb-4">` block with `{!v2 && (...)}` to preserve current rendering when flag is OFF, then add the editorial version `{v2 && (...)}` BEFORE it. The editorial version splits into THREE rows: (1) eyebrow+h1+actions row (mock lines 199-209), (2) optional KPIs strip (omit for v1 — KPIs require backend metrics not yet wired; document as deuda en SUMMARY), (3) toolbar (mock lines 236-247). The third row consolidates the existing search/stage-filter/tag-popover/sort/view-toggle into editorial styling using existing state.

    **CRITICAL — wire to existing state:** the v2 block MUST consume the same state variables and call the same setters as the current block. DO NOT create new state. Verify variable names by reading the file: `searchQuery`, `setSearchQuery`, `selectedStageId`, `setSelectedStageId`, `selectedTagIds`, `setSelectedTagIds`, `viewMode`, `handleViewModeChange`, `sortField`, `handleSortFieldChange`, `sortDirection`, `toggleSortDirection`, `setFormSheetOpen`, `handleExport`, `tags`, `stages`, `hasActiveFilters`, `clearFilters`.

    Editorial topbar block (rendered when `v2 === true`, BEFORE the existing `<div className="flex items-center gap-3 mb-4">`):

    ```tsx
    {v2 && (
      <>
        {/* Row 1 — eyebrow + h1 + actions (mock lines 199-209) */}
        <div className="flex items-end justify-between mb-4 pb-4 border-b border-[var(--ink-1)]">
          <div>
            <span
              className="block text-[11px] uppercase tracking-[0.14em] font-semibold text-[var(--rubric-2)]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              Módulo · pedidos
            </span>
            <h1
              className="mt-1 text-[30px] leading-[1.1] font-semibold tracking-[-0.015em] text-[var(--ink-1)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Tablero de pedidos
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Reuse existing handleExport callback */}
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] border border-[var(--ink-1)] bg-[var(--paper-0)] text-[var(--ink-1)] text-[13px] font-semibold hover:bg-[var(--paper-3)] transition-colors"
              style={{ fontFamily: 'var(--font-sans)', boxShadow: '0 1px 0 var(--ink-1)' }}
            >
              <DownloadIcon className="h-3.5 w-3.5" />
              Exportar
            </button>
            <button
              type="button"
              onClick={() => setFormSheetOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] bg-[var(--ink-1)] text-[var(--paper-0)] text-[13px] font-semibold hover:bg-[var(--ink-2)] transition-colors"
              style={{ fontFamily: 'var(--font-sans)', boxShadow: '0 1px 0 var(--ink-1)' }}
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Nuevo pedido
            </button>
          </div>
        </div>

        {/* Row 2 — toolbar editorial (mock lines 236-247): search + chips + view-toggle */}
        <div className="flex items-center gap-2.5 mb-4">
          {/* Search */}
          <div className="relative flex-1 max-w-[340px]">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--ink-3)] pointer-events-none" aria-hidden />
            <input
              type="text"
              placeholder="Buscar por cliente, id de pedido o producto…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[var(--paper-0)] border border-[var(--border)] rounded-[3px] py-2 pr-3 pl-8 text-[13px] text-[var(--ink-1)] placeholder:text-[var(--ink-3)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-1)]"
              style={{ fontFamily: 'var(--font-sans)' }}
              aria-label="Buscar pedidos"
            />
          </div>

          {/* Stage filter — keep using shadcn Select but it CSS-cascades editorial via .theme-editorial */}
          <Select
            value={selectedStageId || 'all'}
            onValueChange={(value) => setSelectedStageId(value === 'all' ? null : value)}
          >
            <SelectTrigger className="w-[160px] bg-[var(--paper-0)] border-[var(--border)] text-[13px] rounded-[3px]" style={{ fontFamily: 'var(--font-sans)' }}>
              <SelectValue placeholder="Etapa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las etapas</SelectItem>
              {stages.map((stage) => (
                <SelectItem key={stage.id} value={stage.id}>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                    {stage.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Tags filter popover — preserve existing Popover but trigger styled editorial */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'inline-flex items-center justify-center h-9 w-9 rounded-[3px] border border-[var(--border)] bg-[var(--paper-0)] text-[var(--ink-2)] hover:bg-[var(--paper-3)] transition-colors',
                  selectedTagIds.length > 0 && 'border-[var(--rubric-2)] text-[var(--rubric-2)]'
                )}
                aria-label="Filtrar por etiquetas"
              >
                <SlidersHorizontalIcon className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            {/* PopoverContent already supports portalContainer (per inbox v2 Plan 04). Pass dashboard scope if needed: */}
            <PopoverContent className="w-64" align="end" portalContainer={typeof document !== 'undefined' ? document.querySelector<HTMLElement>('[data-theme-scope="dashboard-editorial"]') : undefined}>
              {/* PRESERVE existing tag-filter popover content verbatim — NO style changes inside (CSS-cascade via .theme-editorial) */}
              <div className="space-y-3">
                <div className="font-medium text-sm">Filtrar por etiquetas</div>
                {tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => {
                      const isSelected = selectedTagIds.includes(tag.id)
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setSelectedTagIds(selectedTagIds.filter((id) => id !== tag.id))
                            } else {
                              setSelectedTagIds([...selectedTagIds, tag.id])
                            }
                          }}
                          className={cn(
                            'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition-all',
                            'border-2 cursor-pointer',
                            isSelected
                              ? 'border-foreground shadow-sm'
                              : 'border-transparent opacity-70 hover:opacity-100'
                          )}
                          style={{
                            backgroundColor: tag.color,
                            color: tag.color === '#eab308' || tag.color === '#06b6d4' ? '#1f2937' : '#ffffff',
                          }}
                        >
                          {tag.name}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Sin etiquetas disponibles</p>
                )}
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="w-full text-muted-foreground">
                    <XIcon className="h-4 w-4 mr-1" />
                    Limpiar filtros
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Sort (kanban only) — preserve as is, CSS-cascade restyles via .theme-editorial */}
          {viewMode === 'kanban' && (
            <div className="flex items-center gap-1">
              <Select value={sortField} onValueChange={handleSortFieldChange}>
                <SelectTrigger className="w-[170px] h-9 text-xs bg-[var(--paper-0)] border-[var(--border)] rounded-[3px]" style={{ fontFamily: 'var(--font-sans)' }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                onClick={toggleSortDirection}
                className="inline-flex items-center justify-center h-9 w-9 rounded-[3px] border border-[var(--border)] bg-[var(--paper-0)] text-[var(--ink-2)] hover:bg-[var(--paper-3)] transition-colors"
                title={sortDirection === 'asc' ? 'Ascendente' : 'Descendente'}
                aria-label={sortDirection === 'asc' ? 'Orden ascendente' : 'Orden descendente'}
              >
                {sortDirection === 'asc' ? (
                  <ArrowUpIcon className="h-3.5 w-3.5" />
                ) : (
                  <ArrowDownIcon className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          )}

          <div className="flex-1" />

          {/* View toggle — passes v2 down so the toggle itself re-skins (Task handled in view-toggle.tsx) */}
          <ViewToggle value={viewMode} onChange={handleViewModeChange} />

          {/* Theme toggle — keep current behaviour (already CSS-cascades) */}
          <ThemeToggle />
        </div>
      </>
    )}
    ```

    **Step 5 — Wrap the OLD topbar block with `{!v2 && (...)}`:** the existing `<div className="flex items-center gap-3 mb-4">` block (lines ~696-852) and everything inside it stays exactly as today, just gated.

    **Step 6 — Branch the SELECTION BAR (lines 854-898):**

    ```tsx
    {selectedOrderIds.size > 0 && (
      v2 ? (
        <div
          className="flex items-center gap-3 mb-3 p-3 bg-[var(--paper-2)] border border-[var(--ink-1)] rounded-[3px]"
          style={{ boxShadow: '0 1px 0 var(--ink-1)' }}
        >
          <span
            className="text-[10px] uppercase tracking-[0.14em] font-semibold text-[var(--rubric-2)]"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            Selección
          </span>
          <span className="text-[13px] font-medium text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-sans)' }}>
            {selectedOrderIds.size} pedido{selectedOrderIds.size > 1 ? 's' : ''}
          </span>
          <div className="flex-1" />
          {[
            { onClick: handleExport, icon: DownloadIcon, label: 'Exportar' },
            { onClick: () => setBulkMoveDialogOpen(true), icon: ArrowRightIcon, label: 'Mover de etapa' },
            { onClick: () => setBulkEditDialogOpen(true), icon: PencilIcon, label: 'Editar campo' },
          ].map((btn, i) => (
            <button
              key={i}
              type="button"
              onClick={btn.onClick}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] border border-[var(--ink-1)] bg-[var(--paper-0)] text-[var(--ink-1)] text-[12px] font-medium hover:bg-[var(--paper-3)] transition-colors"
              style={{ fontFamily: 'var(--font-sans)', boxShadow: '0 1px 0 var(--ink-1)' }}
            >
              <btn.icon className="h-3.5 w-3.5" />
              {btn.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setBulkDeleteDialogOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] border border-[var(--rubric-2)] bg-[var(--paper-0)] text-[var(--rubric-2)] text-[12px] font-medium hover:bg-[var(--rubric-2)]/10 transition-colors"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            <Trash2Icon className="h-3.5 w-3.5" />
            Eliminar
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="inline-flex items-center justify-center h-7 w-7 rounded-[3px] hover:bg-[var(--paper-3)] text-[var(--ink-3)] hover:text-[var(--ink-1)] transition-colors"
            aria-label="Limpiar selección"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        // CURRENT selection bar — preserve verbatim (lines 855-897)
        <div className="flex items-center gap-3 mb-3 p-2 bg-primary/10 border border-primary/20 rounded-lg">
          {/* ...preserve verbatim... */}
        </div>
      )
    )}
    ```

    **Step 7 — Branch the FILTER RESULTS COUNT (lines 900-905):**

    ```tsx
    {hasActiveFilters && selectedOrderIds.size === 0 && (
      <div
        className={cn(
          'mb-2',
          v2
            ? 'text-[11px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]'
            : 'text-sm text-muted-foreground'
        )}
        style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
      >
        {v2 ? `Mostrando ${filteredOrders.length} de ${orders.filter((o) => o.pipeline_id === activePipelineId).length}` : `Mostrando ${filteredOrders.length} de ${orders.filter((o) => o.pipeline_id === activePipelineId).length} pedidos`}
      </div>
    )}
    ```

    **Step 8 — Wrap the root content container** (currently `<div className="relative flex flex-col h-full p-4">` at line 694) — add `data-theme-scope="dashboard-editorial"` UNCONDITIONALLY so child portals can re-root via `document.querySelector` (D-DASH-10). Add it ALSO on the empty-state container above:

    ```tsx
    <div
      className="relative flex flex-col h-full p-4"
      data-theme-scope="dashboard-editorial"
    >
    ```

    **DO NOT MODIFY (D-DASH-07 + Regla 6 NO-TOUCH):**
    - State management (all `useState` + setters) — only consume, never re-shape
    - useEffect hooks (kanban initial load, search params order auto-open, localStorage sync)
    - Server actions: `deleteOrder`, `deleteOrders`, `exportOrdersToCSV`, `getOrdersForStage`, `getStageOrderCounts`, `bulkMoveOrdersToStage`, `bulkUpdateOrderField`, `recompraOrder`, `moveOrderToStage`
    - Hooks: `useOrderSearch`, `useRouter`, `useSearchParams`
    - The `compareOrders` helper, `SORT_OPTIONS` constant, `VIEW_MODE_STORAGE_KEY` constant
    - All `<AlertDialog>` blocks (delete, recompra, bulk delete) — only their containing portal will sweep in Task 5
    - The `<KanbanBoard>` and `<DataTable>` invocations — those re-skin in Task 2 + Task 4
    - The `<OrderSheet>` invocation — that re-skins in Task 3
    - The `<PipelineTabs>` invocation — that re-skins in Task 5
    - The `<OrderForm>` Sheet at lines 1112-1136 — wrapper preserved; only OrderForm itself re-skins as deuda futura (NOT in this plan; document)
    - `<StageEditDialog>`, `<BulkMoveDialog>`, `<BulkEditDialog>` invocations — reskin as deuda futura (NOT in this plan; document)
    - `<ProductPicker>` — out of scope (used in recompra dialog; deuda)
    - The `recompraPipeline` lookup, `recompraDisabled` flag, `handleRecompraConfirm`, `handleBulkDelete`, `handleBulkMove`, `handleBulkEdit` callbacks
  </action>
  <verify>
    <automated>grep -q "useDashboardV2" 'src/app/(dashboard)/crm/pedidos/components/orders-view.tsx' && grep -q "Módulo · pedidos" 'src/app/(dashboard)/crm/pedidos/components/orders-view.tsx' && grep -q "Tablero de pedidos" 'src/app/(dashboard)/crm/pedidos/components/orders-view.tsx' && grep -q "Buscar por cliente, id de pedido o producto…" 'src/app/(dashboard)/crm/pedidos/components/orders-view.tsx' && grep -q 'data-theme-scope="dashboard-editorial"' 'src/app/(dashboard)/crm/pedidos/components/orders-view.tsx' && grep -q "useOrderSearch" 'src/app/(dashboard)/crm/pedidos/components/orders-view.tsx' && grep -q "moveOrderToStage\|bulkMoveOrdersToStage" 'src/app/(dashboard)/crm/pedidos/components/orders-view.tsx' && npx tsc --noEmit 2>&1 | grep "orders-view" | (! grep -E "error TS")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "useDashboardV2" 'src/app/(dashboard)/crm/pedidos/components/orders-view.tsx'` (hook imported and used).
    - `grep -q "Módulo · pedidos" 'src/app/(dashboard)/crm/pedidos/components/orders-view.tsx'` (eyebrow text — uses U+00B7 medium dot, NOT a normal period).
    - `grep -q "Tablero de pedidos" 'src/app/(dashboard)/crm/pedidos/components/orders-view.tsx'` (display h1).
    - `grep -q "var(--font-display)" 'src/app/(dashboard)/crm/pedidos/components/orders-view.tsx'` (h1 uses display font).
    - `grep -q "Buscar por cliente, id de pedido o producto…" 'src/app/(dashboard)/crm/pedidos/components/orders-view.tsx'` (search placeholder, U+2026 ellipsis).
    - `grep -q 'data-theme-scope="dashboard-editorial"' 'src/app/(dashboard)/crm/pedidos/components/orders-view.tsx'` (portal-sweep anchor).
    - `grep -q "border-\[var(--ink-1)\]" 'src/app/(dashboard)/crm/pedidos/components/orders-view.tsx'` (editorial borders present).
    - `grep -q "var(--rubric-2)" 'src/app/(dashboard)/crm/pedidos/components/orders-view.tsx'` (eyebrow + selection label).
    - File STILL contains: `useOrderSearch`, `moveOrderToStage` o `bulkMoveOrdersToStage`, `deleteOrder`, `recompraOrder`, `useKanbanRealtime` references (NO-TOUCH guard — D-DASH-07; verify with grep — match string-literal name in current code).
    - `! grep -E "oklch\(|#[0-9a-fA-F]{3,8}" 'src/app/(dashboard)/crm/pedidos/components/orders-view.tsx' | grep -v "tag.color\|stage.color"` (no NEW hardcoded colors — must use var(--*); existing `tag.color`/`stage.color` for user-defined data preserved).
    - `npx tsc --noEmit` reports zero errors in `orders-view.tsx`.
    - With flag OFF, the rendered DOM is byte-identical to current (the `{!v2 && (oldBlock)}` gate enforces).
  </acceptance_criteria>
  <done>orders-view.tsx renderea editorial con flag ON: eyebrow + display h1 + 3 botones + toolbar (search + filtros + segment) + bulk-actions bar + filter count + empty state. Con flag OFF, byte-identical. Cero cambios a state/hooks/server-actions/Realtime/DnD. Build limpio.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Re-skin kanban-card.tsx + kanban-column.tsx + kanban-board.tsx — editorial column paper-0 + ink-1 + smallcaps header; editorial card article paper-1 + flag-pills mx-tag</name>
  <files>src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx, src/app/(dashboard)/crm/pedidos/components/kanban-column.tsx, src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx</files>
  <read_first>
    - src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx (full 236 LOC — pay attention to root div lines 94-108, header lines 127-157, products summary lines 160-169, tracking lines 172-180, tags lines 183-194, footer lines 197-233)
    - src/app/(dashboard)/crm/pedidos/components/kanban-column.tsx (full 241 LOC — pay attention to root div lines 116-126, column header lines 128-202, WIP warning lines 204-209, cards container lines 211-238)
    - src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx (first 80 LOC verified earlier — full file likely 200-300 LOC; focus on the JSX render that maps stages → KanbanColumn; SortableContext wrapper)
    - .planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/pedidos.html lines 64-101 (kanban CSS) + lines 326-381 (column + card JSX)
    - CONTEXT.md D-DASH-12 (kanban cards spec)
  </read_first>
  <action>
    Modify three files. All changes additive className branches gated by `useDashboardV2()`. DnDKit hooks (useDraggable / useSortable / useDroppable) and IntersectionObserver are NO-TOUCH.

    **PART A — `kanban-card.tsx`:**

    **A1. Add import + hook call:**
    ```typescript
    import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
    // ... inside KanbanCard component, near top:
    const v2 = useDashboardV2()
    ```

    **A2. Re-skin the root container className (currently lines 101-107):**
    ```tsx
    className={cn(
      'group relative rounded-[3px] cursor-grab active:cursor-grabbing transition-all',
      v2
        ? cn(
            'p-3',
            isSelected
              ? 'bg-[var(--paper-0)] border border-[var(--ink-1)]'
              : 'bg-[var(--paper-1)] border border-[var(--border)] hover:bg-[var(--paper-2)] hover:border-[var(--ink-2)]'
          )
        : cn(
            'bg-background border p-2.5 shadow-sm',
            'hover:border-foreground/20 hover:shadow-md',
            isSelected && 'ring-2 ring-primary border-primary'
          ),
      dragging && (v2 ? 'opacity-50' : 'opacity-50 shadow-lg ring-2 ring-primary/50'),
      onClick && 'cursor-pointer'
    )}
    style={v2 ? { ...style, boxShadow: isSelected ? '0 1px 0 var(--ink-1), 0 4px 10px -4px oklch(0.3 0.04 60 / 0.18)' : '0 1px 0 var(--border)' } : style}
    ```

    Note: the inline `style={{ transform }}` from DnDKit must be merged with the boxShadow when v2. Use spread.

    **A3. Re-skin the HEADER row (lines 127-157) — name (serif 13.5px 600) + value (mono 12px 600):**

    Replace the wrapping div className `'flex items-start justify-between gap-2 mb-1.5'` with editorial baseline alignment when v2:
    ```tsx
    <div className={cn('flex gap-2 mb-2', v2 ? 'items-baseline justify-between' : 'items-start justify-between', onSelectChange && 'pl-5')}>
    ```

    For the order name span (currently `<span className="font-semibold text-sm truncate block">`):
    ```tsx
    <span
      className={cn(
        'truncate block',
        v2
          ? 'text-[13.5px] font-semibold tracking-[-0.005em] text-[var(--ink-1)]'
          : 'font-semibold text-sm'
      )}
      style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
    >
      {order.name || 'Sin nombre'}
    </span>
    ```

    For the value span (currently `<span className="font-semibold text-sm text-primary shrink-0">`):
    ```tsx
    <span
      className={cn(
        'shrink-0',
        v2
          ? 'text-[12px] font-semibold text-[var(--ink-1)]'
          : 'font-semibold text-sm text-primary'
      )}
      style={v2 ? { fontFamily: 'var(--font-mono)' } : undefined}
    >
      {formatCurrency(order.total_value)}
    </span>
    ```

    **A4. Re-skin products summary (lines 160-169):**
    ```tsx
    {order.products.length > 0 && (
      <div
        className={cn(
          'flex items-center gap-2 mb-1.5',
          v2
            ? 'text-[12px] text-[var(--ink-2)] leading-[1.4]'
            : 'text-xs text-muted-foreground'
        )}
        style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
      >
        <PackageIcon className={cn(v2 ? 'h-3 w-3 text-[var(--ink-3)] shrink-0' : 'h-3.5 w-3.5')} />
        <span className="truncate">
          {order.products.length === 1 ? order.products[0].title : `${order.products[0].title} +${order.products.length - 1}`}
        </span>
      </div>
    )}
    ```

    **A5. Re-skin tracking row (lines 172-180):** wrap in `v2 ? <editorial> : <current>`. Editorial uses `font-mono` 11px ink-3.

    **A6. Re-skin tags overflow indicator (line 188-191):** when v2, swap the `<span className="text-[10px] text-muted-foreground px-1 py-0.5">+N</span>` with `<span className="mx-tag mx-tag--ink">+N</span>`. The individual `<TagBadge>` components are out-of-scope (shared component).

    **A7. Re-skin FOOTER (lines 197-233) — date + iconos + flag:**

    Replace the footer's outer div className with v2 branch. Add a flag-pill rendering for late/vip/mayor/pago using `.mx-tag--*` per the mapping in `<interfaces>`. Note: the current data model does NOT have explicit `flags` array on `OrderWithDetails` — instead derive from existing fields:
    - `late` flag: derive from `order.closing_date` < now AND `!order.stage.is_closed`
    - `vip` flag: derive from `order.tags.some(t => t.name.toLowerCase() === 'vip')` (workspace-defined tag convention)
    - `pago` flag: derive from `order.payment_status` if exists (else skip — data not modeled)
    - `mayor` (mayorista): derive from `order.total_value > 1_000_000` (1M COP threshold) — DOCUMENT this heuristic in SUMMARY as visual-only sugar; not a business rule

    If a derivation requires data not present in `OrderWithDetails`, omit that flag (don't fabricate fields). The visual-flag rendering is decorative; functionality unaffected.

    Editorial footer:
    ```tsx
    <div
      className={cn(
        'flex items-center justify-between pt-2 mt-2',
        v2
          ? 'border-t border-dashed border-[var(--border)] text-[11px] text-[var(--ink-3)]'
          : 'pt-1 border-t text-[11px] text-muted-foreground'
      )}
      style={v2 ? { fontFamily: 'var(--font-mono)' } : undefined}
    >
      <div className="flex items-center gap-1.5">
        {(order.source_order_id || order.has_derived_orders) && (
          <span title="Orden conectada">
            <Link2Icon className={cn(v2 ? 'h-3 w-3 text-[var(--accent-indigo)]' : 'h-3 w-3 text-blue-500')} />
          </span>
        )}
        <span>{formatRelativeTime(order.created_at)}</span>
        {/* Flag pills — only render when v2 */}
        {v2 && (
          <>
            {/* late */}
            {order.closing_date && new Date(order.closing_date) < new Date() && !order.stage?.is_closed && (
              <span className="mx-tag mx-tag--rubric inline-flex items-center gap-1">
                <ClockAlertIcon className="h-2.5 w-2.5" />atrasado
              </span>
            )}
            {/* vip — derived from tags */}
            {order.tags?.some(t => t.name?.toLowerCase() === 'vip') && (
              <span className="mx-tag mx-tag--gold inline-flex items-center gap-1">
                <StarIcon className="h-2.5 w-2.5" />vip
              </span>
            )}
            {/* mayor — heuristic 1M COP+ */}
            {order.total_value > 1_000_000 && (
              <span className="mx-tag mx-tag--indigo inline-flex items-center gap-1">
                <WarehouseIcon className="h-2.5 w-2.5" />mayor
              </span>
            )}
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        {onRecompra && (
          <button
            onClick={(e) => { e.stopPropagation(); onRecompra(order) }}
            className={cn(
              'p-1 rounded transition-colors',
              v2
                ? 'hover:bg-[var(--paper-3)] text-[var(--ink-3)] hover:text-[var(--ink-1)]'
                : 'hover:bg-blue-100 hover:text-blue-600'
            )}
            title="Recompra"
            aria-label="Crear recompra"
          >
            <RefreshCwIcon className="h-3.5 w-3.5" />
          </button>
        )}
        {order.contact?.phone && (
          <Link
            href={`/whatsapp?phone=${encodeURIComponent(order.contact.phone)}`}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'p-1 rounded transition-colors',
              v2
                ? 'hover:bg-[var(--paper-3)] text-[var(--ink-3)] hover:text-[var(--ink-1)]'
                : 'hover:bg-green-100 hover:text-green-600'
            )}
            title="Ver en WhatsApp"
            aria-label="Ver conversación de WhatsApp"
          >
            <MessageCircleIcon className="h-3.5 w-3.5" />
          </Link>
        )}
        {order.contact?.city && (
          <span className={cn('truncate', v2 && 'text-[var(--ink-3)]')}>{order.contact.city}</span>
        )}
      </div>
    </div>
    ```

    Add lucide imports as needed: `ClockAlertIcon`, `StarIcon`, `WarehouseIcon` (verify exact lucide names — use `Clock` if `ClockAlert` not available; lucide-react v0.460+ has `AlarmClock` and `ClockAlert`).

    **PART B — `kanban-column.tsx`:**

    **B1. Add import + hook call (same as A1).**

    **B2. Re-skin root div (currently lines 116-126):**
    ```tsx
    className={cn(
      'flex flex-col w-72 min-w-72 rounded-[3px]',
      v2
        ? 'bg-[var(--paper-0)] border border-[var(--ink-1)]'
        : 'bg-muted/30 border',
      isOver && (v2 ? 'ring-2 ring-[var(--rubric-2)]/40' : 'ring-2 ring-primary/50'),
      isAtLimit && !isOverLimit && (v2 ? 'border-[var(--accent-gold)]' : 'border-amber-400/50'),
      isOverLimit && (v2 ? 'border-[var(--rubric-2)]' : 'border-destructive/50'),
      isDragging && 'opacity-50'
    )}
    ```

    **B3. Re-skin the column header (lines 128-202):**

    Add v2-conditional className wrapping. The header outer div:
    ```tsx
    <div className={cn(
      'group flex items-center gap-2 p-3',
      v2
        ? 'border-b border-[var(--ink-1)] bg-[var(--paper-1)] rounded-t-[3px]'
        : 'border-b bg-muted/50 rounded-t-lg'
    )}>
    ```

    Replace the stage name `<span className="font-medium text-sm flex-1 truncate">{stage.name}</span>` with:
    ```tsx
    <span
      className={cn(
        'flex-1 truncate',
        v2
          ? 'text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-1)]'
          : 'font-medium text-sm'
      )}
      style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
    >
      {stage.name}
    </span>
    ```

    Replace the order count `<Badge>` with v2 branch — when v2 use a counter pill matching the mock `.col .hd .c` style:
    ```tsx
    {v2 ? (
      <span
        className={cn(
          'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border',
          isOverLimit
            ? 'bg-[var(--paper-3)] text-[var(--rubric-2)] border-[var(--rubric-2)]'
            : isAtLimit
              ? 'bg-[var(--paper-3)] text-[var(--accent-gold)] border-[var(--accent-gold)]'
              : 'bg-[var(--paper-3)] text-[var(--ink-3)] border-[var(--border)]'
        )}
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {totalCount !== undefined ? totalCount : orderCount}
        {wipLimit !== null && (
          <span className="ml-0.5 text-[var(--ink-3)]">/ {wipLimit}</span>
        )}
      </span>
    ) : (
      // CURRENT Badge — preserve verbatim:
      <Badge variant={isOverLimit ? 'destructive' : isAtLimit ? 'secondary' : 'outline'} className="h-5 px-1.5 text-xs font-normal">
        {totalCount !== undefined ? totalCount : orderCount}
        {wipLimit !== null && <span className="text-muted-foreground ml-0.5">/ {wipLimit}</span>}
      </Badge>
    )}
    ```

    Replace the "Cerrado" Badge with v2 branch using `.mx-tag--ink` when v2.

    **DropdownMenu (stage menu) — preserve as is.** It already uses `dropdown-menu.tsx` from shadcn which has `portalContainer` prop available. Pass `portalContainer={typeof document !== 'undefined' ? document.querySelector<HTMLElement>('[data-theme-scope="dashboard-editorial"]') : undefined}` ONLY when `v2 === true`:
    ```tsx
    <DropdownMenuContent
      align="end"
      className="w-48"
      portalContainer={v2 ? (typeof document !== 'undefined' ? document.querySelector<HTMLElement>('[data-theme-scope="dashboard-editorial"]') : undefined) : undefined}
    >
    ```

    **B4. Re-skin WIP warning (lines 204-209):**
    ```tsx
    {isOverLimit && (
      <div
        className={cn(
          'px-3 py-1.5 text-xs',
          v2
            ? 'bg-[var(--rubric-2)]/10 text-[var(--rubric-2)] border-b border-[var(--rubric-2)]/30'
            : 'bg-destructive/10 text-destructive'
        )}
        style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
      >
        Limite WIP excedido ({orderCount}/{wipLimit})
      </div>
    )}
    ```

    **B5. Re-skin empty state (lines 213-216):**
    ```tsx
    {orders.length === 0 ? (
      <div className={cn(
        'flex items-center justify-center h-full text-sm py-8',
        v2 ? 'text-[var(--ink-3)] italic' : 'text-muted-foreground'
      )}
      style={v2 ? { fontFamily: 'var(--font-display)' } : undefined}>
        Sin pedidos
      </div>
    ) : ( ... )}
    ```

    **B6. Re-skin "Cargando..." sentinel (lines 230-234):** swap to mono ink-3 when v2.

    **PART C — `kanban-board.tsx`:**

    **C1. Add import + hook call.**

    **C2.** Read the file first to identify the column wrapper / SortableContext / DragOverlay structure. The kanban-board's main role is wiring DndContext + SortableContext + the drag overlay. Reskinning here is minimal:
    - Pass `v2` down via props ONLY if needed for the `<DragOverlay>` rendering (the floating card during drag). Wrap the DragOverlay's child `<KanbanCard>` rendering with v2 styling — but since KanbanCard now consumes `useDashboardV2()` internally, DragOverlay automatically inherits.
    - The grid container around columns: re-skin gap/padding when v2 to match mock `.kanban` (gap 16px, padding 18px 28px). Identify the grid div and apply:
    ```tsx
    <div className={cn(
      'flex flex-col h-full',
      v2 ? 'gap-4' : 'gap-2'  // conservative
    )}>
    ```

    Verify via reading the full file what the actual layout is. Apply minimal re-skin.

    **DO NOT MODIFY (D-DASH-07):**
    - DnDKit hooks (`useDraggable`, `useSortable`, `useDroppable`, `DndContext`, `SortableContext`, `DragOverlay`)
    - `useKanbanRealtime` hook usage in kanban-board
    - `handleMoveResult` pure helper
    - `moveOrderToStage`, `updateStageOrder` server actions
    - `IntersectionObserver` for infinite scroll
    - Optimistic state machinery (`localOrdersByStage`, `recentMoveRef`, etc)
    - WIP limit detection logic (`isAtLimit`, `isOverLimit`)
    - The `setNodeRef` combination for sortable+droppable
    - Drop indicator `isOver` / `isDragging` / `transform` / `transition` from DnDKit
    - `formatCurrency`, `formatRelativeTime` helpers
    - `detectOrderProductTypes`, `PRODUCT_TYPE_COLORS` (product type dots stay as-is — semantic colors per product type, not theme-related)
    - The `<Checkbox>` for selection — preserve verbatim (it CSS-cascades via `.theme-editorial`)
    - The `<TagBadge>` import (shared component out-of-scope)
  </action>
  <verify>
    <automated>grep -q "useDashboardV2" 'src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx' && grep -q "useDashboardV2" 'src/app/(dashboard)/crm/pedidos/components/kanban-column.tsx' && grep -q "useDraggable" 'src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx' && grep -q "useSortable\|useDroppable" 'src/app/(dashboard)/crm/pedidos/components/kanban-column.tsx' && grep -q "var(--paper-0)\|var(--paper-1)" 'src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx' && grep -q "var(--ink-1)" 'src/app/(dashboard)/crm/pedidos/components/kanban-column.tsx' && grep -q "mx-tag mx-tag--" 'src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx' && grep -q "tracking-\[0.08em\]" 'src/app/(dashboard)/crm/pedidos/components/kanban-column.tsx' && npx tsc --noEmit 2>&1 | grep -E "kanban-card|kanban-column|kanban-board" | (! grep -E "error TS")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "useDashboardV2" 'src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx'`.
    - `grep -q "useDashboardV2" 'src/app/(dashboard)/crm/pedidos/components/kanban-column.tsx'`.
    - `grep -q "var(--paper-1)" 'src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx'` (card editorial bg).
    - `grep -q "var(--paper-0)" 'src/app/(dashboard)/crm/pedidos/components/kanban-column.tsx'` (column editorial bg).
    - `grep -q "border-\[var(--ink-1)\]" 'src/app/(dashboard)/crm/pedidos/components/kanban-column.tsx'`.
    - `grep -q "tracking-\[0.08em\]" 'src/app/(dashboard)/crm/pedidos/components/kanban-column.tsx'` (column header smallcaps tracking).
    - `grep -q "mx-tag mx-tag--" 'src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx'` (flag pills via mx-tag classes — D-DASH-15).
    - `grep -q "var(--font-mono)" 'src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx'` (card value uses mono).
    - `grep -q "useDraggable" 'src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx'` (DnDKit preserved — NO-TOUCH).
    - `grep -q "useSortable\|useDroppable" 'src/app/(dashboard)/crm/pedidos/components/kanban-column.tsx'` (DnDKit preserved).
    - `grep -q "useKanbanRealtime" 'src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx'` (Realtime preserved — NO-TOUCH).
    - `grep -q "handleMoveResult" 'src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx'` (CAS helper preserved).
    - `grep -q "PRODUCT_TYPE_COLORS\|detectOrderProductTypes" 'src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx'` (product type dots preserved).
    - `grep -q "TagBadge" 'src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx'` (shared component preserved).
    - `npx tsc --noEmit` reports zero errors in the three files.
    - With flag OFF, kanban DOM byte-identical (gates everywhere are `v2 ? <new> : <current>`).
  </acceptance_criteria>
  <done>Kanban editorial con flag ON: columnas paper-0 + border ink-1 + header smallcaps; cards article paper-1 + serif name + mono value + flag pills .mx-tag--*. Con flag OFF byte-identical. DnDKit + Realtime + IntersectionObserver + handleMoveResult preservados intactos. Build limpio.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Re-skin order-sheet.tsx — ledger-style header (mono ID + display h2 + meta) + stage chip pill + dictionary-table líneas + sections smallcaps + activity timeline + portal sweep</name>
  <files>src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx</files>
  <read_first>
    - src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx (full 561 LOC — pay attention to formatters lines 51-77, ContactSection lines 79-136, header lines 241-349, content sections lines 352-555)
    - .planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/pedidos.html lines 103-168 (drawer CSS) + lines 253-319 (drawer JSX) + lines 384-406 (line items + totals)
    - CONTEXT.md D-DASH-08, D-DASH-10, D-DASH-11
  </read_first>
  <action>
    Modify `src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx`. Major re-skin: ledger header, stage-bar chip (replaces shadcn Select), dictionary-table líneas, sections smallcaps, activity timeline. All gated by `useDashboardV2()`. Pass `portalContainer` to the underlying `<Sheet>` so the sheet content portal lands inside `[data-theme-scope="dashboard-editorial"]` (D-DASH-10) — REQUIRES sheet.tsx extension landed in Task 5 BEFORE this task; coordinate execution order: Task 5 lands sheet.tsx first, then Task 3 consumes the new prop.

    **Step 1 — Add imports + hook call:**
    ```typescript
    import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
    // ... inside OrderSheet component, near top:
    const v2 = useDashboardV2()
    ```

    **Step 2 — Pass `portalContainer` to `<SheetContent>` when v2:**
    Replace:
    ```tsx
    <SheetContent key={order.id} className="sm:max-w-[500px] p-0 flex flex-col">
    ```
    With:
    ```tsx
    <SheetContent
      key={order.id}
      className="sm:max-w-[500px] p-0 flex flex-col"
      portalContainer={v2 ? (typeof document !== 'undefined' ? document.querySelector<HTMLElement>('[data-theme-scope="dashboard-editorial"]') : undefined) : undefined}
    >
    ```

    **Step 3 — Re-skin SheetHeader (lines 241-349) into editorial ledger header:**

    Replace the entire `<SheetHeader>` content with v2 branching. When v2 render the mock pattern (lines 254-266 + 269-276):

    ```tsx
    <SheetHeader className={cn('px-6 pt-6 pb-4', v2 ? 'border-b border-[var(--ink-1)] space-y-0' : 'border-b space-y-4')}>
      {v2 ? (
        <>
          {/* Top: ID + title + meta + close */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div
                className="text-[11px] text-[var(--ink-3)] tracking-[0.02em]"
                style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}
              >
                Pedido · <span>#{order.id.slice(-4).toUpperCase()}</span>
              </div>
              <SheetTitle asChild>
                <h2
                  className="mt-1 text-[22px] leading-[1.15] font-semibold tracking-[-0.01em] text-[var(--ink-1)]"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {order.name || 'Sin nombre'}
                </h2>
              </SheetTitle>
              <div
                className="mt-2 flex flex-wrap gap-3 text-[12px] text-[var(--ink-3)]"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                <span className="inline-flex items-center gap-1">
                  <CalendarIcon className="h-3 w-3" />
                  {formatDateTime(order.created_at)}
                </span>
                {order.shipping_city && (
                  <span className="inline-flex items-center gap-1">
                    <MapPinIcon className="h-3 w-3" />
                    {order.shipping_city}
                  </span>
                )}
                {order.carrier && (
                  <span className="inline-flex items-center gap-1">
                    <TruckIcon className="h-3 w-3" />
                    <span className="capitalize">{order.carrier}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Stage bar (replaces shadcn Select) */}
          <div className="-mx-6 mt-4 px-6 py-3 border-t border-[var(--border)] bg-[var(--paper-1)] flex items-center gap-3 flex-wrap">
            <span
              className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              Estado actual
            </span>
            <span
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--ink-1)] bg-[var(--paper-0)] text-[12px] font-semibold text-[var(--ink-1)] tracking-[0.02em]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: stage.color }} />
              {stage.name}
            </span>
            <div className="flex-1" />
            {/* Stage advance buttons — derive prev/next from stages array index */}
            {(() => {
              const idx = stages.findIndex(s => s.id === order.stage_id)
              const prev = idx > 0 ? stages[idx - 1] : null
              const next = idx < stages.length - 1 ? stages[idx + 1] : null
              return (
                <div className="flex gap-1.5">
                  {prev && (
                    <button
                      type="button"
                      onClick={() => handleStageChange(prev.id)}
                      disabled={isChangingStage}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[3px] border border-[var(--border)] bg-[var(--paper-0)] text-[var(--ink-2)] text-[11px] font-medium hover:bg-[var(--paper-3)] hover:text-[var(--ink-1)] hover:border-[var(--ink-2)] transition-colors disabled:opacity-50"
                      style={{ fontFamily: 'var(--font-sans)' }}
                      aria-label={`Mover a ${prev.name}`}
                    >
                      <ChevronLeftIcon className="h-3 w-3" />
                      {prev.name}
                    </button>
                  )}
                  {next && (
                    <button
                      type="button"
                      onClick={() => handleStageChange(next.id)}
                      disabled={isChangingStage}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[3px] border border-[var(--ink-1)] bg-[var(--paper-0)] text-[var(--ink-1)] text-[11px] font-semibold hover:bg-[var(--paper-3)] transition-colors disabled:opacity-50"
                      style={{ fontFamily: 'var(--font-sans)' }}
                      aria-label={`Mover a ${next.name}`}
                    >
                      {next.name}
                      <ChevronRightIcon className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )
            })()}
          </div>

          {/* Action buttons row (Editar / Eliminar / WhatsApp / Tarea) */}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => { onClose(); onEdit(order) }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] border border-[var(--ink-1)] bg-[var(--paper-0)] text-[var(--ink-1)] text-[12px] font-semibold hover:bg-[var(--paper-3)] transition-colors"
              style={{ fontFamily: 'var(--font-sans)', boxShadow: '0 1px 0 var(--ink-1)' }}
            >
              <PencilIcon className="h-3.5 w-3.5" />
              Editar
            </button>
            <button
              type="button"
              onClick={() => { onClose(); onDelete(order) }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] border border-[var(--rubric-2)] bg-[var(--paper-0)] text-[var(--rubric-2)] text-[12px] font-semibold hover:bg-[var(--rubric-2)]/10 transition-colors"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              <Trash2Icon className="h-3.5 w-3.5" />
              Eliminar
            </button>
            {contact?.phone && (
              <Link
                href={`/whatsapp?phone=${encodeURIComponent(contact.phone)}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] border border-[var(--accent-verdigris)] bg-[var(--paper-0)] text-[var(--accent-verdigris)] text-[12px] font-semibold hover:bg-[var(--accent-verdigris)]/10 transition-colors"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                <MessageCircleIcon className="h-3.5 w-3.5" />
                WhatsApp
              </Link>
            )}
            <CreateTaskButton
              orderId={order.id}
              orderInfo={`Pedido ${formatCurrency(order.total_value)} - ${contact?.name || 'Sin contacto'}`}
              variant="outline"
              size="sm"
            />
          </div>
        </>
      ) : (
        // CURRENT header — preserve verbatim (lines 242-348)
        <>
          {/* ...preserve verbatim... */}
        </>
      )}
    </SheetHeader>
    ```

    Add lucide imports if missing: `ChevronLeftIcon`, `ChevronRightIcon`.

    **Step 4 — Re-skin ContactSection (lines 79-136) — make it editorial when v2.** Add a `v2` prop to `ContactSection` (or use `useDashboardV2()` directly inside it — preferred since ContactSection is a sub-component). Branch the h3 className + body styling:

    ```tsx
    function ContactSection({ contact }: { contact: ... }) {
      const v2 = useDashboardV2()
      // ...
      return (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className={cn(
              v2
                ? 'text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]'
                : 'text-sm font-semibold text-muted-foreground uppercase tracking-wide'
            )}
            style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}>
              Cliente
            </h3>
            {/* expand button preserved */}
          </div>
          {/* body: editorial vs current */}
        </section>
      )
    }
    ```

    **Step 5 — Re-skin Productos section (lines 362-403) into dictionary-table líneas (D-DASH-11):**

    When v2, render as `<table className="lines">` per mock lines 132-145:

    ```tsx
    <section className="space-y-3">
      <h3 className={cn(
        v2
          ? 'text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)] mb-2'
          : 'text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2'
      )}
      style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}>
        {!v2 && <PackageIcon className="h-4 w-4" />}
        {v2 ? `Líneas del pedido` : `Productos (${products.length})`}
      </h3>

      {products.length === 0 ? (
        <p className={cn(v2 ? 'text-[13px] text-[var(--ink-3)] italic' : 'text-sm text-muted-foreground')}
           style={v2 ? { fontFamily: 'var(--font-display)' } : undefined}>
          Sin productos
        </p>
      ) : v2 ? (
        <>
          <table className="w-full border-collapse" style={{ fontFamily: 'var(--font-sans)', fontSize: '13px' }}>
            <thead>
              <tr>
                <th className="text-left pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] border-b border-[var(--border)]">
                  Artículo
                </th>
                <th className="text-right pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] border-b border-[var(--border)] w-12">
                  Cant.
                </th>
                <th className="text-right pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] border-b border-[var(--border)] w-24">
                  Precio
                </th>
                <th className="text-right pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] border-b border-[var(--border)] w-28">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td className="py-2 pr-2 text-[var(--ink-1)] border-b border-[var(--border)] align-top">
                    <div>{product.title}</div>
                    {product.sku && (
                      <span className="block text-[11px] text-[var(--ink-3)] mt-0.5" style={{ fontFamily: 'var(--font-mono)' }}>
                        {product.sku}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right text-[var(--ink-2)] border-b border-[var(--border)] align-top" style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 500 }}>
                    {product.quantity}
                  </td>
                  <td className="py-2 text-right text-[var(--ink-3)] border-b border-[var(--border)] align-top" style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 500 }}>
                    {formatCurrency(product.unit_price)}
                  </td>
                  <td className="py-2 text-right text-[var(--ink-1)] border-b border-[var(--border)] align-top" style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600 }}>
                    {formatCurrency(product.subtotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Totals — grand total mx-display 18px */}
          <div className="mt-3 pt-3 border-t border-[var(--ink-1)] flex items-baseline justify-between">
            <span
              className="text-[14px] font-semibold text-[var(--ink-1)]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              Total
            </span>
            <span
              className="text-[18px] font-bold text-[var(--ink-1)] tracking-[-0.005em]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {formatCurrency(order.total_value)}
            </span>
          </div>
        </>
      ) : (
        // CURRENT products list — preserve verbatim
        <div className="space-y-2">
          {/* ...preserve verbatim... */}
        </div>
      )}
    </section>
    ```

    **Step 6 — Re-skin remaining sections (Envío, Descripción, Etiquetas, Fechas) — apply consistent h3 smallcaps treatment when v2:** wrap each `<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide ...">` with the same v2 branch as Step 5. Body content preserved (className tweaks for ink-1/ink-2/ink-3 vs muted-foreground).

    **Step 7 — Replace `<Separator />` with editorial rules when v2:** the shadcn Separator already cascades via `.theme-editorial` so visually OK; but since ALL separators in this sheet are Separator instances, optionally swap to `<div className="border-t border-[var(--border)] my-2" />` when v2 for tighter visual control. Conservative approach: leave Separator as-is (CSS-cascade handles it).

    **Step 8 — Activity timeline:** the current order-sheet does NOT render activity timeline (mock has it lines 307-318 but the existing component shows "Fechas" only). Add a NEW v2-only `<details>` activity block AFTER the Fechas section with the timeline pattern from mock — but ONLY if data is available. Available data: `order.created_at`, `order.updated_at`, `order.closing_date`. Render these 3 events in editorial timeline format. DO NOT fabricate events.

    ```tsx
    {v2 && (
      <>
        <Separator />
        <details className="space-y-3" open>
          <summary className="flex items-center cursor-pointer gap-2 list-none">
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              Actividad
            </span>
            <ChevronDownIcon className="ml-auto h-3.5 w-3.5 text-[var(--ink-3)] transition-transform group-open:rotate-180" />
          </summary>
          <div className="flex flex-col gap-2.5">
            {[
              { t: formatDateTime(order.created_at), b: 'Pedido creado' },
              ...(order.updated_at !== order.created_at ? [{ t: formatDateTime(order.updated_at), b: 'Última actualización' }] : []),
              ...(order.closing_date ? [{ t: formatDate(order.closing_date), b: 'Fecha de cierre planeada' }] : []),
            ].map((item, i) => (
              <div key={i} className="grid grid-cols-[80px_1fr] gap-2 items-baseline text-[13px]">
                <span className="text-[11px] text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
                  {item.t}
                </span>
                <span className="text-[var(--ink-2)] leading-[1.45]" style={{ fontFamily: 'var(--font-sans)' }}>
                  {item.b}
                </span>
              </div>
            ))}
          </div>
        </details>
      </>
    )}
    ```

    **DO NOT MODIFY (D-DASH-07):**
    - Server actions: `moveOrderToStage`, `getRelatedOrders`, `getOrderNotes`
    - State management (`isChangingStage`, `localTags`, `relatedOrders`, `orderNotes`, `notesLoading`)
    - useEffect hooks for tag sync, related orders fetch, notes fetch
    - `handleStageChange` callback (preserve — only its trigger UI swaps from `<Select>` to button pair)
    - `<OrderTagInput>` — use as-is, CSS-cascades
    - `<RelatedOrders>` — use as-is, CSS-cascades
    - `<OrderNotesSection>` — use as-is, CSS-cascades
    - `<OrderTrackingSection>` — use as-is
    - `<CreateTaskButton>` — use as-is
    - `formatCurrency`, `formatDate`, `formatDateTime`, `isValidTrackingUrl` helpers
    - `useRouter`, `router.refresh` calls
    - The `<Sheet>` open/onOpenChange/onClose mechanic
  </action>
  <verify>
    <automated>grep -q "useDashboardV2" 'src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx' && grep -q "Pedido · " 'src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx' && grep -q "var(--font-display)" 'src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx' && grep -q "Estado actual" 'src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx' && grep -q "Líneas del pedido" 'src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx' && grep -q "Actividad" 'src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx' && grep -q "portalContainer" 'src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx' && grep -q "moveOrderToStage" 'src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx' && grep -q "OrderTagInput\|OrderNotesSection\|RelatedOrders" 'src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx' && npx tsc --noEmit 2>&1 | grep "order-sheet" | (! grep -E "error TS")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "useDashboardV2" 'src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx'`.
    - `grep -q "Pedido · " 'src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx'` (ledger ID — U+00B7 medium dot).
    - `grep -q "var(--font-display)" 'src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx'` (h2 + grand total use display font).
    - `grep -q "var(--font-mono)" 'src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx'` (ID + qty/price/total + timeline timestamps mono).
    - `grep -q "Estado actual" 'src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx'` (stage-bar label).
    - `grep -q "Líneas del pedido" 'src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx'` (dictionary-table heading per mock).
    - `grep -q "Actividad" 'src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx'` (timeline section).
    - `grep -q "portalContainer" 'src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx'` (D-DASH-10 portal sweep).
    - `grep -q 'data-theme-scope="dashboard-editorial"' 'src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx'` (querySelector target referenced).
    - `grep -q "tracking-\[0.12em\]" 'src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx'` (smallcaps section headings).
    - `grep -q "moveOrderToStage" 'src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx'` (server action preserved — NO-TOUCH D-DASH-07).
    - `grep -q "OrderTagInput\|OrderNotesSection\|RelatedOrders" 'src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx'` (sub-components preserved).
    - `grep -q "getRelatedOrders\|getOrderNotes" 'src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx'` (data-fetching preserved).
    - `npx tsc --noEmit` reports zero errors in `order-sheet.tsx`.
    - With flag OFF, sheet DOM byte-identical to current.
  </acceptance_criteria>
  <done>OrderSheet editorial con flag ON: ledger header (mono ID + display h2 + meta) + stage-bar pill + 2 botones avance + dictionary-table líneas con grand total display + sections smallcaps + activity timeline derivada de fechas existentes + portal sweep activo. Con flag OFF byte-identical. Cero cambios a queries/mutations/sub-components. Build limpio.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 4: Re-skin orders-table.tsx + columns.tsx + view-toggle.tsx — list view dictionary-table editorial + status pills mx-tag + segmented view-toggle editorial</name>
  <files>src/app/(dashboard)/crm/pedidos/components/orders-table.tsx, src/app/(dashboard)/crm/pedidos/components/columns.tsx, src/app/(dashboard)/crm/pedidos/components/view-toggle.tsx</files>
  <read_first>
    - src/app/(dashboard)/crm/pedidos/components/orders-table.tsx (full 428 LOC — pay attention to its TopBar render, DataTable usage, dialogs)
    - src/app/(dashboard)/crm/pedidos/components/columns.tsx (full 276 LOC — focus on stage column rendering and any badge usage)
    - src/app/(dashboard)/crm/pedidos/components/view-toggle.tsx (full 47 LOC — entire file)
    - src/components/ui/data-table.tsx (verify if it accepts a `className` or `headerClassName` prop — if not, the table-level re-skin happens via `.theme-editorial` cascade only)
    - .planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/pedidos.html lines 56-62 (segment) + lines 130-145 (dictionary-table example styling)
    - CONTEXT.md D-DASH-11, D-DASH-15, D-DASH-16
  </read_first>
  <action>
    Three files. All gated by `useDashboardV2()`.

    **PART A — `view-toggle.tsx` (smallest):**

    Replace entire component to support v2 branch:
    ```tsx
    'use client'

    import * as React from 'react'
    import { LayoutGridIcon, ListIcon } from 'lucide-react'
    import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
    import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
    import { cn } from '@/lib/utils'

    export type OrderViewMode = 'kanban' | 'list'

    interface ViewToggleProps {
      value: OrderViewMode
      onChange: (value: OrderViewMode) => void
      className?: string
    }

    export function ViewToggle({ value, onChange, className }: ViewToggleProps) {
      const v2 = useDashboardV2()

      if (v2) {
        // Editorial segmented control per mock .seg pattern (lines 59-62)
        return (
          <div
            className={cn(
              'inline-flex border border-[var(--border)] rounded-[3px] overflow-hidden bg-[var(--paper-0)]',
              className
            )}
            role="group"
            aria-label="Modo de vista"
          >
            {([
              { val: 'kanban' as const, icon: LayoutGridIcon, label: 'Tablero' },
              { val: 'list' as const, icon: ListIcon, label: 'Lista' },
            ]).map((opt, i) => {
              const isOn = value === opt.val
              return (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => onChange(opt.val)}
                  aria-pressed={isOn}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] transition-colors',
                    i === 0 && 'border-r border-[var(--border)]',
                    isOn
                      ? 'bg-[var(--ink-1)] text-[var(--paper-0)] font-semibold'
                      : 'bg-transparent text-[var(--ink-3)] font-medium hover:text-[var(--ink-1)]'
                  )}
                  style={{ fontFamily: 'var(--font-sans)' }}
                >
                  <opt.icon className="h-3 w-3" />
                  {opt.label}
                </button>
              )
            })}
          </div>
        )
      }

      // CURRENT — preserve verbatim
      return (
        <ToggleGroup
          type="single"
          value={value}
          onValueChange={(newValue) => {
            if (newValue) {
              onChange(newValue as OrderViewMode)
            }
          }}
          className={cn('bg-muted p-0.5 rounded-md', className)}
        >
          <ToggleGroupItem value="kanban" aria-label="Vista Kanban" className="data-[state=on]:bg-background p-2">
            <LayoutGridIcon className="h-4 w-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label="Vista Lista" className="data-[state=on]:bg-background p-2">
            <ListIcon className="h-4 w-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      )
    }
    ```

    **PART B — `columns.tsx` — stage badge swap to mx-tag-style classes when v2:**

    Read the file first to identify the stage column cell rendering. The stage cell typically renders:
    ```tsx
    <span style={{ backgroundColor: stage.color }}>{stage.name}</span>
    ```

    Since `columns.tsx` is consumed by `<DataTable>` and createColumns is called inside `OrdersView`, the easiest approach is:
    - DO NOT change `createColumns` signature (it's consumed by both OrdersView and OrdersTable)
    - Use the `useDashboardV2` hook INSIDE the cell render function — but cell render functions are NOT React components, they're functions called by react-table. So the alternative: pass `v2` as part of the callbacks args object to `createColumns({ v2, onEdit, onDelete, onRecompra })`.

    Update `createColumns` signature:
    ```typescript
    interface CreateColumnsOptions {
      v2?: boolean
      onEdit: (order: OrderWithDetails) => void
      onDelete: (order: OrderWithDetails) => void
      onRecompra: (order: OrderWithDetails) => void
    }

    export function createColumns({ v2 = false, onEdit, onDelete, onRecompra }: CreateColumnsOptions): ColumnDef<OrderWithDetails>[] {
      // ... in stage column cell:
      cell: ({ row }) => {
        const stage = row.original.stage
        if (!stage) return null

        const stageNameLower = (stage.name || '').toLowerCase()
        const tagVariant = (() => {
          if (/cancel|rechaz/.test(stageNameLower)) return 'rubric'
          if (/atras|alert/.test(stageNameLower)) return 'rubric'
          if (/listo|complet|entreg|enviad/.test(stageNameLower)) return 'verdigris'
          if (/prepar|proces/.test(stageNameLower)) return 'gold'
          if (/nuevo|pendien/.test(stageNameLower)) return 'indigo'
          return 'ink'
        })()

        if (v2) {
          return (
            <span className={`mx-tag mx-tag--${tagVariant} inline-flex items-center gap-1.5`}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: stage.color }} />
              {stage.name}
            </span>
          )
        }

        // CURRENT — preserve verbatim
        return (
          <span /* ...current classes/style... */>{stage.name}</span>
        )
      }
    }
    ```

    Update the call site in `orders-view.tsx` Task 1 — `createColumns({ ...callbacks })` becomes `createColumns({ v2, ...callbacks })`. Re-add `v2` to the `useMemo` deps array.

    **NOTE:** if Task 1 already completed before Task 4, Task 4 must update orders-view.tsx ONE more time to pass `v2` to createColumns. Document in execution order.

    **PART C — `orders-table.tsx` — list view editorial dictionary-table:**

    `orders-table.tsx` appears to be an alternative rendering path (separate from orders-view.tsx). Verify its usage by reading the file. If it's vestigial / unused, mark as such and skip; if used, apply minimal v2 branching to its TopBar (similar to orders-view.tsx Task 1 but lighter).

    For the actual list view rendered INSIDE `orders-view.tsx` (the `<DataTable>` invocation when `viewMode === 'list'`, around line 936-943): wrap with v2-conditional className passed to DataTable. Read `src/components/ui/data-table.tsx` first to determine which props it exposes (className, headerClassName, etc).

    If DataTable accepts a `className`:
    ```tsx
    <DataTable
      columns={columns}
      data={filteredOrders}
      searchColumn="contact"
      searchValue={searchQuery}
      className={v2 ? 'mx-dictionary-table' : undefined}  // optional: define utility in globals.css if needed
    />
    ```

    If DataTable does NOT accept a className, rely on `.theme-editorial` CSS cascade (the tokens swap automatically). Apply minimal styling to the `<div className="flex-1 overflow-hidden">` wrapper around DataTable in orders-view.tsx (already updated in Task 1; ADD a `data-orders-list-v2` attr on the wrapper when v2 for selector targeting if needed).

    **For orders-table.tsx file specifically:** if it IS used (verify via grep `OrdersTable` import elsewhere — likely only imported by older route or test), apply same Task 1 treatment to its top bar at smaller scope. If unused, leave untouched and document in SUMMARY.

    Verification:
    ```bash
    grep -rn "OrdersTable" src/app/ src/components/ 2>/dev/null | grep -v "__tests__\|\.test\."
    ```

    If only its self-export is found → unused → no changes needed; document in SUMMARY.

    **DO NOT MODIFY (D-DASH-07):**
    - `<DataTable>` component itself (`src/components/ui/data-table.tsx`) — out of scope for this phase
    - The `useReactTable` wiring inside DataTable
    - Server actions in orders-table.tsx (`deleteOrder`, `recompraOrder`)
    - Filter logic, sort logic, search logic
    - The `<Sheet>`, `<AlertDialog>`, `<Select>` wirings inside orders-table.tsx — only their styling; portal sweep happens in Task 5
    - `createColumns` signature for downstream consumers — additive `v2` arg with default `false` keeps BC
  </action>
  <verify>
    <automated>grep -q "useDashboardV2" 'src/app/(dashboard)/crm/pedidos/components/view-toggle.tsx' && grep -q "var(--ink-1)" 'src/app/(dashboard)/crm/pedidos/components/view-toggle.tsx' && grep -q "Tablero\|Lista" 'src/app/(dashboard)/crm/pedidos/components/view-toggle.tsx' && grep -q "mx-tag mx-tag--" 'src/app/(dashboard)/crm/pedidos/components/columns.tsx' && grep -q "v2" 'src/app/(dashboard)/crm/pedidos/components/columns.tsx' && grep -q "ToggleGroup" 'src/app/(dashboard)/crm/pedidos/components/view-toggle.tsx' && npx tsc --noEmit 2>&1 | grep -E "view-toggle|columns|orders-table" | (! grep -E "error TS")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "useDashboardV2" 'src/app/(dashboard)/crm/pedidos/components/view-toggle.tsx'`.
    - `grep -q "Tablero" 'src/app/(dashboard)/crm/pedidos/components/view-toggle.tsx'` (per mock label, not "Vista Kanban").
    - `grep -q "var(--ink-1)" 'src/app/(dashboard)/crm/pedidos/components/view-toggle.tsx'` (active state).
    - `grep -q "ToggleGroup" 'src/app/(dashboard)/crm/pedidos/components/view-toggle.tsx'` (preserved !v2 branch — NO-TOUCH BC).
    - `grep -q "mx-tag mx-tag--" 'src/app/(dashboard)/crm/pedidos/components/columns.tsx'` (status badges via mx-tag — D-DASH-15).
    - `grep -q "rubric\|gold\|verdigris\|indigo\|ink" 'src/app/(dashboard)/crm/pedidos/components/columns.tsx'` (variant mapping present).
    - `! grep "oklch(" 'src/app/(dashboard)/crm/pedidos/components/columns.tsx'` (no NEW hardcoded colors; existing `stage.color` from data preserved).
    - `npx tsc --noEmit` reports zero errors in the three files.
    - Existing call to `createColumns({ onEdit, onDelete, onRecompra })` in `orders-view.tsx` updated to include `v2` arg.
    - With flag OFF, view-toggle DOM byte-identical (returns the original `<ToggleGroup>` block).
  </acceptance_criteria>
  <done>List view + status badges + view toggle editorial con flag ON: segmented "Tablero / Lista" mock-style + status pills mx-tag con variant mapping deterministico + DataTable cascade-styled. Con flag OFF byte-identical. Build limpio.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 5: Extend sheet.tsx with portalContainer (BC) + re-skin pipeline-tabs.tsx + portal sweep audit (kanban-board OrderForm/Bulk/Stage/AlertDialog portals)</name>
  <files>src/components/ui/sheet.tsx, src/app/(dashboard)/crm/pedidos/components/pipeline-tabs.tsx</files>
  <read_first>
    - src/components/ui/sheet.tsx (full ~140 LOC — full file — focus on `SheetContent` function and its `SheetPortal` wrapping)
    - src/components/ui/dropdown-menu.tsx — read the existing `portalContainer` extension (precedent from inbox v2 Plan 04) to mirror exact pattern
    - src/components/ui/popover.tsx — same precedent (Plan 05)
    - src/app/(dashboard)/crm/pedidos/components/pipeline-tabs.tsx (full 195 LOC — focus on tab JSX, dropdown menu inside)
    - .planning/standalone/ui-redesign-conversaciones/LEARNINGS.md sections 3.2 (Radix portal re-rooting) + 9.5 (Pitfall — DropdownMenu nested portal)
    - CONTEXT.md D-DASH-09, D-DASH-10, D-DASH-16
  </read_first>
  <action>
    Two files modified directly + portal-sweep audit verifications. All BC.

    **PART A — Extend `src/components/ui/sheet.tsx` aditively with `portalContainer?: HTMLElement | null`:**

    Mirror exact pattern from `dropdown-menu.tsx` Plan 04 of inbox v2. Modify `SheetContent`:

    ```tsx
    function SheetContent({
      className,
      children,
      side = 'right',
      portalContainer,
      ...props
    }: React.ComponentProps<typeof SheetPrimitive.Content> & {
      side?: 'top' | 'right' | 'bottom' | 'left'
      portalContainer?: HTMLElement | null
    }) {
      return (
        <SheetPortal container={portalContainer ?? undefined}>
          <SheetOverlay />
          <SheetPrimitive.Content
            data-slot="sheet-content"
            className={cn(/* ...current sheetVariants/className... */)}
            {...props}
          >
            {children}
            <SheetPrimitive.Close /* ...preserve... */ />
          </SheetPrimitive.Content>
        </SheetPortal>
      )
    }
    ```

    Update `SheetPortal` to accept `container`:
    ```tsx
    function SheetPortal({
      container,
      ...props
    }: React.ComponentProps<typeof SheetPrimitive.Portal>) {
      return <SheetPrimitive.Portal data-slot="sheet-portal" container={container} {...props} />
    }
    ```

    **Byte-identical guarantee:** `portalContainer` is opcional; when undefined/null, Radix falls back to `document.body` (current behavior). All existing consumers of `<SheetContent>` in the repo are unaffected.

    **PART B — Re-skin `pipeline-tabs.tsx`:**

    The PipelineTabs renders a bottom taskbar of pipeline tabs. Apply v2-conditional re-skin per mock-equivalent of `.seg`/`.chip` pattern + smallcaps (D-DASH-16). The exact JSX structure depends on the file content — read first.

    Pattern (apply to whatever JSX is currently rendered):

    **Step 1 — Add hook:**
    ```typescript
    import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
    // ... inside component:
    const v2 = useDashboardV2()
    ```

    **Step 2 — Re-skin the tabs container + each tab + dropdown trigger.** Each tab when v2:
    ```tsx
    <button
      type="button"
      onClick={() => onPipelineChange(p.id)}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] uppercase tracking-[0.08em] transition-colors border',
        v2
          ? isActive
            ? 'bg-[var(--paper-0)] text-[var(--ink-1)] border-[var(--ink-1)] font-semibold'
            : 'bg-transparent text-[var(--ink-3)] border-[var(--border)] font-medium hover:text-[var(--ink-1)]'
          : isActive
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground hover:bg-muted/70'
      )}
      style={v2 ? { fontFamily: 'var(--font-sans)', boxShadow: isActive ? '0 1px 0 var(--ink-1)' : undefined } : undefined}
    >
      {p.name}
      <button onClick={(e) => { e.stopPropagation(); closePipeline(p.id) }} aria-label={`Cerrar ${p.name}`}>
        <XIcon className="h-3 w-3" />
      </button>
    </button>
    ```

    Add `data-theme-scope="dashboard-editorial"` query target wherever DropdownMenuContent is used inside pipeline-tabs (the "open pipeline" dropdown):
    ```tsx
    <DropdownMenuContent
      align="start"
      portalContainer={v2 ? (typeof document !== 'undefined' ? document.querySelector<HTMLElement>('[data-theme-scope="dashboard-editorial"]') : undefined) : undefined}
    >
    ```

    **PART C — Portal sweep audit (verification step, no code change beyond what already happened):**

    After Tasks 1-4 + this Task 5 lands sheet.tsx extension, run a grep audit to confirm all in-scope portals re-root:

    ```bash
    # All Sheet, Dialog, AlertDialog, DropdownMenu, Popover, Select usages in pedidos:
    grep -rn "SheetContent\|DialogContent\|AlertDialogContent\|DropdownMenuContent\|PopoverContent\|SelectContent" src/app/\(dashboard\)/crm/pedidos/ 2>/dev/null
    ```

    For each hit, verify it has `portalContainer={v2 ? ... : undefined}` IF the consuming component is itself v2-aware. The following are documented portal-sweep targets in this plan:
    - `<SheetContent>` in order-sheet.tsx (Task 3 — added)
    - `<DropdownMenuContent>` in kanban-column.tsx (Task 2 — added)
    - `<DropdownMenuContent>` in pipeline-tabs.tsx (this Task — added above)
    - `<PopoverContent>` in orders-view.tsx tag filter (Task 1 — added)

    Documented as DEFERRED (not blockers, surface as deuda in SUMMARY because the dialogs themselves are not editorial-styled in this plan):
    - `<SheetContent>` for OrderForm sheet in orders-view.tsx line 1112 — DEFER (form internals not re-skineadas)
    - `<AlertDialogContent>` for delete/recompra/bulk-delete in orders-view.tsx — DEFER (alert dialogs not re-skineadas)
    - `<AlertDialogContent>` inside StageEditDialog/BulkMoveDialog/BulkEditDialog — DEFER (dialogs not re-skineadas)
    - `<SelectContent>` instances — Radix already re-roots to body; CSS-cascade renders OK because `.theme-editorial` is on root (UNLESS inside an unscoped portal). When body is the portal target, the global `.theme-editorial` class on dashboard layout root applies → portal content inherits. Confirm visually that Select content renders editorial.

    **Note on deferred dialogs:** when a user opens DELETE confirmation while flag ON, the dialog content renders with shadcn slate styling (NOT editorial). This is acceptable for v1 of this plan (D-DASH-08 — "preserve features minimally adapted"). Document as known visual-leak in SUMMARY + LEARNINGS for fase posterior.

    **DO NOT MODIFY:**
    - `src/components/ui/dropdown-menu.tsx` (already extended in inbox v2 Plan 04)
    - `src/components/ui/popover.tsx` (already extended in inbox v2 Plan 05)
    - `src/components/ui/dialog.tsx`, `src/components/ui/alert-dialog.tsx`, `src/components/ui/select.tsx` (out of scope this plan)
    - The `localStorage` persistence logic in pipeline-tabs.tsx
    - The `LOCAL_STORAGE_KEY` constant
    - The `onOpenPipelines` callback contract
  </action>
  <verify>
    <automated>grep -q "portalContainer" 'src/components/ui/sheet.tsx' && grep -q "container={portalContainer" 'src/components/ui/sheet.tsx' && grep -q "useDashboardV2" 'src/app/(dashboard)/crm/pedidos/components/pipeline-tabs.tsx' && grep -q "tracking-\[0.08em\]" 'src/app/(dashboard)/crm/pedidos/components/pipeline-tabs.tsx' && grep -q "var(--ink-1)" 'src/app/(dashboard)/crm/pedidos/components/pipeline-tabs.tsx' && grep -q "LOCAL_STORAGE_KEY\|localStorage" 'src/app/(dashboard)/crm/pedidos/components/pipeline-tabs.tsx' && npx tsc --noEmit 2>&1 | grep -E "sheet|pipeline-tabs" | (! grep -E "error TS")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "portalContainer" 'src/components/ui/sheet.tsx'` (prop accepted).
    - `grep -q "container={portalContainer" 'src/components/ui/sheet.tsx'` (forwarded to Radix Portal).
    - `grep -q "useDashboardV2" 'src/app/(dashboard)/crm/pedidos/components/pipeline-tabs.tsx'`.
    - `grep -q "var(--ink-1)" 'src/app/(dashboard)/crm/pedidos/components/pipeline-tabs.tsx'` (editorial colors).
    - `grep -q "tracking-\[0.08em\]" 'src/app/(dashboard)/crm/pedidos/components/pipeline-tabs.tsx'` (smallcaps tabs).
    - `grep -q "localStorage\|LOCAL_STORAGE_KEY" 'src/app/(dashboard)/crm/pedidos/components/pipeline-tabs.tsx'` (persistence preserved — NO-TOUCH).
    - `grep -q "onOpenPipelines" 'src/app/(dashboard)/crm/pedidos/components/pipeline-tabs.tsx'` (contract preserved).
    - All existing usages of `<SheetContent>` in the repo (verify with grep across `src/`) compile clean — `portalContainer` is opcional, BC.
    - `npx tsc --noEmit` reports zero errors across both files.
    - Manual: opening the order detail sheet with flag ON renders the sheet content INSIDE the dashboard scope wrapper (verifiable via DevTools — `[data-theme-scope="dashboard-editorial"]` contains `[data-slot="sheet-portal"]`).
    - With flag OFF: Sheet portal lands in document.body as before (default Radix behavior preserved).
  </acceptance_criteria>
  <done>sheet.tsx extendido con portalContainer opcional BC. pipeline-tabs.tsx editorial con tabs smallcaps rubric-2 + active state stamp. Portal sweep auditada — in-scope portals re-rootean cuando v2; out-of-scope dialogs (OrderForm, AlertDialogs, Stage/Bulk dialogs) documentadas como deuda futura. Build limpio. Sheet/Dropdown/Popover ya consumen portalContainer correctamente.</done>
</task>

</tasks>

<verification>
After all 5 tasks land:

1. **TypeScript clean:**
   ```bash
   npx tsc --noEmit 2>&1 | grep -E "pedidos|sheet\.tsx|pipeline-tabs|view-toggle|kanban-(card|column|board)|order-sheet|orders-(view|table)|columns" | (! grep -E "error TS")
   ```
   Expected: zero errors.

2. **NO-TOUCH grep guards (D-DASH-07):**
   ```bash
   grep -q "useOrderSearch\|useKanbanRealtime\|moveOrderToStage\|bulkMoveOrdersToStage\|deleteOrder\|recompraOrder\|exportOrdersToCSV\|getOrdersForStage\|getStageOrderCounts\|handleMoveResult" src/app/\(dashboard\)/crm/pedidos/**/*.tsx
   ```
   Expected: every NO-TOUCH symbol present somewhere — none deleted.

3. **mx-tag classes used (D-DASH-15):**
   ```bash
   grep -rn "mx-tag mx-tag--" src/app/\(dashboard\)/crm/pedidos/ 2>/dev/null | wc -l
   ```
   Expected: ≥ 4 (kanban-card flag pills + columns stage badges).

4. **Editorial tokens used (no slate hardcoded):**
   ```bash
   ! grep -rn "bg-muted\|text-muted-foreground\|bg-primary\|text-primary" src/app/\(dashboard\)/crm/pedidos/components/{kanban-card,kanban-column,view-toggle,pipeline-tabs}.tsx | grep -v "// preserve\|!v2" | grep -v "/\* current"
   ```
   Expected: matches only inside `!v2` branches or comments — NEVER in v2 branches.

5. **Portal sweep canonical (D-DASH-10):**
   ```bash
   grep -rn "portalContainer" src/app/\(dashboard\)/crm/pedidos/ 2>/dev/null
   ```
   Expected: ≥ 4 occurrences — order-sheet.tsx, kanban-column.tsx, pipeline-tabs.tsx, orders-view.tsx tag filter.

6. **Sheet primitive BC verified:**
   ```bash
   # All current consumers of SheetContent across the repo:
   grep -rn "SheetContent" src/ --include="*.tsx" 2>/dev/null | wc -l
   # Confirm none break — re-run tsc and visit /crm/contactos, /tareas, /agentes (any other consumer of SheetContent) with flag OFF.
   ```

7. **Manual smoke (with `ui_dashboard_v2.enabled=true` in dev DB for current workspace):**
   - Visit `/crm/pedidos`. Topbar renders eyebrow "Módulo · pedidos" + display h1 "Tablero de pedidos" + 2 botones outline/primary.
   - Toolbar: search bg paper-0 + border, stage filter Select, tag filter button, sort + view-toggle "Tablero/Lista".
   - Kanban: columnas paper-0 + border ink-1 + smallcaps headers + counter mono pill. Cards paper-1 article + serif name + mono value + late/vip/mayor flag pills cuando aplique.
   - Click card → sheet abre dentro de scope editorial: ledger header + stage chip + 2 botones avance + dictionary-table líneas + grand total display + activity timeline.
   - Stage advance buttons cambian stage del pedido (hits server action; toast aparece; kanban refresca optimistically).
   - DnD card from one column to another → still works (DnDKit preserved).
   - Drop with WIP overlimit → red border en columna + warning text.
   - Selección bulk → bar editorial paper-2 + 4 botones + Eliminar variant rubric-2.
   - Pipeline tabs (bottom): tabs smallcaps active state stamp.
   - Toggle to "Lista" view → DataTable renderea con stage badges mx-tag--*.

8. **Manual smoke (with flag OFF):**
   - Visit `/crm/pedidos`. Pixel-identical al main current (slate, shadcn Buttons, Badge, ToggleGroup).
   - All functionality intact.

9. **Sister modules unchanged (Regla 6 NO-TOUCH dashboard chrome):**
   - Visit `/crm/contactos`, `/tareas`, `/agentes` — none of those should be affected by this plan (Plans 02/04/05/06 cover those).
   - `<SheetContent>` consumers across repo (grep above) renderean OK.

10. **Git diff scope check:**
    ```bash
    git diff --stat HEAD -- src/lib/ src/hooks/ src/inngest/ src/app/actions/
    ```
    Expected: zero changes (D-DASH-07).
</verification>

<success_criteria>
- All 5 tasks pass automated verify.
- `npx tsc --noEmit` clean.
- Con flag ON, módulo Pedidos matches mock pedidos.html (eyebrow + display h1 + dictionary-table líneas + ledger sheet + flag pills + segmented toggle + smallcaps tabs).
- Con flag OFF, módulo Pedidos byte-identical al HEAD actual (verificable visualmente y via git diff DOM render).
- D-DASH-07 NO-TOUCH verificado: zero changes a domain/hooks/server-actions/Realtime/DnDKit/IntersectionObserver/handleMoveResult/optimistic-state.
- D-DASH-09 + D-DASH-10 portal sweep ejecutado para in-scope portals (Sheet, DropdownMenu, Popover); out-of-scope (OrderForm Sheet, AlertDialogs, BulkDialogs, StageDialog) documentados como deuda futura en SUMMARY.
- D-DASH-11 dictionary-table pattern aplicado en líneas del pedido (sheet) + DataTable list view (CSS-cascade).
- D-DASH-12 kanban card pattern aplicado.
- D-DASH-14 form treatments aplicados a search input + botones del topbar + bulk action botones.
- D-DASH-15 status badges via mx-tag--* mapping deterministico (rubric/gold/verdigris/indigo/ink).
- D-DASH-16 navegación interna: pipeline tabs + view-toggle + tabs editoriales con smallcaps rubric-2 underline.
- Sheet primitive aditivamente extendido con portalContainer opcional BC — todos los consumers existentes intactos.
- Commits atómicos por task (5 commits totales en este plan).
</success_criteria>

<output>
After completion, create `.planning/standalone/ui-redesign-dashboard/03-SUMMARY.md` with:

- 5 commits (uno por task) con SHAs
- LOC delta por archivo modificado
- Decisión documentada sobre KPI strip omitido (require backend metrics fuera de scope D-DASH-07)
- Listado de portal-sweep targets cubiertos vs diferidos:
  - Cubiertos: Sheet (order-sheet), DropdownMenu (kanban-column + pipeline-tabs), Popover (tag filter en orders-view)
  - Diferidos como deuda futura: OrderForm Sheet, AlertDialog (delete/recompra/bulk-delete), Stage/Bulk dialogs, OrderForm internals, OrderTagInput, OrderNotesSection, OrderTrackingSection, RelatedOrders, ContactSelector, ProductPicker — todos visualmente shadcn-slate cuando se abren con flag ON, requieren own re-skin pass en fase posterior `ui-redesign-dashboard-extras`
- Decisión documentada sobre flag derivations en kanban-card flag pills:
  - `late`: derivado de `closing_date < now AND !stage.is_closed`
  - `vip`: derivado de `tags.some(name === 'vip')` (workspace-defined tag convention)
  - `mayor`: derivado heurísticamente de `total_value > 1_000_000` COP (visual-only, no business rule)
  - `pago`: omitido (data not modeled)
- Decisión documentada sobre `Subtotal` / `Descuento` / `IVA` / `Total` rows del mock — solo `Total` renderizado en grand total porque `OrderWithDetails` no tiene subtotal/descuento/IVA breakdown (data not modeled). Documentar como deuda futura cuando se modele.
- Confirmación que `orders-table.tsx` es / no es usado en ningún route (verificable con `grep -rn "OrdersTable" src/app/`); si no usado, no se modificó
- Pixel-diff vs mock pedidos.html (link a screenshots si producidos en QA)
- Confirmación de portal-sweep funcional (DevTools — `data-theme-scope="dashboard-editorial"` contiene `data-slot="sheet-portal"` cuando v2)
- Handoff a Plan 04 (Tareas, paralelo) y Wave 2 (Plans 05/06): pedidos re-skineado; tareas paralelo; agentes/automatizaciones siguiente wave
</output>
