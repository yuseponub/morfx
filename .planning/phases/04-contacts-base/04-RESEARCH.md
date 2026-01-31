# Phase 04: Contacts Base - Research

**Researched:** 2026-01-28
**Domain:** CRM Contacts Management with Data Tables, Forms, and Tags
**Confidence:** HIGH

## Summary

This phase implements the core contacts module for the MorfX CRM: a data table with TanStack Table, contact CRUD with forms, and a tag system with colors. The research confirms that shadcn/ui provides all necessary components when combined with TanStack Table, and the project already has the foundation from Phase 1-3 (Supabase, RLS, Server Actions).

The standard approach centers on:
1. **TanStack Table** for the data table (already decided) with shadcn/ui integration
2. **libphonenumber-js** for phone normalization to E.164 (+57XXXXXXXXXX)
3. **Emblor** or custom tag input for colored tags with autocomplete
4. **shadcn/ui Combobox** for city autocomplete with Colombian cities dataset
5. **Sonner** for toast notifications (shadcn/ui integrated)
6. **React Hook Form + Zod** for form validation (established pattern from Phase 1)

Phone normalization is critical because the phone field is the unique identifier that connects contacts to WhatsApp conversations and orders.

**Primary recommendation:** Use TanStack Table with shadcn/ui's data-table pattern, libphonenumber-js for E.164 normalization, and the existing Server Actions pattern from Phase 1-2 for CRUD operations with RLS.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @tanstack/react-table | 8.20+ | Headless data table with sorting, filtering, pagination | Already decided, shadcn/ui integrated, 100% control over UI |
| libphonenumber-js | 1.11+ | Phone number parsing, validation, E.164 formatting | Google's library rewritten for JS, 10x smaller, handles Colombian numbers correctly |
| sonner | 1.7+ | Toast notifications | shadcn/ui integrated, replaces deprecated Toast component, promise support |
| react-hook-form | 7.54+ | Form state management | Already used in Phase 1, minimal re-renders, Zod integration |
| zod | 3.23+ | Schema validation | Already used in Phase 1, TypeScript inference, Server Actions compatible |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| emblor | 1.5+ | Tag input with autocomplete | For contact tag management with colors |
| @dnd-kit/core | 6.1+ | Drag and drop | Optional for column reordering (TanStack recommended library) |
| nuqs | 2.0+ | URL-based state management | Optional for persisting table filters in URL |

### Already Installed (Phase 1-3)
| Library | Version | Purpose |
|---------|---------|---------|
| @supabase/ssr | 0.8+ | Supabase client for Next.js |
| shadcn/ui | latest | UI component library |
| tailwindcss | 4.0+ | CSS framework |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| libphonenumber-js | google-libphonenumber | google-libphonenumber is 200KB+, libphonenumber-js is ~50KB |
| Emblor | Custom tag input | Emblor provides autocomplete, validation, drag-and-drop; custom is more work |
| nuqs (URL state) | useState only | URL state allows sharing filtered views, but adds complexity |

**Installation:**
```bash
npm install libphonenumber-js emblor
# Note: @tanstack/react-table, sonner, react-hook-form, zod already installed
```

## Architecture Patterns

### Recommended Project Structure
```
morfx/src/
├── app/
│   └── (dashboard)/
│       └── contactos/
│           ├── page.tsx              # Contact list (Server Component)
│           ├── [id]/
│           │   └── page.tsx          # Contact detail view
│           └── components/
│               ├── contacts-table.tsx      # DataTable wrapper
│               ├── columns.tsx             # Column definitions
│               ├── contact-form.tsx        # Create/Edit form
│               ├── contact-dialog.tsx      # Quick edit modal
│               ├── tag-filter.tsx          # Filter by tags
│               └── bulk-actions.tsx        # Bulk operations toolbar
├── components/
│   └── contacts/                      # Reusable contact components
│       ├── contact-card.tsx
│       ├── tag-input.tsx              # Emblor wrapper
│       └── phone-input.tsx            # libphonenumber-js wrapper
├── app/
│   └── actions/
│       └── contacts.ts                # Server Actions for CRUD
└── lib/
    ├── utils/
    │   └── phone.ts                   # Phone normalization utilities
    └── data/
        └── colombia-cities.ts         # Static cities dataset
```

