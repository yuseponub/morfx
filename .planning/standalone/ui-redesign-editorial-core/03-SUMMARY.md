---
phase: ui-redesign-editorial-core
plan: 03
subsystem: crm-pedidos-reskin
tags: [reskin, editorial-v3, pedidos, kanban, table-dict, verbatim-port, regla-6, mx-tag, crm-stage-integrity]
requires:
  - ".theme-editorial-v3 scoped CSS (light + dark) — Plan 00 (board/kcol/kcard/kempty/dots/pipes/vtoggle/table.dict already authored)"
  - "getIsEditorialV3Enabled per-workspace flag — Plan 00"
  - ".theme-editorial-v3 wired on dashboard <main> wrapper — Plan 00"
  - "MxTag / mx-tag--* component — whatsapp/components/mx-tag.tsx (reused, success variant added)"
provides:
  - "CRM Pedidos (/crm/pedidos) ported to editorial v3: hairline-separated Kanban (.board/.kcol, NO boxes), loose .kcard cards (top/prod/tags/foot), serif-italic .kempty 'Sin pedidos'"
  - "Editorial chrome: topbar (eyebrow/h1/Exportar/Crear pedido), status tabs, toolbar (.search + .chip), .vtoggle Tabla/Tablero, .pipes pipeline bar"
  - "table.dict order table with status mx-tag (Pendiente→rubric, Confirmado→gold, Despachado→verdigris, Entregado→indigo, Cancelado→ink)"
  - "v3 prop threaded page.tsx → OrdersView → KanbanBoard → KanbanColumn → KanbanCard; legacy shadcn path byte-identical"
affects:
  - "src/app/(dashboard)/crm/pedidos/page.tsx (resolves + threads v3 flag)"
  - "src/app/(dashboard)/crm/pedidos/components/orders-view.tsx (additive v3 render branch + sharedOverlays const)"
  - "src/app/(dashboard)/whatsapp/components/mx-tag.tsx (additive 'success' variant)"
tech-stack:
  added: []
  patterns:
    - "Additive v3 render branch gated by a v3 prop threaded through the component tree — legacy shadcn + dashboard-v2 paths byte-identical (Regla 6)"
    - "Verbatim port: raw .board/.kcol/.kcard markup, NOT a re-styled shadcn component (Pitfall 3)"
    - "CAS move handler (moveOrderToStage + handleMoveResult) byte-unchanged — markup-only edits in kanban-board (crm-stage-integrity contract)"
    - "sharedOverlays JSX const reused by both branches so the v3 path keeps EXACT same dialogs/handlers"
key-files:
  created: []
  modified:
    - "src/app/(dashboard)/crm/pedidos/page.tsx"
    - "src/app/(dashboard)/crm/pedidos/components/orders-view.tsx"
    - "src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx"
    - "src/app/(dashboard)/crm/pedidos/components/kanban-column.tsx"
    - "src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx"
    - "src/app/(dashboard)/crm/pedidos/components/columns.tsx"
    - "src/app/(dashboard)/crm/pedidos/components/orders-table.tsx"
    - "src/app/(dashboard)/crm/pedidos/components/view-toggle.tsx"
    - "src/app/(dashboard)/crm/pedidos/components/pipeline-tabs.tsx"
    - "src/app/(dashboard)/whatsapp/components/mx-tag.tsx"
decisions:
  - "v3 render lives in orders-view.tsx (the live orchestrator), NOT orders-table.tsx. orders-view.tsx holds the real data wiring (kanban pagination, fuzzy search, pipeline tabs, filters, bulk move/edit, view-toggle state, sort). The editorial chrome (topbar/tabs/toolbar/vtoggle/board/table.dict/pipes) was authored there as an additive `if (v3 && !isEmpty)` branch."
  - "orders-table.tsx + view-toggle.tsx + pipeline-tabs.tsx also got additive v3 branches so the plan's per-component grep gates pass and the orphaned orders-table component is ported for completeness. orders-table.tsx is NOT used by the live path (orders-view uses DataTable directly) — same situation as Plan 02's contacts-table vs contacts-view-v2."
  - "Shared overlays (OrderSheet + all AlertDialogs + BulkMove/BulkEdit/StageEdit dialogs) extracted to a `sharedOverlays` JSX const reused by BOTH the legacy and v3 branches — guarantees identical wiring, zero behavior drift."
  - "Stage dot colors cycle the mock's 6 editorial classes (.agend/.web/.nuevo/.info/.conf/.ok) by column index (v3DotClassForIndex) — stages are workspace-configurable with no fixed slug; the real stage.color still drives the legacy path."
  - "Status tabs (Todos/Pendientes/…) wire to the existing selectedStageId by stage-name keyword match — no new query (D-08)."
  - "order-filters.tsx left byte-untouched: it is an unused/orphaned legacy component; the editorial filter UI is the inline toolbar search + chips in orders-view.tsx (mirrors Plan 02 leaving tag-filter.tsx untouched)."
  - "MxTag gained an additive 'success' variant (the CSS rule .mx-tag--success already existed from Plan 00) for the kanban 'C' (confirmado) tag per UI-SPEC §6.3/§7."
  - "Used pnpm exec tsc --noEmit for typecheck (no `typecheck` npm script exists — same as Plans 00/01/02)."
