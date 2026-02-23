# Phase 27: Robot OCR de Guias - Research

**Researched:** 2026-02-23
**Domain:** Claude Vision OCR, Inngest orchestration, matching algorithms, file upload UI
**Confidence:** HIGH

## Summary

This phase integrates Claude Vision (Sonnet 4) directly into MorfX to read shipping guide images/PDFs, extract structured data, match against CRM orders, and update guide numbers. Unlike previous robot phases (22-26) that dispatched to an external `robot-coordinadora` service, this phase runs entirely within MorfX using the Anthropic SDK already installed (`@anthropic-ai/sdk@^0.73.0`).

The core architecture follows the established robot pattern: `robot_jobs` + `robot_job_items` for tracking, Inngest orchestrator for durable execution, and `/api/webhooks/robot-callback` for completion. The key difference is that the OCR + matching steps execute as Inngest `step.run()` calls instead of HTTP dispatches to an external service.

The Chat de Comandos needs a new `leer guias` command with file upload capability (drag & drop + file picker). The existing `message-input.tsx` in WhatsApp provides a proven pattern for file-to-base64 conversion in the browser. Files are uploaded to Supabase Storage, and public URLs are passed to the Inngest orchestrator for Claude Vision processing.

**Primary recommendation:** Build the OCR orchestrator as an Inngest function with individual `step.run()` per image (OCR extraction) followed by a single `step.run()` for matching, reusing the existing `robot_jobs`/`robot_job_items` infrastructure and `updateOrder` domain function for guide number assignment.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/sdk` | ^0.73.0 | Claude Vision API calls | Already installed in MorfX, used by `claude-client.ts` |
| `inngest` | ^3.51.0 | Durable OCR orchestration | Already installed, proven pattern from Phase 23/26 robot orchestrators |
| `@supabase/supabase-js` | (installed) | Storage upload + DB | Already used throughout codebase |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| N/A | N/A | N/A | No additional libraries needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Claude Vision | Tesseract.js, Google Vision | Claude handles Spanish shipping guides natively with high accuracy; external OCR would need separate integration and may handle Colombian carrier formats poorly |
| Base64 image in API | URL-based image source | Base64 works universally but increases request size; URL-based requires public URL (Supabase Storage provides this) |
| Inngest step.run per image | Single step.run batch | Per-image steps give durable retry and isolation; one failing image doesn't kill the batch |

**Installation:**
```bash
# No new packages needed. All dependencies already installed.
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── inngest/
│   └── functions/
│       └── robot-orchestrator.ts     # ADD ocr-guide-orchestrator here
├── lib/
│   ├── domain/
│   │   ├── robot-jobs.ts             # REUSE existing (createRobotJob, updateJobItemResult, etc.)
│   │   └── orders.ts                 # REUSE updateOrder for carrier_guide_number
│   ├── ocr/
│   │   ├── extract-guide-data.ts     # NEW: Claude Vision extraction function
│   │   ├── match-guide-to-order.ts   # NEW: Matching algorithm
│   │   └── normalize.ts             # NEW: Phone + address normalization utilities
│   └── automations/
│       ├── types.ts                  # ADD 'robot.ocr.completed' trigger type
│       ├── constants.ts              # ADD trigger catalog entry
│       └── trigger-emitter.ts        # ADD emitRobotOcrCompleted
├── app/
│   ├── actions/
│   │   └── comandos.ts              # ADD executeLeerGuias server action
│   └── (dashboard)/
│       └── comandos/
│           └── components/
│               ├── command-input.tsx  # MODIFY: add file upload zone
│               ├── comandos-layout.tsx # MODIFY: add 'leer guias' command handler
│               └── command-output.tsx  # MODIFY: add OCR result message type
```

### Pattern 1: OCR Extraction via Claude Vision (Inngest Step)
**What:** Each image is processed individually as an Inngest step, calling Claude Vision API.
**When to use:** For every guide image/PDF in the batch.
**Example:**
```typescript
// Source: Anthropic Vision API docs (https://platform.claude.com/docs/en/build-with-claude/vision)
import Anthropic from '@anthropic-ai/sdk'

interface GuideOcrResult {
  numeroGuia: string | null
  destinatario: string | null
  direccion: string | null
  ciudad: string | null
  telefono: string | null
  remitente: string | null
  transportadora: 'ENVIA' | 'INTER' | 'COORDINADORA' | 'SERVIENTREGA' | 'DESCONOCIDA'
  confianza: number // 0-100
}