### Pattern 1: Data Table with Server-Side Data Fetching
**What:** Fetch data in Server Component, render table in Client Component
**When to use:** For the contacts list page
**Example:**
```typescript
// Source: shadcn/ui data-table docs + Next.js patterns
// app/(dashboard)/contactos/page.tsx (Server Component)
import { createClient } from '@/lib/supabase/server'
import { ContactsTable } from './components/contacts-table'

export default async function ContactsPage() {
  const supabase = await createClient()

  // RLS ensures only workspace contacts are returned
  const { data: contacts, error } = await supabase
    .from('contacts')
    .select(`
      id, name, phone, email, city, created_at, updated_at,
      contact_tags!inner(tag:tags(*))
    `)
    .order('updated_at', { ascending: false })

  if (error) throw error

  return (
    <div className="container py-6">
      <ContactsTable data={contacts ?? []} />
    </div>
  )
}
```

### Pattern 2: TanStack Table with shadcn/ui
**What:** Column definitions with sorting, filtering, row selection
**When to use:** For the main contacts table
**Example:**
```typescript
// Source: https://ui.shadcn.com/docs/components/data-table
// app/(dashboard)/contactos/components/columns.tsx
"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { ArrowUpDown } from "lucide-react"
import { Contact } from "@/lib/types/database"

export const columns: ColumnDef<Contact>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Seleccionar todos"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Seleccionar fila"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "name",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Nombre
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
  },
  {
    accessorKey: "phone",
    header: "Teléfono",
    cell: ({ row }) => {
      // Format for display: +57 300 123 4567
      const phone = row.getValue("phone") as string
      return phone?.replace(/^\+57(\d{3})(\d{3})(\d{4})$/, '+57 $1 $2 $3')
    }
  },
  {
    accessorKey: "city",
    header: "Ciudad",
  },
  {
    accessorKey: "tags",
    header: "Tags",
    cell: ({ row }) => {
      const tags = row.original.contact_tags?.map(ct => ct.tag) ?? []
      return (
        <div className="flex gap-1">
          {tags.map(tag => (
            <span
              key={tag.id}
              className="px-2 py-0.5 rounded-full text-xs"
              style={{ backgroundColor: tag.color, color: '#fff' }}
            >
              {tag.name}
            </span>
          ))}
        </div>
      )
    },
    enableSorting: false,
  },
  // ... more columns
]
```

### Pattern 3: Phone Number Normalization
**What:** Normalize all phone input to E.164 format (+57XXXXXXXXXX)
**When to use:** On every phone input/save operation
**Example:**
```typescript
// Source: https://github.com/catamphetamine/libphonenumber-js
// lib/utils/phone.ts
import parsePhoneNumber, { isValidPhoneNumber } from 'libphonenumber-js'

export function normalizePhone(input: string): string | null {
  // Remove all non-digit characters except +
  const cleaned = input.replace(/[^\d+]/g, '')

  // Try to parse with Colombia default
  const phoneNumber = parsePhoneNumber(cleaned, 'CO')

  if (phoneNumber && phoneNumber.isValid()) {
    return phoneNumber.format('E.164') // +573001234567
  }

  return null
}

export function formatPhoneDisplay(e164: string): string {
  const phoneNumber = parsePhoneNumber(e164)
  if (phoneNumber) {
    return phoneNumber.formatInternational() // +57 300 123 4567
  }
  return e164
}

export function isValidColombianPhone(input: string): boolean {
  const cleaned = input.replace(/[^\d+]/g, '')
  return isValidPhoneNumber(cleaned, 'CO')
}
```

