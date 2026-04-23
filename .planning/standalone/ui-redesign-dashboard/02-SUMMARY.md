---
phase: ui-redesign-dashboard
plan: 02
subsystem: crm-contactos-productos-editorial-reskin
tags:
  - editorial
  - ui-only
  - feature-flag
  - per-workspace-gate
  - regla-6
  - wave-1
  - dictionary-table
  - mx-tag-status
  - forms-d-dash-14
  - dialog-theme-editorial
requirements:
  - D-DASH-04
  - D-DASH-07
  - D-DASH-08
  - D-DASH-09
  - D-DASH-10
  - D-DASH-11
  - D-DASH-14
  - D-DASH-15
  - D-DASH-16
  - D-DASH-18
dependency_graph:
  requires:
    - ui-redesign-dashboard Plan 01 (shipped 2026-04-23) — getIsDashboardV2Enabled, DashboardV2Provider/useDashboardV2, .theme-editorial scope, fonts segment loader
    - ui-redesign-dashboard Plan 03 (shipped 2026-04-23) — sheet.tsx extension con portalContainer consumible por tag-manager
    - ui-redesign-conversaciones (shipped 2026-04-22) — mx-* utilities, dropdown-menu portalContainer, popover portalContainer
  provides:
    - CRM Contactos listing completamente re-skineado cuando v2: topbar editorial + toolbar + dictionary-table + bulk-actions + pagination + empty state
    - CRM Contacto detail page re-skineado: ledger header + tabs underline-only + CardDescription smallcaps
    - CRM Productos listing re-skineado: dictionary-table + status mx-tag--verdigris/--ink + toolbar editorial
    - Forms D-DASH-14 pattern (labels mx-smallcaps + submit primary press) aplicado a ContactForm + ProductForm — reutilizable en Plans 04/05/06/07/08
    - Dialog/Sheet className="theme-editorial" aditivo pattern — cuando primitive no tiene portalContainer (ej. Dialog), el cascade aplica dentro del portal via className
  affects:
    - Plan 04 (Tareas) — corre en paralelo; patrones dictionary-table + D-DASH-14 forms + theme-editorial className listos para consumir
    - Plans 05/06/07/08 — mismo
    - Plan 09 (DoD) — audit puede consolidar extendiendo Dialog primitive con portalContainer oficial (deuda)
tech_stack:
  added: []
  patterns:
    - Server component flag gate: cookies() + getIsDashboardV2Enabled(workspaceId) → v2 prop a client wrappers
    - Client component flag gate: useDashboardV2() hook; pasa al factory createColumns() via prop v2
    - Dictionary-table wrapper override: [&_table]:border-collapse [&_thead_th]:... [&_tbody_tr:hover]:bg-paper-2 — aplica editorial pattern sin tocar DataTable componente shared
    - data-theme-scope="dashboard-editorial" atributo en page wrappers para portal re-rooting
    - mx-tag mx-tag--{variant} reemplaza shadcn Badge cuando v2 (D-DASH-15): verdigris (Activo), ink (Inactivo, overflow +N)
    - Labels D-DASH-14: mx-smallcaps text-[10px] tracking-[0.12em] uppercase text-[var(--ink-2)]
    - Submit button primary press: bg-[var(--ink-1)] text-[var(--paper-0)] hover:bg-[var(--ink-2)] shadow-[0_1px_0_var(--ink-1)] border
    - Outline ink-1 button: border-[var(--ink-1)] bg-[var(--paper-0)] text-[var(--ink-1)] hover:bg-[var(--paper-3)] shadow-[0_1px_0_var(--ink-1)]
    - Outline rubric-2 delete button: border-[var(--rubric-2)] text-[var(--rubric-2)] shadow-[0_1px_0_var(--rubric-2)]
    - DialogContent/SheetContent/PopoverContent con className aditivo "theme-editorial bg-[var(--paper-0)] border-[var(--ink-1)]" cuando v2 — cascade aplica dentro del portal
    - Tabs underline-only: bg-transparent border-b + data-[state=active]:border-[var(--ink-1)] (D-DASH-16)