async function extractGuideData(imageUrl: string): Promise<GuideOcrResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'url', url: imageUrl }
        },
        {
          type: 'text',
          text: `Eres un experto en logistica colombiana. Analiza esta guia de envio y extrae los datos.

Responde SOLO con JSON valido:
{
  "numeroGuia": "string o null",
  "destinatario": "nombre del destinatario o null",
  "direccion": "direccion de entrega o null",
  "ciudad": "ciudad destino o null",
  "telefono": "telefono del destinatario o null",
  "remitente": "nombre del remitente o null",
  "transportadora": "ENVIA|INTER|COORDINADORA|SERVIENTREGA|DESCONOCIDA",
  "confianza": 0-100
}

La confianza refleja que tan legible es la guia y que tan seguro estas de los datos extraidos.
Si no puedes leer un campo, ponlo como null y baja la confianza.`
        }
      ]
    }]
  })

  // Parse JSON from response
  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('')

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('OCR response was not valid JSON')

  return JSON.parse(jsonMatch[0]) as GuideOcrResult
}
```

### Pattern 2: PDF Support via Document Content Block
**What:** PDFs use `type: 'document'` instead of `type: 'image'` in the Claude API.
**When to use:** When the uploaded file is a PDF (detected by MIME type).
**Example:**
```typescript
// Source: Anthropic PDF docs (https://platform.claude.com/docs/en/docs/build-with-claude/pdf-support)
// For PDFs: use 'document' content block with base64 or URL
const contentBlock = mimeType === 'application/pdf'
  ? {
      type: 'document' as const,
      source: { type: 'url' as const, url: imageUrl }
    }
  : {
      type: 'image' as const,
      source: { type: 'url' as const, url: imageUrl }
    }
