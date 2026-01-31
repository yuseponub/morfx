# Phase 05: Contacts Extended - Research

**Researched:** 2026-01-29
**Domain:** Custom Fields (JSONB), CSV Import/Export, Notes, Activity History
**Confidence:** HIGH

## Summary

This phase extends the contacts module with four major capabilities: custom fields, CSV import/export, internal notes, and activity history. Research confirms the modern approach uses **JSONB columns** for custom field values (not EAV), **PapaParse** for CSV handling, **trigger-based audit logging** for activity history, and simple **notes table** for internal notes.

The existing stack (Supabase, React Hook Form, Zod, TanStack Table, shadcn/ui) handles most requirements. Key additions are:
1. `papaparse` / `react-papaparse` for CSV parsing/generation
2. `react-csv-importer` for column mapping UI
3. A `custom_field_definitions` table + JSONB `custom_fields` column on contacts
4. PostgreSQL triggers for audit trail with JSONB diff storage
5. `shadcn-timeline` component for activity display

**Primary recommendation:** Use JSONB for custom field values with a separate definitions table for field schema. Use PapaParse for CSV with streaming for large files. Implement audit logging via PostgreSQL triggers storing JSONB diffs. Use a simple notes table with timeline UI component.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| papaparse | 5.4+ | CSV parsing/generation | Fastest CSV parser, streaming support, 1GB+ files, web workers |
| react-csv-importer | 0.8+ | CSV import UI with column mapping | Built on PapaParse, drag-drop, preview, auto-mapping |
| @supabase/supabase-js | 2.93+ | JSONB queries with `->>` and `->` operators | Already installed, native JSONB support |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn-timeline | 1.0+ | Vertical timeline for activity/notes | For activity history and notes timeline display |
| react-dropzone | 14+ | Drag-drop file upload | Base for CSV upload component (included in react-csv-importer) |

### Already Installed (Phase 4)
| Library | Version | Purpose |
|---------|---------|---------|
| react-hook-form | 7.71+ | Form state for custom field builder |
| zod | 4.3+ | Dynamic validation schemas |
| emblor | 1.4+ | Tag input for custom field types |
| @tanstack/react-table | 8.21+ | Display custom fields as columns |
| sonner | 2.0+ | Toasts for import/export feedback |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| JSONB column | EAV tables | EAV is 3x more storage, 15,000x slower queries with GIN indexes |
| papaparse | csv-parse | csv-parse is Node-only, PapaParse works browser + Node |
| react-csv-importer | react-spreadsheet-import | react-spreadsheet-import uses Chakra UI, not shadcn/ui |
| PostgreSQL triggers | Application-level logging | Triggers catch ALL changes, app-level misses direct DB edits |

**Installation:**
```bash
pnpm add papaparse react-csv-importer
pnpm add -D @types/papaparse
```

## Architecture Patterns

### Recommended Project Structure
```
morfx/src/
├── app/
│   └── (dashboard)/
│       └── crm/
│           └── contactos/
│               ├── components/
│               │   ├── csv-import-dialog.tsx    # Import wizard
│               │   ├── csv-export-button.tsx    # Export with options
│               │   ├── custom-field-columns.tsx # Dynamic columns
│               │   └── activity-timeline.tsx    # Contact activity
│               └── [id]/
│                   ├── components/
│                   │   ├── notes-section.tsx    # Notes timeline
│                   │   ├── custom-fields.tsx    # Custom field display/edit
│                   │   └── activity-tab.tsx     # Activity history
│                   └── page.tsx
│       └── configuracion/
│           └── campos-custom/
│               ├── page.tsx                     # Field definitions list
│               └── components/
│                   ├── field-builder.tsx        # Create/edit field
│                   └── field-preview.tsx        # Preview field
├── app/
│   └── actions/
│       ├── custom-fields.ts                     # Field definitions CRUD
│       ├── notes.ts                             # Notes CRUD
│       └── contacts.ts                          # Extended with import/export
├── lib/
│   ├── csv/
│   │   ├── parser.ts                            # PapaParse wrapper
│   │   ├── exporter.ts                          # CSV generation
│   │   └── mapper.ts                            # Column mapping logic
│   └── custom-fields/
│       ├── types.ts                             # Field type definitions
│       ├── validator.ts                         # Dynamic Zod schema builder
│       └── renderer.ts                          # Field component renderer
└── components/
    └── custom-fields/
        ├── field-input.tsx                      # Dynamic field input
        └── field-display.tsx                    # Read-only field display
```

