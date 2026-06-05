---
phase: ui-redesign-editorial-core
plan: 03
type: execute
wave: 2
depends_on: [00]
files_modified:
  - src/app/(dashboard)/crm/pedidos/page.tsx
  - src/app/(dashboard)/crm/pedidos/components/orders-view.tsx
  - src/app/(dashboard)/crm/pedidos/components/orders-table.tsx
  - src/app/(dashboard)/crm/pedidos/components/columns.tsx
  - src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx
  - src/app/(dashboard)/crm/pedidos/components/kanban-column.tsx
  - src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx
  - src/app/(dashboard)/crm/pedidos/components/view-toggle.tsx
  - src/app/(dashboard)/crm/pedidos/components/pipeline-tabs.tsx
  - src/app/(dashboard)/crm/pedidos/components/order-filters.tsx
autonomous: true
requirements: [D-08, D-09]

must_haves:
  truths:
    - "With the v3 flag on, /crm/pedidos renders the editorial Kanban (hairlines between stages, NO boxes, loose cards) matching ui_kits/pedidos/pedidos-editorial.html"
    - "Empty Kanban columns show serif-italic 'Sin pedidos' (.kempty)"
    - "Kanban cards (.kcard) are loose (paper-0 + border + shadow-card), with stage dots, mono total, mx-tag pills, and a foot hairline row"
    - "The table view (table.dict) and the Tabla/Tablero view-toggle render editorial chrome"
    - "All existing data wiring (Supabase orders query, drag-to-move/stage-change server action with CAS, pipeline tabs, filters) is preserved unchanged"
    - "Tags + status use mx-tag--* (via MxTag), not legacy .tg.* and not shadcn Badge"
  artifacts:
    - path: "src/app/(dashboard)/crm/pedidos/components/kanban-column.tsx"
      provides: ".kcol hairline-separated column (flex-basis 246px, border-left, first-child no border) + .kcol-head + .kempty"
      contains: "kcol|kempty"
    - path: "src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx"
      provides: ".kcard loose card (top/prod/tags/foot anatomy) with MxTag pills"
      contains: "kcard"
    - path: "src/app/(dashboard)/crm/pedidos/components/orders-table.tsx"
      provides: "table.dict order table with status mx-tag"
      contains: "dict"
  key_links:
    - from: "src/app/(dashboard)/crm/pedidos/components/kanban-column.tsx"
      to: ".theme-editorial-v3 .kcol / .kempty in globals.css"
      via: "className 'kcol' + 'kempty' empty state"
      pattern: "kcol|kempty"
    - from: "src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx"
      to: "the stage-change server action (CAS-protected moveOrderToStage)"
      via: "preserve existing drag/move handler"
      pattern: "move|stage"
---

<objective>
Verbatim-port the CRM · Pedidos content area (table + Kanban) markup + classes onto the REAL components so it renders identical to `ui_kits/pedidos/pedidos-editorial.html` under the `.theme-editorial-v3` scope, preserving ALL existing data wiring (Supabase orders query, drag-to-move stage-change server action with CAS integrity, pipeline tabs, filters, bulk move/edit, view toggle state).

Purpose: Pedidos has the signature Kanban — stages divided by vertical HAIRLINES (not bordered boxes), loose cards, and the serif-italic "Sin pedidos" empty state. The stage-change logic is CAS-protected (crm-stage-integrity standalone) — this reskin must NOT alter that move logic, only its markup. The screen renders unchanged when the v3 flag is OFF (default).

Output: the Pedidos screen (Kanban + table) ported to editorial v3 markup, verified against the canonical mock in Wave 3.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/ui-redesign-editorial-core/UI-SPEC.md
@.planning/standalone/ui-redesign-editorial-core/RESEARCH.md

<canonical-mock>
.planning/standalone/ui-redesign-editorial-core/handoff/ui_kits/pedidos/pedidos-editorial.html  <!-- VISUAL SOURCE OF TRUTH: board hairlines, loose kcards, kempty, pipes, table.dict, vtoggle. Copy class strings 1:1 -->
.planning/standalone/ui-redesign-editorial-core/handoff/src/app/(dashboard)/crm/pedidos/  <!-- reference TSX (VISUAL only, NOT drop-in — D-08) -->
</canonical-mock>

<interfaces>
From src/app/(dashboard)/whatsapp/components/mx-tag.tsx (reuse — scope-agnostic, no CVA):

    export function MxTag({ variant, icon, children, className, ...rest }):
      variant: 'rubric'|'gold'|'indigo'|'verdigris'|'ink'
    // renders <span class="mx-tag mx-tag--{variant}">. Resolves under .theme-editorial-v3.

