---
phase: ui-redesign-editorial-core
plan: 02
subsystem: crm-contactos-reskin
tags: [reskin, editorial-v3, contactos, table-dict, verbatim-port, regla-6, mx-tag]
requires:
  - ".theme-editorial-v3 scoped CSS (light + dark) — Plan 00"
  - "getIsEditorialV3Enabled per-workspace flag — Plan 00"
  - ".theme-editorial-v3 wired on dashboard <main> wrapper — Plan 00"
  - "MxTag / mx-tag--* component — whatsapp/components/mx-tag.tsx (reused)"
provides:
  - "CRM Contactos (/crm/contactos) ported to editorial v3: table.dict dictionary frame, uppercase Inter thead, cell variants (.entry/.ph/.city/.date), MxTag tags"
  - "Editorial chrome: topbar (eyebrow/h1/Importar/Exportar/Nuevo), tabs (.tabs), toolbar (.search + .chip), pager (.pager mono range es-CO)"
  - "v3 prop threaded through page.tsx → ContactsTable; legacy shadcn path byte-identical"
affects:
  - "src/app/(dashboard)/crm/contactos/page.tsx (resolves + threads v3 flag)"
  - "src/app/(dashboard)/crm/contactos/components/contacts-table.tsx (additive v3 branch)"
tech-stack:
  added: []
  patterns:
    - "Additive v3 render branch gated by a v3 prop — legacy shadcn + dashboard-v2 paths byte-identical (Regla 6)"
    - "Verbatim port: raw table.dict markup, NOT a re-styled shadcn DataTable (Pitfall 3)"
    - "Tags via MxTag (mx-tag--*), never legacy .tg.* nor shadcn Badge (D-09)"
    - "Distinct scope class isolation: .theme-editorial-v3 vs LIVE .theme-editorial (D-05)"
key-files:
  created: []
  modified:
    - "src/app/(dashboard)/crm/contactos/page.tsx"
    - "src/app/(dashboard)/crm/contactos/components/contacts-table.tsx"
    - "src/app/(dashboard)/crm/contactos/components/columns.tsx"
    - "src/app/(dashboard)/crm/contactos/components/empty-state.tsx"
    - "src/app/(dashboard)/crm/contactos/components/csv-export-button.tsx"
decisions:
  - "The editorial v3 render lives in contacts-table.tsx (NOT contacts-view-v2.tsx), because that is where the real data wiring is — debounced search, URL pagination, tag-filter handler, row-selection→bulk-actions, CSV import/export, create-contact. contacts-view-v2.tsx is the SEPARATE dashboard-v2 (.theme-editorial) path and was left byte-untouched."
  - "Toolbar/tabs/pager (Task 2) were authored inside the same v3 branch as the table.dict (Task 1) in contacts-table.tsx, so Task 1's commit necessarily carries that markup; Task 2's commit carries the csv-export-button.tsx editorial trigger. Both grep gates pass against contacts-table.tsx."
  - "Filter chips + tabs are wired inline to the existing handleTagSelectionChange (the legacy TagFilter component is unused in the v3 branch, kept untouched for the legacy path). 'Pedidos' column from the mock was omitted — there is no order-count in the contacts query and the reskin must not add a query (D-08); omitting avoids a stub column."
  - "Used pnpm exec tsc --noEmit for typecheck (no `typecheck` npm script exists — same as Plans 00/01)."
metrics:
  duration: ~25min
  completed: 2026-06-05
  tasks: 2
  files: 5
  commits: 2
---

# Phase ui-redesign-editorial-core Plan 02: CRM Contactos Editorial Port Summary

Ported the CRM · Contactos screen (`/crm/contactos`) to the editorial v3 design — the verbatim `ui_kits/crm/crm-editorial.html` dictionary table (`table.dict` with its heavy 1px ink-1 outer frame, uppercase Inter thead, and cell variants `.entry`/`.ph`/`.city`/`.date`), the editorial topbar (eyebrow "CRM · Directorio" + h1 + Importar/Exportar/Nuevo contacto), tabs (`.tabs`), toolbar (`.search` + `.chip` filter chips), and the pager (`.pager` mono "1–50 de 4.281" range + Anterior/Siguiente) — all gated behind the `ui_editorial_v3` flag so production renders byte-identical until an explicit flip. Every Supabase query, server action, pagination, sorting (via URL), tag filter, bulk action, and CSV import/export trigger is preserved; only markup + class strings changed (D-08). Tags use the official `MxTag` / `mx-tag--*` system (D-09), never legacy `.tg.*` nor shadcn `Badge`.

