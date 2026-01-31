---
phase: 05
plan: 04
subsystem: contacts
tags: [csv, import, export, papaparse, bulk-operations]
dependency-graph:
  requires: [05-02]
  provides: [csv-import, csv-export, bulk-contact-creation]
  affects: [data-migration, reporting]
tech-stack:
  added: [papaparse, react-csv-importer, @radix-ui/react-scroll-area]
  patterns: [streaming-csv-parse, batch-insert, duplicate-resolution]
key-files:
  created:
    - src/lib/csv/parser.ts
    - src/lib/csv/exporter.ts
    - src/app/(dashboard)/crm/contactos/components/csv-import-dialog.tsx
    - src/app/(dashboard)/crm/contactos/components/csv-export-button.tsx
    - src/app/(dashboard)/crm/contactos/components/duplicate-resolver.tsx
    - src/components/ui/scroll-area.tsx
  modified:
    - package.json
    - src/app/actions/contacts.ts
    - src/app/(dashboard)/crm/contactos/page.tsx
    - src/app/(dashboard)/crm/contactos/components/contacts-table.tsx
decisions:
  - key: no-worker-csv-parsing
    choice: Parse CSV without web worker
    reason: worker:true causes issues in Next.js environment
  - key: batch-size-100
    choice: Insert contacts in batches of 100
    reason: Balance between performance and memory usage
  - key: bom-for-excel
    choice: Include BOM in exported CSV
    reason: Excel requires BOM for correct UTF-8 encoding
metrics:
  duration: ~12 minutes
  completed: 2026-01-29
---

# Phase 5 Plan 4: CSV Import/Export Summary

CSV import with column auto-detection and duplicate resolution; export with user-selectable columns and BOM for Excel compatibility.

## What Was Built

### 1. CSV Parsing Utilities (src/lib/csv/parser.ts)
- `parseContactsCsv()` - Parses CSV file with streaming
- Auto-normalizes column headers (nombre->name, telefono->phone, etc.)
- Validates required fields (name, phone)
- Normalizes phone numbers to E.164 format
- Detects duplicates against existing contacts
- Detects duplicates within the file itself
- Extracts custom field values

### 2. CSV Export Utilities (src/lib/csv/exporter.ts)
- `exportContactsToCsv()` - Generates CSV from contacts array
- `downloadCsv()` - Triggers browser download with BOM
- `generateExportFilename()` - Creates dated filename
- Formats values based on field type (date, checkbox, currency, percentage)

### 3. Bulk Import Server Actions (src/app/actions/contacts.ts)
- `bulkCreateContacts()` - Batch insert with error recovery
- `getExistingPhones()` - Fetch all phones for duplicate detection
- `updateContactByPhone()` - Update existing contact during import
- `getContactByPhone()` - Fetch contact details for comparison

### 4. CSV Import Dialog (csv-import-dialog.tsx)
Multi-step import wizard:
1. **Upload** - Drag-and-drop or file picker for CSV
2. **Parsing** - Progress indicator while processing
3. **Duplicates** - Resolve conflicts (skip/update)
4. **Importing** - Progress while creating contacts
5. **Results** - Summary of created/updated/skipped/errors

### 5. Duplicate Resolver (duplicate-resolver.tsx)
- Side-by-side comparison of CSV vs existing contact
- Per-row resolution options (skip or update)
- Bulk actions ("omitir todos" / "actualizar todos")
- Scrollable list for large duplicate sets

### 6. CSV Export Button (csv-export-button.tsx)
- Column selection popover
- Toggle between standard and custom fields
- Export all vs filtered contacts
- Generates CSV with selected columns

### 7. UI Integration
- Import/Export buttons in contacts table toolbar
- Import button in empty state for initial migration
- Custom fields passed through from page to table

## Key Implementation Details

### Column Auto-Detection
The parser normalizes column headers to standard names:
```typescript
const COLUMN_MAPPINGS: Record<string, string> = {
  nombre: 'name', name: 'name', cliente: 'name',
  telefono: 'phone', phone: 'phone', celular: 'phone', movil: 'phone',
  email: 'email', correo: 'email',
  ciudad: 'city', city: 'city',
  direccion: 'address', address: 'address',
}
```

### Batch Insert Strategy
Contacts are inserted in batches of 100:
- If batch succeeds, count all as created
- If batch fails, fall back to individual inserts
- Track individual errors for reporting

### Export BOM for Excel
Excel requires BOM (Byte Order Mark) for correct UTF-8 display:
```typescript
const BOM = '\ufeff'
const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' })
```

## Commits

| Hash | Message |
|------|---------|
| 865a68c | feat(05-04): install CSV dependencies and create parsing/export utilities |
| 39eea6c | feat(05-04): add bulk import Server Actions and CSV import dialog |
| 0f9c8c3 | feat(05-04): add CSV export button and integrate import/export in contacts page |

## Deviations from Plan

### Auto-Fixed Issues
**[Rule 3 - Blocking] Added ScrollArea UI component**
- Found during: Task 2
- Issue: DuplicateResolver needed ScrollArea component which didn't exist
- Fix: Added @radix-ui/react-scroll-area dependency and created component
- Files: package.json, src/components/ui/scroll-area.tsx
- Commit: 39eea6c

### Plan Adjustments
**Did not use react-csv-importer library as originally planned**
- The plan suggested using react-csv-importer for column mapping UI
- Implemented custom import dialog instead for better integration with existing UI patterns
- react-csv-importer was installed but a simpler auto-detection approach was used
- Custom approach: parse headers automatically, let user resolve duplicates

## Verification Results

1. Dependencies installed: papaparse 5.5.3, react-csv-importer 0.8.1, @radix-ui/react-scroll-area 1.2.10
2. TypeScript compiles without errors
3. CSV parser handles various column name variations
4. Export includes BOM for Excel compatibility
5. Custom fields included in both import and export

## Next Phase Readiness

Phase 5 (Contacts Extended) is now **COMPLETE**.

All 4 plans delivered:
- Plan 01: Notes and Activity schema
- Plan 02: Custom Fields API
- Plan 03: Notes and Activity UI
- Plan 04: CSV Import/Export

**Ready to proceed to Phase 6** (WhatsApp API Integration)
