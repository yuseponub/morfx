---
phase: ui-redesign-editorial-core
plan: 02
type: execute
wave: 2
depends_on: [00]
files_modified:
  - src/app/(dashboard)/crm/contactos/page.tsx
  - src/app/(dashboard)/crm/contactos/components/contacts-view-v2.tsx
  - src/app/(dashboard)/crm/contactos/components/contacts-table.tsx
  - src/app/(dashboard)/crm/contactos/components/columns.tsx
  - src/app/(dashboard)/crm/contactos/components/tag-filter.tsx
  - src/app/(dashboard)/crm/contactos/components/empty-state.tsx
autonomous: true
requirements: [D-08, D-09]

must_haves:
  truths:
    - "With the v3 flag on, /crm/contactos renders the editorial dictionary table (table.dict) matching ui_kits/crm/crm-editorial.html"
    - "The table has the heavy outer 1px ink-1 frame, uppercase Inter thead, and cell variants (.entry/.ph/.city/.date)"
    - "Toolbar (search + filter chips), tabs (.tabs), and pager (.pager) render editorial chrome"
    - "All existing data wiring (Supabase query, pagination, sorting, filters, server actions) is preserved unchanged"
    - "Tags in the Tags column use mx-tag--* (via MxTag), not legacy .tg.* and not shadcn Badge"
  artifacts:
    - path: "src/app/(dashboard)/crm/contactos/components/contacts-table.tsx"
      provides: "table.dict editorial table with frame, thead, cell variants"
      contains: "dict"
    - path: "src/app/(dashboard)/crm/contactos/components/columns.tsx"
      provides: "cell variant classes (.entry/.ph/.city/.date) + MxTag for the Tags column"
      contains: "mx-tag|MxTag"
  key_links:
    - from: "src/app/(dashboard)/crm/contactos/components/contacts-table.tsx"
      to: ".theme-editorial-v3 table.dict in globals.css"
      via: "className 'dict' on the <table>"
      pattern: "dict"
    - from: "src/app/(dashboard)/crm/contactos/components/columns.tsx"
      to: "MxTag mx-tag--* classes"
      via: "import MxTag for tag cells"
      pattern: "MxTag|mx-tag"
---

<objective>
Verbatim-port the CRM · Contactos content area markup + classes onto the REAL components so it renders identical to `ui_kits/crm/crm-editorial.html` under the `.theme-editorial-v3` scope, preserving ALL existing data wiring (Supabase query, pagination, sorting, tag filters, bulk actions, CSV import/export, server actions).

Purpose: Contactos is the dictionary-table screen — the heavy outer ink frame + uppercase Inter thead + cell variants are the signature. This was the screen that reached 89% in the prior CRM retrofit via verbatim port; this round adopts the new white-paper v3 tokens. The screen renders unchanged when the v3 flag is OFF (default).

Output: the Contactos screen ported to editorial v3 markup, verified against the canonical mock in Wave 3.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/ui-redesign-editorial-core/UI-SPEC.md
@.planning/standalone/ui-redesign-editorial-core/RESEARCH.md

<canonical-mock>
.planning/standalone/ui-redesign-editorial-core/handoff/ui_kits/crm/crm-editorial.html  <!-- VISUAL SOURCE OF TRUTH: table.dict + toolbar + tabs + pager. Copy class strings 1:1 -->
.planning/standalone/ui-redesign-editorial-core/handoff/src/app/(dashboard)/crm/contactos/  <!-- reference TSX (VISUAL only, NOT drop-in — D-08) -->
</canonical-mock>