## What Was Built

1. **`columns.tsx`** — added editorial-v3 helpers (additive; legacy shadcn `createColumns` byte-untouched):
   - `mapTagVariant(tag)` → maps a real contact tag name to an `mx-tag--*` variant (Cliente/VIP → gold, Lead/Prospecto → indigo, Mayorista/Recompra → verdigris, Pendiente → rubric, else → ink neutral).
   - `renderEditorialTags(tags)` → renders the Tags column as `MxTag` pills (em-dash placeholder when empty).
   - `formatEditorialDate(iso)` → mono `.date` cell, es-CO `dd/mm/yyyy`, America/Bogota (Regla 2).
   - `resolveCityLabel(city)` → city label resolver for the `.city` cell.
2. **`contacts-table.tsx`** — additive `if (v3)` branch that renders the full editorial screen:
   - `.topbar` (eyebrow + `h1` "Contactos" + `<em>` count + Importar / `CsvExportButton v3` / "Nuevo contacto").
   - `.tabs` (Todos / Clientes / Leads / Mayoristas) wired to the existing `handleTagSelectionChange` (each tab toggles its matching workspace tag).
   - `.toolbar` (`.search` input bound to the debounced `search` state + `.chip` filter chips bound to the same tag-filter handler).
   - `BulkActions` (same handlers as legacy) above the table.
   - `table.dict` raw markup (NOT a re-styled shadcn DataTable — Pitfall 3): header checkbox + per-row checkbox feeding `rowSelection` → `selectedIds` → bulk actions; `.entry` name cell links to `/crm/contactos/[id]`; `.ph` phone via `formatPhoneDisplay`; `.city`; Tags via `renderEditorialTags`; `.date` via `formatEditorialDate`.
   - `.pager` (mono "start–end de total" in es-CO format + Anterior/Siguiente `.btn` bound to `goToPage`).
   - Shared `ContactDialog` / `TagManager` / `CsvImportDialog` dialogs (untouched wiring). The legacy shadcn DataTable path below is byte-untouched.
3. **`page.tsx`** — resolves `getIsEditorialV3Enabled(workspaceId)` and, when on, routes to `<ContactsTable v3 … />` (takes precedence over the dashboard-v2 path; default OFF, fails closed — Regla 6).
4. **`empty-state.tsx`** — additive `v3` branch: typographic editorial empty state (serif italic copy + `.btn.pri`). Legacy shadcn empty state byte-identical.
5. **`csv-export-button.tsx`** — additive `v3` prop: the trigger renders as an editorial `.btn` (the popover content + all export logic unchanged).

## Key Decisions