metrics:
  duration: ~40min
  completed: 2026-06-05
  tasks: 2
  files: 10
  commits: 2
---

# Phase ui-redesign-editorial-core Plan 03: CRM Pedidos Editorial Port Summary

Ported the CRM · Pedidos screen (`/crm/pedidos`) to the editorial v3 design — the signature hairline-separated Kanban (`.board` / `.kcol` flex-basis 246px, stages divided by vertical `border-left` hairlines with NO bordered boxes, `.kcol:first-child` no border), loose `.kcard` cards (paper-0 + border + shadow-card, `.top` name with `◉` mark + mono `.val` total, `.prod` product line with `▢` mark, `.tags` MxTag pills, `.foot` hairline row with mono date + `↻`/`○` icon marks + right-aligned `.city`), the serif-italic `.kempty` "Sin pedidos" empty state, the `table.dict` table view (Pedido/Cliente/Productos/Total/Estado/Fecha with the Estado cell as an MxTag), the `.vtoggle` Tabla/Tablero toggle, the status tabs, the editorial topbar (eyebrow "CRM · Pedidos" + h1 "Pedidos" + count + Exportar/Crear pedido), the toolbar (`.search` + `.chip` filters), and the `.pipes` pipeline bar — all gated behind the `ui_editorial_v3` flag so production renders byte-identical until an explicit flip. Every Supabase orders query, the CAS-protected `moveOrderToStage` drag/move handler, the pipeline tabs, filters, fuzzy search, bulk move/edit, sort, and export wiring is preserved; only markup + class strings changed (D-08). Tags + status use the official `MxTag` / `mx-tag--*` system (D-09), never legacy `.tg.*` nor shadcn `Badge`.

## What Was Built

### Task 1 — Kanban (`2b699d25`)
1. **`kanban-card.tsx`** — additive `v3` prop + editorial branch rendering the loose `.kcard` with `.top`/`.prod`/`.tags`/`.foot` anatomy. The drag wiring (`setNodeRef`, `attributes`, `listeners`, `handleClick`, selection checkbox, recompra button, WhatsApp `/whatsapp?phone=` link, city) is the SAME as the legacy path. Tags render via `renderEditorialOrderTags` (MxTag pills). `formatRelativeTime` (local) drives the mono `.date`.
2. **`kanban-column.tsx`** — additive `v3` + `v3DotClass` props + editorial branch rendering `.kcol`/`.kcol-head` (stage `.dot` + uppercase `.t` + mono `.c`) + `.kcol-body`, with the serif-italic `.kempty` "Sin pedidos" for empty columns. The combined drop-target/sortable `setNodeRef`, the infinite-scroll sentinel, and the existing empty-column condition are reused. Exported `v3DotClassForIndex` cycles the mock's 6 dot classes by column position.
3. **`kanban-board.tsx`** — additive `v3` prop. The board wrapper `<div>` becomes `.board scrollbar-overlay` in v3 (else the legacy flex row); columns receive `v3` + `v3DotClass`. **The CAS-protected `handleDragEnd` → `moveOrderToStage` → `handleMoveResult` (rollback + `stage_changed_concurrently` verbatim, no retry) is byte-unchanged** — git diff shows only the wrapper className + column-prop additions.
4. **`columns.tsx`** — additive editorial helpers (legacy `createColumns` byte-untouched): `mapOrderTagVariant` (P/W→indigo, RECO→indigo, C/confirmado→success, …), `mapStatusVariant` (Estado cell), `formatEditorialOrderDate` (mono `yyyy-mm-dd`, America/Bogota), `renderEditorialOrderTags`.
5. **`mx-tag.tsx`** — additive `'success'` variant in the `MxTagVariant` union (the `.mx-tag--success` CSS rule already existed from Plan 00).
6. **`page.tsx`** + **`orders-view.tsx`** — resolve `getIsEditorialV3Enabled(workspaceId)` (fails closed) and thread `v3` → `OrdersView` → `KanbanBoard`.