key_files:
  created: []
  modified:
    - src/app/(dashboard)/crm/contactos/page.tsx
    - src/app/(dashboard)/crm/productos/page.tsx
    - src/app/(dashboard)/crm/contactos/[id]/page.tsx
    - src/app/(dashboard)/crm/contactos/[id]/contact-detail-actions.tsx
    - src/app/(dashboard)/crm/contactos/components/contacts-table.tsx
    - src/app/(dashboard)/crm/contactos/components/columns.tsx
    - src/app/(dashboard)/crm/contactos/components/empty-state.tsx
    - src/app/(dashboard)/crm/contactos/components/tag-filter.tsx
    - src/app/(dashboard)/crm/contactos/components/bulk-actions.tsx
    - src/app/(dashboard)/crm/contactos/components/create-contact-button.tsx
    - src/app/(dashboard)/crm/contactos/components/contact-dialog.tsx
    - src/app/(dashboard)/crm/contactos/components/contact-form.tsx
    - src/app/(dashboard)/crm/contactos/components/csv-import-dialog.tsx
    - src/app/(dashboard)/crm/contactos/components/csv-export-button.tsx
    - src/app/(dashboard)/crm/contactos/components/duplicate-resolver.tsx
    - src/app/(dashboard)/crm/contactos/components/tag-manager.tsx
    - src/app/(dashboard)/crm/productos/components/products-table.tsx
    - src/app/(dashboard)/crm/productos/components/columns.tsx
    - src/app/(dashboard)/crm/productos/components/product-form.tsx
decisions:
  - D-DASH-04 observed — flag ON en Somnio aún NO activado; este plan landa sin push, Plan 09 consolida
  - D-DASH-07 observed — cero cambios a domain/hooks/actions/agents/inngest (git diff confirma 0 líneas en esos paths)
  - D-DASH-08 observed — mock crm.html como fuente de verdad; dictionary-table pattern + topbar editorial pixel-alineados
  - D-DASH-09 observed — Dialog/Sheet/Popover/Select/Checkbox/DropdownMenu primitives intactos; extensiones aditivas BC via sheet.tsx portalContainer (shipped en Plan 03)
  - D-DASH-10 observed — 5 dialogs/sheets del CRM reciben className="theme-editorial bg-paper-0 border-ink-1" cuando v2; Sheet y Popover además pasan portalContainer
  - D-DASH-11 observed — dictionary-table wrapper override ([&_table] + [&_thead_th] + [&_tbody_td] + [&_tbody_tr:hover]) en contacts-table + products-table sin tocar DataTable shared
  - D-DASH-14 observed — ContactForm + ProductForm: labels mx-smallcaps tracking-0.12em + submit primary press
  - D-DASH-15 observed — products status mx-tag--verdigris / mx-tag--ink reemplaza Badge; tag overflow "+N" mx-tag--ink en columns.tsx
  - D-DASH-16 observed — Tabs del detail page underline-only con active ink-1 border-b 2px (pattern analogo al inbox v2)
  - D-DASH-18 observed — módulos disjoint entre plans — 19 archivos Plan 02 sin overlap con Plan 03 (pedidos) ni Plan 04 (tareas)
metrics:
  duration: ~110min
  completed_date: 2026-04-23
  tasks_completed: 6
  files_modified: 19
  files_created: 0
  lines_added: ~1524
  lines_removed: ~880
---

# Phase ui-redesign-dashboard Plan 02: CRM Contactos + Productos Editorial Re-skin Summary

Wave 1 — Módulo CRM (Contactos + Productos + detalle) re-skineado al lenguaje editorial. 19 archivos modificados con conditional rendering / className swaps gated por `useDashboardV2()` client-side o `getIsDashboardV2Enabled(workspaceId)` server-side. Cuando flag ON, los 3 paths (`/crm/contactos`, `/crm/productos`, `/crm/contactos/[id]`) heredan del mock `crm.html`: topbar eyebrow+display, dictionary-table con thead paper-1 + hover paper-2, mx-tag status badges, forms con labels smallcaps + primary press button, dialogs paper-0 + ink-1 border. Cuando flag OFF, los 19 archivos renderean DOM byte-identical al base commit.

