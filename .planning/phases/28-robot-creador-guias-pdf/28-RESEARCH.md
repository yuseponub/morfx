# Phase 28: Robot Creador de Guias PDF - Research

**Researched:** 2026-02-23
**Domain:** PDF/Excel document generation, Claude AI data transformation, Inngest orchestration
**Confidence:** HIGH

## Summary

This phase integrates shipping guide generation (PDF + Excel) directly into MorfX, replacing the external n8n/VPS workflow. The architecture is straightforward because it follows the exact same pattern as the existing OCR robot (Phase 27): server action creates a robot job, fires an Inngest event, an orchestrator processes items internally (no external service), uploads results to Supabase Storage, and returns a download link via Realtime progress.

Three new document types are needed: PDFs for Interrapidisimo and Bogota (4x6" shipping labels with barcode), and Excel for Envia (bulk upload spreadsheet). The core libraries are PDFKit (PDF generation), bwip-js (barcode generation), and ExcelJS (Excel generation). Data normalization is handled by Claude AI (phone formatting, city formatting, unit calculation, name splitting).

**Primary recommendation:** Follow the OCR orchestrator pattern exactly. Each carrier gets its own Inngest orchestrator step that: fetches orders from configured stage, normalizes data via Claude, generates document (PDF/Excel), uploads to Supabase Storage, updates job items, and moves orders to destination stage.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pdfkit | 0.15.x | PDF document generation | Industry standard for Node.js PDF creation; same library used in original n8n robot |
| bwip-js | 4.8.x | Barcode generation (Code 128) | Pure JavaScript barcode writer; works in serverless; supports Code 128 to PNG buffer |
| exceljs | 4.4.x | Excel .xlsx generation | Standard Node.js Excel library; same library used in original n8n robot; supports writeBuffer() |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @anthropic-ai/sdk (already installed) | - | Claude AI for data normalization | Normalize order data before PDF/Excel generation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| pdfkit | puppeteer/chromium | Heavier; 50MB+ bundle; too large for serverless |
| bwip-js | jsbarcode | jsbarcode is browser-focused; bwip-js generates PNG buffer directly for server use |
| exceljs | sheetjs/xlsx | sheetjs npm version is outdated; exceljs has better TypeScript support and writeBuffer() |

**Installation:**
```bash
npm install pdfkit bwip-js exceljs @types/pdfkit
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/
│   ├── pdf/
│   │   ├── generate-guide-pdf.ts     # PDFKit label generator (Inter + Bogota)
│   │   ├── generate-envia-excel.ts   # ExcelJS spreadsheet generator (Envia)
│   │   ├── normalize-order-data.ts   # Claude AI data normalization
│   │   └── types.ts                  # Shared types for normalized order data
│   └── domain/
│       ├── carrier-configs.ts        # Extended with new stage getters (existing)
│       ├── robot-jobs.ts             # Extended with new job types (existing)
│       └── orders.ts                 # New query: getOrdersForGuideGeneration (existing)
├── inngest/
│   ├── functions/
│   │   ├── robot-orchestrator.ts     # Extended with 3 new orchestrators (existing)
│   │   └── (or new file)
│   └── events.ts                     # Extended with new event types (existing)
├── app/
│   ├── actions/
│   │   ├── comandos.ts               # Extended with 3 new command actions (existing)
│   │   └── logistics-config.ts       # Extended with new config actions (existing)
│   └── (dashboard)/
│       ├── comandos/components/       # Extended with new commands + chips (existing)
│       └── settings/logistica/        # Extended with 3 new carrier cards (existing)
└── supabase/
    └── migrations/
        └── YYYYMMDD_phase28_guide_gen_config.sql  # New carrier_configs columns
```

### Pattern 1: OCR-Like Internal Orchestrator (PRIMARY)
**What:** The new orchestrators follow the OCR guide orchestrator pattern -- all processing happens within Inngest steps (no external service callback needed).
**When to use:** For all 3 carrier types (Inter, Bogota, Envia)
**Example:**
```typescript
// Source: Existing ocrGuideOrchestrator in src/inngest/functions/robot-orchestrator.ts
const pdfGuideOrchestrator = inngest.createFunction(
  {
    id: 'pdf-guide-orchestrator',
    retries: 0,
    onFailure: async ({ event }) => { /* mark job as failed */ },
  },
  { event: 'robot/pdf-guide.submitted' as any },
  async ({ event, step }) => {
    const { jobId, workspaceId, carrierType, sourceStageId, destStageId } = event.data
    const ctx = { workspaceId, source: 'inngest-orchestrator' as const }

    // Step 1: Mark job as processing
    await step.run('mark-processing', async () => { ... })

    // Step 2: Fetch orders from source stage
    const orders = await step.run('fetch-orders', async () => { ... })

    // Step 3: Normalize data via Claude AI
    const normalized = await step.run('normalize-data', async () => { ... })

    // Step 4: Generate PDF/Excel
    const docBuffer = await step.run('generate-document', async () => { ... })

    // Step 5: Upload to Supabase Storage
    const downloadUrl = await step.run('upload-document', async () => { ... })

    // Step 6: Update job items with results
    await step.run('update-items', async () => { ... })

    // Step 7: Move orders to destination stage
    await step.run('move-orders', async () => { ... })

    return { status: 'completed', jobId, downloadUrl }
  }
)
```

### Pattern 2: Server Action Command Flow
**What:** Each command follows the exact pattern from `executeSubirOrdenesCoord()` and `executeLeerGuias()`.
**When to use:** For all 3 new commands
**Example:**
```typescript
// Source: Existing executeSubirOrdenesCoord in src/app/actions/comandos.ts
export async function executeGenerarGuiasInter(): Promise<CommandResult<GuideGenResult>> {
  // 1. Auth (getAuthContext)
  // 2. Get carrier config (getGuideGenStage for 'inter')
  // 3. Check for active job (getActiveJob for 'pdf_guide_inter')
  // 4. Fetch orders from source stage
  // 5. Create robot job (createRobotJob with jobType: 'pdf_guide_inter')
  // 6. Dispatch to Inngest: robot/pdf-guide.submitted
  // 7. Return { jobId, totalOrders }
}
```

### Pattern 3: Carrier Config Extension
**What:** Add new columns to `carrier_configs` for each carrier's source stage and destination stage.
**When to use:** Migration + domain layer
**Example:**
```sql
-- 6 new columns: source + dest for each carrier
ALTER TABLE carrier_configs
  ADD COLUMN pdf_inter_pipeline_id UUID REFERENCES pipelines(id) ON DELETE SET NULL,
  ADD COLUMN pdf_inter_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  ADD COLUMN pdf_inter_dest_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  ADD COLUMN pdf_bogota_pipeline_id UUID REFERENCES pipelines(id) ON DELETE SET NULL,
  ADD COLUMN pdf_bogota_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  ADD COLUMN pdf_bogota_dest_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  ADD COLUMN pdf_envia_pipeline_id UUID REFERENCES pipelines(id) ON DELETE SET NULL,
  ADD COLUMN pdf_envia_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  ADD COLUMN pdf_envia_dest_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL;
```

### Pattern 4: Document Result in Chat
**What:** The completed job shows a download link in the Chat de Comandos output.
**When to use:** New message type for document-ready results
**Example:**
```typescript
// New message type in comandos-layout.tsx
| {
    type: 'document_result'
    documentUrl: string
    documentType: 'pdf' | 'excel'
    totalOrders: number
    carrierName: string
    timestamp: string
  }
```

### Anti-Patterns to Avoid
- **Processing all orders in one Claude AI call:** Each order should be normalized individually or in small batches. Large prompts are unreliable.
- **Generating one PDF per order:** Generate a single multi-page PDF for all orders. One file = one download.
- **Storing PDFs without workspace scoping in Storage:** Always prefix with `guide-pdfs/{workspaceId}/` to prevent cross-workspace access.
- **Forgetting to await inngest.send():** Critical in Vercel serverless. Without await, the function may exit before the event is sent.
- **Using the same Inngest event for different orchestrators:** PDF and Excel should use `robot/pdf-guide.submitted` and `robot/excel-guide.submitted` respectively (as decided in CONTEXT.md), with `carrierType` discriminator within PDF event.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Barcode generation | Manual drawing or font-based barcodes | bwip-js toBuffer() | Edge cases in Code 128 encoding, checksum calculation |
| Phone normalization (57 prefix) | RegEx extraction | Claude AI prompt | Handles edge cases: +57, 057, spaces, dashes |
| City formatting (BUCARAMANGA (STDER)) | Manual mapping table | Claude AI prompt | 1000+ Colombian municipalities, abbreviation rules |
| Unit calculation from price | Manual price tiers | Claude AI prompt | Business rules change; Claude adapts to prompt changes |
| PDF layout coordinates | Trial-and-error positioning | Constants object with named positions | Dimensions: 288x432 pts (4x6") — predefine all positions |

**Key insight:** The data transformation is where complexity hides. The original n8n robot uses Claude for this exact reason -- order data from the CRM is messy (inconsistent phone formats, mixed-case cities, no standard structure). Let Claude handle normalization; focus implementation on the document generation and orchestration.

## Common Pitfalls

### Pitfall 1: PDFKit Buffer Collection in Serverless
**What goes wrong:** PDFKit writes to a stream, not a buffer directly. Naively piping to a writable stream that writes to disk fails in serverless (no persistent filesystem).
**Why it happens:** PDFKit was designed for file output, not buffer output.
**How to avoid:** Collect chunks into an array and concatenate into a Buffer:
```typescript
const chunks: Buffer[] = []
doc.on('data', (chunk: Buffer) => chunks.push(chunk))
doc.on('end', () => {
  const pdfBuffer = Buffer.concat(chunks)
  // Upload pdfBuffer to Supabase Storage
})
doc.end()
```
**Warning signs:** Empty PDF files, truncated PDFs, "EPERM: operation not permitted" errors.

### Pitfall 2: Inngest Step Size Limits
**What goes wrong:** If you generate large PDFs (many pages) or include base64-encoded barcodes as step return values, the step output may exceed Inngest's 4MB step output limit.
**Why it happens:** Inngest serializes step return values; large buffers hit the payload limit.
**How to avoid:** Upload the document to Storage WITHIN the same step that generates it. Return only the download URL (a string), not the buffer.
**Warning signs:** `Step output exceeds maximum size` errors from Inngest.

### Pitfall 3: Single-Page vs Multi-Page PDF
**What goes wrong:** Creating one page per order makes the PDF unusable for batch printing if pages aren't properly sized.
**Why it happens:** PDFKit addPage() defaults to Letter size unless explicitly set.
**How to avoid:** Pass `{ size: [288, 432] }` to each addPage() call, not just the constructor.
**Warning signs:** Mixed page sizes in the output PDF.

### Pitfall 4: Claude AI Prompt Consistency
**What goes wrong:** Claude returns inconsistent JSON formats between runs (different key names, missing fields).
**Why it happens:** Prompt is not structured enough, or response format not enforced.
**How to avoid:** Use strict JSON schema in the prompt. Validate Claude's response with a Zod schema before using it.
**Warning signs:** Random "Cannot read property X of undefined" errors in production.

### Pitfall 5: Supabase Storage Public URL Expiration
**What goes wrong:** Using signed URLs that expire; user clicks download link hours later and gets 403.
**Why it happens:** Using `createSignedUrl` instead of `getPublicUrl` on a public bucket.
**How to avoid:** The `whatsapp-media` bucket is already public. Use `getPublicUrl()` like the OCR upload does. Never generate signed URLs for document downloads.
**Warning signs:** Download links stop working after some time.

### Pitfall 6: Order Stage Movement Race Condition
**What goes wrong:** Two robot jobs run simultaneously, both trying to move the same orders.
**Why it happens:** No active job check, or active job check is not type-scoped.
**How to avoid:** Use `getActiveJob(ctx, 'pdf_guide_inter')` scoped by job type (already implemented for existing robots). Each carrier type blocks only its own type.
**Warning signs:** Orders appear in wrong stages, duplicate jobs.

## Code Examples

### PDFKit Label Generation (Verified Pattern)
```typescript
// Source: PDFKit docs + original robot reference
import PDFDocument from 'pdfkit'
import bwipjs from 'bwip-js'

interface NormalizedOrder {
  numero: string        // Shipping number
  nombre: string        // First name (uppercase)
  apellido: string      // Last name (uppercase)
  direccion: string     // Full address
  barrio: string        // Neighborhood
  ciudad: string        // City formatted: "BUCARAMANGA (STDER)"
  telefono: string      // 10-digit phone
  valorCobrar: string   // Formatted: "$77.900"
  pagoAnticipado: boolean
  unidades: number
}

async function generateGuidesPdf(
  orders: NormalizedOrder[],
  logoBuffer: Buffer
): Promise<Buffer> {
  const WIDTH = 288   // 4 inches * 72 pts
  const HEIGHT = 432  // 6 inches * 72 pts

  const doc = new PDFDocument({
    size: [WIDTH, HEIGHT],
    margin: 12,
    autoFirstPage: false,
  })

  const chunks: Buffer[] = []
  doc.on('data', (chunk: Buffer) => chunks.push(chunk))

  for (const order of orders) {
    doc.addPage({ size: [WIDTH, HEIGHT], margin: 12 })

    // Logo
    doc.image(logoBuffer, 12, 12, { width: 80 })

    // Shipping number
    doc.fontSize(14).font('Helvetica-Bold')
       .text(order.numero, 100, 20, { align: 'right', width: WIDTH - 112 })

    // Recipient data
    const startY = 60
    doc.fontSize(10).font('Helvetica-Bold')
       .text(`${order.nombre} ${order.apellido}`, 12, startY)
    doc.fontSize(9).font('Helvetica')
       .text(order.direccion, 12, startY + 16)
       .text(`${order.barrio} - ${order.ciudad}`, 12, startY + 30)
       .text(`Tel: ${order.telefono}`, 12, startY + 44)

    // Amount
    doc.fontSize(16).font('Helvetica-Bold')
       .text(order.valorCobrar, 12, startY + 70, { align: 'center', width: WIDTH - 24 })

    // Barcode (Code 128)
    const barcodePng = await bwipjs.toBuffer({
      bcid: 'code128',
      text: order.numero,
      scale: 2,
      height: 12,
      includetext: true,
      textxalign: 'center',
    })
    doc.image(barcodePng, 40, startY + 100, { width: WIDTH - 80 })

    // Pago anticipado indicator
    if (order.pagoAnticipado) {
      doc.fontSize(12).font('Helvetica-Bold')
         .text('PAGO ANTICIPADO', 12, HEIGHT - 40, { align: 'center', width: WIDTH - 24 })
    }
  }

  doc.end()

  return new Promise((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
  })
}
```

### ExcelJS Envia Spreadsheet Generation
```typescript
// Source: ExcelJS docs + original robot reference
import ExcelJS from 'exceljs'

interface EnviaOrderData {
  valor: number
  nombre: string
  telefono: string
  direccion: string
  municipio: string
  departamento: string
}

async function generateEnviaExcel(orders: EnviaOrderData[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Envios Envia')

  sheet.columns = [
    { header: 'Valor', key: 'valor', width: 12 },
    { header: 'Nombre', key: 'nombre', width: 30 },
    { header: 'Telefono', key: 'telefono', width: 15 },
    { header: 'Direccion', key: 'direccion', width: 40 },
    { header: 'Municipio', key: 'municipio', width: 20 },
    { header: 'Departamento', key: 'departamento', width: 18 },
  ]

  for (const order of orders) {
    sheet.addRow(order)
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
```

### Claude AI Data Normalization Prompt
```typescript
// Source: Original n8n robot workflow + CONTEXT.md decisions
const NORMALIZATION_PROMPT = `Normaliza estos datos de pedido para generar guias de envio.

Reglas:
1. Telefono: quitar prefijo 57, dejar solo 10 digitos. Si tiene +57, 057, o 57 al inicio, quitarlo.
2. Ciudad: formatear como "CIUDAD (DEPTO_ABREV)". Ejemplo: "bucaramanga, santander" -> "BUCARAMANGA (STDER)"
3. Unidades: calcular por precio total: $77,900=1, $109,900=2, $139,900=3. Si no coincide, calcular por rango.
4. Nombres: todo en MAYUSCULAS
5. Separar nombre y apellido (primer token = nombre, resto = apellido)
6. pagoAnticipado: true si el nombre del pedido contiene "&" o si tiene tag "PAGO ANTICIPADO"
7. valorCobrar: formato colombiano con separador de miles. Ejemplo: 77900 -> "$77.900"
8. direccion: incluir barrio si esta disponible

Datos del pedido:
{orderJson}

Responde SOLO con JSON valido en este formato exacto:
{
  "numero": "string",
  "nombre": "string",
  "apellido": "string",
  "direccion": "string",
  "barrio": "string",
  "ciudad": "string",
  "telefono": "string",
  "valorCobrar": "string",
  "pagoAnticipado": boolean,
  "unidades": number
}`
```

### Supabase Storage Upload Pattern
```typescript
// Source: Existing OCR upload in src/app/actions/comandos.ts (executeLeerGuias)
import { createAdminClient } from '@/lib/supabase/admin'

async function uploadDocument(
  workspaceId: string,
  buffer: Buffer,
  fileName: string,
  contentType: string
): Promise<string> {
  const supabase = createAdminClient()
  const filePath = `guide-pdfs/${workspaceId}/${Date.now()}-${fileName}`

  const { error } = await supabase.storage
    .from('whatsapp-media')
    .upload(filePath, buffer, { contentType, upsert: false })

  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  const { data } = supabase.storage
    .from('whatsapp-media')
    .getPublicUrl(filePath)

  return data.publicUrl
}
```

## State of the Art

| Old Approach (n8n VPS) | New Approach (MorfX Internal) | Impact |
|------------------------|-------------------------------|--------|
| Express API on VPS at port 3002 | Inngest orchestrator within MorfX | Eliminates external service dependency |
| Bigin/Zoho CRM API for order data | Supabase direct query | Orders already in MorfX DB |
| Docker shared volume for file output | Supabase Storage upload | No filesystem needed (serverless compatible) |
| Slack notification with download link | Chat de Comandos download link | In-platform delivery |
| n8n webhook triggers per carrier | Chat command with confirmation | User-initiated, same UX as existing robots |
| OAuth token management | Not needed | MorfX owns the data directly |

## Codebase Integration Points

### Existing Files to Extend (NOT create new)

1. **`src/inngest/events.ts`** — Add `robot/pdf-guide.submitted` and `robot/excel-guide.submitted` event types to `RobotEvents`
2. **`src/inngest/functions/robot-orchestrator.ts`** — Add `pdfGuideOrchestrator` and `excelGuideOrchestrator` functions, export in `robotOrchestratorFunctions` array
3. **`src/app/api/inngest/route.ts`** — No change needed (already spreads `robotOrchestratorFunctions`)
4. **`src/app/actions/comandos.ts`** — Add `executeGenerarGuiasInter()`, `executeGenerarGuiasBogota()`, `executeGenerarExcelEnvia()`
5. **`src/app/(dashboard)/comandos/components/comandos-layout.tsx`** — Add new command handling + new message type for document results
6. **`src/app/(dashboard)/comandos/components/command-input.tsx`** — Add 3 new quick-action chips
7. **`src/app/(dashboard)/comandos/components/command-output.tsx`** — Add `document_result` message renderer + download link UI
8. **`src/lib/domain/carrier-configs.ts`** — Add `getGuideGenStage()` helper for new columns, extend `CarrierConfig` interface, extend `UpsertCarrierConfigParams`
9. **`src/lib/domain/orders.ts`** — Add `getOrdersForGuideGeneration()` query (similar to `getOrdersByStage` but returns all fields needed for normalization)
10. **`src/app/(dashboard)/settings/logistica/components/logistics-config-form.tsx`** — Replace "Proximamente" cards with real config cards for Inter, Bogota, Envia
11. **`src/app/actions/logistics-config.ts`** — Add server actions for new carrier config updates

### New Files to Create

1. **`src/lib/pdf/generate-guide-pdf.ts`** — PDFKit-based label generator
2. **`src/lib/pdf/generate-envia-excel.ts`** — ExcelJS-based spreadsheet generator
3. **`src/lib/pdf/normalize-order-data.ts`** — Claude AI data normalization
4. **`src/lib/pdf/types.ts`** — Shared types (NormalizedOrder, EnviaOrderData, etc.)
5. **`supabase/migrations/YYYYMMDD_phase28_guide_gen_config.sql`** — DB migration for new columns

### Data Available for Guide Generation

From the `orders` table + joins:
- `orders.name` — Order reference/identifier
- `orders.total_value` — For unit calculation and amount display
- `orders.shipping_address` — Recipient address
- `orders.shipping_city` — Recipient city
- `orders.shipping_department` — Recipient department
- `orders.carrier` — Carrier name
- `orders.tracking_number` — Existing tracking (if any)
- `orders.custom_fields` — May contain `identificacion`, `barrio`, etc.
- `contacts.name` — Contact name (split into nombre/apellido)
- `contacts.phone` — Contact phone (normalize to 10 digits)
- `contacts.email` — Contact email
- `order_products.quantity` — For unit calculation
- `order_tags` — For "PAGO ANTICIPADO" detection

### Existing Patterns to Reuse Exactly

- **Active job check:** `getActiveJob(ctx, 'pdf_guide_inter')` — scoped by job type
- **Robot job creation:** `createRobotJob(ctx, { orderIds, carrier: 'inter', jobType: 'pdf_guide_inter' })`
- **Job item result update:** `updateJobItemResult(ctx, { itemId, status, ... })`
- **Job status update:** `updateJobStatus(ctx, { jobId, status: 'processing' })`
- **Inngest event dispatch:** `await (inngest.send as any)({ name: 'robot/pdf-guide.submitted', data: { ... } })`
- **Realtime progress:** `useRobotJobProgress(activeJobId)` hook — no changes needed
- **Storage upload:** Same bucket (`whatsapp-media`), different prefix (`guide-pdfs/`)

## Open Questions

1. **Logo asset for PDF labels**
   - What we know: `public/logo-light.png` and `public/logo-dark.png` exist in the project
   - What's unclear: Whether these are the "Somnio" logo referenced in the original robot, or if a separate logo is needed
   - Recommendation: Use `logo-light.png` for now. Can be made configurable per workspace later (deferred idea).

2. **`barrio` (neighborhood) field**
   - What we know: The PDF label includes a `barrio` field. Orders have `shipping_address` but no dedicated `barrio` column.
   - What's unclear: Whether the barrio is embedded in `shipping_address` or `custom_fields`
   - Recommendation: Let Claude AI extract barrio from `shipping_address` during normalization. The prompt already handles this.

3. **Shipping number for new guides**
   - What we know: The PDF shows a `numero` (shipping number). For Coordinadora, this is the `tracking_number`.
   - What's unclear: For Inter/Bogota, whether MorfX generates a sequential shipping number or uses the order name
   - Recommendation: Use `orders.name` as the shipping number identifier. It's the order reference used in the original system.

4. **Batch size limits for Claude normalization**
   - What we know: Each order needs normalization. Batching all orders in one prompt could hit token limits.
   - What's unclear: Optimal batch size
   - Recommendation: Normalize in batches of 20 orders per Claude call. If fewer than 20, use a single call.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `src/inngest/functions/robot-orchestrator.ts` (ocrGuideOrchestrator pattern)
- Existing codebase: `src/app/actions/comandos.ts` (executeLeerGuias pattern)
- Existing codebase: `src/lib/domain/robot-jobs.ts` (createRobotJob, updateJobItemResult)
- Existing codebase: `src/lib/domain/carrier-configs.ts` (getCarrierConfig, upsertCarrierConfig)
- Existing codebase: `src/lib/domain/orders.ts` (getOrdersByStage, moveOrderToStage)
- Existing codebase: `supabase/migrations/` (carrier_configs schema, robot_jobs schema)
- PDFKit README: https://github.com/foliojs/pdfkit — Text positioning, image embedding, custom page sizes
- bwip-js README: https://github.com/metafloor/bwip-js — Version 4.8.0, Code 128 support, toBuffer() API
- ExcelJS README: https://github.com/exceljs/exceljs — writeBuffer() API, column definitions, row insertion

### Secondary (MEDIUM confidence)
- Original robot documentation: https://github.com/yuseponub/AGENTES-IA-FUNCIONALES-v3/tree/master/documentacion-tecnica-robots
  - ROBOT-INTER-ENVIA-BOG.md: PDF specs (4x6", PDFKit 0.15.0, ExcelJS 4.4.0)
  - WORKFLOW-N8N-LOGISTICA.md: Full carrier workflow (stage transitions, Claude normalization, Slack notifications)
- Vercel serverless function limits: https://vercel.com/docs/functions/limitations — 250MB bundle, memory configurable

### Tertiary (LOW confidence)
- None. All critical findings verified against codebase or official documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Same libraries as original robot; APIs verified against README docs
- Architecture: HIGH — Follows exact existing patterns in codebase (OCR orchestrator, server actions, domain layer)
- Pitfalls: HIGH — Identified from real patterns in existing codebase (buffer collection, Inngest step limits, Storage URLs)

**Research date:** 2026-02-23
**Valid until:** 2026-03-23 (stable stack, no fast-moving dependencies)
