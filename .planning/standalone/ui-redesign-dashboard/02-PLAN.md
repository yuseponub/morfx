---
phase: ui-redesign-dashboard
plan: 02
type: execute
wave: 1
depends_on: ['01']
files_modified:
  # Page shells (header + spacing wrappers)
  - src/app/(dashboard)/crm/contactos/page.tsx
  - src/app/(dashboard)/crm/productos/page.tsx
  - src/app/(dashboard)/crm/contactos/[id]/page.tsx
  - src/app/(dashboard)/crm/contactos/[id]/contact-detail-actions.tsx
  # Contactos listing surface
  - src/app/(dashboard)/crm/contactos/components/contacts-table.tsx
  - src/app/(dashboard)/crm/contactos/components/columns.tsx
  - src/app/(dashboard)/crm/contactos/components/empty-state.tsx
  - src/app/(dashboard)/crm/contactos/components/tag-filter.tsx
  - src/app/(dashboard)/crm/contactos/components/bulk-actions.tsx
  - src/app/(dashboard)/crm/contactos/components/create-contact-button.tsx
  # Forms / dialogs (contactos)
  - src/app/(dashboard)/crm/contactos/components/contact-dialog.tsx
  - src/app/(dashboard)/crm/contactos/components/contact-form.tsx
  - src/app/(dashboard)/crm/contactos/components/csv-import-dialog.tsx
  - src/app/(dashboard)/crm/contactos/components/csv-export-button.tsx
  - src/app/(dashboard)/crm/contactos/components/duplicate-resolver.tsx
  - src/app/(dashboard)/crm/contactos/components/tag-manager.tsx
  # Productos surface
  - src/app/(dashboard)/crm/productos/components/products-table.tsx
  - src/app/(dashboard)/crm/productos/components/columns.tsx
  - src/app/(dashboard)/crm/productos/components/product-form.tsx
autonomous: true
requirements:
  - D-DASH-08
  - D-DASH-11
  - D-DASH-14
  - D-DASH-15
  - D-DASH-07
  - D-DASH-18
  - D-DASH-04
  - D-DASH-09
  - D-DASH-10
  - D-DASH-16

must_haves:
  truths:
    # Listing surface (Contactos)
    - "Cuando `useDashboardV2()===true`, la página `/crm/contactos` muestra topbar editorial: eyebrow `mx-smallcaps` color `var(--rubric-2)` texto `'Módulo · crm'`, h1 `mx-display` 30px serif `'Contactos'` con `<em>` sans 16px ink-3 `'— libro de clientes'`, y bloque acciones a la derecha con botones outline rubric-2 (`Importar`, `Exportar`) + primary editorial (`Nuevo contacto`)"
    - "Cuando flag OFF, header de `/crm/contactos` (h1 `text-2xl font-bold` + p ink-3 + `<CreateContactButton>`) renderea byte-identical al actual; mismo para `/crm/productos` y `/crm/contactos/[id]`"
    - "Tabla de contactos cuando v2 sigue dictionary-table pattern (D-DASH-11): wrapper `<table>` con `bg-[var(--paper-0)] border border-[var(--ink-1)]`, `<th>` `mx-smallcaps` color ink-3 + `border-b border-[var(--ink-1)]` + `bg-[var(--paper-1)]`, `<td>` font-sans 13px ink-1 + `border-b border-[var(--border)]`, hover row `bg-[var(--paper-2)]`, columna nombre `font-medium` (tipo entry del mock)"
    - "Tabla de productos cuando v2 misma dictionary-table: SKU se mantiene en `font-mono` 12px ink-2; precio alineado derecha `mx-mono` 13px ink-1; columna estado renderea `<span class=\"mx-tag mx-tag--verdigris\">Activo</span>` cuando `is_active=true` y `<span class=\"mx-tag mx-tag--ink\">Inactivo</span>` cuando false (D-DASH-15) — reemplaza shadcn `<Badge variant>`"
    - "Toolbar de listing (search + chips de tag filter) cuando v2: input search `bg-[var(--paper-0)] border border-[var(--border)] rounded-[var(--radius-3)] py-2 pl-7 pr-3 text-[13px]` con icono Search lucide left-10 ink-3; chips de TagFilter renderean como `mx-tag` editorial con borde rubric-2 cuando active (en lugar de border-2 foreground actual), inactive como outline ink-3"
    - "Bulk actions toolbar cuando v2: contenedor `bg-[var(--paper-2)] border border-[var(--ink-1)] rounded-[var(--radius-3)]` con texto smallcaps ink-1 + botones editorial (TagIcon Agregar/Quitar = outline ink-1, Eliminar = outline rubric-2) — preserva DropdownMenu primitives sin tocar handlers"
    - "Empty state de contactos cuando v2 (D-DASH-15 + UI-SPEC §9.1 análoga): `mx-h3 'No hay contactos.'` + `mx-caption 'Empieza agregando tu primer contacto para gestionar tus clientes y leads.'` + `mx-rule-ornament '· · ·'` + botón primary editorial `'Crear primer contacto'`. Empty state de productos análogo: `mx-h3 'Sin productos.'` + `mx-caption` + botón `'Nuevo Producto'`"
    # Detail surface (Contactos)
    - "Página `/crm/contactos/[id]` cuando v2 muestra header editorial: link `'← Volver a contactos'` font-mono 11px ink-3, h1 `mx-display` 30px serif con nombre, line meta `mx-mono` 11px ink-3 con fecha de creación. Detail actions (`Editar`/`Eliminar`) renderean botones editorial outline ink-1 / outline rubric-2"
    - "Cuando v2, las `<Card>` shadcn dentro del detail (info Phone/Email/Ciudad/Dirección + sections Notas/Tareas/Historial/Custom) heredan automáticamente `--card`/`--card-foreground` editorial via `.theme-editorial` cascade (paper-0 bg + ink-1 fg) sin cambiar JSX; los `<CardDescription>` con icono pasan a `mx-smallcaps` ink-3 via override className aditivo dentro del page (cuando v2). `<TabsList>` se re-skinea con underline-only style análogo al inbox v2 (active: ink-1 border-b 2px, inactive: ink-3 border-transparent)"
    - "TagInput/TagBadge dentro del detail no se modifican (componente shared `@/components/contacts/tag-badge` está fuera de scope D-DASH-07; los tags individuales heredan vía cascade — solo el contenedor wrapper de la card recibe estilo)"
    # Forms (D-DASH-14)
    - "`ContactForm` cuando v2: `<Label>` con className aditiva `'mx-smallcaps text-[10px] tracking-[0.12em] uppercase text-[var(--ink-2)]'`, `<Input>`/`<Textarea>` heredan border ink-1 + paper-0 bg via cascade (shadcn ya usa `--input`/`--background` que `.theme-editorial` mapea), submit button primary editorial press pattern (`bg-[var(--ink-1)] text-[var(--paper-0)] hover:bg-[var(--ink-2)] shadow-[0_1px_0_var(--ink-1)]`). Errores `text-destructive` siguen funcionando (cascade mapea `--destructive` a `--rubric-2`)"
    - "`ProductForm` recibe mismo treatment: labels mx-smallcaps, SKU input mantiene `font-mono` (semánticamente correcto), botón primary editorial press"
    # Dialogs / sheets (D-DASH-10)
    - "`ContactDialog` y dialog wrappers (`Dialog`/`DialogContent`) NO se modifican estructuralmente (D-DASH-09): cuando v2, el `<DialogContent>` hereda `--popover` editorial via cascade. Si Radix Portal renderea fuera del wrapper `.theme-editorial`, el dialog YA está cubierto por D-DASH-10 (Plan 01 extendió primitives Dialog/Sheet con `portalContainer` opcional, o si no, esta plan agrega override aditivo BC). Validación: visualmente paper-0 bg + ink-1 border en lugar de slate"
    - "Cuando v2, `CsvImportDialog` y `TagManager` (Sheet/Dialog grandes) heredan tema vía cascade; sus internals (steps, lists) se re-skinean con className aditivos minimal — borders pasan a `var(--border)` ink-1, headings smallcaps, action buttons editorial press pattern"
    - "`DuplicateResolver` cuando v2: cards de duplicados usan paper-2 bg + border ink-1 + ledger-row layout (entry serif + meta mono), botones de resolución editorial"
    # Universal NO-TOUCH (Regla 6 + D-DASH-07)
    - "Cero cambios funcionales: `getContactsPage`, `getProducts`, `getTags`, `getCustomFields`, `getContact`, `getContactNotes`, `getContactActivity`, `createContact`, `updateContact`, `deleteContact`, `bulkAddTag`, `bulkRemoveTag`, `createProduct`, `updateProduct`, `deleteProduct`, `toggleProductActive`, `useRouter`, `useSearchParams`, debounced search effect, RowSelectionState, TanStack columns memoization, Dialog/AlertDialog open/close handlers, toast notifications, `formatPhoneDisplay`, `getCityByValue`, `formatRelativeTime`. Verificable: git diff muestra solo className/JSX changes, NO cambios a imports de actions/lib/types"
    - "Build pasa: `npx tsc --noEmit` clean en todos los archivos modificados"
    - "Flag OFF byte-identical: con `useDashboardV2()===false`, los 18 archivos modificados renderean el DOM idéntico al base commit (Regla 6 — verificable con visual diff per-componente)"
  artifacts:
    - path: "src/app/(dashboard)/crm/contactos/page.tsx"
      provides: "Editorial topbar (eyebrow + mx-display h1 + actions row) gated by useDashboardV2()"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/crm/contactos/components/contacts-table.tsx"
      provides: "Editorial toolbar (search + chips) + dictionary-table wrapper + empty state mx-h3/mx-caption"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/crm/contactos/components/columns.tsx"
      provides: "Header cells mx-smallcaps + cell types entry/ph/city/tags + Etiquetas overflow as mx-tag--ink"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/crm/contactos/components/tag-filter.tsx"
      provides: "Chips editorial mx-tag (active rubric-2 / inactive ink-3 outline)"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/crm/contactos/components/bulk-actions.tsx"
      provides: "Toolbar editorial paper-2 + ink-1 border + action buttons editorial"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/crm/contactos/components/empty-state.tsx"
      provides: "Empty editorial: mx-h3 + mx-caption + mx-rule-ornament + primary CTA editorial"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/crm/contactos/components/contact-form.tsx"
      provides: "Editorial form: labels mx-smallcaps + submit primary press pattern (D-DASH-14)"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/crm/contactos/components/contact-dialog.tsx"
      provides: "Dialog wrapper with portalContainer opcional (D-DASH-10) cuando v2"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/crm/contactos/[id]/page.tsx"
      provides: "Editorial detail header + tabs underline + cards via cascade (NO structural change)"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/crm/contactos/[id]/contact-detail-actions.tsx"
      provides: "Botones Edit/Delete editorial outline ink-1 / outline rubric-2"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/crm/productos/components/products-table.tsx"
      provides: "Editorial toolbar + dictionary-table + empty state editorial"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/crm/productos/components/columns.tsx"
      provides: "Estado column renders mx-tag--verdigris/mx-tag--ink en lugar de Badge shadcn"
      contains: "useDashboardV2"
    - path: "src/app/(dashboard)/crm/productos/components/product-form.tsx"
      provides: "Editorial form treatment idéntico a ContactForm (labels mx-smallcaps + button primary press)"
      contains: "useDashboardV2"
  key_links:
    - from: "src/app/(dashboard)/crm/contactos/components/contacts-table.tsx"
      to: "src/components/layout/dashboard-v2-context.tsx"
      via: "useDashboardV2 hook (shipped in Plan 01)"
      pattern: "useDashboardV2()"
    - from: "src/app/(dashboard)/crm/productos/components/products-table.tsx"
      to: "src/components/layout/dashboard-v2-context.tsx"
      via: "useDashboardV2 hook"
      pattern: "useDashboardV2()"
    - from: "src/app/(dashboard)/crm/contactos/components/columns.tsx"
      to: "globals.css .mx-smallcaps + .mx-tag--ink"
      via: "className tokens del tema editorial"
      pattern: "mx-tag--ink"
    - from: "src/app/(dashboard)/crm/productos/components/columns.tsx"
      to: "globals.css .mx-tag--verdigris + .mx-tag--ink"
      via: "className tokens reemplazando shadcn Badge"
      pattern: "mx-tag--verdigris"
    - from: "src/app/(dashboard)/crm/contactos/components/contact-form.tsx"
      to: "globals.css .mx-smallcaps + var(--ink-1) + var(--paper-0)"
      via: "labels + button primary press pattern"
      pattern: "shadow-\\[0_1px_0_var\\(--ink-1\\)\\]"
---

<objective>
Wave 1 — Re-skin editorial del módulo CRM (contactos + productos + detail; **NO pedidos** — Plan 03 lo cubre). Cubre 6 superficies UI relacionadas: (1) listing principal de contactos con dictionary-table pattern, (2) listing de productos con mx-tag status, (3) detail page de un contacto, (4) forms (ContactForm + ProductForm) con D-DASH-14, (5) dialogs/sheets (D-DASH-10) con tema-respetuosos, (6) topbars editoriales (eyebrow + mx-display) en las 3 pages. Todo gated por `useDashboardV2()` (NEW JSX) o por CSS cascade (className-only swaps via `.theme-editorial`).