### Pattern 4: Form with Server Action
**What:** React Hook Form + Zod + Server Action pattern from Phase 1
**When to use:** Contact create/edit forms
**Example:**
```typescript
// Source: Phase 1 patterns + Next.js Server Actions
// app/actions/contacts.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { normalizePhone } from '@/lib/utils/phone'

const contactSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  phone: z.string().min(1, 'El teléfono es requerido'),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  address: z.string().optional(),
  city: z.string().optional(),
})

export async function createContact(formData: FormData) {
  const supabase = await createClient()

  const rawData = {
    name: formData.get('name') as string,
    phone: formData.get('phone') as string,
    email: formData.get('email') as string,
    address: formData.get('address') as string,
    city: formData.get('city') as string,
  }

  // Validate
  const result = contactSchema.safeParse(rawData)
  if (!result.success) {
    return { error: result.error.flatten().fieldErrors }
  }

  // Normalize phone
  const normalizedPhone = normalizePhone(result.data.phone)
  if (!normalizedPhone) {
    return { error: { phone: ['Número de teléfono inválido'] } }
  }

  // Insert (RLS handles workspace_id)
  const { data, error } = await supabase
    .from('contacts')
    .insert({
      ...result.data,
      phone: normalizedPhone,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') { // Unique violation
      return { error: { phone: ['Ya existe un contacto con este teléfono'] } }
    }
    return { error: { _form: [error.message] } }
  }

  revalidatePath('/contactos')
  return { success: true, data }
}
```

### Pattern 5: Colombian Cities Autocomplete
**What:** Combobox with static cities dataset
**When to use:** City field in contact form
**Example:**
```typescript
// Source: https://github.com/marcovega/colombia-json + shadcn/ui Combobox
// lib/data/colombia-cities.ts
// Download from: https://github.com/marcovega/colombia-json

export const colombiaCities = [
  { value: "bogota", label: "Bogotá D.C.", department: "Cundinamarca" },
  { value: "medellin", label: "Medellín", department: "Antioquia" },
  { value: "cali", label: "Cali", department: "Valle del Cauca" },
  { value: "barranquilla", label: "Barranquilla", department: "Atlántico" },
  // ... 1100+ municipalities
] as const

// components/contacts/city-combobox.tsx
"use client"

import { useState } from "react"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import { colombiaCities } from "@/lib/data/colombia-cities"

export function CityCombobox({
  value,
  onChange
}: {
  value: string
  onChange: (value: string) => void
}) {
  const [search, setSearch] = useState("")

  const filtered = colombiaCities.filter(city =>
    city.label.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 50) // Limit for performance

  return (
    <Combobox value={value} onValueChange={onChange}>
      <ComboboxInput
        placeholder="Buscar ciudad..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <ComboboxContent>
        <ComboboxList>
          <ComboboxEmpty>No se encontraron ciudades</ComboboxEmpty>
          {filtered.map((city) => (
            <ComboboxItem key={city.value} value={city.label}>
              {city.label} - {city.department}
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
```

### Pattern 6: Toast Notifications with Sonner
**What:** Show feedback for CRUD operations
**When to use:** After create/edit/delete operations
**Example:**
```typescript
// Source: https://ui.shadcn.com/docs/components/sonner
// Already in layout from Phase 1: <Toaster />

// Usage in client component:
import { toast } from "sonner"

// After successful create
toast.success("Contacto creado", {
  description: `${contact.name} agregado correctamente`
})

// After error
toast.error("Error al crear contacto", {
  description: error.message
})

// For async operations with promise
toast.promise(createContactAction(formData), {
  loading: 'Creando contacto...',
  success: 'Contacto creado',
  error: 'Error al crear contacto'
})
```

### Anti-Patterns to Avoid
- **Phone normalization on display only:** Normalize on SAVE, store E.164 in DB always
- **Client-side filtering for large datasets:** Use server-side pagination for 1000+ contacts
- **Inline column definitions:** Define columns outside component with useMemo to avoid infinite re-renders
- **localStorage for table state:** Use cookies or URL params for server-accessible state
- **Fetching all tags on every render:** Fetch tags once per workspace, cache with React Context

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Phone number parsing/validation | Regex for +57 format | libphonenumber-js | Carrier codes, area codes, mobile vs landline, 1000+ edge cases |
| Data table with sorting/filtering | Custom table with useState | TanStack Table | Pagination, virtualization, column ordering, selection - months of work |
| Tag input with autocomplete | Input + dropdown + chips | Emblor | Keyboard nav, duplicates, validation, drag-drop already solved |
| City autocomplete | Fetch from API on each keystroke | Static JSON + Combobox | API has latency, Colombian cities don't change, 1100 cities is small |
| Toast notifications | Custom portal + animations | Sonner | Promise integration, stacking, accessibility, animations |
| Form validation | Manual validation in handler | Zod + React Hook Form | Type inference, error messages, async validation |