```

### Pattern 3: OCR Guide Orchestrator (Inngest Function)
**What:** Durable Inngest function that processes all images sequentially, then matches.
**When to use:** Triggered by `robot/ocr-guide.submitted` event.
**Example:**
```typescript
// Follows exact pattern of robot-orchestrator.ts and guide-lookup-orchestrator.ts
const ocrGuideOrchestrator = inngest.createFunction(
  {
    id: 'ocr-guide-orchestrator',
    retries: 0, // Consistent with other robot orchestrators
    onFailure: async ({ event }) => { /* mark job failed */ },
  },
  { event: 'robot/ocr-guide.submitted' as any },
  async ({ event, step }) => {
    const { jobId, workspaceId, items } = event.data

    // Step 1: Mark job as processing
    await step.run('mark-processing', async () => { /* ... */ })

    // Step 2: OCR each image (one step per image for durability)
    const ocrResults: Array<{ itemId: string; result: GuideOcrResult | null }> = []
    for (const item of items) {
      const result = await step.run(`ocr-${item.itemId}`, async () => {
        try {
          return await extractGuideData(item.imageUrl)
        } catch {
          return null // OCR failed
        }
      })
      ocrResults.push({ itemId: item.itemId, result })
    }

    // Step 3: Match against orders
    await step.run('match-and-update', async () => {
      // Fetch eligible orders, run matching algorithm, update via domain layer
    })

    // Step 4: Mark job completed, emit results
    await step.run('complete-job', async () => { /* ... */ })
  }
)
```

### Pattern 4: File Upload in Chat de Comandos
**What:** Add drag & drop / file picker to CommandInput component.
**When to use:** For the `leer guias` command.
**Example:**
```typescript
// Follows pattern from whatsapp/message-input.tsx
// File -> arrayBuffer -> base64 -> server action -> Supabase Storage -> public URL
const handleFileChange = async (files: FileList) => {
  for (const file of Array.from(files)) {
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    const base64 = btoa(binary)
    // Send to server action for Supabase Storage upload
  }
}
```

### Pattern 5: Matching Algorithm
**What:** Cascading priority match: Telefono > Nombre > Ciudad > Direccion.
**When to use:** After OCR extraction, match each guide against eligible orders.
**Example:**
```typescript
// Matching runs server-side as Inngest step
function matchGuideToOrder(
  ocrData: GuideOcrResult,
  eligibleOrders: OrderForMatching[]
): { orderId: string; confidence: number } | null {

  // Priority 1: Phone match (highest confidence)
  const phoneNorm = normalizePhone(ocrData.telefono)
  if (phoneNorm) {
    const phoneMatch = eligibleOrders.find(o =>
      normalizePhone(o.contact_phone) === phoneNorm
    )
    if (phoneMatch) return { orderId: phoneMatch.id, confidence: 95 }
  }

  // Priority 2: Name match
  // Priority 3: City match
  // Priority 4: Address match (lowest confidence)
  // ...

  return null // No match found
}
```

### Anti-Patterns to Avoid
- **Running OCR client-side:** Claude Vision API key must NEVER be exposed to the browser. OCR runs server-side in Inngest steps.
- **Single step.run for all images:** If one image fails, all fail. Use per-image steps for isolation.
- **Matching in Claude Vision prompt:** Matching logic must run in TypeScript against real DB data, not in the Vision prompt.
- **Fire-and-forget inngest.send:** ALWAYS await `inngest.send()` in serverless (Vercel terminates early).
- **Direct DB writes from orchestrator:** All mutations go through domain layer (`updateOrder`, `updateJobItemResult`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Job tracking (status, progress) | Custom state management | `robot_jobs` + `robot_job_items` tables | Already designed for batch job tracking with counters |
| Order guide number update | Direct Supabase insert | `updateOrder(ctx, { carrierGuideNumber })` | Domain layer handles field.changed triggers |
| Automation trigger emission | Manual Inngest event send | `emitRobotOcrCompleted()` pattern from `trigger-emitter.ts` | Handles cascade depth, error logging |
| File upload to storage | Custom upload endpoint | Supabase Storage `.upload()` + `.getPublicUrl()` | Already used in `messages.ts` and `webhook-handler.ts` |
| OCR text extraction | Tesseract.js or custom OCR | Claude Vision API (Sonnet 4) | Handles Spanish text, Colombian carrier formats, structured output |

**Key insight:** The entire robot job infrastructure (job creation, item tracking, status aggregation, auto-completion) already exists in `robot-jobs.ts`. This phase adds a new `job_type: 'ocr_guide_read'` but reuses the full domain layer.

## Common Pitfalls

### Pitfall 1: Image Too Large for Claude Vision API
**What goes wrong:** Uploading high-resolution photos (8000x8000+) gets rejected by Claude API.
**Why it happens:** Phone cameras produce large images; users may upload raw photos.
**How to avoid:** Validate image dimensions server-side before sending to Claude. Resize to max 1568px on longest edge for optimal performance and cost. No quality loss for OCR since guides don't need pixel-perfect rendering.
**Warning signs:** 400 errors from Anthropic API mentioning image size.

### Pitfall 2: Base64 vs URL Source for Claude Vision
**What goes wrong:** Sending large base64 blobs in Inngest event data exceeds limits.
**Why it happens:** Inngest events have payload size limits.
**How to avoid:** Upload files to Supabase Storage FIRST, then pass public URLs to the orchestrator. Claude Vision accepts URL sources directly: `{ type: 'url', url: publicUrl }`.
**Warning signs:** Inngest event send failures, 413 errors.

### Pitfall 3: PDF vs Image Content Block Types
**What goes wrong:** Sending a PDF with `type: 'image'` fails silently or returns garbage.
**Why it happens:** Claude API uses `type: 'document'` for PDFs and `type: 'image'` for images.
**How to avoid:** Check MIME type and use the correct content block type. Images: `{ type: 'image', source: { type: 'url', url } }`. PDFs: `{ type: 'document', source: { type: 'url', url } }`.
**Warning signs:** OCR returns null/empty for PDF files.

### Pitfall 4: Claude Vision JSON Response Parsing
**What goes wrong:** Claude sometimes wraps JSON in markdown code fences or adds commentary.
**Why it happens:** LLMs don't always follow "respond ONLY with JSON" perfectly.
**How to avoid:** Use regex extraction `text.match(/\{[\s\S]*\}/)` as done in `claude-client.ts` parseIntentResponse. Wrap in try/catch, treat parse failure as OCR failure with null result.
**Warning signs:** `JSON.parse()` throws on Vision responses.

### Pitfall 5: Phone Normalization Edge Cases
**What goes wrong:** Phone "3001234567" doesn't match "573001234567" or "+57 300 123 4567".
**Why it happens:** Colombian phones have various prefix formats.
**How to avoid:** Normalize: strip `+`, strip leading `57` (country code), remove all spaces/dashes/dots. Compare last 10 digits only.
**Warning signs:** Low match rates when phones clearly should match.

### Pitfall 6: Address Normalization Complexity
**What goes wrong:** "CL 8 #6-27" doesn't match "Calle 8 No. 6-27".
**Why it happens:** Colombian addresses have many abbreviation variants.
**How to avoid:** Normalize abbreviations (CL/CALLE, CR/KR/CARRERA, AV/AVENIDA, DG/DIAGONAL, TV/TRANSVERSAL). Strip #, No., special chars. Compare core components (street type + number + cross).
**Warning signs:** Address match confidence is always low.

### Pitfall 7: Supabase Storage Bucket Must Exist
**What goes wrong:** Upload fails with "Bucket not found".
**Why it happens:** No bucket created for OCR guide images.
**How to avoid:** Create a Supabase Storage bucket (e.g., `robot-guides`) with public access policy, or reuse `whatsapp-media` bucket with a `/ocr-guides/` path prefix.
**Warning signs:** 404 on storage upload.

### Pitfall 8: Inngest Function Not Registered
**What goes wrong:** OCR events fire but nothing happens.
**Why it happens:** New Inngest function not added to `/api/inngest/route.ts` serve list.
**How to avoid:** Export the new orchestrator from `robot-orchestrator.ts` and add to the `functions` array in `route.ts`.
**Warning signs:** Inngest dashboard shows unhandled events.

## Code Examples

### Supabase Storage Upload Pattern (from messages.ts)
```typescript
// Source: src/app/actions/messages.ts lines 248-270
const adminClient = createAdminClient()
const buffer = Buffer.from(fileData, 'base64')
const filePath = `${workspaceId}/ocr-guides/${Date.now()}-${fileName}`

