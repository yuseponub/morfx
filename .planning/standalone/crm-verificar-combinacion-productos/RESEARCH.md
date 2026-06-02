# Standalone — CRM Verificar Combinacion de Productos — Research

**Researched:** 2026-04-16
**Domain:** Cross-cutting anti-error protection across 4 shipping-guide generation flows (Coord robot + Excel + 2 PDF carriers)
**Confidence:** HIGH (4 flows fully mapped in code + package versions confirmed + schema verified)

## Summary

The 4 guide-generation flows all entry via server actions in `src/app/actions/comandos.ts` (single file, 4 explicit export functions). Each flow instantiates an Inngest event that eventually calls a generator in `src/lib/pdf/`. The generators use **pdfkit 0.17.2** (layout) + **bwip-js 4.8.0** (barcodes) for the PDF path, and **exceljs 4.4.0** for the Excel path. The Claude-AI normalizer (`normalize-order-data.ts`) is the shape-translation layer between the raw DB rows and the generators' input types.

**Critical structural gap discovered:** Both domain queries that feed these flows (`getOrdersByStage` and `getOrdersForGuideGeneration`) currently select ONLY `order_products(quantity)` — they DO NOT load `sku` or `title`. Without widening those `SELECT` statements, `detectOrderProductTypes(...)` can never classify anything because it receives an empty shape `{ quantity }` per product. This is the **first plannable task** and must happen before any flow-level behavior can be applied.

**Primary recommendation:** Wave 1 = helpers in `product-types.ts` + widen the 2 domain SELECTs to include `sku, title`. Wave 2 = parallel (Coord filter message vs Excel row-fill+column). Wave 3 = PDF visual section shared between Inter and Bogota. Zero new npm packages. Zero schema migration.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**1. Flag rule (locked):**
- **Safe (no flag):** `detectOrderProductTypes(order.products) === ['melatonina']` — pure Elixir.
- **Flag (everything else):** only Magnesio Forte / only Ash / Elixir + Magnesio Forte / Elixir + Ash / any combo with Ash / orders with empty classification `[]` (treated as flag by precaution).

**2. Display labels (locked):**
- Type `'melatonina'` → **ELIXIR**
- Type `'ash'` → **ASHWAGANDHA**
- Type `'magnesio_forte'` → **MAGNESIO FORTE**

**3. Per-flow behavior (locked):**
- **Coord:** server-side FILTER flag orders out before creating the robot job; informative message in `/comandos` listing rejected orders.
- **Excel Envia:** all orders go through, but flag orders get YELLOW row fill + new "COMBINACIÓN" (or equivalent) column filled with labels, empty for safe orders.
- **PDF Inter + Bogota (shared generator):** NEW visual section between logo and recipient address, ONLY rendered when order is flag. Safe orders render identically to today (zero regression).

**4. Central helpers in `src/lib/orders/product-types.ts`:**
- `isSafeForCoord(types: ProductType[]): boolean` — true only if `types.length === 1 && types[0] === 'melatonina'`.
- `isMixedOrder(types: ProductType[]): boolean` — `!isSafeForCoord(types)`, treats `[]` as mixed.
- `formatProductLabels(types: ProductType[]): string` — uppercase labels joined by " + ", ordered per `PRODUCT_TYPE_ORDER`. `[]` → `"SIN CLASIFICAR"`.

**5. Workspace scope:** apply globally, no explicit workspace filter. Other workspaces don't match SKUs → classified `[]` → treated as flag. Mitigation: only Somnio triggers these commands in practice.

**6. Execution order (locked waves):**
- Wave 1: helper extensions (unit-testable).
- Wave 2 (parallel, 2 plans): Coord filter + Excel row-fill+column.
- Wave 3: PDF shared visual section.

### Claude's Discretion
- Exact visual format of PDF section (box size, border color, typography, whether to include icon).
- Exact format of Coord rejection message (per-order vs count-aggregated).
- Exact column name in Excel ("COMBINACIÓN" vs "PRODUCTOS" vs "TIPO" vs "MIX").
- Order of labels in mix strings (proposed: follow `PRODUCT_TYPE_ORDER` which is melatonina → ash → magnesio_forte).

### Deferred Ideas (OUT OF SCOPE)
- Modal interactive confirmation before Coord dispatch (silent filter + message for now).
- Persist `is_mixed` flag in DB column `orders.is_mixed`.
- Per-workspace UI configuration of safe combos.
- Dashboard alerts when Shopify/WhatsApp creates flag orders.
- Extending to CSV export flow.
- Touching the Railway robot itself.

## Entry-Point Map

All 4 flows dispatch through `src/app/actions/comandos.ts`. The chat commands are `.toLowerCase()`-normalized matched in `comandos-layout.tsx`.