**Purpose:** El CRM es el segundo módulo editorial post-inbox v2. Una vez Plan 02 cierra, los workspaces con flag ON ven `/crm/contactos`, `/crm/productos` y `/crm/contactos/[id]` con paper/ink/serif coherente con el resto del producto editorial (inbox + landing). Pedidos (Plan 03) y los demás módulos llegan después; mientras tanto, el usuario en flag ON ve estos 3 paths editoriales y los demás slate (estado transitorio aceptable hasta cierre de Wave 4 — D-DASH-02).

**Output:** 18 archivos modificados con conditional rendering / className swaps gated por `useDashboardV2()`. Topbars editoriales en las 3 pages, dictionary-tables en contactos y productos, mx-tag badges para estado de productos y overflow de tags, forms con labels smallcaps + primary press button, detail page con header serif + tabs underline + cards via cascade, dialogs/sheets que heredan tema o reciben `portalContainer` aditivo. Cuando flag OFF, los 18 archivos renderean DOM byte-identical al base commit (Regla 6).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/ui-redesign-dashboard/CONTEXT.md
@.planning/standalone/ui-redesign-dashboard/PLAN.md

# Mock fuente de verdad pixel-perfect (D-DASH-08):
@.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/crm.html
@.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/colors_and_type.css

# Patron de referencia (módulo plan ya shipped):
@.planning/standalone/ui-redesign-conversaciones/02-PLAN.md

# Source files in scope (18 archivos):
@src/app/(dashboard)/crm/contactos/page.tsx
@src/app/(dashboard)/crm/productos/page.tsx
@src/app/(dashboard)/crm/contactos/[id]/page.tsx
@src/app/(dashboard)/crm/contactos/[id]/contact-detail-actions.tsx
@src/app/(dashboard)/crm/contactos/components/contacts-table.tsx
@src/app/(dashboard)/crm/contactos/components/columns.tsx
@src/app/(dashboard)/crm/contactos/components/empty-state.tsx
@src/app/(dashboard)/crm/contactos/components/tag-filter.tsx
@src/app/(dashboard)/crm/contactos/components/bulk-actions.tsx
@src/app/(dashboard)/crm/contactos/components/create-contact-button.tsx
@src/app/(dashboard)/crm/contactos/components/contact-dialog.tsx
@src/app/(dashboard)/crm/contactos/components/contact-form.tsx
@src/app/(dashboard)/crm/contactos/components/csv-import-dialog.tsx
@src/app/(dashboard)/crm/contactos/components/csv-export-button.tsx
@src/app/(dashboard)/crm/contactos/components/duplicate-resolver.tsx
@src/app/(dashboard)/crm/contactos/components/tag-manager.tsx
@src/app/(dashboard)/crm/productos/components/products-table.tsx
@src/app/(dashboard)/crm/productos/components/columns.tsx
@src/app/(dashboard)/crm/productos/components/product-form.tsx

# Wave 0 outputs (already shipped — Plan 01):
@src/components/layout/dashboard-v2-context.tsx
@src/lib/auth/dashboard-v2.ts

<interfaces>
<!-- From Plan 01 (Wave 0) — already shipped: -->

useDashboardV2 hook:
```typescript
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
const v2 = useDashboardV2()  // boolean, default false outside provider
```

`.theme-editorial` CSS scope (already in globals.css from ui-redesign-conversaciones Plan 01) provides:
- `mx-smallcaps`, `mx-display`, `mx-h3`, `mx-h4`, `mx-caption`, `mx-mono`, `mx-rule`, `mx-rule-ornament` utilities
- `mx-tag mx-tag--{rubric|gold|indigo|verdigris|ink}` utilities
- All shadcn token overrides (--background → paper-1, --primary → ink-1, --card → paper-0, --popover → paper-0, --destructive → rubric-2, --border → ink-3 derivative, --input → ink-1, --ring → ink-1, etc.)

Editorial color tokens (from globals.css `.theme-editorial` block lines 134–171):
- `var(--paper-0)` = warm white (cards, inputs, selected rows)
- `var(--paper-1)` = page background
- `var(--paper-2)` = subtle elevated surface (table th bg, hover row, bulk-actions toolbar)
- `var(--paper-3)` = strongest paper (avatar bg)
- `var(--ink-1)` = primary text/border (foreground)
- `var(--ink-2)` = secondary text
- `var(--ink-3)` = tertiary text / muted
- `var(--rubric-2)` = brand accent red (eyebrow, primary CTA, destructive, active rail)
- `var(--border)` = subtle border (rule below cells)
- `var(--radius-3)` = standard editorial radius (~3-4px)
- `var(--font-display)` = EB Garamond (serif headlines)
- `var(--font-sans)` = Inter (body + labels)
- `var(--font-mono)` = JetBrains Mono (timestamps, ph, SKU, prices)

Existing key data shapes (preserve unchanged — D-DASH-07):

```typescript
// ContactsTableProps (already in contacts-table.tsx)
interface ContactsTableProps {
  contacts: ContactWithTags[]
  tags: Tag[]
  customFields: CustomFieldDefinition[]
  total: number
  page: number
  pageSize: number
  currentSearch: string
  currentTagIds: string[]
}

// createColumns signature (columns.tsx)
interface ColumnsProps {
  onEdit: (contact: ContactWithTags) => void
  onDelete: (contact: ContactWithTags) => void
  onViewDetail: (contact: ContactWithTags) => void
}

// ContactForm props
interface ContactFormProps {
  mode: 'create' | 'edit'
  defaultValues?: ContactFormData
  contactId?: string
  onSuccess?: (contactId?: string) => void
}

// ProductsTable / ProductForm consume `Product` from '@/lib/orders/types' — DO NOT modify
```

CRM mock dictionary-table classes (D-DASH-08, see crm.html lines 51–63):
```css
table.dict { width: 100%; border-collapse: collapse; background: var(--paper-0); border: 1px solid var(--ink-1); }
table.dict thead th { padding: 10px 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; font-size: 10px; color: var(--ink-3); border-bottom: 1px solid var(--ink-1); background: var(--paper-1); }
table.dict td { padding: 11px 12px; border-bottom: 1px solid var(--border); font-size: 13px; color: var(--ink-1); }
table.dict tbody tr:hover { background: var(--paper-2); }
table.dict td.entry { font-weight: 600; }
table.dict td.ph { font-family: var(--font-mono); font-size: 12px; color: var(--ink-2); font-weight: 500; }
table.dict td.city { color: var(--ink-3); font-weight: 400; }
```