const { error: uploadError } = await adminClient
  .storage
  .from('whatsapp-media') // or dedicated 'robot-guides' bucket
  .upload(filePath, buffer, {
    contentType: mimeType,
    upsert: false,
  })

const { data: publicUrlData } = adminClient
  .storage
  .from('whatsapp-media')
  .getPublicUrl(filePath)

const imageUrl = publicUrlData.publicUrl
```

### Automation Trigger Pattern (from trigger-emitter.ts)
```typescript
// Source: src/lib/automations/trigger-emitter.ts (emitRobotCoordCompleted pattern)
export async function emitRobotOcrCompleted(data: {
  workspaceId: string
  orderId: string
  orderName?: string
  carrierGuideNumber: string
  carrier: string // detected by OCR
  contactId: string | null
  contactName?: string
  contactPhone?: string
  shippingCity?: string
  cascadeDepth?: number
}): Promise<void> {
  const depth = data.cascadeDepth ?? 0
  if (isCascadeSuppressed('robot.ocr.completed', data.workspaceId, depth)) return

  await sendEvent(
    'automation/robot.ocr.completed',
    { ...data, cascadeDepth: depth },
    'robot.ocr.completed',
    data.workspaceId
  )
}
```

### New Inngest Event Type
```typescript
// Source: Follow pattern from src/inngest/events.ts
'robot/ocr-guide.submitted': {
  data: {
    jobId: string
    workspaceId: string
    items: Array<{
      itemId: string
      imageUrl: string      // Supabase Storage public URL
      mimeType: string      // image/jpeg, image/png, image/webp, application/pdf
      fileName: string      // Original file name
    }>
    /** Stage ID to filter eligible orders for matching */
    matchStageId: string
  }
}
```

### New Automation Event Type
```typescript
// Source: Follow pattern from AutomationEvents in src/inngest/events.ts
'automation/robot.ocr.completed': {
  data: {
    workspaceId: string
    orderId: string
    orderName?: string
    carrierGuideNumber: string
    carrier: string // detected carrier
    contactId: string | null
    contactName?: string
    contactPhone?: string
    shippingCity?: string
    cascadeDepth: number
  }
}
```

### CommandMessage Type for OCR Results
```typescript
// New message type for comandos-layout.tsx
| {
    type: 'ocr_result'
    autoAssigned: Array<{
      guideNumber: string
      orderName: string | null
      carrier: string
      confidence: number
    }>
    pendingConfirmation: Array<{
      guideNumber: string
      suggestedOrderName: string | null
      carrier: string
      confidence: number
    }>
    noMatch: Array<{
      guideNumber: string | null
      carrier: string
    }>
    ocrFailed: Array<{
      fileName: string
    }>
    timestamp: string
  }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate OCR service (Express.js + n8n) | Integrated in MorfX (Inngest + Claude API) | Phase 27 | No external service dependency, simpler deployment |