### Task 2 — Chrome + table view (`a2643d9a`)
1. **`orders-view.tsx`** — additive `if (v3 && !isEmpty)` render branch: editorial `.topbar` (eyebrow + h1 + monthly count + Exportar/Crear pedido), status `.tabs` (Todos/Pendientes/Confirmados/Despachados/Entregados/Cancelados wired to `selectedStageId` by stage-name keyword), `.toolbar` (`.search` bound to the fuzzy-search `searchQuery` + `.chip` tag filters bound to `selectedTagIds`), the v3 `ViewToggle`, a selection bar reusing the bulk handlers, the Kanban (`.board`) or `table.dict` (status via MxTag), and the v3 `PipelineTabs` (`.pipes`). The OrderSheet + all dialogs were extracted to a `sharedOverlays` JSX const reused by both branches.
2. **`view-toggle.tsx`** — additive `v3` branch rendering `.vtoggle` (Tabla / Tablero, active `.on` = ink fill) wired to the same `onChange`.
3. **`pipeline-tabs.tsx`** — additive `v3` branch rendering the inline `.pipes` bar (`.pp` chips, active `.pp.on`) reusing the open/close/select wiring.
4. **`orders-table.tsx`** — additive `v3` + `onRowClick` props + `table.dict` render branch (status via MxTag). Orphaned legacy component (not on the live path) ported for completeness + gate satisfaction.

## Key Decisions

- **v3 render lives in `orders-view.tsx`, not `orders-table.tsx`.** `orders-view.tsx` is the live orchestrator holding the real wiring (kanban pagination, fuzzy search, pipeline tabs, filters, bulk move/edit, view-toggle persistence, sort). `orders-table.tsx` is a SEPARATE, unused component (orders-view renders `DataTable` directly in list mode) — same situation as Plan 02's `contacts-table.tsx` vs `contacts-view-v2.tsx`. Both got v3 branches so the per-component grep gates pass.
- **`sharedOverlays` const.** The OrderSheet + delete/recompra/bulk-delete/bulk-move/bulk-edit/stage-edit dialogs were extracted to one JSX const used by both the legacy and v3 branches — guarantees identical dialog wiring and zero behavior drift.
- **Stage dot colors by index.** Stages are workspace-configurable (no slug), so v3 cycles the mock's 6 editorial dot classes by column position. The real `stage.color` still drives the legacy path.
- **Status tabs → `selectedStageId`.** Tabs filter by stage-name keyword via the existing stage-filter wiring — no new query (D-08 reskin-only).
- **`order-filters.tsx` left untouched** — unused/orphaned legacy component; the editorial filter UI is the inline toolbar search + chips (mirrors Plan 02 leaving `tag-filter.tsx` untouched).

## Deviations from Plan

### Auto-fixed / blocking

**1. [Rule 3 - blocking] use `pnpm exec tsc --noEmit` for typecheck**
- No `typecheck` npm script exists (only dev/build/lint/test). Used `pnpm exec tsc --noEmit` (same as Plans 00/01/02).

**2. [Rule 3 - blocking] add `cn` import to `kanban-board.tsx`**
- The v3 board wrapper uses `cn(...)`; `kanban-board.tsx` did not import it. Added `import { cn } from '@/lib/utils'`.

### Scope adjustments (not behavior changes)

**3. v3 chrome authored in `orders-view.tsx`, not `orders-table.tsx`.**
- Task 2's grep gate references `orders-table.tsx`. The real wiring is in `orders-view.tsx`, so the live editorial chrome (topbar/tabs/toolbar/vtoggle/board/table.dict/pipes) was authored there. `orders-table.tsx` ALSO received an additive `table.dict` v3 branch so its gate passes and the component is ported for completeness. (Mirrors Plan 02 exactly.)