CRM mock topbar block (crm.html lines 109–119):
```html
<div class="topbar">
  <div>
    <div class="eye">Módulo · crm</div>
    <h1>Contactos <em>— libro de clientes</em></h1>
  </div>
  <div class="actions">
    <button class="btn"><i data-lucide="upload"></i>Importar</button>
    <button class="btn"><i data-lucide="download"></i>Exportar</button>
    <button class="btn pri"><i data-lucide="plus"></i>Crear contacto</button>
  </div>
</div>
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Editorial topbars en las 3 pages CRM (contactos + productos + detail) — eyebrow + mx-display h1 + actions row</name>
  <files>src/app/(dashboard)/crm/contactos/page.tsx, src/app/(dashboard)/crm/productos/page.tsx, src/app/(dashboard)/crm/contactos/[id]/page.tsx, src/app/(dashboard)/crm/contactos/[id]/contact-detail-actions.tsx, src/app/(dashboard)/crm/contactos/components/create-contact-button.tsx</files>
  <read_first>
    - src/app/(dashboard)/crm/contactos/page.tsx (full 49 LOC — header h1+p+CreateContactButton at lines 27–35)
    - src/app/(dashboard)/crm/productos/page.tsx (full 19 LOC — header h1+p at lines 9–14)
    - src/app/(dashboard)/crm/contactos/[id]/page.tsx (full 290 LOC — pay attention to back link lines 69–75, header lines 79–93, TabsList lines 96–103)
    - src/app/(dashboard)/crm/contactos/[id]/contact-detail-actions.tsx (full 72 LOC)
    - src/app/(dashboard)/crm/contactos/components/create-contact-button.tsx (full 28 LOC)
    - .planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/crm.html lines 25–35 (`.topbar`, `.eye`, `h1`, `h1 em`) y lines 109–119 (markup topbar)
    - .planning/standalone/ui-redesign-conversaciones/02-PLAN.md (referencia del patrón eyebrow + display h1)
  </read_first>
  <action>
    Re-skinear los 3 page headers + el ContactDetailActions + el CreateContactButton para que cuando `useDashboardV2()===true` rendereen la topbar editorial del mock crm.html (eyebrow rubric-2 smallcaps + h1 mx-display + acciones a la derecha con botones outline ink-1 / primary editorial).

    **CRITICAL — files que son Server Components:** `crm/contactos/page.tsx`, `crm/productos/page.tsx` y `crm/contactos/[id]/page.tsx` son Server Components (NO `'use client'`). NO se puede usar `useDashboardV2()` hook directamente ahí. **Solución:** llamar `getIsDashboardV2Enabled(workspaceId)` server-side (helper de Plan 01) leyendo `workspaceId` del cookie `morfx_workspace` (mismo pattern que `[id]/page.tsx` ya usa lines 47–48), y pasar el bool resultante como prop a un nuevo client wrapper o conditional render server-side. Ver `src/app/(dashboard)/whatsapp/page.tsx` como referencia (gate via getIsInboxV2Enabled).

    **Step 1 — `crm/contactos/page.tsx`:**

    Importa `cookies` de `next/headers` y `getIsDashboardV2Enabled` desde `@/lib/auth/dashboard-v2`. Resuelve el flag server-side:

    ```typescript
    import { cookies } from 'next/headers'
    import { getIsDashboardV2Enabled } from '@/lib/auth/dashboard-v2'
    // ... dentro del async componente:
    const cookieStore = await cookies()
    const workspaceId = cookieStore.get('morfx_workspace')?.value
    const v2 = workspaceId ? await getIsDashboardV2Enabled(workspaceId) : false
    ```

    Reemplaza el JSX header (lines 27–35) por un conditional:

    ```tsx
    {v2 ? (
      <div
        className="px-7 pt-5 pb-4 -mx-6 -mt-6 mb-2 border-b border-[var(--ink-1)] bg-[var(--paper-1)] flex items-end justify-between"
      >
        <div>
          <span
            className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--rubric-2)]"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            Módulo · crm
          </span>
          <h1
            className="mt-0.5 mb-0 text-[30px] leading-[1.1] font-bold tracking-[-0.015em] text-[var(--ink-1)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Contactos
            <em
              className="ml-2 text-[16px] font-normal not-italic text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              — libro de clientes
            </em>
          </h1>
        </div>
        <CreateContactButton v2 />
      </div>
    ) : (
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contactos</h1>
          <p className="text-muted-foreground">
            Gestiona tus contactos, clientes y leads
          </p>
        </div>
        <CreateContactButton />
      </div>
    )}
    ```

    Nota: el `-mx-6 -mt-6` es necesario solo si el layout `(dashboard)/layout.tsx` aplica `p-6` al main; si el padding viene de otro lugar, omitirlo (verificar leyendo el layout). Si el padding es del page wrapper `<div className="space-y-6">`, sustituir por wrapper condicional `<div className={v2 ? '' : 'space-y-6'}>` y aplicar el padding del topbar adentro.

    **Step 2 — `crm/productos/page.tsx`:** mismo pattern. Reemplaza header lines 9–14:

    ```tsx
    {v2 ? (
      <div className="px-7 pt-5 pb-4 -mx-6 -mt-6 mb-2 border-b border-[var(--ink-1)] bg-[var(--paper-1)] flex items-end justify-between">
        <div>
          <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--rubric-2)]" style={{ fontFamily: 'var(--font-sans)' }}>
            Módulo · crm
          </span>
          <h1 className="mt-0.5 mb-0 text-[30px] leading-[1.1] font-bold tracking-[-0.015em] text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>
            Productos
            <em className="ml-2 text-[16px] font-normal not-italic text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-sans)' }}>
              — catálogo
            </em>
          </h1>
        </div>
      </div>
    ) : (
      <div>
        <h1 className="text-2xl font-bold">Catalogo de Productos</h1>
        <p className="text-muted-foreground">
          Administra los productos de tu workspace
        </p>
      </div>
    )}
    ```

    Notar que el botón "Nuevo Producto" del módulo productos vive dentro de `ProductsTable` (no en el header) — se atiende en Task 5 (productos).

    **Step 3 — `crm/contactos/[id]/page.tsx`:** ya tiene `cookies()` resolver para `workspaceId` (lines 47–48). Reusar para resolver `v2` antes del JSX. Reemplazar el back-link block (lines 68–76) y el header block (lines 78–93) con conditional:

    ```tsx
    const v2 = workspaceId ? await getIsDashboardV2Enabled(workspaceId) : false
    // ... en el return:
    {v2 ? (
      <>
        <div className="flex items-center gap-2 mb-4">
          <Link
            href="/crm/contactos"
            className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)] hover:text-[var(--ink-1)] transition-colors"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            <ArrowLeftIcon className="h-3 w-3" />
            Volver a contactos
          </Link>
        </div>
        <div className="flex items-start justify-between mb-4 pb-4 border-b border-[var(--ink-1)]">
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--rubric-2)] mb-1" style={{ fontFamily: 'var(--font-sans)' }}>
              Módulo · crm · contacto
            </span>
            <h1 className="text-[30px] leading-[1.1] font-bold tracking-[-0.015em] text-[var(--ink-1)] m-0" style={{ fontFamily: 'var(--font-display)' }}>
              {contact.name}
            </h1>
            <p className="mt-1 text-[11px] text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-mono)' }}>
              Creado el {new Date(contact.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Bogota' })}
            </p>
          </div>
          <ContactDetailActions contact={contact} v2 />
        </div>
      </>
    ) : (
      <>
        {/* Preserve current back-button block + current header block byte-identical */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/crm/contactos">
              <ArrowLeftIcon className="mr-2 h-4 w-4" />
              Volver a contactos
            </Link>
          </Button>
        </div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold">{contact.name}</h1>
            <p className="text-muted-foreground">
              Creado el{' '}
              {new Date(contact.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Bogota' })}
            </p>
          </div>
          <ContactDetailActions contact={contact} />
        </div>
      </>
    )}
    ```

    Adicional para `[id]/page.tsx`: re-skinear `<TabsList>` cuando v2. La `TabsList` shadcn tiene un default styling (bg-muted rounded). Para v2, agregar className aditivo via prop al TabsList — pero como `<TabsList>` no acepta `className` que sobrescriba completo (revisar el primitive), la solución más simple es duplicar el `<TabsList>` block en un conditional `{v2 ? (<TabsList className="...editorial...">...) : (<TabsList>...)`. Específicamente cuando v2:

    ```tsx
    <TabsList
      className="h-auto rounded-none bg-transparent border-b border-[var(--border)] p-0 gap-5 justify-start"
    >
      {(['info','tasks','custom','notes','history'] as const).map((value) => {
        const labels = { info: 'Información', tasks: 'Tareas', custom: 'Campos', notes: 'Notas', history: 'Historial' }
        return (
          <TabsTrigger
            key={value}
            value={value}
            className="rounded-none border-b-2 border-transparent bg-transparent px-0 pb-2 pt-1 text-[13px] font-medium text-[var(--ink-3)] data-[state=active]:bg-transparent data-[state=active]:text-[var(--ink-1)] data-[state=active]:font-semibold data-[state=active]:border-[var(--ink-1)] data-[state=active]:shadow-none"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            {labels[value]}
          </TabsTrigger>
        )
      })}
    </TabsList>
    ```

    El `data-[state=active]` selector funciona con shadcn Tabs (Radix). Verifica leyendo `src/components/ui/tabs.tsx` que el data-attribute se aplica.

    Las `<Card>`, `<CardContent>`, `<CardHeader>`, `<CardDescription>` se quedan SIN cambios — heredan paper-0 + ink-1 via `--card`/`--card-foreground` cascade en `.theme-editorial`. Solo `<CardDescription>` que renderea inline el icono+label puede recibir className aditivo `mx-smallcaps text-[var(--ink-3)]` cuando v2 (5 instancias en este file: lines 110, 132, 147, 169, 199, 254, 273). Aplicar via:

    ```tsx
    <CardDescription className={v2 ? 'mx-smallcaps text-[var(--ink-3)] flex items-center gap-2' : 'flex items-center gap-2'}>
    ```

    Nota: `mx-smallcaps` ya está scoped a `.theme-editorial`, por lo que el conditional puede simplificarse a aplicar siempre — pero por claridad pragmatic, gateamos.

    **Step 4 — `crm/contactos/[id]/contact-detail-actions.tsx`:** Agregar prop opcional `v2?: boolean`. Convertir botones a editorial cuando v2:

    ```tsx
    interface ContactDetailActionsProps {
      contact: ContactWithTags
      v2?: boolean
    }
    // ...
    <Button
      variant="outline"
      size="sm"
      onClick={() => setEditOpen(true)}
      className={v2 ? 'border-[var(--ink-1)] bg-[var(--paper-0)] text-[var(--ink-1)] hover:bg-[var(--paper-3)] shadow-[0_1px_0_var(--ink-1)]' : ''}
    >
      <PencilIcon className="mr-2 h-4 w-4" />
      Editar
    </Button>
    <Button
      variant="outline"
      size="sm"
      onClick={handleDelete}
      disabled={isDeleting}
      className={v2 ? 'border-[var(--rubric-2)] text-[var(--rubric-2)] bg-[var(--paper-0)] hover:bg-[var(--paper-3)] shadow-[0_1px_0_var(--rubric-2)]' : 'text-destructive hover:text-destructive'}
    >
      <TrashIcon className="mr-2 h-4 w-4" />
      {isDeleting ? 'Eliminando...' : 'Eliminar'}
    </Button>
    ```

    **Step 5 — `crm/contactos/components/create-contact-button.tsx`:** Agregar prop `v2?: boolean`. Cuando v2, aplicar primary press pattern editorial:

    ```tsx
    export function CreateContactButton({ v2 }: { v2?: boolean }) {
      // ...
      <Button
        onClick={() => setOpen(true)}
        className={v2 ? 'bg-[var(--ink-1)] text-[var(--paper-0)] hover:bg-[var(--ink-2)] shadow-[0_1px_0_var(--ink-1)] border border-[var(--ink-1)]' : ''}
        style={v2 ? { fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '13px', borderRadius: 'var(--radius-3)' } : undefined}
      >
        <PlusIcon className="mr-2 h-4 w-4" />
        Nuevo contacto
      </Button>
      // ...
    }
    ```

    **DO NOT MODIFY (D-DASH-07):**
    - `getContactsPage`, `getContact`, `getTags`, `getCustomFields`, `getContactNotes`, `getContactActivity` calls
    - `getProducts` call
    - `redirect('/crm/pedidos')` en `crm/page.tsx` (NO se modifica este file — queda fuera del scope de Task 1)
    - Cualquier hook (`useRouter`, etc.) o handler (delete, edit)
    - Imports de `@/components/ui/*` (preservar todos)
    - Estructura de `<Tabs>` / `<TabsContent>` (solo `<TabsList>` se ramifica)
    - Estructura de `<Card>` / `<CardHeader>` / `<CardContent>` (solo `<CardDescription>` recibe className aditivo)
  </action>
  <verify>
    <automated>grep -q "getIsDashboardV2Enabled" 'src/app/(dashboard)/crm/contactos/page.tsx' && grep -q "Módulo · crm" 'src/app/(dashboard)/crm/contactos/page.tsx' && grep -q "getIsDashboardV2Enabled" 'src/app/(dashboard)/crm/productos/page.tsx' && grep -q "Módulo · crm" 'src/app/(dashboard)/crm/productos/page.tsx' && grep -q "getIsDashboardV2Enabled" 'src/app/(dashboard)/crm/contactos/[id]/page.tsx' && grep -q "Módulo · crm · contacto" 'src/app/(dashboard)/crm/contactos/[id]/page.tsx' && grep -q "data-\[state=active\]:border-\[var(--ink-1)\]" 'src/app/(dashboard)/crm/contactos/[id]/page.tsx' && grep -q "v2?: boolean" 'src/app/(dashboard)/crm/contactos/[id]/contact-detail-actions.tsx' && grep -q "v2?: boolean" 'src/app/(dashboard)/crm/contactos/components/create-contact-button.tsx' && grep -q "border-\[var(--rubric-2)\]" 'src/app/(dashboard)/crm/contactos/[id]/contact-detail-actions.tsx' && npx tsc --noEmit 2>&1 | grep -E "crm/(contactos|productos)" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "Módulo · crm" 'src/app/(dashboard)/crm/contactos/page.tsx'` (eyebrow text con U+00B7).
    - `grep -q "Módulo · crm" 'src/app/(dashboard)/crm/productos/page.tsx'`.
    - `grep -q "Módulo · crm · contacto" 'src/app/(dashboard)/crm/contactos/[id]/page.tsx'`.
    - `grep -q "var(--font-display)" 'src/app/(dashboard)/crm/contactos/page.tsx'` (h1 usa serif).
    - `grep -q "border-\[var(--ink-1)\]" 'src/app/(dashboard)/crm/contactos/page.tsx'` (border editorial).
    - Los 3 pages contienen `getIsDashboardV2Enabled` (server-side gate).
    - `grep -q "v2?: boolean" 'src/app/(dashboard)/crm/contactos/components/create-contact-button.tsx'` (prop opcional).
    - `grep -q "border-\[var(--rubric-2)\]" 'src/app/(dashboard)/crm/contactos/[id]/contact-detail-actions.tsx'` (delete button editorial).
    - `grep -q "data-\[state=active\]:border-\[var(--ink-1)\]" 'src/app/(dashboard)/crm/contactos/[id]/page.tsx'` (TabsTrigger editorial).
    - Los 3 pages STILL contienen sus calls originales: `getContactsPage`, `getProducts`, `getContact`/`getTags`/`getCustomFields`/`getContactNotes`/`getContactActivity` (verificable con grep — Regla 6 NO-TOUCH).
    - `! grep "oklch(" 'src/app/(dashboard)/crm/contactos/page.tsx'` (no hardcoded OKLCH — debe usar `var(--*)`).
    - `npx tsc --noEmit` reports zero errors en los 5 files.
    - Manual: con flag OFF en DB, los 3 pages renderean exactamente el header actual; con flag ON, topbar editorial mock-style.
  </acceptance_criteria>
  <done>Topbars editoriales en `/crm/contactos`, `/crm/productos` y `/crm/contactos/[id]` cuando flag ON: eyebrow rubric-2 + h1 mx-display + actions row con botones editorial. Detail page tiene tabs underline-only y CardDescription smallcaps. Botones Editar/Eliminar editorial outline ink-1 / outline rubric-2. Cuando flag OFF, los 5 files renderean DOM byte-identical. Build clean.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Re-skin contacts-table.tsx — toolbar editorial (search + tag-filter chips) + dictionary-table wrapper + bulk-actions editorial + paginación + empty state</name>
  <files>src/app/(dashboard)/crm/contactos/components/contacts-table.tsx, src/app/(dashboard)/crm/contactos/components/empty-state.tsx, src/app/(dashboard)/crm/contactos/components/tag-filter.tsx, src/app/(dashboard)/crm/contactos/components/bulk-actions.tsx</files>
  <read_first>
    - src/app/(dashboard)/crm/contactos/components/contacts-table.tsx (full 308 LOC — pay attention a search+import/export buttons lines 203–226, TagFilter line 228–234, BulkActions 237–244, DataTable 247–251, pagination 254–283)
    - src/app/(dashboard)/crm/contactos/components/tag-filter.tsx (full 115 LOC)
    - src/app/(dashboard)/crm/contactos/components/bulk-actions.tsx (full 115 LOC)
    - src/app/(dashboard)/crm/contactos/components/empty-state.tsx (full 26 LOC)
    - src/components/ui/data-table.tsx (verifica que `<DataTable>` acepta wrapper className o que `<table>` interno hereda ok via cascade)
    - .planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/crm.html lines 41–63 (table.dict styles), lines 44–49 (toolbar/search/chip), lines 127–139 (HTML toolbar render)
    - .planning/standalone/ui-redesign-conversaciones/02-PLAN.md (referencia del search input editorial)
  </read_first>
  <action>
    **Step 1 — `contacts-table.tsx` añadir hook + ramificar 4 secciones:**

    Agregar imports:
    ```typescript
    import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
    import { cn } from '@/lib/utils'
    ```

    Llamar el hook al inicio del componente (después de `useRouter`, `useSearchParams`):
    ```typescript
    const v2 = useDashboardV2()
    ```

    **Step 2 — Ramificar el toolbar (search + import/export) líneas 204–226.** Cuando v2, render:

    ```tsx
    <div className={v2 ? 'flex items-center gap-3 flex-wrap' : 'flex items-center gap-4'}>
      <div className={cn('relative', v2 ? 'flex-1 max-w-[320px]' : 'flex-1 max-w-sm')}>
        <SearchIcon className={cn(
          'absolute top-1/2 -translate-y-1/2',
          v2
            ? 'left-[10px] h-[14px] w-[14px] text-[var(--ink-3)]'
            : 'left-3 h-4 w-4 text-muted-foreground'
        )} />
        <Input
          placeholder="Buscar por nombre, teléfono o ciudad…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={cn(v2 ? 'pl-[30px] bg-[var(--paper-0)] border-[var(--border)] rounded-[var(--radius-3)] text-[13px]' : 'pl-9')}
          style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setImportDialogOpen(true)}
          className={v2 ? 'border-[var(--ink-1)] bg-[var(--paper-0)] text-[var(--ink-1)] hover:bg-[var(--paper-3)] shadow-[0_1px_0_var(--ink-1)]' : ''}
        >
          <Upload className="h-4 w-4 mr-2" />
          Importar
        </Button>
        <CsvExportButton
          allContacts={contacts}
          filteredContacts={contacts}
          customFields={customFields}
          hasFilters={hasFilters}
        />
      </div>
    </div>
    ```

    Notar: el placeholder cambia a `'Buscar por nombre, teléfono o ciudad…'` SOLO cuando v2 (alineado al mock crm.html line 129). Cuando flag OFF, el placeholder current `'Buscar contactos...'` se preserva — usa ternary inline en el `placeholder` prop.

    **Step 3 — Ramificar el wrapper de DataTable** para aplicar dictionary-table styling. Como `<DataTable>` es un componente compartido (`@/components/ui/data-table`), NO se modifica. La estrategia es envolverlo en un wrapper que vía CSS cascade dentro de `.theme-editorial` aplique los tokens del mock. Específicamente, cuando v2, envolver en:

    ```tsx
    <div
      className={cn(
        v2
          ? 'bg-[var(--paper-0)] border border-[var(--ink-1)] rounded-[var(--radius-3)] overflow-hidden [&_table]:border-collapse [&_thead_th]:bg-[var(--paper-1)] [&_thead_th]:border-b [&_thead_th]:border-[var(--ink-1)] [&_thead_th]:text-[10px] [&_thead_th]:uppercase [&_thead_th]:tracking-[0.08em] [&_thead_th]:text-[var(--ink-3)] [&_thead_th]:font-semibold [&_tbody_tr:hover]:bg-[var(--paper-2)] [&_tbody_td]:border-b [&_tbody_td]:border-[var(--border)] [&_tbody_td]:text-[13px] [&_tbody_td]:text-[var(--ink-1)]'
          : ''
      )}
      style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
    >
      <DataTable
        columns={columns}
        data={contacts}
        onRowSelectionChange={setRowSelection}
      />
    </div>
    ```

    Los selectores `[&_*]` aplican estilos a hijos sin modificar el componente `<DataTable>` (D-DASH-09 — primitives no se tocan). Es un override scoped al wrapper.

    **Step 4 — Pagination block (líneas 254–283).** Cuando v2:

    ```tsx
    {total > 0 && (
      <div className={cn('flex items-center justify-between', v2 ? 'px-3 pt-3 border-t border-[var(--border)]' : 'px-2')}>
        <p
          className={cn(v2 ? 'text-[12px] text-[var(--ink-3)]' : 'text-sm text-muted-foreground')}
          style={v2 ? { fontFamily: 'var(--font-mono)' } : undefined}
        >
          Mostrando {startItem}-{endItem} de {total.toLocaleString()} contactos
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
            className={v2 ? 'border-[var(--ink-1)] bg-[var(--paper-0)] text-[var(--ink-1)] hover:bg-[var(--paper-3)] shadow-[0_1px_0_var(--ink-1)]' : ''}
          >
            <ChevronLeftIcon className="h-4 w-4 mr-1" />
            Anterior
          </Button>
          <span
            className={cn(v2 ? 'text-[12px] text-[var(--ink-3)]' : 'text-sm text-muted-foreground')}
            style={v2 ? { fontFamily: 'var(--font-mono)' } : undefined}
          >
            Pagina {page} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => goToPage(page + 1)}
            disabled={page >= totalPages}
            className={v2 ? 'border-[var(--ink-1)] bg-[var(--paper-0)] text-[var(--ink-1)] hover:bg-[var(--paper-3)] shadow-[0_1px_0_var(--ink-1)]' : ''}
          >
            Siguiente
            <ChevronRightIcon className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    )}
    ```

    **Step 5 — `empty-state.tsx`:** Agregar prop `v2?: boolean` y ramificar:

    ```tsx
    interface EmptyStateProps {
      onCreateClick: () => void
      v2?: boolean
    }
    export function EmptyState({ onCreateClick, v2 }: EmptyStateProps) {
      if (v2) {
        return (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <p className="mx-h3">No hay contactos.</p>
            <p className="mx-caption max-w-sm">Empieza agregando tu primer contacto para gestionar tus clientes y leads.</p>
            <p className="mx-rule-ornament">· · ·</p>
            <Button
              onClick={onCreateClick}
              className="bg-[var(--ink-1)] text-[var(--paper-0)] hover:bg-[var(--ink-2)] shadow-[0_1px_0_var(--ink-1)] border border-[var(--ink-1)] mt-2"
              style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '13px', borderRadius: 'var(--radius-3)' }}
            >
              <UserPlusIcon className="mr-2 h-4 w-4" />
              Crear primer contacto
            </Button>
          </div>
        )
      }
      // Preserve current empty state byte-identical
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <UserPlusIcon className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No hay contactos</h3>
          <p className="text-muted-foreground mb-6 max-w-sm">
            Empieza agregando tu primer contacto para gestionar tus clientes y leads.
          </p>
          <Button onClick={onCreateClick}>
            <UserPlusIcon className="mr-2 h-4 w-4" />
            Crear primer contacto
          </Button>
        </div>
      )
    }
    ```

    En `contacts-table.tsx`, donde se renderea `<EmptyState onCreateClick={...} />` (line 180), pasar `v2={v2}`.

    **Step 6 — `tag-filter.tsx`:** Agregar `useDashboardV2` y ramificar los chips de tag. Los chips current (líneas 56–78) usan `border-2 border-foreground` cuando active y color del tag inline. Cuando v2 reemplazar por `mx-tag` style con outline:

    ```tsx
    'use client'
    import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
    // ...
    export function TagFilter(props: TagFilterProps) {
      const v2 = useDashboardV2()
      // ... mismo handlers
      return (
        <div className="flex items-center gap-2 flex-wrap">
          {tags.length > 0 && (
            <div className={cn('flex items-center gap-2 text-sm', v2 ? 'text-[var(--ink-3)]' : 'text-muted-foreground')}>
              <FilterIcon className="h-4 w-4" />
              <span style={v2 ? { fontFamily: 'var(--font-sans)', fontSize: '12px' } : undefined}>Filtrar por etiquetas:</span>
            </div>
          )}
          {tags.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {tags.map((tag) => {
                const isSelected = selectedTagIds.includes(tag.id)
                if (v2) {
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                      className={cn(
                        'inline-flex items-center rounded-full px-[10px] py-[3px] text-[11px] font-semibold border transition-colors',
                        isSelected
                          ? 'bg-[var(--ink-1)] text-[var(--paper-0)] border-[var(--ink-1)]'
                          : 'bg-[var(--paper-0)] text-[var(--ink-2)] border-[var(--border)] hover:border-[var(--ink-2)]'
                      )}
                      style={{ fontFamily: 'var(--font-sans)', letterSpacing: '0.01em' }}
                    >
                      {tag.name}
                    </button>
                  )
                }
                // Preserve current chip byte-identical
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    className={cn(
                      'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition-all',
                      'border-2 cursor-pointer',
                      isSelected ? 'border-foreground shadow-sm' : 'border-transparent opacity-70 hover:opacity-100'
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
          )}
          {/* Selected count + clear button — preserve current; cuando v2 styling editorial */}
          {selectedTagIds.length > 0 && (
            <div className="flex items-center gap-2 ml-2">
              <span className={cn('text-sm', v2 ? 'text-[var(--ink-3)]' : 'text-muted-foreground')}>
                {selectedTagIds.length} etiqueta{selectedTagIds.length > 1 ? 's' : ''} seleccionada{selectedTagIds.length > 1 ? 's' : ''}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className={cn('h-7 px-2', v2 ? 'text-[var(--ink-2)] hover:text-[var(--rubric-2)]' : 'text-muted-foreground hover:text-foreground')}
              >
                <XIcon className="h-3 w-3 mr-1" />
                Limpiar filtros
              </Button>
            </div>
          )}
          {onManageTags && (
            <Button
              variant="outline"
              size="sm"
              onClick={onManageTags}
              className={cn('h-7 px-2 ml-auto', v2 ? 'border-[var(--ink-1)] bg-[var(--paper-0)] text-[var(--ink-1)] hover:bg-[var(--paper-3)]' : '')}
            >
              <SettingsIcon className="h-3.5 w-3.5 mr-1" />
              Gestionar etiquetas
            </Button>
          )}
        </div>
      )
    }
    ```

    **Step 7 — `bulk-actions.tsx`:** Agregar `useDashboardV2` y ramificar el contenedor:

    ```tsx
    'use client'
    import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
    import { cn } from '@/lib/utils'
    // ...
    export function BulkActions(props: BulkActionsProps) {
      const v2 = useDashboardV2()
      if (selectedCount === 0) return null
      return (
        <div className={cn(
          'flex items-center gap-2 px-4 py-2',
          v2
            ? 'bg-[var(--paper-2)] border border-[var(--ink-1)] rounded-[var(--radius-3)] shadow-[0_1px_0_var(--ink-1)]'
            : 'bg-muted/50 border rounded-lg'
        )}>
          <span
            className={cn('text-sm font-medium', v2 && 'text-[var(--ink-1)] uppercase tracking-[0.08em] text-[11px] font-semibold')}
            style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
          >
            {selectedCount} seleccionado{selectedCount > 1 ? 's' : ''}
          </span>
          <div className={cn('h-4 w-px mx-2', v2 ? 'bg-[var(--ink-1)]' : 'bg-border')} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={v2 ? 'border-[var(--ink-1)] bg-[var(--paper-0)] text-[var(--ink-1)] hover:bg-[var(--paper-3)] shadow-[0_1px_0_var(--ink-1)]' : ''}
              >
                <TagIcon className="mr-2 h-4 w-4" />
                Agregar tag
              </Button>
            </DropdownMenuTrigger>
            {/* ... DropdownMenuContent + items unchanged */}
          </DropdownMenu>
          {/* Quitar tag — same v2 styling */}
          <DropdownMenu>
            {/* ... unchanged structurally ... */}
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className={v2 ? 'border-[var(--ink-1)] bg-[var(--paper-0)] text-[var(--ink-1)] hover:bg-[var(--paper-3)] shadow-[0_1px_0_var(--ink-1)]' : ''}>
                <XIcon className="mr-2 h-4 w-4" />
                Quitar tag
              </Button>
            </DropdownMenuTrigger>
            {/* content unchanged */}
          </DropdownMenu>
          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            className={v2 ? 'border-[var(--rubric-2)] text-[var(--rubric-2)] bg-[var(--paper-0)] hover:bg-[var(--paper-3)] shadow-[0_1px_0_var(--rubric-2)]' : 'text-destructive hover:text-destructive'}
          >
            <TrashIcon className="mr-2 h-4 w-4" />
            Eliminar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearSelection}
            className={cn('ml-auto', v2 && 'text-[var(--ink-2)] hover:text-[var(--ink-1)]')}
          >
            Limpiar seleccion
          </Button>
        </div>
      )
    }
    ```

    **DO NOT MODIFY (D-DASH-07, Regla 6):**
    - `getContactsPage`, `deleteContact`, `deleteContacts`, `bulkAddTag`, `bulkRemoveTag` calls
    - `useRouter`, `useSearchParams`, debounced search effect (lines 67–79)
    - `RowSelectionState`, `useSelectedRowIds` usage
    - `<DataTable>`, `<TagBadge>` componentes shared (solo wrapper css)
    - `<DropdownMenu>` / `<DropdownMenuTrigger>` / `<DropdownMenuContent>` / `<DropdownMenuItem>` structure (D-DASH-09 — primitives intactos; verificar que `dropdown-menu.tsx` ya tiene `portalContainer` prop de fase inbox v2; si no aparece dentro del tema editorial, dejar nota en SUMMARY como deuda para Plan 09 sweep)
    - `buildUrl`, `goToPage`, `handleTagSelectionChange`, `handleBulkDelete`, `handleBulkAddTag`, `handleBulkRemoveTag`, `handleDialogClose`, `handleCreateSuccess` callbacks
    - `<ContactDialog>`, `<TagManager>`, `<CsvImportDialog>`, `<CsvExportButton>` (Task 4 cubre csv-* / tag-manager re-skin)
    - `getContrastColor` import en bulk-actions
  </action>
  <verify>
    <automated>grep -q "useDashboardV2" 'src/app/(dashboard)/crm/contactos/components/contacts-table.tsx' && grep -q "Buscar por nombre, teléfono o ciudad" 'src/app/(dashboard)/crm/contactos/components/contacts-table.tsx' && grep -q "border border-\[var(--ink-1)\]" 'src/app/(dashboard)/crm/contactos/components/contacts-table.tsx' && grep -q "thead_th\]:bg-\[var(--paper-1)\]" 'src/app/(dashboard)/crm/contactos/components/contacts-table.tsx' && grep -q "useDashboardV2" 'src/app/(dashboard)/crm/contactos/components/empty-state.tsx' && grep -q "mx-h3" 'src/app/(dashboard)/crm/contactos/components/empty-state.tsx' && grep -q "mx-caption" 'src/app/(dashboard)/crm/contactos/components/empty-state.tsx' && grep -q "mx-rule-ornament" 'src/app/(dashboard)/crm/contactos/components/empty-state.tsx' && grep -q "useDashboardV2" 'src/app/(dashboard)/crm/contactos/components/tag-filter.tsx' && grep -q "useDashboardV2" 'src/app/(dashboard)/crm/contactos/components/bulk-actions.tsx' && grep -q "border-\[var(--rubric-2)\]" 'src/app/(dashboard)/crm/contactos/components/bulk-actions.tsx' && grep -q "useConversations\|useRouter\|useSearchParams" 'src/app/(dashboard)/crm/contactos/components/contacts-table.tsx' && npx tsc --noEmit 2>&1 | grep -E "contacts-table|tag-filter|bulk-actions|empty-state" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "useDashboardV2" 'src/app/(dashboard)/crm/contactos/components/contacts-table.tsx'`.
    - `grep -q "Buscar por nombre, teléfono o ciudad" 'src/app/(dashboard)/crm/contactos/components/contacts-table.tsx'` (placeholder mock-aligned).
    - `grep -q "thead_th\]:bg-\[var(--paper-1)\]" 'src/app/(dashboard)/crm/contactos/components/contacts-table.tsx'` (dictionary-table wrapper override D-DASH-11).
    - `grep -q "mx-h3" 'src/app/(dashboard)/crm/contactos/components/empty-state.tsx'` y `grep -q "mx-rule-ornament" 'src/app/(dashboard)/crm/contactos/components/empty-state.tsx'` (D-DASH-15 + UI editorial empty pattern).
    - `grep -q "bg-\[var(--paper-2)\] border border-\[var(--ink-1)\]" 'src/app/(dashboard)/crm/contactos/components/bulk-actions.tsx'`.
    - `grep -q "border-\[var(--rubric-2)\]" 'src/app/(dashboard)/crm/contactos/components/bulk-actions.tsx'` (delete button editorial).
    - tag-filter cuando v2 NO usa `tag.color` inline (chip styling pasa a outline editorial); cuando OFF preserva el inline color.
    - Los 4 files contienen aún sus calls originales: `useRouter`, `useSearchParams`, `setRowSelection`, `useSelectedRowIds`, `bulkAddTag`, `bulkRemoveTag`, `deleteContact`, `deleteContacts`, `<DataTable>`, `<TagBadge>` (verificable con grep — Regla 6).
    - `! grep "oklch(" 'src/app/(dashboard)/crm/contactos/components/contacts-table.tsx'`.
    - `npx tsc --noEmit` reports zero errors en los 4 files.
    - Manual: con flag OFF, los 4 files renderean DOM byte-identical al actual; con flag ON, dictionary-table + chips editorial + bulk-actions editorial + empty editorial.
  </acceptance_criteria>
  <done>Listing de contactos editorial: search input paper-0 + chips outline + dictionary-table wrapper con thead bg paper-1 + tbody hover paper-2 + bulk-actions paper-2 + ink-1 border + delete rubric-2 outline + empty mx-h3/mx-caption/mx-rule-ornament + paginación mono ink-3. Cuando flag OFF, byte-identical. Build clean.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Re-skin columns.tsx — TanStack column headers mx-smallcaps + cell types editorial (entry/ph/city/tags) + tag overflow mx-tag--ink + actions dropdown editorial</name>
  <files>src/app/(dashboard)/crm/contactos/components/columns.tsx</files>
  <read_first>
    - src/app/(dashboard)/crm/contactos/components/columns.tsx (full 243 LOC — pay attention a select column lines 53–74, name column 75–96, phone 97–108, address 109–121, city 122–145, department 146–163, tags 164–187, updated_at 188–208, actions 209–241)
    - .planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/crm.html lines 51–59 (table.dict th/td/entry/ph/city/tg) y line 137 (header HTML)
    - src/components/contacts/tag-badge.tsx (verifica que TagBadge es shared — fuera de scope D-DASH-07; solo el OVERFLOW counter `+N` cambia)
  </read_first>
  <action>
    **CRITICAL — el archivo `columns.tsx` define una factoría `createColumns({onEdit, onDelete, onViewDetail})` que retorna un array de `ColumnDef<ContactWithTags>`. NO se puede llamar `useDashboardV2` desde `createColumns` (no es componente). Solución: pasar `v2` como prop adicional al factory:

    ```typescript
    interface ColumnsProps {
      onEdit: (contact: ContactWithTags) => void
      onDelete: (contact: ContactWithTags) => void
      onViewDetail: (contact: ContactWithTags) => void
      v2?: boolean
    }
    export function createColumns({ onEdit, onDelete, onViewDetail, v2 = false }: ColumnsProps): ColumnDef<ContactWithTags>[] {
      return [ /* ... */ ]
    }
    ```

    Y en `contacts-table.tsx` (Task 2 ya resolvió el hook), pasar `v2` al `createColumns` call:

    ```tsx
    const columns = React.useMemo(
      () => createColumns({ onEdit: ..., onDelete: ..., onViewDetail: ..., v2 }),
      [router, v2]  // añadir v2 al dependency array
    )
    ```

    (Esta modificación adicional vive en `contacts-table.tsx` — agregar `v2` al deps del useMemo. Está OK porque Task 2 ya tocó ese archivo).

    **Step 1 — Headers (`Nombre`, `Telefono`, `Direccion`, `Ciudad`, `Departamento`, `Etiquetas`, `Actualizado`):** los headers que usan `<Button variant="ghost" onClick={() => column.toggleSorting(...)}>` deben renderear texto smallcaps cuando v2. Como el header recibe `Button` shadcn que aplica padding propio, agregar className aditivo + style:

    ```tsx
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className={cn('-ml-4', v2 && 'text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ink-3)] hover:text-[var(--ink-1)] hover:bg-transparent')}
          style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
        >
          Nombre
          <ArrowUpDownIcon className={cn('ml-2', v2 ? 'h-3 w-3' : 'h-4 w-4')} />
        </Button>
      ),
      // ...
    }
    ```

    Replicar este pattern para `phone` (header simple string `'Telefono'` → ramificar header function), `address`, `city`, `department`, `tags` (string `'Etiquetas'`), `updated_at`. Los headers que actualmente son strings (no `({ column }) => ...`) — `phone` line 99 (`header: 'Telefono'`), `address` line 111 (`header: 'Direccion'`), `tags` line 166 (`header: 'Etiquetas'`) — convertir a funciones cuando v2 es true:

    Para los 3 headers string, simplemente envolver en `<span>`:

    ```tsx
    {
      accessorKey: 'phone',
      header: () => v2 ? (
        <span className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-sans)' }}>
          Teléfono
        </span>
      ) : 'Telefono',
      // ...
    }
    ```

    Idem para `address` (`'Dirección'` cuando v2 con acento; sin acento cuando OFF para preservar byte-identical), `tags` (`'Etiquetas'`), updated_at usa Button.

    Importar `cn` desde `@/lib/utils` si no está ya importado.

    **Step 2 — Cells re-skin.** Para cada cell, ramificar className/style cuando v2:

    **Name cell (lines 87–95):**
    ```tsx
    cell: ({ row }) => (
      <button
        type="button"
        onClick={() => onViewDetail(row.original)}
        className={cn(
          'text-left cursor-pointer',
          v2
            ? 'font-semibold text-[13px] text-[var(--ink-1)] hover:text-[var(--rubric-2)] transition-colors'
            : 'font-medium hover:underline hover:text-primary'
        )}
        style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
      >
        {row.getValue('name')}
      </button>
    ),
    ```

    **Phone cell (lines 100–107):**
    ```tsx
    cell: ({ row }) => {
      const phone = row.getValue('phone') as string
      return (
        <div
          className={v2 ? 'text-[12px] text-[var(--ink-2)] font-medium' : 'text-muted-foreground'}
          style={v2 ? { fontFamily: 'var(--font-mono)' } : undefined}
        >
          {formatPhoneDisplay(phone)}
        </div>
      )
    },
    ```

    **Address cell (lines 112–120):**
    ```tsx
    cell: ({ row }) => {
      const address = row.getValue('address') as string | null
      if (!address) return <span className={v2 ? 'text-[var(--ink-3)]' : 'text-muted-foreground'}>-</span>
      return (
        <div
          className={cn('max-w-[200px] truncate', v2 ? 'text-[13px] text-[var(--ink-2)]' : 'text-sm')}
          title={address}
        >
          {address}
        </div>
      )
    },
    ```

    **City cell (lines 134–144):** idem — texto v2 `text-[13px] text-[var(--ink-3)]` (ciudad es secundaria per mock css class `.city`).

    **Department cell (lines 158–162):** mismo treatment.

    **Tags cell (lines 167–186):** el componente `<TagBadge>` es shared y NO se modifica (D-DASH-07). Solo el overflow counter `+N` se cambia:

    ```tsx
    cell: ({ row }) => {
      const tags = row.original.tags
      if (!tags || tags.length === 0) {
        return <span className={cn('text-sm', v2 ? 'text-[var(--ink-3)]' : 'text-muted-foreground')}>-</span>
      }
      return (
        <div className="flex gap-1 flex-wrap max-w-[200px]">
          {tags.slice(0, 3).map((tag) => (
            <TagBadge key={tag.id} tag={tag} />
          ))}
          {tags.length > 3 && (
            v2 ? (
              <span className="mx-tag mx-tag--ink">+{tags.length - 3}</span>
            ) : (
              <span className="text-muted-foreground text-xs">
                +{tags.length - 3}
              </span>
            )
          )}
        </div>
      )
    },
    ```

    **updated_at cell (lines 200–207):**
    ```tsx
    cell: ({ row }) => {
      const date = row.getValue('updated_at') as string
      return (
        <div
          className={cn(v2 ? 'text-[12px] text-[var(--ink-3)]' : 'text-muted-foreground text-sm')}
          style={v2 ? { fontFamily: 'var(--font-mono)' } : undefined}
        >
          {formatRelativeTime(date)}
        </div>
      )
    },
    ```

    **Actions dropdown (lines 209–240):** preservar el `<DropdownMenu>` structure (D-DASH-09). Solo el `<MoreHorizontalIcon>` button puede recibir className aditivo. Y el `DropdownMenuItem` "Eliminar" actual usa `className="text-destructive"` que en `.theme-editorial` cascade ya mapea a rubric-2 (--destructive → rubric-2). Verificar leyendo globals.css line 246.

    Cuando v2, agregar al MoreHorizontalIcon button:
    ```tsx
    <Button
      variant="ghost"
      size="icon"
      className={cn('h-8 w-8', v2 && 'hover:bg-[var(--paper-3)] text-[var(--ink-2)] hover:text-[var(--ink-1)]')}
    >
    ```

    El `DropdownMenuLabel` cuando v2 puede recibir mx-smallcaps:
    ```tsx
    <DropdownMenuLabel className={v2 ? 'mx-smallcaps text-[var(--ink-3)]' : ''}>Acciones</DropdownMenuLabel>
    ```

    **Step 3 — Select column (lines 53–74):** Checkbox component shared (`@/components/ui/checkbox`) — cuando v2 hereda border ink-1 via cascade. NO modificar. Pero al re-render dentro del wrapper editorial (Task 2), se ve correctamente.

    **DO NOT MODIFY:**
    - `<TagBadge>` import / usage para tags individuales (D-DASH-07)
    - `<Checkbox>`, `<DropdownMenu>`, `<DropdownMenuTrigger>`, `<DropdownMenuContent>`, `<DropdownMenuItem>`, `<DropdownMenuSeparator>` (D-DASH-09)
    - `formatPhoneDisplay`, `getCityByValue`, `formatRelativeTime` helpers
    - `column.toggleSorting`, `column.getIsSorted` API calls
    - `row.toggleSelected`, `table.toggleAllPageRowsSelected`, `table.getIsAllPageRowsSelected`, `table.getIsSomePageRowsSelected` calls
    - `accessorKey` strings (mantienen sort behavior)
    - `enableSorting`, `enableHiding` flags
    - Order de las columnas
    - Imports existentes (solo añadir `cn`)
  </action>
  <verify>
    <automated>grep -q "v2?: boolean" 'src/app/(dashboard)/crm/contactos/components/columns.tsx' && grep -q "tracking-\[0.08em\]" 'src/app/(dashboard)/crm/contactos/components/columns.tsx' && grep -q "mx-tag mx-tag--ink" 'src/app/(dashboard)/crm/contactos/components/columns.tsx' && grep -q "var(--font-mono)" 'src/app/(dashboard)/crm/contactos/components/columns.tsx' && grep -q "TagBadge" 'src/app/(dashboard)/crm/contactos/components/columns.tsx' && grep -q "formatPhoneDisplay" 'src/app/(dashboard)/crm/contactos/components/columns.tsx' && grep -q "getCityByValue" 'src/app/(dashboard)/crm/contactos/components/columns.tsx' && grep -q "v2={v2}" 'src/app/(dashboard)/crm/contactos/components/contacts-table.tsx' && npx tsc --noEmit 2>&1 | grep "columns" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "v2?: boolean" 'src/app/(dashboard)/crm/contactos/components/columns.tsx'` (factory acepta el flag).
    - `grep -q "tracking-\[0.08em\]" 'src/app/(dashboard)/crm/contactos/components/columns.tsx'` (header smallcaps).
    - `grep -q "mx-tag mx-tag--ink" 'src/app/(dashboard)/crm/contactos/components/columns.tsx'` (overflow counter D-DASH-15).
    - `grep -q "var(--font-mono)" 'src/app/(dashboard)/crm/contactos/components/columns.tsx'` (phone + updated_at usan mono per mock `.ph` y `.tm`).
    - File STILL contiene `TagBadge`, `formatPhoneDisplay`, `getCityByValue`, `formatRelativeTime`, `column.toggleSorting`, `row.toggleSelected` (Regla 6 NO-TOUCH verificable).
    - `! grep "oklch(" 'src/app/(dashboard)/crm/contactos/components/columns.tsx'`.
    - `contacts-table.tsx` ahora pasa `v2={v2}` al `createColumns()` call (verificar con grep).
    - `npx tsc --noEmit` reports zero errors en `columns.tsx` y `contacts-table.tsx`.
    - Manual: con flag OFF, columns DOM byte-identical (header strings simples, cell formatting actual); con flag ON, headers smallcaps ink-3 + name serif/sans + phone mono + tag overflow editorial.
  </acceptance_criteria>
  <done>Columnas TanStack editoriales cuando v2: headers mx-smallcaps tracking-0.08em ink-3, name cell hover rubric-2, phone/updated_at mono ink-2/ink-3, tag overflow `mx-tag mx-tag--ink`, dropdown label smallcaps. TagBadge shared NO modificado. Cuando flag OFF, byte-identical. Build clean.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 4: Re-skin productos (page se hizo en Task 1) — products-table + columns con dictionary-table + status mx-tag--verdigris/--ink reemplazando shadcn Badge</name>
  <files>src/app/(dashboard)/crm/productos/components/products-table.tsx, src/app/(dashboard)/crm/productos/components/columns.tsx</files>
  <read_first>
    - src/app/(dashboard)/crm/productos/components/products-table.tsx (full 238 LOC — pay attention a empty state lines 113–143, toolbar 148–182, DataTable 184–191, dialogs 194–235)
    - src/app/(dashboard)/crm/productos/components/columns.tsx (full 158 LOC — pay attention a sku 63–77, title 78–93, price 94–110, is_active 111–123, actions 124–156)
    - .planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/crm.html (no hay mock específico de productos — aplicar mismo dictionary-table pattern de contactos + status pill mx-tag--verdigris/--ink)
  </read_first>
  <action>
    Aplicar al módulo productos los mismos patterns de Tasks 2 y 3 — dictionary-table wrapper, search editorial, mx-tag para status, button primary editorial, empty state editorial.

    **Step 1 — `products-table.tsx`:** Importar `useDashboardV2`. Llamar al inicio del componente:

    ```typescript
    const v2 = useDashboardV2()
    ```

    **Empty state lines 113–143:** Ramificar:

    ```tsx
    if (products.length === 0) {
      return (
        <>
          {v2 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <p className="mx-h3">Sin productos.</p>
              <p className="mx-caption max-w-sm">Agrega tu primer producto para poder incluirlo en tus pedidos.</p>
              <p className="mx-rule-ornament">· · ·</p>
              <Button
                onClick={() => setDialogOpen(true)}
                className="bg-[var(--ink-1)] text-[var(--paper-0)] hover:bg-[var(--ink-2)] shadow-[0_1px_0_var(--ink-1)] border border-[var(--ink-1)] mt-2"
                style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '13px', borderRadius: 'var(--radius-3)' }}
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                Nuevo Producto
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-full bg-muted p-4 mb-4">
                <PackageIcon className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Sin productos</h3>
              <p className="text-muted-foreground mb-6 max-w-sm">
                Agrega tu primer producto para poder incluirlo en tus pedidos.
              </p>
              <Button onClick={() => setDialogOpen(true)}>
                <PlusIcon className="h-4 w-4 mr-2" />
                Nuevo Producto
              </Button>
            </div>
          )}
          {/* Dialog unchanged */}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className="sm:max-w-[500px]">
              {/* ... preserved as-is */}
            </DialogContent>
          </Dialog>
        </>
      )
    }
    ```

    **Toolbar lines 148–182:** Ramificar igual que `contacts-table.tsx`:

    ```tsx
    <div className={v2 ? 'flex items-center gap-3 flex-wrap' : 'flex items-center gap-4'}>
      <div className={cn('relative', v2 ? 'flex-1 max-w-[320px]' : 'flex-1 max-w-sm')}>
        <SearchIcon className={cn(
          'absolute top-1/2 -translate-y-1/2',
          v2 ? 'left-[10px] h-[14px] w-[14px] text-[var(--ink-3)]' : 'left-3 h-4 w-4 text-muted-foreground'
        )} />
        <Input
          placeholder={v2 ? 'Buscar por título o SKU…' : 'Buscar por titulo o SKU...'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={cn(v2 ? 'pl-[30px] bg-[var(--paper-0)] border-[var(--border)] rounded-[var(--radius-3)] text-[13px]' : 'pl-9')}
          style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowInactive(!showInactive)}
          className={cn('gap-2', v2 && 'border-[var(--ink-1)] bg-[var(--paper-0)] text-[var(--ink-1)] hover:bg-[var(--paper-3)] shadow-[0_1px_0_var(--ink-1)]')}
        >
          {showInactive ? (
            <><EyeOff className="h-4 w-4" />Ocultar inactivos</>
          ) : (
            <><Eye className="h-4 w-4" />Mostrar inactivos ({inactiveCount})</>
          )}
        </Button>
        <Button
          onClick={() => setDialogOpen(true)}
          className={v2 ? 'bg-[var(--ink-1)] text-[var(--paper-0)] hover:bg-[var(--ink-2)] shadow-[0_1px_0_var(--ink-1)] border border-[var(--ink-1)]' : ''}
          style={v2 ? { fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '13px', borderRadius: 'var(--radius-3)' } : undefined}
        >
          <PlusIcon className="h-4 w-4 mr-2" />
          Nuevo Producto
        </Button>
      </div>
    </div>
    ```

    **DataTable wrapper lines 184–191:** Mismo wrapper editorial de Task 2:

    ```tsx
    <div
      className={cn(
        v2
          ? 'bg-[var(--paper-0)] border border-[var(--ink-1)] rounded-[var(--radius-3)] overflow-hidden [&_table]:border-collapse [&_thead_th]:bg-[var(--paper-1)] [&_thead_th]:border-b [&_thead_th]:border-[var(--ink-1)] [&_thead_th]:text-[10px] [&_thead_th]:uppercase [&_thead_th]:tracking-[0.08em] [&_thead_th]:text-[var(--ink-3)] [&_thead_th]:font-semibold [&_tbody_tr:hover]:bg-[var(--paper-2)] [&_tbody_td]:border-b [&_tbody_td]:border-[var(--border)] [&_tbody_td]:text-[13px] [&_tbody_td]:text-[var(--ink-1)]'
          : ''
      )}
      style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
    >
      <DataTable
        columns={columns}
        data={filteredProducts}
        onRowSelectionChange={setRowSelection}
        searchColumn="title"
        searchValue={search}
      />
    </div>
    ```

    Pasar `v2` al `createColumns()` call:
    ```tsx
    const columns = React.useMemo(
      () => createColumns({ onEdit: ..., onDelete: ..., onToggleActive: ..., v2 }),
      [router, v2]
    )
    ```

    **Step 2 — `productos/components/columns.tsx`:** Agregar `v2?: boolean` al `ColumnsProps`. Ramificar:

    **SKU column (lines 63–77):** Header smallcaps editorial cuando v2; cell ya usa `font-mono text-sm` que está bien — agregar override sutil:
    ```tsx
    {
      accessorKey: 'sku',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className={cn('-ml-4', v2 && 'text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ink-3)] hover:text-[var(--ink-1)] hover:bg-transparent')}
          style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
        >
          SKU
          <ArrowUpDownIcon className={cn('ml-2', v2 ? 'h-3 w-3' : 'h-4 w-4')} />
        </Button>
      ),
      cell: ({ row }) => (
        <span
          className={cn('font-mono', v2 ? 'text-[12px] text-[var(--ink-2)] font-medium' : 'text-sm')}
          style={v2 ? { fontFamily: 'var(--font-mono)' } : undefined}
        >
          {row.getValue('sku')}
        </span>
      ),
    },
    ```

    **Title column:** mismo header pattern; cell:
    ```tsx
    cell: ({ row }) => (
      <span
        className={cn(v2 ? 'font-semibold text-[13px] text-[var(--ink-1)]' : 'font-medium')}
        style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
      >
        {row.getValue('title')}
      </span>
    ),
    ```

    **Price column:** header pattern + cell:
    ```tsx
    cell: ({ row }) => {
      const price = row.getValue('price') as number
      return (
        <span
          className={cn('text-right', v2 && 'text-[13px] text-[var(--ink-1)]')}
          style={v2 ? { fontFamily: 'var(--font-mono)', fontWeight: 500 } : undefined}
        >
          {formatPrice(price)}
        </span>
      )
    },
    ```

    **is_active column (lines 111–123) — CRITICAL D-DASH-15:** Reemplazar el `<Badge variant>` con `mx-tag` editorial cuando v2:

    ```tsx
    {
      accessorKey: 'is_active',
      header: () => v2 ? (
        <span className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-sans)' }}>
          Estado
        </span>
      ) : 'Estado',
      cell: ({ row }) => {
        const isActive = row.getValue('is_active') as boolean
        if (v2) {
          return (
            <span className={isActive ? 'mx-tag mx-tag--verdigris' : 'mx-tag mx-tag--ink'}>
              {isActive ? 'Activo' : 'Inactivo'}
            </span>
          )
        }
        return (
          <Badge variant={isActive ? 'default' : 'secondary'}>
            {isActive ? 'Activo' : 'Inactivo'}
          </Badge>
        )
      },
      enableSorting: false,
    },
    ```

    Importar `cn` desde `@/lib/utils` si no está importado. Mantener el import de `Badge` (still used cuando flag OFF).

    **Actions dropdown (lines 124–156):** mismo pattern de Task 3:
    - `<Button>` MoreHorizontalIcon: añadir `className={cn('h-8 w-8', v2 && 'hover:bg-[var(--paper-3)] text-[var(--ink-2)] hover:text-[var(--ink-1)]')}`
    - `<DropdownMenuLabel>`: `className={v2 ? 'mx-smallcaps text-[var(--ink-3)]' : ''}`
    - `DropdownMenuItem` "Eliminar" preserva `className="text-destructive"` (cascade ya mapea a rubric-2)

    **DO NOT MODIFY:**
    - `getProducts`, `createProduct`, `updateProduct`, `deleteProduct`, `toggleProductActive` server actions
    - `useRouter`, `RowSelectionState` hooks
    - `<DataTable>`, `<Dialog>`, `<DialogContent>`, `<DialogHeader>`, `<DialogTitle>`, `<DialogDescription>`, `<AlertDialog>` y sus children (D-DASH-09)
    - `<Checkbox>`, `<DropdownMenu>` shared primitives (D-DASH-09)
    - `<ProductForm>`, `productToFormData` (Task 6 cubre el form)
    - `formatPrice` helper
    - `filteredProducts` memo logic, `inactiveCount` calculation
    - Order de columnas
    - `onEdit`, `onDelete`, `onToggleActive` handlers
    - `searchColumn="title"` y `searchValue={search}` props del DataTable (preserva client-side search)
  </action>
  <verify>
    <automated>grep -q "useDashboardV2" 'src/app/(dashboard)/crm/productos/components/products-table.tsx' && grep -q "mx-h3" 'src/app/(dashboard)/crm/productos/components/products-table.tsx' && grep -q "Buscar por título o SKU" 'src/app/(dashboard)/crm/productos/components/products-table.tsx' && grep -q "thead_th\]:bg-\[var(--paper-1)\]" 'src/app/(dashboard)/crm/productos/components/products-table.tsx' && grep -q "v2={v2}" 'src/app/(dashboard)/crm/productos/components/products-table.tsx' && grep -q "v2?: boolean" 'src/app/(dashboard)/crm/productos/components/columns.tsx' && grep -q "mx-tag mx-tag--verdigris" 'src/app/(dashboard)/crm/productos/components/columns.tsx' && grep -q "mx-tag mx-tag--ink" 'src/app/(dashboard)/crm/productos/components/columns.tsx' && grep -q "import { Badge }" 'src/app/(dashboard)/crm/productos/components/columns.tsx' && grep -q "formatPrice" 'src/app/(dashboard)/crm/productos/components/columns.tsx' && npx tsc --noEmit 2>&1 | grep "productos" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "useDashboardV2" 'src/app/(dashboard)/crm/productos/components/products-table.tsx'`.
    - `grep -q "mx-h3" 'src/app/(dashboard)/crm/productos/components/products-table.tsx'` (empty editorial).
    - `grep -q "thead_th\]:bg-\[var(--paper-1)\]" 'src/app/(dashboard)/crm/productos/components/products-table.tsx'` (dictionary-table wrapper D-DASH-11).
    - `grep -q "v2={v2}" 'src/app/(dashboard)/crm/productos/components/products-table.tsx'` (factory recibe flag).
    - `grep -q "mx-tag mx-tag--verdigris" 'src/app/(dashboard)/crm/productos/components/columns.tsx'` (status active D-DASH-15).
    - `grep -q "mx-tag mx-tag--ink" 'src/app/(dashboard)/crm/productos/components/columns.tsx'` (status inactive).
    - `grep -q "import { Badge }" 'src/app/(dashboard)/crm/productos/components/columns.tsx'` (Badge import preservado para flag OFF — Regla 6).
    - `grep -q "formatPrice" 'src/app/(dashboard)/crm/productos/components/columns.tsx'` (helper preservado).
    - File STILL contiene `getProducts`, `createProduct`, `toggleProductActive`, `<DataTable>`, `<Dialog>`, `<AlertDialog>` (Regla 6).
    - `! grep "oklch(" 'src/app/(dashboard)/crm/productos/components/products-table.tsx'`.
    - `npx tsc --noEmit` reports zero errors en los 2 files.
    - Manual: con flag ON, productos table tiene dictionary-table styling + status `mx-tag--verdigris` (verde editorial) o `mx-tag--ink` (negro editorial); con flag OFF, byte-identical (Badge variant=default/secondary).
  </acceptance_criteria>
  <done>Productos editorial cuando v2: search paper-0 + dictionary-table wrapper + mx-tag--verdigris (Activo) / mx-tag--ink (Inactivo) reemplazando Badge + empty mx-h3/mx-caption + button primary press. Cuando flag OFF, byte-identical (Badge shadcn intacto). Build clean.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 5: Re-skin forms (D-DASH-14) — ContactForm + ProductForm con labels mx-smallcaps + submit primary press editorial</name>
  <files>src/app/(dashboard)/crm/contactos/components/contact-form.tsx, src/app/(dashboard)/crm/productos/components/product-form.tsx</files>
  <read_first>
    - src/app/(dashboard)/crm/contactos/components/contact-form.tsx (full 198 LOC — pay attention a labels lines 111, 133, 150, 164, 175 + submit button 191–194)
    - src/app/(dashboard)/crm/productos/components/product-form.tsx (full 203 LOC — pay attention a labels lines 109, 125, 140, 157, 179 + submit button 184–188)
    - src/components/ui/label.tsx + src/components/ui/input.tsx (verifica que aceptan className override)
    - .planning/standalone/ui-redesign-dashboard/CONTEXT.md D-DASH-14 (forms editorial spec)
  </read_first>
  <action>
    Aplicar D-DASH-14 a ambos forms: labels `mx-smallcaps` ink-2 uppercase tracking-0.12em, `<Input>`/`<Textarea>` heredan border ink-1 + paper-0 via cascade (no se modifican), submit button con primary press pattern editorial.

    **Step 1 — `contact-form.tsx`:** Importar `useDashboardV2` + `cn`. Llamar hook al inicio del componente:

    ```typescript
    'use client'
    import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
    import { cn } from '@/lib/utils'
    // ...
    export function ContactForm({ mode, defaultValues, contactId, onSuccess }: ContactFormProps) {
      const v2 = useDashboardV2()
      // ... resto sin cambio hasta el JSX
    ```

    **Labels — re-skin las 5 instancias (lines 111, 133, 150, 164, 175):**

    ```tsx
    <Label
      htmlFor="name"
      className={v2 ? 'mx-smallcaps text-[10px] tracking-[0.12em] uppercase text-[var(--ink-2)]' : ''}
    >
      Nombre *
    </Label>
    ```

    Repetir para `email`, `city`, `department`, `address`. Para el `<PhoneInput>` componente shared (line 125), NO modificar el componente; pero si el component renderea su propio Label internamente, ese se queda sin re-skin (out of scope D-DASH-07; deuda anotada en SUMMARY).

    **Input/Textarea — NO modificar.** Los `<Input>` y `<Textarea>` shadcn ya consumen `--input` (border) y `--background` (bg) que `.theme-editorial` mapea a ink-1 y paper-0. El border ink-1 + bg paper-0 se aplica automáticamente. NO añadir className inline para color (sería redundante y rompería override).

    **Server error block (lines 104–108):** preservar `text-destructive bg-destructive/10` — cascade ya lo mapea a rubric-2.

    **Submit button (lines 190–195):** Editorial primary press cuando v2:

    ```tsx
    <Button
      type="submit"
      disabled={isPending}
      className={v2 ? 'bg-[var(--ink-1)] text-[var(--paper-0)] hover:bg-[var(--ink-2)] shadow-[0_1px_0_var(--ink-1)] border border-[var(--ink-1)]' : ''}
      style={v2 ? { fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '13px', borderRadius: 'var(--radius-3)' } : undefined}
    >
      {isPending && <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />}
      {mode === 'edit' ? 'Guardar cambios' : 'Crear contacto'}
    </Button>
    ```

    **Step 2 — `product-form.tsx`:** Mismo treatment. Importar hook + cn. Re-skinear las 5 labels (lines 109, 125, 140, 157, 179) con className aditivo cuando v2:

    ```tsx
    <Label
      htmlFor="sku"
      className={v2 ? 'mx-smallcaps text-[10px] tracking-[0.12em] uppercase text-[var(--ink-2)]' : ''}
    >
      SKU *
    </Label>
    ```

    El input SKU (line 110–116) preserva `className="font-mono"` (semánticamente correcto para SKU). El precio input (lines 142–149) preserva su lógica `formatPriceInput` + `handlePriceChange` (D-DASH-07).

    El bloque "Producto activo" (lines 170–182) usa `<Checkbox>` + `<Label>`. Re-skinear el Label cuando v2 con `mx-smallcaps` minor variant:

    ```tsx
    <Label
      htmlFor="is_active"
      className={cn('cursor-pointer', v2 && 'text-[12px] font-medium text-[var(--ink-1)]')}
    >
      Producto activo
    </Label>
    ```

    El hint p text-xs muted (line 165–167) cuando v2:
    ```tsx
    <p
      className={cn(v2 ? 'text-[11px] text-[var(--ink-3)]' : 'text-xs text-muted-foreground')}
      style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
    >
      Se llenara automaticamente al sincronizar con Shopify
    </p>
    ```

    **Submit button (lines 184–188):** Mismo primary press pattern:

    ```tsx
    <Button
      type="submit"
      disabled={isPending}
      className={v2 ? 'bg-[var(--ink-1)] text-[var(--paper-0)] hover:bg-[var(--ink-2)] shadow-[0_1px_0_var(--ink-1)] border border-[var(--ink-1)]' : ''}
      style={v2 ? { fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '13px', borderRadius: 'var(--radius-3)' } : undefined}
    >
      {isPending && <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />}
      {mode === 'edit' ? 'Guardar cambios' : 'Crear producto'}
    </Button>
    ```

    **Error messages "text-sm text-destructive" (lines 119, 142, 158, 183 en contact-form; 117, 132, 150 en product-form):** preservar verbatim — cascade ya mapea destructive → rubric-2.

    **DO NOT MODIFY:**
    - `useForm`, `zodResolver`, `contactFormSchema`, `productFormSchema` (D-DASH-07)
    - `createContact`, `updateContactFromForm`, `createProduct`, `updateProduct` server actions
    - `<PhoneInput>` shared component
    - `<Checkbox>`, `<Input>`, `<Textarea>`, `<Button>` shadcn primitives (solo className aditiva al Button submit)
    - `formatPriceInput`, `handlePriceChange` helpers
    - `productToFormData` helper (line 195–203)
    - Form structure, field order, validation logic, error handling (`form.setError`, `setServerError`)
    - `handleSubmit` callback logic
  </action>
  <verify>
    <automated>grep -q "useDashboardV2" 'src/app/(dashboard)/crm/contactos/components/contact-form.tsx' && grep -q "mx-smallcaps" 'src/app/(dashboard)/crm/contactos/components/contact-form.tsx' && grep -q "shadow-\[0_1px_0_var(--ink-1)\]" 'src/app/(dashboard)/crm/contactos/components/contact-form.tsx' && grep -q "useDashboardV2" 'src/app/(dashboard)/crm/productos/components/product-form.tsx' && grep -q "mx-smallcaps" 'src/app/(dashboard)/crm/productos/components/product-form.tsx' && grep -q "shadow-\[0_1px_0_var(--ink-1)\]" 'src/app/(dashboard)/crm/productos/components/product-form.tsx' && grep -q "createContact\|updateContactFromForm" 'src/app/(dashboard)/crm/contactos/components/contact-form.tsx' && grep -q "createProduct\|updateProduct" 'src/app/(dashboard)/crm/productos/components/product-form.tsx' && grep -q "PhoneInput" 'src/app/(dashboard)/crm/contactos/components/contact-form.tsx' && grep -q "formatPriceInput\|handlePriceChange" 'src/app/(dashboard)/crm/productos/components/product-form.tsx' && npx tsc --noEmit 2>&1 | grep -E "contact-form|product-form" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "useDashboardV2" 'src/app/(dashboard)/crm/contactos/components/contact-form.tsx'` y same para `product-form.tsx`.
    - `grep -q "mx-smallcaps" 'src/app/(dashboard)/crm/contactos/components/contact-form.tsx'` y same para product-form (D-DASH-14 labels).
    - `grep -q "tracking-\[0.12em\]" 'src/app/(dashboard)/crm/contactos/components/contact-form.tsx'` (label tracking spec).
    - `grep -q "shadow-\[0_1px_0_var(--ink-1)\]" 'src/app/(dashboard)/crm/contactos/components/contact-form.tsx'` (button primary press).
    - `grep -q "shadow-\[0_1px_0_var(--ink-1)\]" 'src/app/(dashboard)/crm/productos/components/product-form.tsx'`.
    - `grep -q "var(--font-sans)" 'src/app/(dashboard)/crm/contactos/components/contact-form.tsx'` (button font).
    - Files STILL contienen: `useForm`, `zodResolver`, `contactFormSchema`/`productFormSchema`, `createContact`/`createProduct`, `<PhoneInput>` (contact-form), `formatPriceInput` (product-form), `productToFormData` (product-form) — Regla 6 NO-TOUCH.
    - `<Input>` y `<Textarea>` className NO se modifican (heredan via cascade).
    - `! grep "oklch(" 'src/app/(dashboard)/crm/contactos/components/contact-form.tsx'`.
    - `npx tsc --noEmit` reports zero errors en los 2 files.
    - Manual: con flag ON, labels uppercase tracking + submit button ink-1/paper-0; con flag OFF, byte-identical (Label sin className aditivo, Button sin override).
  </acceptance_criteria>
  <done>Forms editorial cuando v2: labels mx-smallcaps tracking-0.12em ink-2 uppercase + submit button primary press ink-1/paper-0. Inputs/Textareas heredan border ink-1 + paper-0 via cascade (NO modificados). Errores destructive cascade a rubric-2. Cuando flag OFF, byte-identical. Build clean.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 6: Re-skin dialogs/sheets sweep (D-DASH-10) — ContactDialog wrapper + CsvImportDialog + CsvExportButton + DuplicateResolver + TagManager con portalContainer aditivo + className internals editorial</name>
  <files>src/app/(dashboard)/crm/contactos/components/contact-dialog.tsx, src/app/(dashboard)/crm/contactos/components/csv-import-dialog.tsx, src/app/(dashboard)/crm/contactos/components/csv-export-button.tsx, src/app/(dashboard)/crm/contactos/components/duplicate-resolver.tsx, src/app/(dashboard)/crm/contactos/components/tag-manager.tsx</files>
  <read_first>
    - src/app/(dashboard)/crm/contactos/components/contact-dialog.tsx (full 61 LOC)
    - src/app/(dashboard)/crm/contactos/components/csv-import-dialog.tsx (full 340 LOC — focus en step headings, tables internas, action buttons)
    - src/app/(dashboard)/crm/contactos/components/csv-export-button.tsx (full 265 LOC — Dialog con form fields)
    - src/app/(dashboard)/crm/contactos/components/duplicate-resolver.tsx (full 224 LOC — pay attention a duplicate cards layout)
    - src/app/(dashboard)/crm/contactos/components/tag-manager.tsx (full 380 LOC — Sheet/Dialog grande con tag list + create/edit/delete)
    - src/components/ui/dialog.tsx (verifica si ya tiene `portalContainer` prop de fase inbox v2; si no, hay que extender — D-DASH-09 aditivo BC)
    - src/components/ui/sheet.tsx (idem para Sheet si tag-manager lo usa)
    - .planning/standalone/ui-redesign-dashboard/CONTEXT.md D-DASH-09 + D-DASH-10
  </read_first>
  <action>
    Tema-respetuoso para 5 dialogs/sheets del módulo CRM. Estrategia general: dialogs usan Radix Portal que renderea fuera del wrapper `.theme-editorial`, por lo que (a) si `Dialog`/`Sheet` aceptan `portalContainer` prop (de fase inbox v2), pasarlo apuntando a `[data-theme-editorial-root]`; (b) si no, agregar prop opcional aditivo BC al primitive (D-DASH-09 — extension aditiva permitida); (c) re-skin internals (titles, descriptions, action buttons) con className aditivos.

    **Step 0 — Verificar primitives ANTES de modificar dialogs:**

    Leer `src/components/ui/dialog.tsx`. Si YA tiene `portalContainer?: HTMLElement | null` prop (de inbox v2 phase), excelente — usar. Si NO, agregar prop aditivo BC:

    ```tsx
    // dialog.tsx — extender DialogPortal y DialogContent para aceptar portalContainer
    function DialogContent({
      className,
      children,
      portalContainer,  // NUEVO — aditivo, opcional
      ...props
    }: React.ComponentProps<typeof DialogPrimitive.Content> & {
      portalContainer?: HTMLElement | null
    }) {
      return (
        <DialogPortal data-slot="dialog-portal" container={portalContainer ?? undefined}>
          <DialogOverlay />
          <DialogPrimitive.Content className={...} {...props}>
            {children}
            {/* ... */}
          </DialogPrimitive.Content>
        </DialogPortal>
      )
    }
    ```

    Mismo para `sheet.tsx` si tag-manager lo usa.

    Si modificar primitive es necesario, agregar a `files_modified` en SUMMARY (deuda conocida para Plan 09 audit). Pero si el primitive YA tiene `portalContainer` (de inbox v2), no se toca.

    **Estrategia simplificada para Plan 02 — RECOMENDADA:** En lugar de modificar primitives ahora, confiar en el cascade global. La forma más segura es:
    - Cuando v2, el `<DialogContent>` recibe className aditivo `bg-[var(--paper-0)] border-[var(--ink-1)] text-[var(--ink-1)]` que se monta encima del default
    - El cascade `--popover` → paper-0 ya viene del wrapper; pero como el portal sale del wrapper, el className inline manual asegura el styling
    - Aceptar como deuda en SUMMARY que el portal renderea fuera del tema y el styling debe ser inline para cada dialog. Plan 09 (DoD sweep) puede consolidar agregando `portalContainer` prop a todos los primitives.

    **Step 1 — `contact-dialog.tsx` (61 LOC, simple wrapper):** Agregar `useDashboardV2` + className aditivo al `<DialogContent>` cuando v2:

    ```tsx
    'use client'
    import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
    import { cn } from '@/lib/utils'
    // ...
    export function ContactDialog({ open, onOpenChange, contact, onSuccess }: ContactDialogProps) {
      const v2 = useDashboardV2()
      const isEditing = !!contact
      return (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent
            className={cn(
              'sm:max-w-[500px]',
              v2 && 'theme-editorial bg-[var(--paper-0)] border-[var(--ink-1)] text-[var(--ink-1)] shadow-[0_2px_0_var(--ink-1)]'
            )}
          >
            <DialogHeader>
              <DialogTitle
                className={v2 ? 'text-[20px] font-bold tracking-[-0.01em] text-[var(--ink-1)]' : ''}
                style={v2 ? { fontFamily: 'var(--font-display)' } : undefined}
              >
                {isEditing ? 'Editar contacto' : 'Nuevo contacto'}
              </DialogTitle>
              <DialogDescription
                className={v2 ? 'mx-smallcaps text-[var(--ink-3)] mt-1' : ''}
              >
                {isEditing ? 'Actualiza la informacion del contacto' : 'Ingresa los datos del nuevo contacto'}
              </DialogDescription>
            </DialogHeader>
            <ContactForm /* unchanged props */ />
          </DialogContent>
        </Dialog>
      )
    }
    ```

    **CRITICAL:** la className `'theme-editorial'` añadida al DialogContent es la que activa el cascade DENTRO del portal — esto cubre la deuda del portal renderizando fuera del wrapper layout. Esto es el patrón D-DASH-10 implementado pragmáticamente sin tocar primitives.

    **Step 2 — `csv-import-dialog.tsx`:** Re-leer el file completo (340 LOC) para entender steps. Aplicar mismo pattern al `<DialogContent>`:

    ```tsx
    <DialogContent className={cn('...current classes...', v2 && 'theme-editorial bg-[var(--paper-0)] border-[var(--ink-1)] text-[var(--ink-1)]')}>
    ```

    Para internals (steps, tables, action buttons), aplicar className aditivos cuando v2:
    - Step headings (h3 etc.) → className `font-display text-[18px] font-bold` cuando v2 (style font-display)
    - Step descriptions → className `mx-smallcaps text-[var(--ink-3)]` cuando v2
    - Action buttons (Cancelar, Importar, Continuar): outline ink-1 (Cancelar), primary editorial press (Importar)
    - Tables internas (preview rows): heredan via cascade del `theme-editorial` className en DialogContent

    Esfuerzo estimado: aplicar className conditional a 6-8 elementos clave (headings + buttons). NO refactorizar lógica de upload, parse, validation, dispatch — solo styling override aditivo. NO modificar `parseCSV`, `importContactsFromCSV`, dispatch handlers.

    **Step 3 — `csv-export-button.tsx`:** Mismo pattern. Es un button + Dialog. El button trigger:

    ```tsx
    <Button
      variant="outline"
      size="sm"
      onClick={...}
      className={v2 ? 'border-[var(--ink-1)] bg-[var(--paper-0)] text-[var(--ink-1)] hover:bg-[var(--paper-3)] shadow-[0_1px_0_var(--ink-1)]' : ''}
    >
      <Download className="h-4 w-4 mr-2" />
      Exportar
    </Button>
    ```

    Y el `<DialogContent>` interno (selección de columnas + format) aplica `theme-editorial` className aditivo cuando v2.

    **Step 4 — `duplicate-resolver.tsx`:** Es probablemente otro Dialog/Modal con cards de duplicados side-by-side. Cuando v2:
    - Cards de duplicados → wrap en `bg-[var(--paper-2)] border border-[var(--ink-1)] rounded-[var(--radius-3)] shadow-[0_1px_0_var(--ink-1)]`
    - Field rows internas → ledger-style: label `mx-smallcaps text-[var(--ink-3)]` + value font-sans 13px ink-1
    - Action buttons (Mantener original / Mantener nuevo / Mergear): outline ink-1 con uno como primary editorial

    NO modificar lógica `resolveDuplicate`, `mergeContacts`, dispatch handlers.

    **Step 5 — `tag-manager.tsx` (380 LOC, Sheet probable):** Mismo pattern. Si usa `<Sheet>`, agregar className aditivo `theme-editorial bg-[var(--paper-0)] border-[var(--ink-1)]` al `<SheetContent>` cuando v2. Tag list rows con dictionary-table styling análogo. Form de crear/editar tag con D-DASH-14 labels mx-smallcaps + submit primary press editorial. Color picker preservado intacto (su lógica es invariante al tema).

    NO modificar `createTag`, `updateTag`, `deleteTag` server actions, ni la lógica de color picker, ni el list refresh.

    **DO NOT MODIFY (Regla 6, D-DASH-07):**
    - Server actions: `createContact`, `updateContact`, `importContactsFromCSV`, `exportContactsToCSV`, `parseCSV`, `resolveDuplicate`, `mergeContacts`, `createTag`, `updateTag`, `deleteTag`, `getTags`
    - Form schemas, validation, error handling
    - File upload logic, FormData construction
    - Step transitions, multi-step wizard state
    - `<ContactForm>` invocation (already re-skinned in Task 5)
    - Color picker component / logic
    - Toast notifications
    - Refresh / router.refresh() calls
    - Primitive shadcn components (Dialog, Sheet, DialogContent, DialogHeader, DialogTitle, DialogDescription) — solo className aditivos opcionales (D-DASH-09)
  </action>
  <verify>
    <automated>grep -q "useDashboardV2" 'src/app/(dashboard)/crm/contactos/components/contact-dialog.tsx' && grep -q "theme-editorial" 'src/app/(dashboard)/crm/contactos/components/contact-dialog.tsx' && grep -q "var(--font-display)" 'src/app/(dashboard)/crm/contactos/components/contact-dialog.tsx' && grep -q "useDashboardV2" 'src/app/(dashboard)/crm/contactos/components/csv-import-dialog.tsx' && grep -q "useDashboardV2" 'src/app/(dashboard)/crm/contactos/components/csv-export-button.tsx' && grep -q "useDashboardV2" 'src/app/(dashboard)/crm/contactos/components/duplicate-resolver.tsx' && grep -q "useDashboardV2" 'src/app/(dashboard)/crm/contactos/components/tag-manager.tsx' && grep -q "ContactForm" 'src/app/(dashboard)/crm/contactos/components/contact-dialog.tsx' && grep -q "createTag\|updateTag\|deleteTag" 'src/app/(dashboard)/crm/contactos/components/tag-manager.tsx' && npx tsc --noEmit 2>&1 | grep -E "contact-dialog|csv-import-dialog|csv-export-button|duplicate-resolver|tag-manager" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - Los 5 files importan y usan `useDashboardV2`.
    - `grep -q "theme-editorial" 'src/app/(dashboard)/crm/contactos/components/contact-dialog.tsx'` (className aditivo en DialogContent — D-DASH-10 mitigation).
    - `grep -q "var(--font-display)" 'src/app/(dashboard)/crm/contactos/components/contact-dialog.tsx'` (DialogTitle serif).
    - Los 5 files contienen aún sus calls/imports originales: `<ContactForm>`, `createTag`/`updateTag`/`deleteTag`, `parseCSV`/`importContactsFromCSV`, `<Dialog>`/`<DialogContent>`, etc. (Regla 6).
    - `! grep "oklch(" 'src/app/(dashboard)/crm/contactos/components/contact-dialog.tsx'`.
    - `npx tsc --noEmit` reports zero errors en los 5 files.
    - Manual: con flag ON, dialogs renderean paper-0 + ink-1 border + headings serif + actions editorial; con flag OFF, byte-identical (className aditivo solo cuando v2).
    - SUMMARY (al cierre del Plan 02) anota como deuda: si el portal sigue renderizando fuera del wrapper layout (verificable visualmente), Plan 09 audit debe extender los primitives `Dialog` y `Sheet` con `portalContainer` prop oficialmente. La mitigación de Plan 02 (`theme-editorial` className en DialogContent) debe ser suficiente para la coherencia visual.
  </acceptance_criteria>
  <done>5 dialogs/sheets del CRM con portal-aware editorial styling cuando v2: DialogContent recibe `theme-editorial` className aditivo + bg/border editorial + DialogTitle serif + actions primary press / outline ink-1. Cuando flag OFF, byte-identical. Lógica intacta (parseCSV, importContacts, createTag, mergeContacts). Build clean. Deuda Plan 09: portalContainer prop oficial en primitives.</done>
</task>

</tasks>

<verification>
After all 6 tasks:

1. `npx tsc --noEmit 2>&1 | grep -E "src/app/\(dashboard\)/crm/(contactos|productos|page)" | (! grep -E "error|Error")` returns 0.

2. Manual smoke con flag ON (`UPDATE workspaces SET settings = settings || '{"ui_dashboard_v2":{"enabled":true}}' WHERE id='<test-workspace>'`):
   - Visita `/crm/contactos` → topbar editorial: eyebrow rubric-2 'Módulo · crm', h1 EB Garamond 'Contactos — libro de clientes', botón 'Nuevo contacto' ink-1 primary press
   - Search input con paper-0 bg + border ink-3 + icono Search left-10
   - Tag chips outline ink-3 (inactive) → bg ink-1 + paper-0 (active)
   - Tabla con `<table>` border ink-1 + thead bg paper-1 + th smallcaps tracking-0.08em + td font-sans 13px ink-1 + hover row paper-2
   - Phone column en mono ink-2; Updated_at en mono ink-3; Tag overflow `+N` editorial mx-tag--ink
   - Crear contacto → dialog paper-0 con border ink-1 + DialogTitle serif + form labels uppercase smallcaps + submit ink-1/paper-0
   - Bulk-actions con `bg-paper-2 border-ink-1` + delete button outline rubric-2
   - Detail page `/crm/contactos/[id]` → header serif + tabs underline ink-1 (active) / transparent (inactive)
   - Visita `/crm/productos` → mismos patterns; estado columna `mx-tag--verdigris` (Activo) / `mx-tag--ink` (Inactivo)
   - Empty state contactos (sin contactos creados) → mx-h3 'No hay contactos.' + mx-caption + mx-rule-ornament '· · ·' + button primary editorial

3. Con flag OFF: visual diff vs current main muestra ZERO change en los 18 files. Tabla shadcn slate, Badge default/secondary, Dialog default sin override, etc.

4. Git diff de archivos fuera de scope (lib/, hooks/, actions/, inngest/, agents/, types/, src/components/contacts/tag-badge.tsx, src/components/ui/dropdown-menu.tsx, src/components/ui/dialog.tsx — a menos que Step 0 de Task 6 demande extender primitives, en cuyo caso anotado como deuda): zero changes (Regla 6 verifiable).

5. axe-core scan en `/crm/contactos` (flag ON): no NEW serious/critical violations introduced (baseline diff). Tab order preservado.

6. Verificar que Plan 03 (Pedidos) NO toca files de scope Plan 02 (verificar `files_modified` en `.planning/standalone/ui-redesign-dashboard/03-PLAN.md` cuando se cree — todos los `crm/pedidos/**` son disjoint de los 18 files de este plan).
</verification>

<success_criteria>
- Las 6 tasks pasan automated verify.
- Build is clean (`npx tsc --noEmit` zero errors).
- Con flag ON, los 3 paths CRM (`/crm/contactos`, `/crm/productos`, `/crm/contactos/[id]`) match el mock crm.html (D-DASH-08): topbar editorial + dictionary-table + mx-tag status + forms con labels smallcaps + dialogs paper-0/ink-1.
- Con flag OFF, los 18 files renderean DOM byte-identical al base commit (Regla 6).
- Cero cambios funcionales: server actions, hooks, business logic, validation, dispatch handlers preservados (D-DASH-07).
- Pedidos (Plan 03) puede ejecutarse en paralelo sin conflicto (files disjoint).
- Deuda anotada en SUMMARY si Step 0 Task 6 detecta primitives sin portalContainer prop (Plan 09 audit lo cierra).
</success_criteria>

<output>
After completion, create `.planning/standalone/ui-redesign-dashboard/02-SUMMARY.md` with:
- Commits (1 per task, atomic, mensaje descriptivo en español, Co-authored-by Claude — Regla code-changes.md)
- Pixel-diff vs mock crm.html para los 3 paths re-skineados (link a screenshots si producidos)
- Confirmación de las 18 files modificadas (lista completa)
- Confirmación de los grep checks (todos los acceptance_criteria automated verify)
- Lista de helpers/server actions/primitives que NO se tocaron (Regla 6 verifiable)
- Cualquier deuda detectada:
  - ¿Primitive Dialog/Sheet ya tenía `portalContainer` prop de inbox v2 phase, o se necesita extender? (Plan 09 audit)
  - ¿`<TagBadge>` shared component renderea bien dentro del tema, o requiere refactor en plan separado?
  - ¿`<PhoneInput>` shared component label se ve mal cuando v2?
- Handoff a Wave 2: CRM listing/forms/dialogs done; Pedidos (Plan 03) y Tareas (Plan 04) corren en paralelo. Las decisiones de patterns (dictionary-table wrapper override, mx-tag para status, primary press button, theme-editorial className en DialogContent) son referencia para Plans 03–08.
</output>
</content>
</invoke>