**Key insight:** Contact management looks simple but has hidden complexity in phone normalization (Colombian carrier codes, 10-digit vs 7-digit historical numbers) and data table UX (column resize, sort persistence, bulk selection). Use established libraries.

## Common Pitfalls

### Pitfall 1: Phone Normalization Inconsistency
**What goes wrong:** Phone stored as "3001234567" in one record, "+573001234567" in another, matching fails
**Why it happens:** Normalizing on display but not on save, or using different normalization in different places
**How to avoid:** ALWAYS normalize to E.164 on server before save, create single `normalizePhone()` utility
**Warning signs:** Duplicate contacts with "different" phone numbers, WhatsApp matching failures

### Pitfall 2: TanStack Table Infinite Re-renders
**What goes wrong:** Table re-renders infinitely, browser freezes
**Why it happens:** Columns or data array created inline without useMemo, React sees new reference each render
**How to avoid:** Define columns outside component OR wrap with useMemo, never inline `data={contacts.map(...)}`
**Warning signs:** Browser tab freezes, React DevTools shows constant re-renders

### Pitfall 3: Hydration Mismatch with Phone Formatting
**What goes wrong:** Server renders "+573001234567", client renders "+57 300 123 4567"
**Why it happens:** Formatting function uses different logic or locale on server vs client
**How to avoid:** Format for display in same location always (prefer client-side formatting), or use identical formatting everywhere
**Warning signs:** Console hydration errors, phone numbers "flash" on page load

### Pitfall 4: Missing RLS for Contacts
**What goes wrong:** User A sees User B's contacts from different workspace
**Why it happens:** RLS policy not created or doesn't check workspace_id correctly
**How to avoid:** Create RLS policy immediately after table creation, test with different workspace users
**Warning signs:** Contacts appearing that weren't created, security audit failures

### Pitfall 5: Tag Color Contrast
**What goes wrong:** White text on yellow background is unreadable
**Why it happens:** Using user-defined colors without contrast checking
**How to avoid:** Use predefined palette with guaranteed contrast, or calculate text color dynamically (light/dark based on bg luminance)
**Warning signs:** Accessibility audit failures, user complaints about readability

### Pitfall 6: Bulk Delete Without Confirmation
**What goes wrong:** User accidentally deletes 100 contacts
**Why it happens:** Delete action triggered immediately on button click
**How to avoid:** ALWAYS show confirmation modal for delete operations, especially bulk
**Warning signs:** Support tickets about "missing" contacts, no audit trail

## Code Examples

Verified patterns from official sources:

