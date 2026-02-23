---
phase: 28-robot-creador-guias-pdf
plan: 02
subsystem: document-generation
tags: [pdfkit, exceljs, bwip-js, claude-ai, barcode, shipping-labels, xlsx]

# Dependency graph
requires:
  - phase: none
    provides: standalone library, no prior phase dependencies
provides:
  - "NormalizedOrder, GuideGenOrder, EnviaOrderData types (src/lib/pdf/types.ts)"
  - "Claude AI batch normalization for order data (src/lib/pdf/normalize-order-data.ts)"
  - "PDFKit 4x6 inch multi-page shipping label generator (src/lib/pdf/generate-guide-pdf.ts)"
  - "ExcelJS Envia-format spreadsheet generator (src/lib/pdf/generate-envia-excel.ts)"
  - "normalizedToEnvia() helper for converting normalized orders to Envia format"
affects:
  - 28-03 (Inngest orchestrators consume these generators)
  - 28-04 (server actions pass data to these functions)

# Tech tracking
tech-stack:
  added: [pdfkit@0.17.2, bwip-js@4.8.0, exceljs@4.4.0, "@types/pdfkit@0.17.5"]
  patterns:
    - "Buffer-based document generation for serverless (no filesystem)"
    - "Claude AI batch normalization with graceful fallback defaults"
    - "PDFKit chunk collection via on('data') + resolve on 'end' event"

key-files:
  created:
    - src/lib/pdf/types.ts
    - src/lib/pdf/normalize-order-data.ts
    - src/lib/pdf/generate-guide-pdf.ts
    - src/lib/pdf/generate-envia-excel.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "bwip-js imported via 'bwip-js/node' path for TypeScript bundler module resolution compatibility"
  - "Fallback normalization returns sensible defaults instead of throwing on Claude API failure"
  - "valorCobrar set to $0 when pagoAnticipado is true (prepaid orders have nothing to collect)"
  - "Barcode generation wrapped in try/catch per order — failed barcode skips without crashing the label"

patterns-established:
  - "Buffer-output pattern: PDFKit chunk collection via doc.on('data') + Promise resolve on doc.on('end')"
  - "Claude AI batch normalization: 20 orders/batch, JSON array prompt, runtime field validation"
  - "Graceful degradation: buildFallbackOrder() provides usable defaults when AI normalization fails"

# Metrics
duration: 19min
completed: 2026-02-23
---

# Phase 28 Plan 02: Document Generation Library Summary

**Claude AI order normalization + PDFKit 4x6" shipping labels with Code 128 barcodes + ExcelJS Envia spreadsheet generator -- all returning Buffers for serverless**

## Performance

- **Duration:** 19 min
- **Started:** 2026-02-23T22:25:52Z
- **Completed:** 2026-02-23T22:45:47Z
- **Tasks:** 2/2
- **Files created:** 4

## Accomplishments

- Self-contained document generation library under src/lib/pdf/ with zero database/infrastructure dependencies
- Claude AI normalizer handles messy CRM data: phone prefix removal, city formatting, name splitting, unit calculation, pago anticipado detection -- with batch processing and graceful error fallbacks
- PDFKit generator produces multi-page 4x6" labels with logo, recipient data, COD amount, barcode, and prepaid indicator
- ExcelJS generator produces Envia-compatible .xlsx with correct 6-column format (Valor, Nombre, Telefono, Direccion, Municipio, Departamento)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies + types + Claude normalizer** - `7a7a76b` (feat)
2. **Task 2: PDF generator + Excel generator** - `4ff762c` (feat)

## Files Created/Modified

- `src/lib/pdf/types.ts` - Shared interfaces: GuideGenOrder, NormalizedOrder, EnviaOrderData
- `src/lib/pdf/normalize-order-data.ts` - Claude AI batch normalization (20 orders/call) with fallback defaults
- `src/lib/pdf/generate-guide-pdf.ts` - PDFKit multi-page 4x6" label generator with Code 128 barcodes
- `src/lib/pdf/generate-envia-excel.ts` - ExcelJS spreadsheet generator for Envia carrier bulk upload
- `package.json` - Added pdfkit, bwip-js, exceljs dependencies; @types/pdfkit devDependency
- `package-lock.json` - Updated lockfile

## Decisions Made

- **bwip-js/node import path:** TypeScript bundler moduleResolution could not resolve the root `bwip-js` import due to conditional exports without a default fallback. Used `bwip-js/node` explicit subpath export instead.
- **Fallback normalization:** When Claude API fails for a batch, each order gets a `buildFallbackOrder()` result with basic phone/name/city cleanup rather than throwing -- ensures document generation can proceed even with degraded normalization quality.
- **valorCobrar for prepaid:** Set to "$0" when pagoAnticipado is true, since prepaid orders have nothing to collect on delivery.
- **Per-order barcode try/catch:** If bwip-js fails for a specific order's barcode, the label is still generated without the barcode rather than failing the entire PDF.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] pnpm corrupted node_modules during install**
- **Found during:** Task 1 (dependency installation)
- **Issue:** Running `pnpm add` moved 50+ packages to `node_modules/.ignored/` and failed to complete (WSL EACCES on `next` rename)
- **Fix:** Restored packages from `.ignored` back to `node_modules/`, then used `npm install --legacy-peer-deps` successfully
- **Files modified:** node_modules (restored), package-lock.json
- **Verification:** `npm ls pdfkit bwip-js exceljs @types/pdfkit` shows all installed

**2. [Rule 3 - Blocking] bwip-js TypeScript module resolution failure**
- **Found during:** Task 2 (PDF generator)
- **Issue:** `import bwipjs from 'bwip-js'` failed with TS2307 -- conditional exports in bwip-js package.json lacked a default types entry
- **Fix:** Changed import to `import bwipjs from 'bwip-js/node'` using the explicit node subpath export
- **Files modified:** src/lib/pdf/generate-guide-pdf.ts
- **Verification:** `npx tsc --noEmit` passes with zero errors in src/lib/pdf/

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes necessary to unblock installation and compilation. No scope creep.

## Issues Encountered

- npm peer dependency conflict with `@webscopeio/react-textarea-autocomplete` (requires React ^16-18, project uses React 19) -- resolved with `--legacy-peer-deps` flag, consistent with existing project setup.

## User Setup Required

None - no external service configuration required. ANTHROPIC_API_KEY is already configured for the existing OCR module.

## Next Phase Readiness

- All 4 library files ready for consumption by Inngest orchestrators (plan 28-03)
- Functions accept typed inputs and return Buffers -- orchestrators just call them and upload results to Supabase Storage
- No database or infrastructure dependencies in this library

---
*Phase: 28-robot-creador-guias-pdf*
*Completed: 2026-02-23*