NOTE: a GLOBAL legacy `.kcard` rule exists at globals.css:927 (warm-cream values). Plan 00 authored a
v3-scoped `.theme-editorial-v3 .kcard` that wins via specificity inside the v3 scope. Do NOT edit the
global `.kcard` (Regla 6 — used by the live dashboard-v2 path).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Port the Kanban (board hairlines, .kcol, loose .kcard, .kempty)</name>
  <read_first>
    - .planning/standalone/ui-redesign-editorial-core/handoff/ui_kits/pedidos/pedidos-editorial.html (the `.board`, `.kcol` hairline columns, `.kcol-head`/`.dot` stage colors, loose `.kcard` anatomy `.top`/`.prod`/`.tags`/`.foot`, `.kempty` "Sin pedidos" — copy class strings VERBATIM)
    - src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx + kanban-column.tsx + kanban-card.tsx (the REAL components — preserve the drag-to-move handler, the CAS-protected stage-change server action, the empty-column logic, card-click → order sheet)
    - src/app/globals.css block authored in Plan 00 (`.theme-editorial-v3 .board/.kcol/.kcol-head/.dot/.kcard/.kempty` rules these classes resolve against; v3-scoped `.kcard` wins over the global legacy one)
    - UI-SPEC §6.3 (Pedidos per-screen contract — hairlines NOT boxes; loose cards; "Sin pedidos") + §7 (mx-tag, incl. kanban stage tags P/W → indigo, RECO → indigo, C → success/gold) + §0 golden rule (verbatim port — Pitfall 3)
    - MEMORY: crm-stage-integrity — moveOrderToStage is CAS-protected; `stage_changed_concurrently` propagates verbatim. DO NOT alter the move logic.
  </read_first>
  <action>
    Port the Kanban per UI-SPEC §6.3, verbatim. Rewire ONLY markup/className — the drag-to-move handler, the CAS-protected `moveOrderToStage` server action, optimistic update, and `stage_changed_concurrently` handling MUST remain byte-identical (D-08 + crm-stage-integrity contract).
    - `.board`: flex, horizontal scroll, thin scrollbar (reuse the global `.scrollbar-overlay` utility — already global, NOT scope-bound).
    - `.kcol`: flex-basis **246px**, separated by `border-left:1px solid var(--border)` hairlines between stages; `.kcol:first-child` has NO left border. THIS IS THE SIGNATURE — stages divided by vertical hairlines, NOT bordered boxes. Do not wrap columns in card containers.
    - `.kcol-head`: colored stage `.dot` (8px) + uppercase title `.t` (Inter 11/700/0.08em) + mono count `.c`. Dot color classes by stage: `.agend`=verdigris, `.web`=gold, `.nuevo`=ink-4, `.info`=indigo, `.conf`=gold, `.ok`=success — map these to the real pipeline stages.
    - Cards `.kcard` are LOOSE (no column container box): paper-0 + border + `--shadow-card`, hover → ink-3 border. Anatomy: `.top` (name `.nm` with `◉` `.ci` mark + mono `.val` total), `.prod` (product line with `▢` mark, ink-3), `.tags` (MxTag pills — P/W → indigo, RECO → indigo, C → success or gold per UI-SPEC §7), `.foot` (top hairline border + mono `.date` + `↻`/`○` icon marks + right-aligned `.city`). Bind every field to the real order data.
    - Empty columns show `.kempty` = serif italic "Sin pedidos" (ink-4, centered, 24px pad) — wire to the existing empty-column condition.
    Preserve card-click → order sheet, drag-and-drop, and bulk-move integration.
  </action>
  <verify>
    <automated>grep -Eq "['\"]kcol['\" ]|kcol-head" "src/app/(dashboard)/crm/pedidos/components/kanban-column.tsx" && grep -Eq "['\"]kempty['\" ]" "src/app/(dashboard)/crm/pedidos/components/kanban-column.tsx" && grep -Eq "['\"]kcard['\" ]" "src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx" && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `kanban-column.tsx` uses the `kcol` class (hairline columns) + `kcol-head` with stage `dot` — columns are NOT wrapped in bordered card boxes
    - `kanban-column.tsx` renders `kempty` serif-italic "Sin pedidos" for empty columns, wired to the existing empty condition
    - `kanban-card.tsx` uses the loose `kcard` class with `top`/`prod`/`tags`/`foot` anatomy; tags use `MxTag` / `mx-tag--*` (NOT legacy `.tg.*`, NOT Badge)
    - The drag-to-move handler + CAS-protected `moveOrderToStage` server action + `stage_changed_concurrently` handling are UNCHANGED (git diff shows markup/className edits, not logic deletions) — verify the move handler import/call still present
    - Card data is bound to real order fields (not mock placeholders)
    - `pnpm typecheck` passes
  </acceptance_criteria>
  <done>Kanban ported: hairline columns (246px, first-child no border), loose kcards with MxTag pills, "Sin pedidos" empty state; CAS move logic intact; typecheck green.</done>