### Database Schema for Contacts
```sql
-- Source: Supabase patterns + MorfX conventions
-- supabase/migrations/XXXXXXXX_contacts_and_tags.sql

-- Tags table (workspace-scoped)
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1', -- Default indigo
  created_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(workspace_id, name)
);

-- Contacts table
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL, -- E.164 format: +573001234567
  email TEXT,
  address TEXT,
  city TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(workspace_id, phone) -- Phone unique per workspace
);

-- Junction table for contact-tag relationship
CREATE TABLE contact_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(contact_id, tag_id)
);

-- Indexes for performance
CREATE INDEX idx_contacts_workspace ON contacts(workspace_id);
CREATE INDEX idx_contacts_phone ON contacts(phone);
CREATE INDEX idx_contacts_updated ON contacts(updated_at DESC);
CREATE INDEX idx_tags_workspace ON tags(workspace_id);
CREATE INDEX idx_contact_tags_contact ON contact_tags(contact_id);
CREATE INDEX idx_contact_tags_tag ON contact_tags(tag_id);

-- RLS Policies
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_tags ENABLE ROW LEVEL SECURITY;

-- Contacts: Users can only see/modify contacts in their workspace
CREATE POLICY contacts_workspace_isolation ON contacts
  FOR ALL USING (
    workspace_id = (auth.jwt() -> 'app_metadata' ->> 'workspace_id')::uuid
  );

-- Tags: Users can only see/modify tags in their workspace
CREATE POLICY tags_workspace_isolation ON tags
  FOR ALL USING (
    workspace_id = (auth.jwt() -> 'app_metadata' ->> 'workspace_id')::uuid
  );

-- Contact_tags: Access through contact ownership
CREATE POLICY contact_tags_access ON contact_tags
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM contacts
      WHERE contacts.id = contact_tags.contact_id
      AND contacts.workspace_id = (auth.jwt() -> 'app_metadata' ->> 'workspace_id')::uuid
    )
  );

-- Trigger to auto-set workspace_id on insert
CREATE OR REPLACE FUNCTION set_workspace_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.workspace_id := (auth.jwt() -> 'app_metadata' ->> 'workspace_id')::uuid;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER contacts_set_workspace
  BEFORE INSERT ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION set_workspace_id();

CREATE TRIGGER tags_set_workspace
  BEFORE INSERT ON tags
  FOR EACH ROW
  EXECUTE FUNCTION set_workspace_id();

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := timezone('America/Bogota', NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

### Empty State Component
```typescript
// Source: shadcn/ui patterns
// components/contacts/empty-state.tsx
import { Button } from "@/components/ui/button"
import { UserPlus } from "lucide-react"

export function ContactsEmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <UserPlus className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">No hay contactos</h3>
      <p className="text-muted-foreground mb-4 max-w-sm">
        Agrega tu primer contacto para empezar a gestionar tus clientes y sus pedidos.
      </p>
      <Button onClick={onCreateClick}>
        <UserPlus className="mr-2 h-4 w-4" />
        Crear primer contacto
      </Button>
    </div>
  )
}
```

### Skeleton Loading for Table
```typescript
// Source: TanStack Table discussions + shadcn/ui Skeleton
// components/contacts/table-skeleton.tsx
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export function ContactsTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12"><Skeleton className="h-4 w-4" /></TableHead>
          <TableHead><Skeleton className="h-4 w-24" /></TableHead>
          <TableHead><Skeleton className="h-4 w-32" /></TableHead>
          <TableHead><Skeleton className="h-4 w-28" /></TableHead>
          <TableHead><Skeleton className="h-4 w-20" /></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 10 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-4" /></TableCell>
            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
            <TableCell><Skeleton className="h-4 w-28" /></TableCell>
            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
            <TableCell>
              <div className="flex gap-1">
                <Skeleton className="h-5 w-12 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