| Slack for input/output | Chat de Comandos UI | Phase 24 | Integrated UX, no Slack dependency |
| Bigin CRM for order matching | MorfX domain layer + Supabase | Phase 21 | Direct DB access, richer order data |
| `image` content block for all files | `image` for images, `document` for PDFs | Claude API 2024-2025 | PDF native support without conversion |
| Base64 only for image source | URL source supported | Claude API | Smaller payloads, Supabase Storage URLs work directly |

**Deprecated/outdated:**
- External OCR service approach: Replaced by in-MorfX Claude Vision calls
- n8n workflow orchestration: Replaced by Inngest durable functions

## Open Questions

1. **Supabase Storage bucket for OCR guides**
   - What we know: `whatsapp-media` bucket exists and is public. Can reuse with path prefix or create dedicated `robot-guides` bucket.
   - What's unclear: Whether to reuse existing bucket or create new one. Both work.
   - Recommendation: Reuse `whatsapp-media` with path prefix `ocr-guides/{workspaceId}/{timestamp}-{filename}` to avoid bucket creation migration. Claude's discretion.

2. **Which pipeline stage to filter eligible orders**
   - What we know: CONTEXT.md says "pedidos en etapa especifica del pipeline (equivalente a ESPERANDO GUIAS)". The existing dispatch stage config (`getDispatchStage`) returns a single stage.
   - What's unclear: Should we reuse the dispatch stage config or add a new "awaiting guides" stage config?
   - Recommendation: Reuse dispatch stage config for now (same orders that were dispatched are the ones awaiting guides). Can be refined in a future phase.

3. **Manual confirmation UI for 50-69% confidence matches**
   - What we know: Low-confidence matches need user confirmation before assignment.
   - What's unclear: Should this be inline in the command output or a separate modal/dialog?
   - Recommendation: Use inline confirmation buttons in the OCR result message (similar to the "subir ordenes" confirmation pattern in CommandInput). Each pending match shows a "Confirmar" / "Descartar" button pair.

4. **Concurrent OCR jobs**
   - What we know: `getActiveJob(ctx, 'ocr_guide_read')` will correctly scope by job type, allowing OCR jobs to run independently from shipment/guide-lookup jobs.
   - What's unclear: N/A - the existing pattern handles this.
   - Recommendation: Follow existing pattern.

## Sources

### Primary (HIGH confidence)
- [Anthropic Vision Docs](https://platform.claude.com/docs/en/build-with-claude/vision) - Image formats, size limits, URL source, API examples
- [Anthropic PDF Support Docs](https://platform.claude.com/docs/en/docs/build-with-claude/pdf-support) - Document content blocks, base64 + URL source
- Codebase: `src/inngest/functions/robot-orchestrator.ts` - Existing orchestrator patterns
- Codebase: `src/lib/domain/robot-jobs.ts` - Robot job domain layer
- Codebase: `src/inngest/events.ts` - Event type definitions
- Codebase: `src/lib/automations/trigger-emitter.ts` - Trigger emission patterns
- Codebase: `src/lib/automations/constants.ts` - Trigger catalog structure
- Codebase: `src/lib/automations/types.ts` - TriggerType union
- Codebase: `src/app/actions/comandos.ts` - Server action patterns
- Codebase: `src/app/(dashboard)/comandos/components/` - UI component patterns
- Codebase: `src/app/(dashboard)/whatsapp/components/message-input.tsx` - File upload pattern
- Codebase: `src/app/actions/messages.ts` - Supabase Storage upload pattern
- Codebase: `src/app/api/webhooks/robot-callback/route.ts` - Callback route with trigger emission

### Secondary (MEDIUM confidence)
- [Reference OCR Bot Documentation](https://github.com/yuseponub/AGENTES-IA-FUNCIONALES-v3/blob/master/Agentes%20Logistica/ocr-guias-bot/documentacion-completa/DOCUMENTACION_OCR_GUIAS_BOT.md) - Matching algorithm, confidence scoring, normalization rules from existing bot

### Tertiary (LOW confidence)
- N/A - All critical findings verified with primary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Using existing libraries already in the project (`@anthropic-ai/sdk`, `inngest`, Supabase)
- Architecture: HIGH - Following established patterns from Phase 23/26 robot orchestrators
- OCR API: HIGH - Verified with official Anthropic Vision and PDF docs
- Matching algorithm: MEDIUM - Based on reference bot documentation; normalization rules need Colombian address testing
- File upload UI: HIGH - Proven pattern from WhatsApp message-input component

**Research date:** 2026-02-23
**Valid until:** 2026-03-23 (30 days - stable stack, no expected breaking changes)