### Pattern 1: JSONB Custom Fields (Hybrid Approach)
**What:** Store field definitions in a table, values in JSONB column
**When to use:** Dynamic user-defined fields on contacts
**Example:**
```sql
-- Source: PostgreSQL best practices + Supabase patterns
-- supabase/migrations/XXXXXXXX_custom_fields.sql

-- Field definitions table
CREATE TABLE custom_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                    -- Display name: "Fecha de cumpleanos"
  key TEXT NOT NULL,                     -- Storage key: "fecha_cumpleanos"
  field_type TEXT NOT NULL,              -- text, number, date, select, checkbox, etc.
  options JSONB,                         -- For select: ["Opcion 1", "Opcion 2"]
  is_required BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(workspace_id, key)
);

-- Add custom_fields column to contacts
ALTER TABLE contacts ADD COLUMN custom_fields JSONB DEFAULT '{}';

-- GIN index for efficient JSONB queries
CREATE INDEX idx_contacts_custom_fields ON contacts USING GIN (custom_fields);
```

```typescript
// Source: Supabase JSONB docs
// lib/custom-fields/types.ts
export type FieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'select'
  | 'checkbox'
  | 'url'
  | 'email'
  | 'phone'
  | 'currency'
  | 'percentage'
  | 'file'
  | 'contact_relation'

export interface CustomFieldDefinition {
  id: string
  workspace_id: string
  name: string
  key: string
  field_type: FieldType
  options?: string[] | { value: string; label: string }[]
  is_required: boolean
  display_order: number
  created_at: string
}

// Contact with custom fields
export interface ContactExtended extends Contact {
  custom_fields: Record<string, unknown>
}
```

### Pattern 2: Activity Log with Trigger + JSONB Diff
**What:** PostgreSQL trigger that captures all changes to contacts
**When to use:** For complete activity history with field-level diffs
**Example:**
```sql
-- Source: PostgreSQL Wiki Audit Trigger + Supabase patterns
-- supabase/migrations/XXXXXXXX_activity_log.sql

CREATE TABLE contact_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,                  -- 'created', 'updated', 'deleted', 'note_added', 'tag_added'
  changes JSONB,                         -- {"name": {"old": "Juan", "new": "Juan Perez"}}
  metadata JSONB,                        -- Additional context (tag name, note preview, etc.)
  created_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW())
);

CREATE INDEX idx_activity_contact ON contact_activity(contact_id);
CREATE INDEX idx_activity_created ON contact_activity(created_at DESC);

-- Trigger function to capture changes
CREATE OR REPLACE FUNCTION log_contact_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changes_json JSONB := '{}';
  old_json JSONB;
  new_json JSONB;
  key TEXT;
  user_uuid UUID;
BEGIN
  -- Get current user from JWT
  user_uuid := (auth.jwt() ->> 'sub')::UUID;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO contact_activity (contact_id, workspace_id, user_id, action, changes)
    VALUES (NEW.id, NEW.workspace_id, user_uuid, 'created', to_jsonb(NEW));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Build diff of changed fields
    old_json := to_jsonb(OLD);
    new_json := to_jsonb(NEW);

    FOR key IN SELECT jsonb_object_keys(new_json)
    LOOP
      IF old_json -> key IS DISTINCT FROM new_json -> key THEN
        changes_json := changes_json || jsonb_build_object(
          key, jsonb_build_object('old', old_json -> key, 'new', new_json -> key)
        );
      END IF;
    END LOOP;

    -- Only log if something actually changed
    IF changes_json != '{}' THEN
      INSERT INTO contact_activity (contact_id, workspace_id, user_id, action, changes)
      VALUES (NEW.id, NEW.workspace_id, user_uuid, 'updated', changes_json);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO contact_activity (contact_id, workspace_id, user_id, action, changes)
    VALUES (OLD.id, OLD.workspace_id, user_uuid, 'deleted', to_jsonb(OLD));
    RETURN OLD;
  END IF;
END;
$$;

CREATE TRIGGER contact_activity_trigger
  AFTER INSERT OR UPDATE OR DELETE ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION log_contact_changes();
```