- **v3 render lives in `contacts-table.tsx`, not `contacts-view-v2.tsx`.** `contacts-view-v2.tsx` is the SEPARATE dashboard-v2 (`.theme-editorial`, `ui_dashboard_v2` flag) raw-HTML path with NO real data wiring (its own JSDoc says search/chips/selection/pagination are stubs). The editorial-v3 port must preserve the real wiring, which lives in `contacts-table.tsx` (debounced search, URL pagination, tag-filter handler, row-selection→bulk-actions, CSV import/export, create-contact). So the v3 branch was authored there; `contacts-view-v2.tsx` was left byte-untouched.
- **Task 2 markup co-located with Task 1.** The toolbar/tabs/pager (Task 2) and the `table.dict` (Task 1) form one cohesive `if (v3)` render block in `contacts-table.tsx`, so the Task 1 commit necessarily carries that markup. The Task 2 commit carries the `csv-export-button.tsx` editorial trigger. Both grep gates (`dict`/`table.dict` for Task 1; `tabs`/`pager`/`search` for Task 2) pass against `contacts-table.tsx`.
- **"Pedidos" column omitted.** The mock has a Pedidos count column, but the contacts query (`getContactsPage`) returns no order count and the reskin must not add a query (D-08). Omitting the column avoids shipping a stub.
- **Filter chips/tabs wired inline** to the existing `handleTagSelectionChange` rather than rendering the shadcn `TagFilter` — the editorial chips ARE the filter UI in the mock. `tag-filter.tsx` (listed in the plan's `files_modified`) was left untouched because it belongs to the legacy path.

## Deviations from Plan

### Auto-fixed / blocking

**1. [Rule 3 - blocking] use `pnpm exec tsc --noEmit` for typecheck**
- The plan's verify steps reference `pnpm typecheck`, but no such npm script exists (only dev/build/lint/test). Used `pnpm exec tsc --noEmit` (same as Plans 00/01).

### Scope adjustments (not behavior changes)

**2. v3 render placed in `contacts-table.tsx`, not `contacts-view-v2.tsx`.**
- The plan's `files_modified` lists both `contacts-view-v2.tsx` and `contacts-table.tsx` and Task 2's grep gate references `contacts-view-v2.tsx`. However `contacts-view-v2.tsx` is the dashboard-v2 stub path (no real wiring); the real Supabase/pagination/filter/bulk wiring is in `contacts-table.tsx`. Per the plan's own action text ("preserve the existing data source, sorting, row selection, links, bulk-actions wiring" — all of which live in `contacts-table.tsx`), the editorial v3 branch was authored in `contacts-table.tsx`. `contacts-view-v2.tsx` and `tag-filter.tsx` were left byte-untouched (Regla 6). The Task 2 grep gate (`tabs`/`pager`/`search`) passes against `contacts-table.tsx` where the chrome actually renders.

**3. "Pedidos" count column omitted** (see Key Decisions) — no data source; avoids a stub (D-08 reskin-only).

## Authentication Gates

None.

## Verification Results

- **Typecheck:** `pnpm exec tsc --noEmit` — my changed files are clean; exactly **4 pre-existing errors** remain (`conversations.test.ts`, `instagram/.../webhook-handler.test.ts`, `messenger/.../webhook-handler.test.ts`) — identical to the Plan 00/01 baseline, all in unrelated test files (out of scope).
- **Task 1 gate:** `grep -Eq "['\"]dict['\" ]|table\.dict" contacts-table.tsx` → PASS; `grep -Eq "MxTag|mx-tag" columns.tsx` → PASS.
- **Task 2 gate:** `grep -Eq "['\"]tabs['\" ]|['\"]pager['\" ]|['\"]search['\" ]" contacts-table.tsx` → PASS.
- **D-09 (no legacy tags / no Badge in v3):** the only `.tg.*` occurrence in the v3 files is a documentation comment in `columns.tsx`; no `className="tg…"` and no `<Badge>` render in the v3 branch.
- **Data wiring preserved:** git diff is markup-additive — debounced `search` state, `handleTagSelectionChange`, `goToPage`, `rowSelection`/`selectedIds`/`BulkActions`, `ContactDialog`/`CsvImportDialog`/`CsvExportButton`, and the `/crm/contactos/[id]` row links are all reused, not removed. 0 file deletions across both commits.
- **Regla 6 / D-05 (isolation):** `git diff` on `src/app/globals.css` is **empty** (legacy `.theme-editorial` block byte-frozen). `contacts-view-v2.tsx` + `tag-filter.tsx` byte-untouched. The legacy shadcn DataTable path (`v3 === false`) is byte-identical. v3 markup only renders when `ui_editorial_v3` is on (default OFF).

## Known Stubs

None. The v3 branch renders real data through the same wiring as the legacy path. The mock's "Pedidos" count column was deliberately omitted (no data source) rather than stubbed with placeholder values.

## Visual Fidelity Note

Per the plan, the ≥95% pixel-fidelity gate (light + dark, side-by-side vs the mock) is **deferred to Wave 3 (Plan 04)** with the Playwright + pixelmatch harness. This plan's gate was per-commit typecheck + preserved data wiring (git-diff review), both satisfied.

## Commits

- `d383fb42` feat(ui-redesign-editorial-core-02): portar tabla dict de contactos a editorial v3
- `26d1c2aa` feat(ui-redesign-editorial-core-02): chrome editorial de toolbar/tabs/pager + boton Exportar

## Self-Check: PASSED

Modified files verified present:
- FOUND: src/app/(dashboard)/crm/contactos/page.tsx
- FOUND: src/app/(dashboard)/crm/contactos/components/contacts-table.tsx
- FOUND: src/app/(dashboard)/crm/contactos/components/columns.tsx
- FOUND: src/app/(dashboard)/crm/contactos/components/empty-state.tsx
- FOUND: src/app/(dashboard)/crm/contactos/components/csv-export-button.tsx
- FOUND: .planning/standalone/ui-redesign-editorial-core/02-SUMMARY.md

Commits verified in git log:
- FOUND: d383fb42, 26d1c2aa