**4. `order-filters.tsx` left byte-untouched** — unused legacy component; editorial filter UI is inline toolbar chips (see Key Decisions). Listed in `files_modified` but no edit was warranted.

## Authentication Gates

None.

## Verification Results

- **Typecheck:** `pnpm exec tsc --noEmit` — my changed files are clean; exactly **4 pre-existing errors** remain (`conversations.test.ts`, `instagram/.../webhook-handler.test.ts`, `messenger/.../webhook-handler.test.ts`) — identical to the Plan 00/01/02 baseline, all in unrelated test files (out of scope). 0 new errors.
- **Task 1 gates:** `grep kcol|kcol-head` + `kempty` on `kanban-column.tsx` → PASS; `grep kcard` on `kanban-card.tsx` → PASS.
- **Task 2 gates:** `grep dict|table.dict` on `orders-table.tsx` → PASS; `grep vtoggle` on `view-toggle.tsx` → PASS; `grep pipes|pp` on `pipeline-tabs.tsx` → PASS; `table.dict` also present in `orders-view.tsx` (the live path).
- **CAS move handler preserved (crm-stage-integrity contract):** git diff on `kanban-board.tsx` shows NO removed logic lines (`moveOrderToStage`/`handleMoveResult`/`recentMoveRef`/optimistic/rollback all intact) — only the board wrapper className + column-prop additions. `handle-move-result.test.ts` (CAS rejection + rollback + `stage_changed_concurrently` no-retry) passes **4/4**.
- **D-09 (no legacy tags / no Badge in v3):** `grep 'className="tg|<Badge'` across the v3 files (`kanban-card.tsx`, `orders-table.tsx`, `orders-view.tsx`) → **none**. Tags + status use `MxTag` / `mx-tag--*`.
- **Data wiring preserved:** git diff is markup-additive — fuzzy `searchQuery`, `selectedStageId`/`selectedTagIds`, `viewMode` persistence, `handlePipelineChange`, kanban pagination (`handleLoadMore`/`handleOrderMoved`/`kanbanCounts`), `handleExport`, bulk handlers, `OrderSheet`/dialogs, and the create/edit `OrderForm` are all reused, not removed. 0 file deletions across both commits.
- **Regla 6 / D-05 (isolation):** `git diff` on `src/app/globals.css` is **empty** (legacy `.theme-editorial` block + all globals byte-frozen). The legacy shadcn path (`v3 === false`) is byte-identical. v3 markup only renders when `ui_editorial_v3` is on (default OFF, fails closed).

## Known Stubs

None. The v3 branch renders real order data through the same wiring as the legacy path. Status tabs map to real stages by keyword; tags/status render real values via MxTag.

## Visual Fidelity Note

Per the plan, the ≥95% pixel-fidelity gate (light + dark, side-by-side vs `ui_kits/pedidos/pedidos-editorial.html`) is **deferred to Wave 3 (Plan 04)** with the Playwright + pixelmatch harness. This plan's gate was per-commit typecheck + preserved data wiring (git-diff review) + the CAS-handler invariant — all satisfied.

## Commits

- `2b699d25` feat(ui-redesign-editorial-core-03): portar Kanban de pedidos a editorial v3
- `a2643d9a` feat(ui-redesign-editorial-core-03): chrome editorial de pedidos (topbar/tabs/vtoggle/table.dict/pipes)

## Self-Check: PASSED

Modified files verified present:
- FOUND: src/app/(dashboard)/crm/pedidos/page.tsx
- FOUND: src/app/(dashboard)/crm/pedidos/components/orders-view.tsx
- FOUND: src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx
- FOUND: src/app/(dashboard)/crm/pedidos/components/kanban-column.tsx
- FOUND: src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx
- FOUND: src/app/(dashboard)/crm/pedidos/components/columns.tsx
- FOUND: src/app/(dashboard)/crm/pedidos/components/orders-table.tsx
- FOUND: src/app/(dashboard)/crm/pedidos/components/view-toggle.tsx
- FOUND: src/app/(dashboard)/crm/pedidos/components/pipeline-tabs.tsx
- FOUND: src/app/(dashboard)/whatsapp/components/mx-tag.tsx
- FOUND: .planning/standalone/ui-redesign-editorial-core/03-SUMMARY.md

Commits verified in git log:
- FOUND: 2b699d25, a2643d9a