### Pattern 3: CSV Import with Column Mapping
**What:** PapaParse + react-csv-importer for guided import
**When to use:** CSV file upload with user-controlled column mapping
**Example:**
```typescript
// Source: react-csv-importer docs + PapaParse
// app/(dashboard)/crm/contactos/components/csv-import-dialog.tsx
'use client'

import { Importer, ImporterField } from 'react-csv-importer'
import 'react-csv-importer/dist/index.css'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface ImportRow {
  name: string
  phone: string
  email?: string
  city?: string
  // ... dynamic custom fields
}

export function CsvImportDialog({
  open,
  onOpenChange,
  customFields
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  customFields: CustomFieldDefinition[]
}) {
  const [duplicates, setDuplicates] = useState<ImportRow[]>([])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Importar contactos desde CSV</DialogTitle>
        </DialogHeader>

        <Importer
          chunkSize={100}
          restartable
          onStart={() => console.log('Import started')}
          processChunk={async (rows) => {
            // Process in batches, check for duplicates
            const result = await importContactsBatch(rows)
            if (result.duplicates.length > 0) {
              setDuplicates(prev => [...prev, ...result.duplicates])
            }
          }}
          onComplete={() => {
            if (duplicates.length > 0) {
              // Show duplicate resolution dialog
            } else {
              onOpenChange(false)
            }
          }}
        >
          {/* Required fields */}
          <ImporterField name="name" label="Nombre" />
          <ImporterField name="phone" label="Telefono" />

          {/* Optional standard fields */}
          <ImporterField name="email" label="Email" optional />
          <ImporterField name="city" label="Ciudad" optional />
          <ImporterField name="address" label="Direccion" optional />

          {/* Dynamic custom fields */}
          {customFields.map(field => (
            <ImporterField
              key={field.key}
              name={field.key}
              label={field.name}
              optional={!field.is_required}
            />
          ))}
        </Importer>
      </DialogContent>
    </Dialog>
  )
}
```

### Pattern 4: CSV Export with Column Selection
**What:** PapaParse unparse for CSV generation with user-selected columns
**When to use:** Export contacts with configurable fields
**Example:**
```typescript
// Source: PapaParse docs
// lib/csv/exporter.ts
import Papa from 'papaparse'

interface ExportOptions {
  fields: string[]           // ['name', 'phone', 'email', 'custom_cumpleanos']
  contacts: ContactExtended[]
  includeHeaders: boolean
}

export function exportContactsToCsv(options: ExportOptions): string {
  const { fields, contacts, includeHeaders } = options

  // Transform contacts to export format
  const data = contacts.map(contact => {
    const row: Record<string, string> = {}

    for (const field of fields) {
      if (field.startsWith('custom_')) {
        // Custom field
        const key = field.replace('custom_', '')
        row[field] = String(contact.custom_fields[key] ?? '')
      } else {
        // Standard field
        row[field] = String(contact[field as keyof Contact] ?? '')
      }
    }

    return row
  })

  return Papa.unparse(data, {
    header: includeHeaders,
    quotes: true,          // Always quote fields
    quoteChar: '"',
    escapeChar: '"',
    delimiter: ',',
    newline: '\r\n'
  })
}

// Trigger download in browser
export function downloadCsv(csv: string, filename: string) {
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
```

### Pattern 5: Notes Timeline
**What:** Simple notes table with timeline display
**When to use:** Internal notes on contacts
**Example:**
```sql
-- supabase/migrations/XXXXXXXX_contact_notes.sql

CREATE TABLE contact_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW())
);

CREATE INDEX idx_notes_contact ON contact_notes(contact_id);
CREATE INDEX idx_notes_created ON contact_notes(created_at DESC);

-- RLS: workspace members can see all notes
ALTER TABLE contact_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY notes_workspace_select ON contact_notes
  FOR SELECT USING (
    workspace_id = (auth.jwt() -> 'app_metadata' ->> 'workspace_id')::UUID
  );

-- Only note author, admin, or owner can update/delete
CREATE POLICY notes_author_update ON contact_notes
  FOR UPDATE USING (
    user_id = (auth.jwt() ->> 'sub')::UUID
    OR EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = contact_notes.workspace_id
      AND wm.user_id = (auth.jwt() ->> 'sub')::UUID
      AND wm.role IN ('owner', 'admin')
    )
  );
```