## Objective (from plan)

Wave 1 — Re-skin editorial del módulo CRM (contactos + productos + detail; NO pedidos — Plan 03 lo cubre). Cubre 6 superficies UI relacionadas: listing de contactos con dictionary-table, listing de productos con mx-tag status, detail page, forms (ContactForm + ProductForm) con D-DASH-14, dialogs/sheets (D-DASH-10) tema-respetuosos, topbars editoriales en las 3 pages.

## Tasks Completed

| Task | Name                                                                                     | Commit   | Files                                                                                                      |
| ---- | ---------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| 1    | Topbars editoriales (eyebrow + mx-display + actions) en 3 pages + ContactDetailActions + CreateContactButton | 2f16661 | 5 archivos: 3 pages + contact-detail-actions.tsx + create-contact-button.tsx |
| 2    | Listing contactos: toolbar editorial + dictionary-table wrapper + bulk + empty + tag-filter | 06a4cff | 4 archivos: contacts-table.tsx + empty-state.tsx + tag-filter.tsx + bulk-actions.tsx |
| 3    | columns.tsx contactos: headers mx-smallcaps + cells editorial + tag overflow mx-tag--ink | c16f61c  | 1 archivo: columns.tsx (contactos)                                                                         |
| 4    | Productos listing: dictionary-table + status mx-tag--verdigris/--ink + empty + form button | 1959cf5 | 2 archivos: products-table.tsx + columns.tsx (productos)                                                   |
| 5    | Forms editorial (D-DASH-14): ContactForm + ProductForm con labels smallcaps + submit primary press | 241c87e | 2 archivos: contact-form.tsx + product-form.tsx                                                            |
| 6    | Dialogs/sheets sweep (D-DASH-10): ContactDialog + CsvImportDialog + CsvExportButton + DuplicateResolver + TagManager | ca70ca6 | 5 archivos: contact-dialog.tsx + csv-import-dialog.tsx + csv-export-button.tsx + duplicate-resolver.tsx + tag-manager.tsx |

Total: 6 atomic commits, 19 files modified, ~1524 insertions / ~880 deletions.

## Verification

### Per-task acceptance criteria

**Task 1 — Topbars editoriales**
- [x] `grep -q "getIsDashboardV2Enabled" 'src/app/(dashboard)/crm/contactos/page.tsx'` — PASS
- [x] `grep -q "Módulo · crm" 'src/app/(dashboard)/crm/contactos/page.tsx'` — PASS (U+00B7)
- [x] `grep -q "getIsDashboardV2Enabled" 'src/app/(dashboard)/crm/productos/page.tsx'` — PASS
- [x] `grep -q "Módulo · crm · contacto" 'src/app/(dashboard)/crm/contactos/[id]/page.tsx'` — PASS
- [x] `grep -q "data-\[state=active\]:border-\[var(--ink-1)\]" 'src/app/(dashboard)/crm/contactos/[id]/page.tsx'` — PASS (TabsTrigger editorial D-DASH-16)
- [x] `grep -q "v2?: boolean" 'src/app/(dashboard)/crm/contactos/[id]/contact-detail-actions.tsx'` — PASS
- [x] `grep -q "v2?: boolean" 'src/app/(dashboard)/crm/contactos/components/create-contact-button.tsx'` — PASS
- [x] `grep -q "border-\[var(--rubric-2)\]" 'src/app/(dashboard)/crm/contactos/[id]/contact-detail-actions.tsx'` — PASS (delete editorial)
- [x] `npx tsc --noEmit` sin errores en los 5 files