| Flow | Chat command | Server action | File:line | Inngest event |
|------|-------------|---------------|-----------|---------------|
| Coord (robot) | `subir ordenes coord` | `executeSubirOrdenesCoord` | `src/app/actions/comandos.ts:173` | `robot/job.submitted` |
| PDF Inter | `generar guias inter` | `executeGenerarGuiasInter` | `src/app/actions/comandos.ts:709` | `robot/pdf-guide.submitted` (carrierType='inter') |
| PDF Bogota | `generar guias bogota` | `executeGenerarGuiasBogota` | `src/app/actions/comandos.ts:817` | `robot/pdf-guide.submitted` (carrierType='bogota') |
| Excel Envia | `generar excel envia` | `executeGenerarExcelEnvia` | `src/app/actions/comandos.ts:925` | `robot/excel-guide.submitted` |

**UI wire-up** — chat command dispatcher is `handleCommand` in `src/app/(dashboard)/comandos/components/comandos-layout.tsx:507, 634, 653, 672` (4 `if (normalized === '…')` branches). Result messages added via `addMessage(...)` with types `'system' | 'error' | 'warning'` (see `CommandMessage` discriminated union at `comandos-layout.tsx:48-143`).

**Note on robot orchestrator (referenced, NOT modified):**
- `src/inngest/functions/robot-orchestrator.ts:44-97` — Coord orchestrator body (consumes `robot/job.submitted`). The filter happens BEFORE the event is sent, not here.
- `src/inngest/functions/robot-orchestrator.ts:704-857` — PDF orchestrator body (Inter+Bogota share event + handler, branch by `carrierType`). Calls `normalizeOrdersForGuide` at line 742, `generateGuidesPdf` at line 759.
- `src/inngest/functions/robot-orchestrator.ts:876-966+` — Excel orchestrator body. Calls `normalizeOrdersForGuide` at line 938, `generateEnviaExcel` at line 946.

## Standard Stack

### Core (already installed, versions from `package.json`)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `pdfkit` | ^0.17.2 | PDF layout (Inter + Bogota guides) | Already used in `generate-guide-pdf.ts`; low-level primitive API fits the 4x6-inch label format. Has `@types/pdfkit`. |
| `bwip-js` | ^4.8.0 | Code128 barcode images embedded in PDF | Already used at `generate-guide-pdf.ts:23` via `bwip-js/node`. |
| `exceljs` | ^4.4.0 | Excel generation with cell/row styling | Already used in `generate-envia-excel.ts`. Supports row-level `.fill` (applies to existing + new cells) and per-cell `.fill`. |
| `@anthropic-ai/sdk` | (present) | Claude normalization of messy CRM data → guide-ready shape | Already in `normalize-order-data.ts`. |
| Inngest + Supabase Storage | (present) | Orchestration + delivery | All 4 flows already integrated. |