### Anti-Patterns to Avoid
- **EAV for custom fields:** Use JSONB column with GIN index instead - 3x less storage, orders of magnitude faster
- **Polling for activity updates:** Use Supabase Realtime subscriptions or refresh on action
- **Loading entire CSV into memory:** Use PapaParse streaming with `chunkSize` option
- **Application-level activity logging:** Use PostgreSQL triggers to catch ALL changes including direct SQL
- **Storing file attachments in JSONB:** Store file path/URL in custom field, actual file in Supabase Storage

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSV parsing | Regex/split(',') | PapaParse | Quotes, escaping, encoding, newlines, 1000+ edge cases |
| CSV column mapping UI | Custom drag-drop interface | react-csv-importer | Auto-detection, preview, validation already solved |
| Activity history | Manual INSERT after each action | PostgreSQL trigger | Triggers catch ALL changes, never miss an update |
| JSONB diff calculation | JavaScript object comparison | PostgreSQL JSONB functions | `to_jsonb(NEW) - to_jsonb(OLD)` in trigger |
| Dynamic form validation | Manual if/else for each type | Zod `.refine()` + dynamic schema | Type inference, async validation, composable |
| Timeline UI | Custom CSS timeline | shadcn-timeline | Accessibility, responsive, animations included |
| File uploads | `<input type="file">` | react-dropzone | Drag-drop, preview, validation, accessibility |

**Key insight:** Custom fields and CSV handling have enormous hidden complexity. Custom fields need validation per type, display per type, import/export mapping. CSV has encoding, quoting, escaping, large file streaming. Use established libraries.

## Common Pitfalls

### Pitfall 1: JSONB Query Performance Without Index
**What goes wrong:** Queries on custom_fields column are slow, get worse with more contacts
**Why it happens:** No GIN index on JSONB column, or using wrong query syntax
**How to avoid:**
- Create GIN index: `CREATE INDEX idx_contacts_custom_fields ON contacts USING GIN (custom_fields)`
- Use containment operator `@>` instead of `->>` for indexed queries
- Example: `custom_fields @> '{"vip": true}'` uses index, `custom_fields->>'vip' = 'true'` does not
**Warning signs:** Query time increases linearly with table size

### Pitfall 2: CSV Import Crashes Browser
**What goes wrong:** Uploading 50MB CSV file freezes browser tab
**Why it happens:** Loading entire file into memory before parsing
**How to avoid:** Use PapaParse streaming with `step` or `chunk` callback, set `worker: true`
**Warning signs:** Browser tab becomes unresponsive, memory usage spikes

### Pitfall 3: Custom Field Type Mismatch on Import
**What goes wrong:** Date field imports as string "2026-01-29", number field as "123.45" string
**Why it happens:** CSV is all strings, no type coercion on import
**How to avoid:** Validate and coerce types during import based on field definition
**Warning signs:** Filtering/sorting doesn't work as expected on custom fields

### Pitfall 4: Activity Log Table Grows Unbounded
**What goes wrong:** Activity table has millions of rows, queries slow down
**Why it happens:** No retention policy, logging every tiny change
**How to avoid:**
- Consider debouncing rapid updates (multiple edits within 1 minute = 1 log entry)
- Add created_at index and archive old records
- Consider only logging "significant" fields, not updated_at changes
**Warning signs:** Activity queries take >100ms, table size >1GB

### Pitfall 5: Notes Not Visible to Team
**What goes wrong:** User creates note, other team members can't see it
**Why it happens:** RLS policy uses user_id instead of workspace_id for SELECT
**How to avoid:** RLS SELECT policy should check workspace membership, not authorship
**Warning signs:** Users report "missing" notes

### Pitfall 6: CSV Export Includes Sensitive Data
**What goes wrong:** Export includes all fields including internal notes, activity, etc.
**Why it happens:** No field selection, exports everything
**How to avoid:** Always require explicit field selection for export
**Warning signs:** Users complain about "extra columns" in export

## Code Examples

Verified patterns from official sources:

### Dynamic Zod Schema for Custom Fields
```typescript
// Source: Zod docs + React Hook Form integration
// lib/custom-fields/validator.ts
import { z } from 'zod'
import type { CustomFieldDefinition } from './types'

export function buildCustomFieldSchema(definitions: CustomFieldDefinition[]) {
  const shape: Record<string, z.ZodTypeAny> = {}

  for (const def of definitions) {
    let fieldSchema: z.ZodTypeAny

    switch (def.field_type) {
      case 'text':
        fieldSchema = z.string()
        break
      case 'number':
        fieldSchema = z.coerce.number()
        break
      case 'date':
        fieldSchema = z.coerce.date()
        break
      case 'checkbox':
        fieldSchema = z.boolean()
        break
      case 'select':
        fieldSchema = z.enum(def.options as [string, ...string[]])
        break
      case 'email':
        fieldSchema = z.string().email()
        break
      case 'url':
        fieldSchema = z.string().url()
        break
      case 'phone':
        fieldSchema = z.string().min(10)
        break
      case 'currency':
      case 'percentage':
        fieldSchema = z.coerce.number()
        break
      case 'contact_relation':
        fieldSchema = z.string().uuid()
        break
      default:
        fieldSchema = z.unknown()
    }

    if (!def.is_required) {
      fieldSchema = fieldSchema.optional().nullable()
    }

    shape[def.key] = fieldSchema
  }

  return z.object(shape)
}
```