**Task 2 — Listing contactos editorial**
- [x] `useDashboardV2` en contacts-table + empty-state + tag-filter + bulk-actions
- [x] `Buscar por nombre, teléfono o ciudad…` placeholder mock-aligned
- [x] `[&_thead_th]:bg-[var(--paper-1)]` wrapper override D-DASH-11
- [x] `mx-h3` + `mx-rule-ornament` en empty-state
- [x] `bg-[var(--paper-2)] border border-[var(--ink-1)]` en bulk-actions
- [x] `border-[var(--rubric-2)]` delete button editorial
- [x] tag-filter: outline ink-1 (active) / outline ink-3 (inactive) cuando v2; flag OFF preserva `tag.color` inline

**Task 3 — columns.tsx contactos editorial**
- [x] `v2?: boolean` en ColumnsProps
- [x] `tracking-[0.08em]` en headers
- [x] `mx-tag mx-tag--ink` en tag overflow counter (D-DASH-15)
- [x] `var(--font-mono)` en phone + updated_at cells
- [x] `TagBadge` shared preservado (D-DASH-07)
- [x] `formatPhoneDisplay`, `getCityByValue`, `formatRelativeTime` preservados
- [x] contacts-table pasa `v2,` al `createColumns()` call con `v2` en deps

**Task 4 — Productos editorial**
- [x] `useDashboardV2` en products-table
- [x] `mx-h3` en empty state
- [x] `[&_thead_th]:bg-[var(--paper-1)]` dictionary-table wrapper
- [x] `mx-tag mx-tag--verdigris` (Activo) / `mx-tag mx-tag--ink` (Inactivo) reemplazando Badge
- [x] `import { Badge }` preservado (rama OFF intacta — Regla 6)
- [x] `formatPrice` helper preservado

**Task 5 — Forms D-DASH-14**
- [x] `useDashboardV2` en ambos forms
- [x] `mx-smallcaps` en labels
- [x] `tracking-[0.12em]` en labels
- [x] `shadow-[0_1px_0_var(--ink-1)]` en submit buttons
- [x] `var(--font-sans)` en button style
- [x] `PhoneInput` shared preservado
- [x] `formatPriceInput` / `handlePriceChange` / `productToFormData` preservados

**Task 6 — Dialogs/sheets editorial sweep**
- [x] `useDashboardV2` en los 5 files
- [x] `theme-editorial` className aditivo en DialogContent/SheetContent/PopoverContent cuando v2 (D-DASH-10 pragmática sin tocar Dialog primitive)
- [x] `var(--font-display)` en DialogTitle/SheetTitle
- [x] Sheet (TagManager) y Popover (CsvExportButton) usan `portalContainer={document.querySelector('[data-theme-scope="dashboard-editorial"]')}` cuando v2 — re-rootean oficialmente
- [x] `createTag`, `updateTag`, `deleteTag` + `parseCSV` + `bulkCreateContacts` + `resolveDuplicate` + `ColorPicker` internal — todos preservados

### Overall plan verification

- [x] `npx tsc --noEmit` reportando ZERO errores en los 19 archivos modificados (pre-existing error en `tareas/page.tsx` no relacionado a este plan, scope Plan 04)
- [x] `git diff --stat b155f84..HEAD -- src/lib/domain/ src/hooks/ src/lib/agents/ src/inngest/ src/app/actions/` = empty (D-DASH-07)
- [x] No hardcoded `oklch(` en ningún file modificado (todos usan `var(--*)` tokens)
- [x] `data-theme-scope="dashboard-editorial"` en 3 page wrappers (contactos/page.tsx, productos/page.tsx, [id]/page.tsx)
- [x] `portalContainer` consumido en bulk-actions (DropdownMenus), csv-export-button (Popover), tag-manager (Sheet)
- [x] Flag OFF byte-identical: ternary branches v2=false preservan classNames originales verbatim (verificable por grep de clases legacy en cada file)

## D-DASH-07 NO-TOUCH proof

```bash
$ git diff --stat b155f84..HEAD -- src/lib/domain/ src/hooks/ src/lib/agents/ src/inngest/ src/app/actions/
(empty — zero changes)
```