</task>

<task type="auto">
  <name>Task 2: Port the table view + view-toggle + pipeline tabs + topbar</name>
  <read_first>
    - .planning/standalone/ui-redesign-editorial-core/handoff/ui_kits/pedidos/pedidos-editorial.html (the `.vtoggle` Tabla/Tablero, `table.dict` order columns, `.pipes`/`.pp` pipeline bar, tabs, topbar — copy verbatim)
    - src/app/(dashboard)/crm/pedidos/components/orders-table.tsx + columns.tsx + view-toggle.tsx + pipeline-tabs.tsx + orders-view.tsx + order-filters.tsx (REAL — preserve view-toggle state, pipeline selection, filters, sorting, row → order sheet)
    - UI-SPEC §6.3 + §7 (status cell uses mx-tag) + §8 (chrome) + §9 (copy)
  </read_first>
  <action>
    Port the table view and chrome per UI-SPEC §6.3, verbatim:
    - View toggle `.vtoggle` (Tabla / Tablero), active `.on` = ink fill — lives at the right of the toolbar; wire to the existing view-toggle state (preserve which view persists).
    - Table view `table.dict` (same dictionary table as Contactos) with columns Pedido / Cliente / Productos / Total / Estado / Fecha; `.entry` = order #; the Estado (status) cell uses MxTag (`mx-tag--*`) mapped per UI-SPEC §7 (Pendiente → rubric, Confirmado → gold, Despachado → verdigris, Entregado → indigo, Cancelado → ink). Preserve sorting, row → order sheet, bulk-edit selection.
    - Pipeline bar `.pipes` at the bottom: pipeline chips, active `.pp.on` = ink border + 600 — wire to the existing pipeline selection.
    - Tabs: Todos / Pendientes / Confirmados / Despachados / Entregados / Cancelados — wire to the existing filter/segment state.
    - Topbar: eyebrow "CRM · Pedidos", `h1` "Pedidos" + "312 este mes" count, actions Exportar / `.btn.pri` "Crear pedido" — preserve export + create-order triggers. Header band aligns to the 84.6px switcher standard (UI-SPEC §8; sidebar deferred D-06).
    Markup/className only — do not change view-toggle / pipeline / filter / sort / export / create logic.
  </action>
  <verify>
    <automated>grep -Eq "['\"]dict['\" ]|table\.dict" "src/app/(dashboard)/crm/pedidos/components/orders-table.tsx" && grep -Eq "['\"]vtoggle['\" ]" "src/app/(dashboard)/crm/pedidos/components/view-toggle.tsx" && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `orders-table.tsx` renders `table.dict` with the order columns; the Estado cell uses `MxTag` / `mx-tag--*` (NOT legacy `.tg.*`, NOT Badge)
    - `view-toggle.tsx` uses the `vtoggle` markup with `on` active state wired to the existing view state
    - `pipeline-tabs.tsx` uses `pipes` / `pp` / `pp.on` wired to the existing pipeline selection
    - Topbar preserves export + create-order triggers (no handler removed)
    - View-toggle, pipeline, filter, sort, and order-sheet wiring preserved (git diff shows markup/className edits, not logic deletions)
    - `pnpm typecheck` passes
  </acceptance_criteria>
  <done>Table view + vtoggle + pipeline bar + tabs + topbar ported to editorial chrome; status via MxTag; view/pipeline/filter/sort/export wiring intact; typecheck green.</done>
</task>

</tasks>

<verification>
- Visual fidelity vs `ui_kits/pedidos/pedidos-editorial.html` is gated in Wave 3 (Plan 04) at ≥95%, light + dark (D-10). The Kanban-hairlines, loose-cards, and "Sin pedidos" checks are in the HANDOFF §5 / UI-SPEC §11 checklist.
- Per-commit gate: `pnpm typecheck` + no removed data wiring (git diff review).
- crm-stage-integrity contract preserved: the CAS-protected `moveOrderToStage` move logic is byte-unchanged.
</verification>

<success_criteria>
- /crm/pedidos Kanban renders hairline-separated stages (no boxes), loose kcards, and serif-italic "Sin pedidos"
- Table view + view-toggle + pipeline bar in editorial chrome; status via MxTag
- All Supabase/move/pipeline/filter/sort/export wiring preserved (CAS move logic intact)
- typecheck green
</success_criteria>

<output>
After completion, create `.planning/standalone/ui-redesign-editorial-core/03-SUMMARY.md`
</output>