<interfaces>
From src/app/(dashboard)/whatsapp/components/mx-tag.tsx (reuse — scope-agnostic, no CVA):

    export function MxTag({ variant, icon, children, className, ...rest }):
      variant: 'rubric'|'gold'|'indigo'|'verdigris'|'ink'
    // renders <span class="mx-tag mx-tag--{variant}">. Resolves under .theme-editorial-v3.
    // Import from '@/app/(dashboard)/whatsapp/components/mx-tag' (or move to a shared path if the
    // executor prefers — but do NOT re-introduce CVA / a new Badge component).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Port the dictionary table (table.dict + cell variants + MxTag tags)</name>
  <read_first>
    - .planning/standalone/ui-redesign-editorial-core/handoff/ui_kits/crm/crm-editorial.html (the `table.dict` markup: outer `1px solid --ink-1` frame, `thead th` uppercase Inter, `td` + cell variants `.entry`/`.ph`/`.city`/`.date`, Tags column — copy class strings VERBATIM)
    - src/app/(dashboard)/crm/contactos/components/contacts-table.tsx + columns.tsx (the REAL table — preserve the data source, sorting, row selection, links to /crm/contactos/[id], bulk-actions integration)
    - src/app/globals.css block authored in Plan 00 (`.theme-editorial-v3 table.dict` + `.entry`/`.ph`/`.city`/`.date` rules these classes resolve against)
    - UI-SPEC §6.2 (Contactos per-screen contract) + §7 (mx-tag) + §0 golden rule (verbatim port — Pitfall 3, do NOT restyle shadcn DataTable; replace markup with the mock's `table.dict`)
  </read_first>
  <action>
    Port the contacts table per UI-SPEC §6.2, verbatim. The mock uses a raw `<table class="dict">`, NOT a shadcn DataTable wrapper styling — replace the table markup with the mock's `table.dict` structure (Pitfall 3: re-styling the shadcn primitive instead of porting raw markup is the documented 35% failure). Rewire ONLY data — keep the existing data source (Supabase contacts query result), sorting, row selection, row links to `/crm/contactos/[id]`, and bulk-actions wiring (D-08).
    - `table.dict`: full width, `border-collapse`, `background:--paper-0`, outer `1px solid --ink-1` (heavy dictionary frame).
    - `thead th`: Inter 10px / 600 / uppercase / 0.08em / ink-3, `--paper-1` bg, `1px solid --ink-1` bottom border.
    - `td`: Inter 13px / ink-1, `1px solid --border` bottom; row hover → paper-2.
    - Cell variants bound to the real columns: `.entry` (600 weight — contact name, links to detail), `.ph` (mono 12px — phone / counts), `.city` (ink-3 400), `.date` (mono 12px ink-3).
    - Tags column: render the real contact tags via MxTag (`mx-tag--*`), NOT legacy `.tg.*`, NOT Badge (D-09). Map tag semantics to variants per UI-SPEC §7 (e.g. Cliente → gold, Lead → indigo, Mayorista → verdigris).
    Preserve row selection checkboxes feeding bulk-actions; preserve the empty-state component hookup.
  </action>
  <verify>
    <automated>grep -Eq "['\"]dict['\" ]|table\.dict" "src/app/(dashboard)/crm/contactos/components/contacts-table.tsx" && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `contacts-table.tsx` renders a `table` with the `dict` class (the editorial dictionary frame) — NOT a styled shadcn DataTable shell for this view
    - `columns.tsx` applies cell variant classes `.entry` / `.ph` / `.city` / `.date` to the matching columns
    - The Tags column uses `MxTag` / `mx-tag--*` (NOT legacy `.tg.*`, NOT `<Badge`)
    - Row links to `/crm/contactos/[id]` and row-selection → bulk-actions wiring preserved (git diff shows markup change, not logic deletion)
    - Data source remains the real Supabase contacts query (not mock placeholder rows)
    - `pnpm typecheck` passes
  </acceptance_criteria>
  <done>Dictionary table ported with frame + cell variants + MxTag tags; data/sort/selection/links intact; typecheck green.</done>
</task>

<task type="auto">
  <name>Task 2: Port the toolbar, tabs, and pager (search / chips / .tabs / .pager)</name>
  <read_first>
    - .planning/standalone/ui-redesign-editorial-core/handoff/ui_kits/crm/crm-editorial.html (the toolbar `.search` + filter chips, `.tabs` row, `.pager` mono range + Anterior/Siguiente, topbar eyebrow/h1/actions — copy verbatim)
    - src/app/(dashboard)/crm/contactos/components/contacts-view-v2.tsx + tag-filter.tsx + page.tsx (REAL — preserve search state, tab/segment state, pagination state, import/export triggers)
    - UI-SPEC §6.2 + §8 (chrome components) + §9 (copy contract)
  </read_first>
  <action>
    Port the toolbar/tabs/pager per UI-SPEC §6.2, verbatim:
    - Toolbar: search input `.search` (max 320px, 30px left pad for the search icon — preserve the existing search/debounce state) + filter chips (Todos / Con pedido / Sin actividad 30d / VIP) wired to the existing filter state in `tag-filter.tsx` / view.
    - Tabs `.tabs`: Todos / Clientes / Leads / Mayoristas / Archivados; active `.on` = ink-1 text + 2px ink bottom border — wire to the existing segment/tab state.
    - Pager `.pager`: mono "1–8 de 4.281" range + Anterior / Siguiente `.btn` — bind to the existing pagination state/handlers (Colombian number format `4.281` per §9).
    - Topbar: eyebrow "CRM · Directorio", `h1` "Contactos" + count, actions Importar / Exportar / `.btn.pri` "Nuevo contacto" — preserve the existing CSV import dialog, CSV export, and create-contact triggers.
    - Header band aligns to the 84.6px workspace-switcher standard (UI-SPEC §8 — the sidebar itself is deferred D-06, but the content-area header band keeps that vertical alignment).
    Markup/className only — do not change search/filter/pagination/import/export logic.
  </action>
  <verify>
    <automated>grep -Eq "['\"]tabs['\" ]|['\"]pager['\" ]|['\"]search['\" ]" "src/app/(dashboard)/crm/contactos/components/contacts-view-v2.tsx" && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - The toolbar uses `search` + editorial filter `chip` classes wired to the existing search/filter state
    - Tabs use `tabs` / `on` classes wired to the existing segment state
    - The pager uses `pager` + mono range wired to the existing pagination handlers (Colombian number format)
    - Topbar eyebrow/h1/actions preserve the CSV import dialog, CSV export, and create-contact triggers (no handler removed)
    - `pnpm typecheck` passes
  </acceptance_criteria>
  <done>Toolbar, tabs, pager, and topbar ported to editorial chrome; search/filter/pagination/import/export wiring intact; typecheck green.</done>
</task>

</tasks>

<verification>
- Visual fidelity vs `ui_kits/crm/crm-editorial.html` is gated in Wave 3 (Plan 04) at ≥95%, light + dark (D-10).
- Per-commit gate: `pnpm typecheck` + no removed data wiring (git diff review).
- Renders unchanged when the v3 flag is OFF (default) — markup only resolves styling under the v3 scope.
</verification>

<success_criteria>
- /crm/contactos renders the editorial dictionary table (frame + thead + cell variants) under the v3 scope
- Toolbar/tabs/pager/topbar in editorial chrome
- All Supabase/pagination/sort/filter/import/export wiring preserved
- Tags via MxTag (mx-tag--*), no legacy .tg.* or Badge
- typecheck green
</success_criteria>

<output>
After completion, create `.planning/standalone/ui-redesign-editorial-core/02-SUMMARY.md`
</output>