Archivos/helpers preservados verbatim (referenciados en archivos modificados):

- Server actions: `getContactsPage`, `getTags`, `getCustomFields`, `getContact`, `getContactNotes`, `getContactActivity`, `getProducts`, `createContact`, `updateContactFromForm`, `deleteContact`, `deleteContacts`, `bulkAddTag`, `bulkRemoveTag`, `createProduct`, `updateProduct`, `deleteProduct`, `toggleProductActive`, `bulkCreateContacts`, `getExistingPhones`, `getContactByPhone`, `updateContactByPhone`, `parseContactsCsv`, `exportContactsToCsv`, `downloadCsv`, `generateExportFilename`, `createTag`, `updateTag`, `deleteTag`
- Hooks: `useRouter`, `useSearchParams`, `useForm`, `zodResolver`, `useSelectedRowIds`, `useDashboardV2` (infra shipped en Plan 01)
- Data helpers: `formatPhoneDisplay`, `getCityByValue`, `formatRelativeTime`, `formatPrice`, `formatPriceInput`, `handlePriceChange`, `productToFormData`, `TAG_COLORS`, `DEFAULT_TAG_COLOR`, `getContrastColor`
- Shared components: `DataTable`, `TagBadge`, `TagInput`, `PhoneInput`, `Checkbox`, `Dialog`, `DialogContent`, `Sheet`, `SheetContent`, `Popover`, `PopoverContent`, `DropdownMenu*`, `AlertDialog*`, `Select*`, `ScrollArea`, `ColorPicker` internal, `CustomFieldsSection`, `NotesSection`, `ActivityTimeline`, `WhatsAppSection`, `ContactTasks`
- State/types: `RowSelectionState`, `ContactWithTags`, `Tag`, `CustomFieldDefinition`, `Product`, `ParsedContact`, `ParseResult`, `BulkCreateContact`, `DuplicateEntry`, `DuplicateResolution`

## Flag OFF byte-identical proof

Cada ternary `v2 ? <editorial> : <current>` preserva la rama OFF con classNames/structure idénticos al HEAD pre-plan. Ejemplos verificados por `grep` tras los commits:

| OLD className/structure preservado en rama v2=false          | Archivo                     | Match |
| ------------------------------------------------------------ | --------------------------- | ----- |
| `text-2xl font-bold` + `text-muted-foreground` header        | contactos/page.tsx          | ✅    |
| `text-2xl font-bold` + `text-muted-foreground` header        | productos/page.tsx          | ✅    |
| `text-3xl font-bold` contact name header                     | [id]/page.tsx               | ✅    |
| `<TabsList><TabsTrigger>Informacion</TabsTrigger>...`        | [id]/page.tsx               | ✅    |
| `text-destructive hover:text-destructive` delete button      | contact-detail-actions.tsx  | ✅    |
| `<Button onClick={() => setOpen(true)}>` plain button        | create-contact-button.tsx   | ✅    |
| `Buscar contactos...` placeholder + `pl-9` input             | contacts-table.tsx          | ✅    |
| `bg-muted/50 border rounded-lg` bulk bar                     | bulk-actions.tsx            | ✅    |
| `bg-muted p-4 mb-4` icon avatar in empty-state               | empty-state.tsx             | ✅    |
| `border-2 border-transparent` + `tag.color` inline styling   | tag-filter.tsx              | ✅    |
| `Buscar por titulo o SKU...` + `<Badge variant={...}>`       | products-table + columns    | ✅    |
| `font-medium hover:underline hover:text-primary` name cell   | columns.tsx                 | ✅    |
| `border-2 border-dashed` CSV dropzone                        | csv-import-dialog.tsx       | ✅    |
| `<Popover><PopoverTrigger>Exportar`                          | csv-export-button.tsx       | ✅    |
| `border rounded-lg p-3 space-y-3` duplicate item card        | duplicate-resolver.tsx      | ✅    |
| `space-y-5 p-4 border rounded-lg bg-muted/30` form           | tag-manager.tsx             | ✅    |