### Querying JSONB Custom Fields
```typescript
// Source: Supabase JSONB docs
// app/actions/contacts.ts

// Get contacts where custom field "vip" is true
export async function getVipContacts() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .contains('custom_fields', { vip: true })  // Uses GIN index

  return data
}

// Get contacts with specific custom field value
export async function getContactsByCustomField(key: string, value: unknown) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .contains('custom_fields', { [key]: value })

  return data
}
```

### Activity Timeline Component
```typescript
// Source: shadcn-timeline patterns
// components/activity-timeline.tsx
'use client'

import { Timeline, TimelineItem } from '@/components/ui/timeline'
import { Edit, Plus, Trash, MessageSquare, Tag } from 'lucide-react'

interface ActivityEntry {
  id: string
  action: 'created' | 'updated' | 'deleted' | 'note_added' | 'tag_added' | 'tag_removed'
  changes: Record<string, { old: unknown; new: unknown }>
  metadata?: Record<string, unknown>
  created_at: string
  user?: { email: string }
}

const ACTION_ICONS = {
  created: Plus,
  updated: Edit,
  deleted: Trash,
  note_added: MessageSquare,
  tag_added: Tag,
  tag_removed: Tag,
}

const ACTION_LABELS = {
  created: 'Contacto creado',
  updated: 'Contacto actualizado',
  deleted: 'Contacto eliminado',
  note_added: 'Nota agregada',
  tag_added: 'Etiqueta agregada',
  tag_removed: 'Etiqueta removida',
}

export function ActivityTimeline({ activities }: { activities: ActivityEntry[] }) {
  return (
    <Timeline>
      {activities.map((activity) => {
        const Icon = ACTION_ICONS[activity.action]

        return (
          <TimelineItem
            key={activity.id}
            date={activity.created_at}
            title={ACTION_LABELS[activity.action]}
            description={formatChanges(activity)}
            icon={<Icon className="h-4 w-4" />}
          />
        )
      })}
    </Timeline>
  )
}

function formatChanges(activity: ActivityEntry): string {
  if (activity.action === 'updated' && activity.changes) {
    return Object.entries(activity.changes)
      .filter(([key]) => key !== 'updated_at')
      .map(([key, change]) => `${key}: ${change.old} -> ${change.new}`)
      .join(', ')
  }

  if (activity.action === 'note_added' && activity.metadata?.preview) {
    return String(activity.metadata.preview)
  }

  return ''
}
```