### Supporting
None new. This phase is purely additive code on top of existing stack.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Widening `getOrdersByStage`/`getOrdersForGuideGeneration` SELECTs | A new domain function `getOrderProductsForClassification(orderIds)` that joins after the fact | Extra DB roundtrip. Current 2-query pattern already batches tags — extending the existing main SELECT is cheaper and matches the pattern. |
| Per-cell iteration for yellow row fill in Envia Excel | `sheet.getRow(n).fill = {...}` single assignment | Row-level is 1 LoC per row and propagates to new cells. Chosen as standard. [VERIFIED: exceljs docs/github issue #596] |
| PDFKit `rect().fillAndStroke()` for flag section | External PDF component library | Generator is already primitive-level; adding ~15 lines inline keeps style idiom consistent. |

**Installation:** Zero new packages. All versions verified in `package.json`.

**Version verification:** Ran `grep '"pdfkit"|"bwip-js"|"exceljs"' package.json` → `pdfkit ^0.17.2`, `bwip-js ^4.8.0`, `exceljs ^4.4.0`, plus `@types/pdfkit ^0.17.5`. Versions match what generator code currently imports. [VERIFIED: codebase grep]

## Architecture Patterns

### System Architecture Diagram

```
User types chat command
        │
        ▼
comandos-layout.tsx (handleCommand switch) ──► calls server action
        │
        ▼
comandos.ts (server action, 4 entry points)
        │
        ├── [auth + stage config + active-job check]
        │
        ├── calls getOrdersByStage / getOrdersForGuideGeneration  ◄── DOMAIN (Regla 3)
        │                          │                                    │
        │                          │        ┌───────────────────────────┘
        │                          │        │
        │                          ▼        ▼
        │                    ┌─────────────────────────────┐
        │                    │  *** NEW FILTER POINT ***   │  ◄── Wave 2 Coord plan only
        │                    │  types = detectOrderProductTypes(order.products)  │
        │                    │  isSafeForCoord(types) ?    │
        │                    │    → flow                   │
        │                    │    → rejected[]             │
        │                    └─────────────────────────────┘
        │
        ├── createRobotJob()                ◄── DOMAIN
        │
        └── await inngest.send({event, data: { items, [orderIds with typesMap] }})
                    │
                    ▼
        Inngest event triggers orchestrator (robot-orchestrator.ts)
                    │
                    ├── [Coord]    HTTP → Railway robot (UNCHANGED)
                    │
                    └── [PDF/Excel] step.run('fetch-orders')
                                   → step.run('normalize-data')  [Claude AI]
                                   → step.run('generate-and-upload')
                                       │
                                       ├── generateGuidesPdf(normalized [+ flaggedMap]) ──► pdfkit renders section
                                       └── generateEnviaExcel(enviaData [+ flaggedMap]) ──► exceljs applies row fill
```

### Recommended Project Structure
No new directories. Existing structure preserved:
```
src/
├── lib/orders/product-types.ts   # EXTEND — new helpers + display labels
├── app/actions/comandos.ts       # MODIFY — filter in Coord; propagate types in other 3
├── lib/domain/orders.ts          # MODIFY — widen 2 SELECTs to include sku, title
├── lib/pdf/
│   ├── types.ts                  # MODIFY — GuideGenOrder.products gains sku + title; add productTypes optional on NormalizedOrder
│   ├── normalize-order-data.ts   # MODIFY — passthrough productTypes into NormalizedOrder; pass through to EnviaOrderData
│   ├── generate-guide-pdf.ts     # MODIFY — conditional section between logo + recipient address
│   └── generate-envia-excel.ts   # MODIFY — yellow row fill when flag + new column
└── inngest/functions/robot-orchestrator.ts  # MODIFY (minor) — propagate productTypes through the step.run mapping; no event shape change required if types are re-derived in the step
```

### Pattern 1: Filter rejected orders with informative chat message (Coord flow)
**What:** Before `createRobotJob(...)`, split orders into `validForCoord` and `rejectedByCombination`, send only valid ones to Inngest, and return `rejectedByCombination` in the `CommandResult` for the UI to render as a `warning` message.

**Why this pattern:** `executeSubirOrdenesCoord` already has 2 precedents doing exactly this kind of split — city-validation rejects (`invalidCityResults`, line 234) and COD rejects (`codRejected`, line 269). The new combination-rejection list slots into the same return shape. The UI already renders similar lists as `type: 'warning'` messages (see `aiResolvedOrders`, line 533).

**Example (structure, not final code):**
```typescript
// src/app/actions/comandos.ts — inside executeSubirOrdenesCoord
// AFTER getOrdersByStage, BEFORE validateCities (or after — either works;
// recommend AFTER city validation so we don't reject on combination an order
// that would already be rejected for city reasons)

const rejectedByCombination: Array<{
  orderId: string
  orderName: string | null
  products: string  // e.g. "ELIXIR + ASHWAGANDHA"
  reason: string    // canned message
}> = []

const validForCoord: OrderForDispatch[] = []

for (const order of orders) {
  const types = detectOrderProductTypes(order.products)
  if (isSafeForCoord(types)) {
    validForCoord.push(order)
  } else {
    rejectedByCombination.push({
      orderId: order.id,
      orderName: order.name ?? null,
      products: formatProductLabels(types),
      reason: `No hay stock de ${formatProductLabels(types)} en la bodega de Coordinadora. Usa Envía/Inter/Bogotá.`,
    })
  }
}

// rest of flow operates on validForCoord only
// return includes rejectedByCombination so UI can render a warning message
```

**UI side** — add a new branch to the `CommandMessage` union (or reuse `type: 'warning'` with a different `title` + `items` shape adjusted). Then in `handleCommand` after success response:
```typescript
if (data.rejectedByCombination.length > 0) {
  addMessage({
    type: 'warning',
    title: `${data.rejectedByCombination.length} órdenes NO se enviaron a Coordinadora:`,
    items: data.rejectedByCombination.map(r => ({
      orderName: r.orderName,
      originalCity: r.products,   // reuse existing field names OR extend the union
      resolvedCity: '',           // (planner decides whether to extend discriminated union)
      department: '',
      reason: r.reason,
    })),
    timestamp: now(),
  })
}
```
**Planner decision:** whether to extend the existing `type: 'warning'` union with an optional `products` field, or create a new discriminated variant (e.g. `type: 'combination_warning'`). Recommend extending the union variant to keep a single list-rendering component in `command-output.tsx`.

### Pattern 2: Yellow row fill + new column in ExcelJS
**What:** After `sheet.addRow(order)`, check `order.isMixed` (new field threaded via `normalizedToEnvia`) and apply `sheet.getRow(rowIdx).fill = {...}` if true.

**When to use:** for every order row, but conditionally styled.

**Example:**
```typescript
// src/lib/pdf/generate-envia-excel.ts
// Source: exceljs docs — row.fill propagates to existing + new cells
// https://deepwiki.com/exceljs/exceljs/2.4-styles-and-formatting

sheet.columns = [
  { header: 'Valor', key: 'valor', width: 12 },
  { header: 'Nombre', key: 'nombre', width: 30 },
  { header: 'Telefono', key: 'telefono', width: 15 },
  { header: 'Direccion', key: 'direccion', width: 40 },
  { header: 'Municipio', key: 'municipio', width: 20 },
  { header: 'Departamento', key: 'departamento', width: 18 },
  { header: 'COMBINACION', key: 'combinacion', width: 30 }, // NEW
]

// header styling block unchanged

for (const order of orders) {
  const row = sheet.addRow({
    ...order,
    combinacion: order.isMixed ? order.productLabels : '',  // empty for safe
  })
  if (order.isMixed) {
    row.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFF59D' }, // soft yellow; tune with user. 8-digit ARGB: alpha+RGB.
    }
  }
}
```

**Gotcha (verified):** ARGB string is 8 hex digits (alpha + RGB). `'FFFF00'` (6 digits) is 6-digit and interpreted differently across ExcelJS versions — always use 8 digits (e.g. `'FFFFFF00'` for solid yellow with full alpha). [CITED: github.com/exceljs/exceljs discussions #1658]

### Pattern 3: Conditional section between logo and address in PDFKit
**What:** Between the logo render (`generate-guide-pdf.ts:76-86`) and the first separator (line 89), insert a conditional block when the order is flagged. Draw a rectangle (`doc.rect(x, y, w, h).fillAndStroke(fillColor, strokeColor)`), then reset `fillColor` and render centered bold text inside it. Advance `y` by the section height.

**When to use:** ONLY when `order.isMixed === true`. Safe orders (Elixir-only) skip the section entirely so layout is identical to today.

**Example:**
```typescript
// src/lib/pdf/generate-guide-pdf.ts
// Source: PDFKit docs pdfkit.org/docs/vector.html + pdfkit.org/docs/text.html

// after logo block (~line 86), before drawSeparator (~line 89)
if (order.isMixed && order.productLabels) {
  const boxH = 28
  const boxY = y
  doc
    .save()
    .rect(MARGIN, boxY, CONTENT_W, boxH)
    .fillAndStroke('#FFF4E5', '#ff751f')  // light orange fill, Ashwagandha-orange border
    .restore()

  doc
    .fillColor('#B45309')  // darker orange text, must be reset AFTER fillAndStroke (Pitfall 4)
    .fontSize(11)
    .font('Helvetica-Bold')
    .text(`COMBINACIÓN: ${order.productLabels}`, MARGIN, boxY + 9, {
      align: 'center',
      width: CONTENT_W,
    })
  y += boxH + 6
  doc.fillColor('#000000') // restore default for downstream draws
}
```
[CITED: github.com/foliojs/pdfkit issue #203 — fillColor must be reset after fillAndStroke because PDFKit state shares fill color across vector + text ops]

### Anti-Patterns to Avoid

- **Re-computing types in Inngest after it was computed in server action:** DO the classification once — in the server action OR in the Inngest `fetch-orders` step. Do not compute twice, diverging sources of truth. Recommend: classify in Inngest after `fetch-orders` (so types are based on the same snapshot the generators see), EXCEPT for Coord where the filter MUST be in the server action (can't send flagged orders to the robot at all).
- **Mutating existing event shape in a breaking way:** `robot/pdf-guide.submitted` and `robot/excel-guide.submitted` are typed in `src/inngest/events.ts:620, 637`. Don't need to change them — `productTypes` are derived inside the orchestrator from the fetched orders. Keeping event shape intact avoids a deploy-ordering risk (in-flight events would fail type-check).
- **Putting `isMixed` inside `NormalizedOrder` as required:** make it **optional** to avoid invalidating prior Inngest step cache keys or breaking the Claude prompt fallback shape. Claude doesn't need to know about it — we set it post-normalization.
- **Using Tailwind-scoped classes in PDF/Excel code:** these are Node-side generators — hex colors + inline style only, same pattern as `PRODUCT_TYPE_COLORS.dotColor` in the existing `product-types.ts`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Classify product → type | Re-implement SKU matcher per flow | `detectOrderProductTypes(order.products)` from `src/lib/orders/product-types.ts` (already exists, prior phase) | Single source of truth. Handles SKU normalization + title fallback + dedupe + stable ordering. |
| Format labels "A + B + C" | `types.map(t => upper(t)).join(' + ')` inline 4 times | NEW `formatProductLabels(types)` — central helper | Consistent ordering per `PRODUCT_TYPE_ORDER`. One place to change copy if labels ever rename. |
| Row fill in Excel | Manual `row.eachCell((c) => c.fill = ...)` | `sheet.getRow(n).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '…' } }` | Row-level assignment propagates to existing + future cells. [CITED: exceljs docs / github #596] |
| Reject-with-reason list UI in chat | New component per flow | Reuse / extend `CommandMessage` `type: 'warning'` variant already at `comandos-layout.tsx:130-141` | Renderer already exists in `command-output.tsx`. Add field if needed; don't add a new message type if an existing one fits. |
| PDF text-in-box | Layout from scratch | `doc.rect(...).fillAndStroke(...)` + explicit `fillColor(...)` before text | Existing generator is primitive-level; 1 rect + 1 text call = ~10 LoC. Preserves layout idiom. |

**Key insight:** every problem in this phase has a precedent in the existing codebase (city-rejection list, header row fill, logo positioning). The research boils down to: locate the precedent, then replicate its pattern.

## Project Constraints (from CLAUDE.md)

| Rule | Applies How |
|------|-------------|
| REGLA 0 (GSD completo) | This RESEARCH.md is step 3 of the process. |
| REGLA 1 (Push a Vercel) | After each wave's commits. |
| REGLA 3 (Domain layer) | **APPLIES PARTIALLY.** Widening `getOrdersByStage`/`getOrdersForGuideGeneration` SELECTs = domain-layer edit. The filter itself in `comandos.ts` is input-filtering, not mutation — acceptable outside domain. No new domain function needed. |
| REGLA 4 (Docs al dia) | Update `docs/analysis/04-estado-actual-plataforma.md` section "Logística / Guías" on completion. Append LEARNINGS to standalone dir. |
| REGLA 5 (Migración antes de deploy) | **DOES NOT APPLY** — no schema change. |
| REGLA 6 (Proteger agente en producción) | **DOES NOT APPLY** — this phase touches guide-generation paths only, not agent runtime. |

## Runtime State Inventory

Rename/refactor checklist does not apply — this is an additive feature phase (new helpers + new behavior, no string rebrand).

- **Stored data:** none. No DB schema change. `order_products.sku` + `order_products.title` already exist (verified at `src/lib/domain/orders.ts:830-834`). We merely widen SELECT statements.
- **Live service config:** none.
- **OS-registered state:** none.
- **Secrets/env vars:** none.
- **Build artifacts:** none — purely source changes.

## Common Pitfalls

### Pitfall 1: Missing sku/title in order products payload (CRITICAL, must fix in Wave 1)
**What goes wrong:** `detectOrderProductTypes([{ quantity: 1 }])` returns `[]` for EVERY order. Every single order in every flow becomes flagged. Excel has yellow everywhere; PDF shows the section on every guide; Coord rejects every order.
**Why it happens:** `src/lib/domain/orders.ts:1254` and `:1399` select `order_products(quantity)` only — no `sku`, no `title`. `detectProductType` requires these fields.
**How to avoid:** In Wave 1, widen both SELECTs to `order_products(sku, title, quantity)`. Update `OrderForDispatch.products` and `OrderForGuideGen.products` types from `Array<{ quantity: number }>` to `Array<{ sku: string | null; title: string | null; quantity: number }>`. Update the `.map()` at :1297 and :1450 accordingly. Update `GuideGenOrder.products` in `src/lib/pdf/types.ts:11` in lockstep (types flow to normalizer call sites in Inngest at lines 738, 934).
**Warning signs:** unit test `isMixedOrder([])` returns true. If manually verify in prod shows 100% of orders flagged, this wasn't done.
**Confidence:** HIGH. Grepped both files; selects are literal strings, easy to verify.

### Pitfall 2: PDFKit fill color state leak after fillAndStroke
**What goes wrong:** After `doc.rect(...).fillAndStroke('#FFF4E5', '#ff751f')`, the internal fill color is now `#FFF4E5` (the box background). If you call `doc.text(...)` without first calling `doc.fillColor('…')`, the text renders invisible (same color as box).
**Why it happens:** PDFKit's graphics state shares `fillColor` between vector and text ops. Documented in issue #203.
**How to avoid:** Always call `doc.fillColor('<textColor>')` BEFORE `doc.text(...)` inside the conditional block, and reset to `'#000000'` after (downstream `font()` / `text()` calls assume black).
**Warning signs:** box renders but text is blank in the PDF. [CITED: github.com/foliojs/pdfkit issue #203]

### Pitfall 3: ExcelJS ARGB string format
**What goes wrong:** `fgColor: { argb: 'FFFF00' }` may render differently than `fgColor: { argb: 'FFFFFF00' }` — the former is 6 digits (treated as RGB + implicit alpha) while ExcelJS docs expect 8 digits (AARRGGBB).
**Why it happens:** ARGB is 4 bytes; when you pass only 3 bytes it pads either at the front or the back, inconsistent behavior across versions.
**How to avoid:** Always use 8 hex digits. Yellow solid = `'FFFFFF00'` (opaque) or `'FFFFF59D'` (opaque soft yellow).
**Warning signs:** cell highlight looks faded or transparent. [CITED: exceljs discussions #1658]

### Pitfall 4: Event shape changes invalidating in-flight Inngest jobs
**What goes wrong:** if you add `productTypes` to `robot/pdf-guide.submitted` payload schema in `events.ts`, Inngest events already queued at deploy time fail type-check when consumed.
**Why it happens:** Inngest does not re-validate old events against new schemas; they deserialize raw but downstream typed access crashes.
**How to avoid:** Do NOT change event shape. Derive `productTypes` INSIDE the orchestrator, right after `step.run('fetch-orders')`, since orders are re-fetched from the DB there anyway. Coord flow is an exception — the filter happens BEFORE the event is sent, so only valid orders go to the event; the event shape stays identical.
**Warning signs:** Inngest dashboard shows errors like "Cannot read property 'productTypes' of undefined" for old events. This must be avoided.

### Pitfall 5: Normalize step fallback loses productTypes
**What goes wrong:** When Claude API fails, `buildFallbackOrder` (line 81 of `normalize-order-data.ts`) constructs a `NormalizedOrder` with default fields but doesn't know about `productTypes`/`isMixed`.
**Why it happens:** fallback is a safety net that builds from raw `GuideGenOrder` — if productTypes/isMixed aren't computed in the fallback path, flag orders silently render without the visual section.
**How to avoid:** Compute `productTypes` + `isMixed` OUTSIDE `normalizeOrdersForGuide` — i.e. in the orchestrator after both the fetch and normalize steps, by matching on `orderId`. Alternative: thread `productTypes` / `isMixed` through `GuideGenOrder` input and have both the Claude-success branch AND the fallback branch carry it forward.
**Recommendation:** post-normalize enrichment in the orchestrator is cleaner — types aren't Claude's concern, they're a deterministic derivation.

### Pitfall 6: Per-cell fill overrides row fill
**What goes wrong:** ExcelJS header row currently uses `headerRow.eachCell((cell) => { cell.fill = ... })` (line 39 of `generate-envia-excel.ts`). If you then set `sheet.getRow(1).fill = ...`, the cell-level fill wins for existing cells but not for cells added later. Inconsistent.
**Why it happens:** row-level `.fill` is the default for cells that don't have their own; per-cell `.fill` is explicit and wins.
**How to avoid:** keep the header row using per-cell iteration (don't change it). Apply row-level `.fill` ONLY to data rows (index >= 2), which are added by `sheet.addRow(...)` without per-cell fill — row-level then propagates cleanly.
**Warning signs:** yellow applies to 6 columns but not the new "COMBINACIÓN" column if you're not careful.

## Code Examples

Verified patterns from codebase + official sources.

### Example 1: Product type detection (already exists, prior phase)
```typescript
// src/lib/orders/product-types.ts — existing
import { detectOrderProductTypes } from '@/lib/orders/product-types'

const types = detectOrderProductTypes(order.products)  // e.g. ['melatonina', 'ash']
```
Note `order.products` must contain `{ sku, title, quantity }` — see Pitfall 1.

### Example 2: Domain-layer SELECT widening (Wave 1 prerequisite)
```typescript
// src/lib/domain/orders.ts — inside getOrdersByStage (line ~1254)
const { data, error } = await supabase
  .from('orders')
  .select(
    'id, name, contact_id, shipping_address, shipping_city, shipping_department, ' +
    'total_value, custom_fields, contacts(name, phone, email), ' +
    'order_products(sku, title, quantity)'   // <-- was: order_products(quantity)
  )
  .eq('workspace_id', ctx.workspaceId)
  .eq('stage_id', stageId)

// Update mapping (line ~1284):
const products = (row.order_products as unknown as Array<{
  sku: string | null; title: string | null; quantity: number
}>) ?? []
return {
  // …
  products: products.map((p) => ({
    sku: p.sku ?? null,
    title: p.title ?? null,
    quantity: p.quantity,
  })),
  // …
}
```
Same shape change applies to `getOrdersForGuideGeneration` at `src/lib/domain/orders.ts:1399`.

### Example 3: Existing rejection-list pattern to mimic
```typescript
// src/app/actions/comandos.ts — line 269, existing COD rejection
const codRejected: Array<{ orderId: string; orderName: string | null; reason: string }> = []
// …
if (wouldBeCod && !cityResult.supportsCod) {
  codRejected.push({
    orderId: order.id,
    orderName: order.name ?? null,
    reason: `Ciudad ${cityResult.coordinadoraCity} no soporta recaudo contra-entrega (COD). Use pago anticipado (tag P/A) o elija otra transportadora.`,
  })
}
```
New `rejectedByCombination` follows this exact shape (plus optional `products` string).

### Example 4: ExcelJS header row fill (already exists) vs new row fill
```typescript
// src/lib/pdf/generate-envia-excel.ts — existing header fill (line 37)
const headerRow = sheet.getRow(1)
headerRow.font = { bold: true }
headerRow.eachCell((cell) => {
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  }
})

// NEW: data-row fill (per order)
for (const order of orders) {
  const row = sheet.addRow(order)
  if (order.isMixed) {
    row.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFF59D' }, // 8-digit ARGB, soft yellow
    }
  }
}
```

### Example 5: PDFKit existing logo+separator idiom
```typescript
// src/lib/pdf/generate-guide-pdf.ts — existing (lines 76-89)
if (logoBuffer) {
  try {
    const logoW = 160
    const logoX = (WIDTH - logoW) / 2
    doc.image(logoBuffer, logoX, y, { width: logoW })
    y += 52
  } catch (logoErr) {
    console.warn('[pdf/generate] Failed to render logo, skipping:', logoErr)
    y += 10
  }
}

// *** NEW conditional section goes here — before drawSeparator(doc, y) at line 89 ***

drawSeparator(doc, y)
y += 8
```

### Example 6: Helpers to add to `product-types.ts`
```typescript
// src/lib/orders/product-types.ts — NEW exports
const DISPLAY_LABELS: Record<ProductType, string> = {
  melatonina: 'ELIXIR',
  ash: 'ASHWAGANDHA',
  magnesio_forte: 'MAGNESIO FORTE',
}

export function isSafeForCoord(types: ProductType[]): boolean {
  return types.length === 1 && types[0] === 'melatonina'
}

export function isMixedOrder(types: ProductType[]): boolean {
  return !isSafeForCoord(types)
}

export function formatProductLabels(types: ProductType[]): string {
  if (types.length === 0) return 'SIN CLASIFICAR'
  // types is already ordered by PRODUCT_TYPE_ORDER because
  // detectOrderProductTypes returns PRODUCT_TYPE_ORDER.filter(...)
  return types.map((t) => DISPLAY_LABELS[t]).join(' + ')
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Agent manually eyeballs Kanban dots to avoid wrong dispatch | Server-side filter + visual flags in 4 flows | 2026-04-16 (this phase) | Removes human-reliance safety net; catches the error at the operational boundary (guide generation) instead of letting a wrong guide print. |
| `detectOrderProductTypes([{quantity}])` always returns `[]` due to missing sku/title in SELECT | Widen domain SELECTs to include sku/title | Wave 1 of this phase | Unblocks ALL downstream classification logic. |

**Deprecated/outdated:** None in this phase's scope. All prior-phase helpers remain valid and are extended, not replaced.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | User is OK with soft-yellow `FFFFF59D` (not saturated `FFFF00`) for Excel row fill. | Patterns — Pattern 2 | Low. Planner can swap the hex; 1 LoC. |
| A2 | User is OK with orange-ish flag section (border `#ff751f` matching Ashwagandha dot color) for PDF. | Patterns — Pattern 3 | Low. Planner or user chooses final color during plan-phase. |
| A3 | The Coord message format "N órdenes NO se enviaron …" is acceptable phrasing. | Patterns — Pattern 1 | Low. Copy tweaks are trivial. |
| A4 | Computing `isMixed` post-normalization in the orchestrator (vs threading through Claude prompt) is the right choice. | Pitfalls 4 + 5 | Medium. If we decide to thread through Claude, we'd need to change `buildNormalizationPrompt` + response schema — more invasive. Recommended path keeps Claude unchanged. |
| A5 | `robot/pdf-guide.submitted` and `robot/excel-guide.submitted` event shapes should NOT be modified. | Anti-Patterns | Medium. If planner disagrees, they'd need to bump event version + handle in-flight compat. Recommendation is to keep shape intact. |
| A6 | Column name "COMBINACIÓN" is the user's preferred choice over "PRODUCTOS"/"TIPO"/"MIX". | User Constraints (Claude's Discretion) | Low. User explicitly delegated. |

## Open Questions

1. **Should the Coord filter run before or after city validation?**
   - What we know: today the order is [fetch → validate city → validate COD → create job]. Adding combination-filter at position [fetch → **filter-combination** → validate-city → …] means Ashwagandha orders are filtered before AI city resolution runs on them (saves cost). Adding at [fetch → validate-city → validate-COD → **filter-combination** → …] means combination filter is a "final" check.
   - Recommendation: filter IMMEDIATELY after fetch. Saves Claude cost for AI city resolution on orders we were going to reject anyway. Rejection reason has nothing to do with city, so no ordering dependency.

2. **Should `isMixed` be persisted somewhere (in-memory across step.run?) or recomputed inside the orchestrator step?**
   - What we know: each `step.run` is a fresh lambda in Inngest replay semantics (MEMORY file documents this: "in-memory collectors do NOT survive across Inngest step.run boundaries").
   - Recommendation: compute inside the `generate-and-upload` step by calling `detectOrderProductTypes` on the already-fetched orders. Don't pass data between steps unless you encode it in the step return value. Orders are already fetched in the step — cheap recomputation.

3. **Envia Excel column position — append at end, or insert after "Departamento" for visual grouping?**
   - What we know: the current columns are a fixed portal-import format. Adding a new column at the END preserves the import-compatible prefix and the extra column is just informational (the Envia portal will ignore it).
   - Recommendation: append at end. Users read left-to-right; "COMBINACIÓN" at column G is visible after the yellow row fill catches the eye.

4. **Should `/comandos` message type be extended or a new variant created for combination-rejection?**
   - What we know: existing `type: 'warning'` has a specific item shape geared to city-AI-resolution (`originalCity`, `resolvedCity`, `department`, `reason`). Reusing it means either (a) putting product labels in the `originalCity` slot (misleading but functional) or (b) extending the union's item shape.
   - Recommendation: extend the `type: 'warning'` union's item shape to add optional `products?: string`, then the renderer in `command-output.tsx` conditionally shows products when present. Single renderer, fewer variants.

## Environment Availability

Not applicable — no external tool/service dependencies. All stack is npm packages already installed.

## Validation Architecture

`workflow.nyquist_validation` likely not enabled; per `CONTEXT.md` and prior phase precedent:
- Sin tests automatizados activos for PDF/Excel generators.
- Unit tests for pure helpers are OPTIONAL but encouraged:
  - `isSafeForCoord(types)` — easy unit tests: `[]`, `['melatonina']`, `['ash']`, `['melatonina','ash']`, `['melatonina','magnesio_forte']`.
  - `formatProductLabels(types)` — same cases.
- Integration / smoke: manual verification post-deploy per flow (detailed in CONTEXT.md "Tests / verificación").

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None for this scope |
| Config file | n/a |
| Quick run command | `npx tsc --noEmit` |
| Full suite command | `npm run build` (Vercel deploy) |

### Phase Requirements → Verification Map
| Req | Behavior | Test Type | How Verified |
|-----|----------|-----------|--------------|
| Safe rule | `['melatonina']` is safe | unit (optional) | helper unit test |
| Flag rule | `[]`, `['ash']`, `['melatonina','ash']`, etc. → flag | unit (optional) | helper unit test |
| Coord filter | Only safe orders go to robot | manual | run command with mixed batch in prod |
| Coord message | Rejected list shows product labels + reason | manual | UI message inspection |
| Envia row fill | Flag rows yellow | manual | open xlsx in LibreOffice/Excel |
| Envia column | "COMBINACIÓN" filled for flag, empty for safe | manual | open xlsx |
| PDF section | Appears only for flag orders between logo + address | manual | open PDF |
| Safe path | Elixir-only orders behave identically to today | manual | compare PDF/Excel output with a known-safe batch |

## Security Domain

Not applicable — this phase does not touch auth, ACL, input validation of user-provided data (the DB is the only input source), crypto, session management, or access control. All existing `ctx.workspaceId` filters preserved.

## Sources

### Primary (HIGH confidence)
- **Codebase grep** (verified file:line references):
  - `package.json` — pdfkit 0.17.2, exceljs 4.4.0, bwip-js 4.8.0
  - `src/app/actions/comandos.ts:173, 709, 817, 925` — 4 entry points
  - `src/lib/pdf/generate-guide-pdf.ts:23, 53, 76-89` — PDFKit setup, signature, logo block
  - `src/lib/pdf/generate-envia-excel.ts:20, 37-46` — ExcelJS signature, header styling
  - `src/lib/pdf/normalize-order-data.ts:233, 258` — normalization + Envia transform
  - `src/lib/pdf/types.ts:2-40` — GuideGenOrder / NormalizedOrder / EnviaOrderData
  - `src/lib/domain/orders.ts:1254, 1297, 1399, 1450` — SELECT statements needing widening
  - `src/lib/domain/orders.ts:830-834` — confirmation that `order_products.sku` and `.title` exist in schema
  - `src/inngest/functions/robot-orchestrator.ts:44, 703, 876` — 3 orchestrator entry points
  - `src/app/(dashboard)/comandos/components/comandos-layout.tsx:48-143, 507, 634, 653, 672` — UI message union + command dispatch
  - `src/lib/orders/product-types.ts` — entire existing file reviewed

### Secondary (MEDIUM confidence)
- **ExcelJS documentation / issues:**
  - [github.com/exceljs/exceljs issue #596](https://github.com/exceljs/exceljs/issues/596) — row.fill applies to existing + new cells
  - [exceljs discussion #1658](https://github.com/exceljs/exceljs/discussions/1658) — ARGB 8-digit format
  - [ExcelJS Styles and Formatting (DeepWiki)](https://deepwiki.com/exceljs/exceljs/2.4-styles-and-formatting)
- **PDFKit documentation / issues:**
  - [github.com/foliojs/pdfkit issue #203](https://github.com/foliojs/pdfkit/issues/203) — fill color must be reset after fillAndStroke
  - [pdfkit.org/docs/vector.html](https://pdfkit.org/docs/vector.html) — rect + fillAndStroke API
  - [pdfkit.org/docs/text.html](https://pdfkit.org/docs/text.html) — text with alignment inside width

### Tertiary (LOW confidence)
- None required — all critical claims verified against primary source.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions confirmed in package.json, imports confirmed in code.
- Architecture patterns: HIGH — existing code provides 2-3 precedents per pattern.
- Entry-point map: HIGH — every file:line grepped and verified.
- Pitfalls: HIGH (pitfalls 1, 2, 3, 6) / MEDIUM (pitfalls 4, 5 — based on general Inngest knowledge + prior phase MEMORY notes on step.run boundaries).
- Don't-hand-roll: HIGH — precedents exist in this codebase.
- Assumptions: flagged individually above.

**Research date:** 2026-04-16
**Valid until:** 2026-05-16 (stable stack, no fast-moving dependencies). Re-verify if pdfkit/exceljs/bwip-js major version bumps occur.