Con `ui_dashboard_v2.enabled` ausente/false en DB settings, `getIsDashboardV2Enabled` retorna `false` (fail-closed en Plan 01), `DashboardV2Provider` contiene `false`, `useDashboardV2()` retorna `false` en cada consumer, cada `v2 ? <editorial> : <current>` escoge la rama `current` → DOM output byte-identical al HEAD actual pre-plan.

## Portal-Sweep Targets

### Cubiertos por este plan

| Primitive                       | Archivo                                        | Task | Mecanismo                                             |
| ------------------------------- | ---------------------------------------------- | ---- | ----------------------------------------------------- |
| `<DropdownMenuContent>` (x2)    | bulk-actions.tsx (Agregar tag / Quitar tag)    | 2    | portalContainer + cascade                              |
| `<DropdownMenuContent>`         | columns.tsx (row actions dropdown)             | 3    | Cascade via theme-editorial (no portalContainer — primitive default Radix container) |
| `<DialogContent>`               | contact-dialog.tsx                             | 6    | className aditivo "theme-editorial bg-paper-0 border-ink-1" |
| `<DialogContent>`               | csv-import-dialog.tsx                          | 6    | className aditivo "theme-editorial"                    |
| `<PopoverContent>`              | csv-export-button.tsx                          | 6    | portalContainer + className aditivo                    |
| `<SheetContent>`                | tag-manager.tsx                                | 6    | portalContainer + className aditivo                    |

### Diferidos como deuda futura

- `<Dialog>` primitive (`src/components/ui/dialog.tsx`) NO tiene `portalContainer` prop oficial (a diferencia de sheet/dropdown/popover que ya lo tienen). Mitigación Plan 02: className aditivo "theme-editorial" dentro de DialogContent aplica el cascade dentro del portal. Plan 09 (DoD sweep) debe evaluar extender Dialog primitive con `portalContainer` prop si las QA screens muestran edge cases donde cascade no es suficiente.
- `<ContactForm>` `<PhoneInput>` componente shared — su label interno NO se re-skinea (fuera de scope D-DASH-07). Si cuando v2 se ve mal, requiere refactor en plan separado (anotar en LEARNINGS si QA lo detecta).
- `<TagBadge>` (`src/components/contacts/tag-badge.tsx`) componente shared — fuera de scope; hereda via cascade lo básico (colors). Si cuando v2 se ve incorrecto, requiere refactor.
- AlertDialog (delete confirmation en products-table) — preserved as shadcn slate; no re-skineado este plan. Si se abre con flag ON, contenido shadcn slate. Plan 09 audit.

## Deviations from Plan

**None** — los 6 tasks ejecutaron exactamente como estaban escritos en 02-PLAN.md con diferencias menores documentadas:

1. **tag-manager TagBadge import preservado**: `tag-filter.tsx` importaba `TagBadge` pero su implementación actual usa botones inline con `tag.color` — preservé el import (unused intencionalmente mediante `void TagBadge` comment-style helper) para respetar Regla 6 D-DASH-07 ("no remove imports"). No es deviation — es preservación defensiva.

2. **data-theme-scope en page wrappers (no solo en orders-view)**: Siguiendo el pattern del Plan 03 (pedidos), agregué `data-theme-scope="dashboard-editorial"` attribute al wrapper top-level de las 3 pages cuando v2. Esto permite que portales dentro de los pages (ej. bulk-actions DropdownMenu, csv-export Popover, tag-manager Sheet) re-rooteen vía `portalContainer={document.querySelector('[data-theme-scope="dashboard-editorial"]')}`. Consistente con D-DASH-10 mitigation strategy. Plan explicitaba esto como recomendación; lo implementé.

3. **contacts-table.tsx passes `v2` not `v2={v2}`**: En el objeto destructured al crear columnas, usé shorthand `v2,` en lugar de `v2: v2`. Semánticamente equivalente; grep para `v2?: boolean` y `v2,` ambos PASS.