### Tag Color Palette
```typescript
// lib/data/tag-colors.ts
// Predefined palette with guaranteed contrast

export const TAG_COLORS = [
  { name: 'Rojo', value: '#ef4444', textColor: '#ffffff' },
  { name: 'Naranja', value: '#f97316', textColor: '#ffffff' },
  { name: 'Amarillo', value: '#eab308', textColor: '#000000' },
  { name: 'Verde', value: '#22c55e', textColor: '#ffffff' },
  { name: 'Azul', value: '#3b82f6', textColor: '#ffffff' },
  { name: 'Indigo', value: '#6366f1', textColor: '#ffffff' },
  { name: 'Violeta', value: '#8b5cf6', textColor: '#ffffff' },
  { name: 'Rosa', value: '#ec4899', textColor: '#ffffff' },
  { name: 'Gris', value: '#6b7280', textColor: '#ffffff' },
  { name: 'Cian', value: '#06b6d4', textColor: '#000000' },
] as const

export type TagColor = typeof TAG_COLORS[number]

// For custom hex colors, calculate text color dynamically
export function getContrastColor(hexColor: string): string {
  const hex = hexColor.replace('#', '')
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5 ? '#000000' : '#ffffff'
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| shadcn/ui Toast component | Sonner integration | 2025 | Toast component deprecated, Sonner is recommended |
| Custom data tables | TanStack Table + shadcn/ui | 2024+ | Headless approach with full control, better performance |
| react-dnd for drag-drop | @dnd-kit/core | 2023+ | react-dnd has React 18 issues, dnd-kit is modern |
| Form component with HOCs | Field component pattern | 2025 | shadcn/ui moving to simpler Field-based forms |

**Deprecated/outdated:**
- **shadcn/ui Toast:** Deprecated in favor of Sonner. Use `import { toast } from "sonner"` not `useToast()`
- **react-table v7:** TanStack Table v8 is the rewrite with better TypeScript support
- **react-dnd:** Incompatible with React 18 Strict Mode, use @dnd-kit/core

## Open Questions

Things that couldn't be fully resolved:

1. **Server-side vs Client-side Pagination Threshold**
   - What we know: TanStack Table handles 100k rows client-side, but 1000+ contacts will be common
   - What's unclear: Exact threshold where server-side pagination becomes necessary
   - Recommendation: Start with client-side for MVP, add server-side in Phase 5 if performance issues

2. **Tag Scope Flexibility**
   - What we know: User decided "tags globales por defecto + opción de tags específicos de módulo"
   - What's unclear: Exact UX for creating module-specific tags
   - Recommendation: Implement global tags only in Phase 4, add module scope in Phase 5

3. **Bulk Actions Performance**
   - What we know: Bulk delete/tag operations need confirmation
   - What's unclear: Performance with 500+ selected contacts
   - Recommendation: Limit initial selection to 100, batch operations in 50-item chunks

## Sources

### Primary (HIGH confidence)
- [shadcn/ui Data Table](https://ui.shadcn.com/docs/components/data-table) - Official data table pattern
- [shadcn/ui Sonner](https://ui.shadcn.com/docs/components/sonner) - Toast component replacement
- [shadcn/ui Combobox](https://ui.shadcn.com/docs/components/combobox) - Autocomplete pattern
- [TanStack Table Docs](https://tanstack.com/table/latest/docs/guide/sorting) - Sorting, filtering, pagination
- [libphonenumber-js GitHub](https://github.com/catamphetamine/libphonenumber-js) - Phone normalization
- [Emblor GitHub](https://github.com/JaleelB/emblor) - Tag input component
- [Supabase RLS Docs](https://supabase.com/docs/guides/database/postgres/row-level-security) - Row Level Security

### Secondary (MEDIUM confidence)
- [colombia-json GitHub](https://github.com/marcovega/colombia-json) - Colombian cities dataset
- [TanStack Table + Supabase Example](https://allshadcn.com/tools/supabase-database/) - Integration patterns
- [Next.js 15 Server Actions](https://nextjs.org/docs/app/guides/forms) - Form handling

### Tertiary (LOW confidence - marked for validation)
- [TanStack Table skeleton loading discussion](https://github.com/TanStack/table/discussions/2386) - Community pattern

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries verified with official docs and are established in ecosystem
- Architecture: HIGH - Patterns from shadcn/ui official docs and project's Phase 1-3 conventions
- Pitfalls: HIGH - Based on Phase 2-3 LEARNINGS.md and documented issues

**Research date:** 2026-01-28
**Valid until:** 2026-03-28 (60 days - stable libraries, established patterns)

---

## Research Notes

**Key discoveries:**
1. shadcn/ui Toast is DEPRECATED - use Sonner (already in Phase 1 layout)
2. TanStack Table with shadcn/ui is the established pattern, not a custom table
3. libphonenumber-js is 10x smaller than google-libphonenumber and handles Colombia correctly
4. Colombian cities can be a static JSON (1100 entries), no need for API
5. Emblor provides enterprise-grade tag input with shadcn/ui integration

**What makes this phase unique:**
- Phone is the UNIQUE KEY connecting contacts to WhatsApp and orders
- Phone normalization must be 100% consistent (E.164 format)
- Empty state and onboarding UX is critical for new users
- Bulk operations need confirmation and performance consideration

**Implementation risks:**
- LOW: Data table implementation (shadcn/ui pattern is well documented)
- LOW: Form CRUD (established pattern from Phase 1)
- MEDIUM: Phone normalization edge cases (Colombian carrier codes)
- LOW: Tag system (Emblor handles complexity)
- LOW: RLS policies (established pattern from Phase 2)