### Streaming CSV Import with Duplicate Detection
```typescript
// Source: PapaParse docs
// lib/csv/parser.ts
import Papa from 'papaparse'
import { normalizePhone } from '@/lib/utils/phone'

interface ParseResult {
  valid: ImportRow[]
  invalid: { row: number; errors: string[] }[]
  duplicates: { row: number; existingId: string; data: ImportRow }[]
}

export async function parseAndValidateCsv(
  file: File,
  existingPhones: Set<string>
): Promise<ParseResult> {
  return new Promise((resolve) => {
    const result: ParseResult = { valid: [], invalid: [], duplicates: [] }
    let rowNum = 0

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
      worker: true,

      step: (row) => {
        rowNum++
        const errors: string[] = []

        // Validate required fields
        if (!row.data.name?.trim()) {
          errors.push('Nombre requerido')
        }
        if (!row.data.phone?.trim()) {
          errors.push('Telefono requerido')
        }

        // Normalize phone
        const normalizedPhone = normalizePhone(row.data.phone || '')
        if (!normalizedPhone) {
          errors.push('Telefono invalido')
        }

        if (errors.length > 0) {
          result.invalid.push({ row: rowNum, errors })
          return
        }

        // Check for duplicates
        if (existingPhones.has(normalizedPhone!)) {
          result.duplicates.push({
            row: rowNum,
            existingId: '', // Will be resolved later
            data: { ...row.data, phone: normalizedPhone! } as ImportRow
          })
          return
        }

        result.valid.push({
          name: row.data.name.trim(),
          phone: normalizedPhone!,
          email: row.data.email?.trim() || undefined,
          city: row.data.city?.trim() || undefined,
        })
      },

      complete: () => resolve(result)
    })
  })
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| EAV tables for custom fields | JSONB column + definitions table | 2020+ | 3x less storage, faster queries with GIN index |
| Application logging | PostgreSQL audit triggers | 2015+ | Catches ALL changes, no gaps |
| Manual CSV parsing | PapaParse with streaming | 2018+ | Handles GB files, web workers |
| Custom timeline components | shadcn-timeline | 2024+ | Accessibility, animations included |
| localStorage for import state | In-memory with streaming | 2020+ | No 5MB limit, better UX |

**Deprecated/outdated:**
- **EAV (Entity-Attribute-Value):** Don't use for user-defined fields. JSONB is universally recommended.
- **csv-parse in browser:** Node-only library, use PapaParse instead
- **react-dnd for drag-drop:** Use @dnd-kit or react-dropzone, react-dnd has React 18 issues

## Open Questions

Things that couldn't be fully resolved:

1. **File Attachment Storage Strategy**
   - What we know: File type custom field should store URL/path
   - What's unclear: Direct Supabase Storage integration vs external URL
   - Recommendation: Defer file attachment type to post-MVP, start with URL field

2. **Activity Log Retention**
   - What we know: Logs can grow large with frequent edits
   - What's unclear: How long to keep activity history
   - Recommendation: Keep all for MVP, add archival policy if needed

3. **Custom Field Ordering**
   - What we know: display_order column exists
   - What's unclear: Drag-drop reordering UX in field builder
   - Recommendation: Simple number input for MVP, drag-drop later

## Sources

### Primary (HIGH confidence)
- [Supabase JSONB Docs](https://supabase.com/docs/guides/database/json) - JSONB columns, GIN indexes, query operators
- [PapaParse Official](https://www.papaparse.com/) - CSV parsing, streaming, web workers
- [PostgreSQL Audit Trigger Wiki](https://wiki.postgresql.org/wiki/Audit_trigger_91plus) - Trigger-based audit logging
- [react-csv-importer GitHub](https://github.com/beamworks/react-csv-importer) - Column mapping UI
- [pg_jsonschema Supabase](https://supabase.com/docs/guides/database/extensions/pg_jsonschema) - JSON Schema validation

### Secondary (MEDIUM confidence)
- [JSONB vs EAV Analysis](https://www.razsamuel.com/postgresql-jsonb-vs-eav-dynamic-data/) - Performance comparison
- [shadcn-timeline GitHub](https://github.com/timDeHof/shadcn-timeline) - Timeline component
- [Zod Dynamic Schemas](https://zod.dev/) - Dynamic validation

### Tertiary (LOW confidence - marked for validation)
- Community patterns for CSV duplicate handling
- Custom field builder UX patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - PapaParse and JSONB are industry standard, official docs consulted
- Architecture: HIGH - JSONB pattern from Supabase docs, audit trigger from PostgreSQL wiki
- Pitfalls: HIGH - Based on documented issues and Phase 4 LEARNINGS.md patterns

**Research date:** 2026-01-29
**Valid until:** 2026-03-29 (60 days - stable patterns, established libraries)

---

## Research Notes

**Key discoveries:**
1. JSONB is universally recommended over EAV - 3x less storage, 15,000x faster with GIN index
2. PapaParse handles 1GB+ files with streaming and web workers
3. PostgreSQL triggers are the gold standard for audit trails
4. react-csv-importer provides complete column mapping UI built on PapaParse
5. shadcn-timeline exists and is compatible with the project's design system

**What makes this phase unique:**
- Custom fields require TWO database changes: definitions table + JSONB column
- CSV import needs duplicate handling UX (per user decision)
- Activity history trigger must handle JSONB diff calculation
- Notes are simple but need correct RLS (workspace-visible, author-editable)

**Implementation risks:**
- LOW: CSV import/export (PapaParse handles complexity)
- LOW: Notes system (straightforward CRUD)
- MEDIUM: Custom field builder UI (dynamic form generation)
- LOW: Activity history (trigger pattern is well-documented)
- MEDIUM: Column mapping for custom fields in import (need to map CSV columns to both standard and custom fields)