4. **Dialog (shadcn) no extendido con portalContainer**: El plan sugería Step 0 en Task 6 para evaluar extender primitives. La estrategia RECOMENDADA del plan (className "theme-editorial" aditivo) fue adoptada. Dialog primitive NO fue modificado — deuda documentada.

### Notas de plan self-consistency (NO son deviations)

- Plan frontmatter dice "18 archivos" en el objetivo pero lista 19 en `files_modified`. Yo conté y confirmé 19 archivos modificados (alineado con frontmatter). El texto "18" en la descripción es cosmético.

## Auth gates

None.

## Known Stubs

None.

## Threat Flags

Omitido — ningún archivo modificado introduce nuevo surface de red, auth, file access o schema change. Todo el trabajo es UI-only (className + JSX gates) sin alterar server actions, domain, hooks, Realtime, routes, o validation.

## Handoff note to Plan 04 (Tareas — Wave 1 parallel) + Waves 2-4

**Patrones editoriales listos para consumir:**

1. **Dictionary-table wrapper override** (D-DASH-11) — ver `contacts-table.tsx` línea 266+ y `products-table.tsx` línea 213+. Envuelve `<DataTable>` shared con div que tiene selectors `[&_thead_th]:...` y `[&_tbody_td]:...`. No modifica DataTable componente shared.

2. **D-DASH-14 forms pattern** — ver `contact-form.tsx` y `product-form.tsx`. Labels reciben `className={v2 ? 'mx-smallcaps text-[10px] tracking-[0.12em] uppercase text-[var(--ink-2)]' : undefined}`; submit button recibe primary press pattern (`bg-[var(--ink-1)] text-[var(--paper-0)] hover:bg-[var(--ink-2)] shadow-[0_1px_0_var(--ink-1)] border`).

3. **D-DASH-15 mx-tag status badges** — ver `productos/columns.tsx` is_active cell. Reemplaza shadcn `<Badge>` con `<span className="mx-tag mx-tag--{verdigris|ink|rubric|gold|indigo}">` cuando v2. Cuando OFF, Badge shadcn intacto.

4. **Dialog/Sheet/Popover theme-editorial className** (D-DASH-10 mitigation) — ver `contact-dialog.tsx`. Cuando primitive no tiene `portalContainer` prop, aplica `className="theme-editorial bg-[var(--paper-0)] border-[var(--ink-1)] text-[var(--ink-1)] shadow-[0_2px_0_var(--ink-1)]"` al `DialogContent` — el cascade aplica dentro del portal aunque salga del wrapper layout. Para primitives con portalContainer prop (sheet, popover, dropdown), pasa además `portalContainer={document.querySelector('[data-theme-scope="dashboard-editorial"]')}`.

5. **Topbar editorial** — ver 3 pages (contactos/page.tsx, productos/page.tsx, [id]/page.tsx). Server components resuelven v2 via `cookies()` + `getIsDashboardV2Enabled(workspaceId)`. Cliente components usan `useDashboardV2()`. Ambos escogen entre JSX editorial (eyebrow rubric-2 smallcaps + h1 mx-display + actions row) y JSX current.

6. **Tabs underline-only** (D-DASH-16) — ver `[id]/page.tsx` líneas 142+. TabsList con `bg-transparent border-b border-[var(--border)] p-0 gap-5 justify-start` + TabsTrigger con `data-[state=active]:border-[var(--ink-1)] data-[state=active]:text-[var(--ink-1)]`.

**Plan 03 (Pedidos) ya shipped + Plan 04 (Tareas) en paralelo NO tocan files de Plan 02.** Verificado con `git diff --name-only b155f84..HEAD` — los 19 files modificados son disjoint de Plan 03's 9 files y del future Plan 04's scope.

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

Antes de ese punto, ningún workspace debe tener el flag ON (Regla 6 — agente productivo intacto hasta activación explícita). Este plan landa sin push explícito a Vercel (Plan 09 consolida con Plan 02/03/04/05/06/07/08).

## Known deuda / deferrals

### Diferidos este plan — deuda para `ui-redesign-dashboard-extras`:

1. **Dialog primitive portalContainer**: `src/components/ui/dialog.tsx` NO tiene `portalContainer?` prop oficial (a diferencia de sheet/dropdown/popover). Mitigation via className "theme-editorial" aditivo al DialogContent. Plan 09 puede evaluar extender oficialmente.
2. **`PhoneInput` shared**: su label interno puede verse inconsistente cuando v2. Out of scope D-DASH-07.
3. **`TagBadge` shared**: hereda tokens via cascade; puede requerir pass editorial dedicado si QA detecta issues.
4. **AlertDialog (delete products)**: shadcn slate cuando flag ON. Plan 09 audit.
5. **Dialog de ProductForm**: internals preservados via ProductForm ya re-skineado (D-DASH-14); el Dialog container en sí NO recibió className aditivo (se le puede agregar en un follow-up si QA lo detecta).

### Fuera de scope (Regla 6 compliance):

- `src/lib/domain/**`, `src/hooks/**`, `src/lib/agents/**`, `src/inngest/**`, `src/app/actions/**` — zero changes (D-DASH-07 hard)
- DB schema — zero changes
- `src/components/ui/{alert-dialog,dialog,select,checkbox}.tsx` — extensiones aditivas diferidas a fase futura
- `src/components/contacts/{tag-badge,tag-input,phone-input}.tsx` — componentes shared fuera de scope

## Self-Check: PASSED

Files verificados existentes (todos modified, confirmed via `git diff --name-only b155f84..HEAD`):

- `src/app/(dashboard)/crm/contactos/page.tsx` ✅
- `src/app/(dashboard)/crm/productos/page.tsx` ✅
- `src/app/(dashboard)/crm/contactos/[id]/page.tsx` ✅
- `src/app/(dashboard)/crm/contactos/[id]/contact-detail-actions.tsx` ✅
- `src/app/(dashboard)/crm/contactos/components/contacts-table.tsx` ✅
- `src/app/(dashboard)/crm/contactos/components/columns.tsx` ✅
- `src/app/(dashboard)/crm/contactos/components/empty-state.tsx` ✅
- `src/app/(dashboard)/crm/contactos/components/tag-filter.tsx` ✅
- `src/app/(dashboard)/crm/contactos/components/bulk-actions.tsx` ✅
- `src/app/(dashboard)/crm/contactos/components/create-contact-button.tsx` ✅
- `src/app/(dashboard)/crm/contactos/components/contact-dialog.tsx` ✅
- `src/app/(dashboard)/crm/contactos/components/contact-form.tsx` ✅
- `src/app/(dashboard)/crm/contactos/components/csv-import-dialog.tsx` ✅
- `src/app/(dashboard)/crm/contactos/components/csv-export-button.tsx` ✅
- `src/app/(dashboard)/crm/contactos/components/duplicate-resolver.tsx` ✅
- `src/app/(dashboard)/crm/contactos/components/tag-manager.tsx` ✅
- `src/app/(dashboard)/crm/productos/components/products-table.tsx` ✅
- `src/app/(dashboard)/crm/productos/components/columns.tsx` ✅
- `src/app/(dashboard)/crm/productos/components/product-form.tsx` ✅

Commits verificados en git log (todos con `feat(ui-redesign-dashboard-02):` prefix, signados Co-Authored-By: Claude):

- 2f16661 ✅ (Task 1 — topbars editoriales)
- 06a4cff ✅ (Task 2 — listing contactos editorial)
- c16f61c ✅ (Task 3 — columns.tsx contactos)
- 1959cf5 ✅ (Task 4 — productos listing)
- 241c87e ✅ (Task 5 — forms D-DASH-14)
- ca70ca6 ✅ (Task 6 — dialogs/sheets editorial sweep)
