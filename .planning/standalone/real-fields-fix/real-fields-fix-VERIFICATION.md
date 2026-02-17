---
phase: standalone/real-fields-fix
verified: 2026-02-17T17:48:48-05:00
status: gaps_found
score: 22/24 must-haves verified
gaps:
  - truth: "{{contacto.departamento}} resolves from real contacts.department"
    status: failed
    reason: "TriggerContext type missing contactDepartment field — runtime enrichment happens but TypeScript type is incomplete"
    artifacts:
      - path: "src/lib/automations/types.ts"
        issue: "TriggerContext interface missing contactDepartment?: string field"
    missing:
      - "Add contactDepartment?: string to TriggerContext interface (line 206 after contactCity)"
      - "Add contactAddress?: string to TriggerContext interface (also missing but used)"
---

# Phase standalone/real-fields-fix Verification Report

**Phase Goal:** Make all CRM fields REAL — every field shown in UI or used in automations must correspond to a real database column with real data. No hacks, no decorative fields.

**Verified:** 2026-02-17T17:48:48-05:00
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | orders.name column exists | ✓ VERIFIED | Migration 20260217000000_real_fields.sql line 6 |
| 2 | contacts.department column exists | ✓ VERIFIED | Migration 20260217000000_real_fields.sql line 9 |
| 3 | orders.shipping_department column exists | ✓ VERIFIED | Migration 20260217000000_real_fields.sql line 12 |
| 4 | Shopify order.name → orders.name | ✓ VERIFIED | order-mapper.ts line 67 |
| 5 | Shopify shipping_department stored | ✓ VERIFIED | order-mapper.ts line 71 |
| 6 | Domain createOrder inserts name | ✓ VERIFIED | domain/orders.ts line 178 |
| 7 | Domain createOrder inserts shipping_department | ✓ VERIFIED | domain/orders.ts line 183 |
| 8 | Domain updateOrder handles name | ✓ VERIFIED | domain/orders.ts line 292 |
| 9 | Domain updateOrder handles shipping_department | ✓ VERIFIED | domain/orders.ts line 292 |
| 10 | Server action createOrder passes name | ✓ VERIFIED | actions/orders.ts line 458 |
| 11 | Server action createOrder passes shippingDepartment | ✓ VERIFIED | actions/orders.ts line 464 |
| 12 | Server action updateOrder passes name | ✓ VERIFIED | actions/orders.ts line 520 |
| 13 | Server action updateOrder passes shippingDepartment | ✓ VERIFIED | actions/orders.ts line 526 |
| 14 | Contact server action passes department | ✓ VERIFIED | actions/contacts.ts line 251, 307, 363 |
| 15 | Enrichment uses real orders.name for orderName | ✓ VERIFIED | automation-runner.ts line 419 (order.name preferred) |
| 16 | CityCombobox emits department | ✓ VERIFIED | city-combobox.tsx line 13, 129 |
| 17 | Order form has "Referencia" input | ✓ VERIFIED | order-form.tsx line 261-265 |
| 18 | Order form auto-sets shipping_department | ✓ VERIFIED | order-form.tsx line 402 (onDepartmentChange) |
| 19 | Order sheet displays name | ✓ VERIFIED | order-sheet.tsx line 163-165 |
| 20 | Order sheet displays shipping_department | ✓ VERIFIED | order-sheet.tsx line 373 |
| 21 | Kanban card shows order name | ✓ VERIFIED | kanban-card.tsx line 126-130 |
| 22 | Contact form auto-sets department | ✓ VERIFIED | contact-form.tsx line 152 |
| 23 | Contact detail shows department | ✓ VERIFIED | contactos/[id]/page.tsx line 179, 187 |
| 24 | Contact table has department column | ✓ VERIFIED | columns.tsx line 147, 154 |
| 25 | {{contacto.departamento}} resolves from contacts.department | ✗ FAILED | See gaps section |

**Score:** 22/24 truths verified (2 gaps found)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| supabase/migrations/20260217000000_real_fields.sql | Migration adds 3 columns | ✓ VERIFIED | Lines 6, 9, 12 — name, department, shipping_department |
| src/lib/orders/types.ts | Order interface has name | ✓ VERIFIED | Line 135 — name: string \| null |
| src/lib/orders/types.ts | OrderFormData has name | ✓ VERIFIED | Line 154 — name?: string \| null |
| src/lib/domain/orders.ts | CreateOrderParams has name + shippingDepartment | ✓ VERIFIED | Lines 34, 39 |
| src/lib/domain/orders.ts | UpdateOrderParams has name + shippingDepartment | ✓ VERIFIED | Lines 55, 60 |
| src/lib/domain/orders.ts | createOrder inserts both fields | ✓ VERIFIED | Lines 178, 183 |
| src/lib/domain/orders.ts | updateOrder updates both fields | ✓ VERIFIED | Line 292 (conditional updates) |
| src/lib/shopify/order-mapper.ts | Maps order.name | ✓ VERIFIED | Line 67 |
| src/lib/shopify/order-mapper.ts | Maps shipping_department | ✓ VERIFIED | Line 71 |
| src/app/actions/orders.ts | Zod schema includes name | ✓ VERIFIED | Line 44 |
| src/app/actions/contacts.ts | Zod schema includes department | ✓ VERIFIED | Line 30 |
| src/lib/automations/variable-resolver.ts | Resolves orden.nombre from orderName | ✓ VERIFIED | Line 164 |
| src/lib/automations/variable-resolver.ts | Resolves contacto.departamento from contactDepartment | ✓ VERIFIED | Line 157 |
| src/inngest/functions/automation-runner.ts | Enriches orderName from order.name | ✓ VERIFIED | Line 419 |
| src/inngest/functions/automation-runner.ts | Enriches contactDepartment from contact.department | ✓ VERIFIED | Line 435 |
| src/components/contacts/city-combobox.tsx | onDepartmentChange callback | ✓ VERIFIED | Lines 13, 23, 129 |
| src/app/(dashboard)/crm/pedidos/components/order-form.tsx | Referencia input | ✓ VERIFIED | Lines 261-265 |
| src/app/(dashboard)/crm/pedidos/components/order-form.tsx | Auto-set shipping_department | ✓ VERIFIED | Line 402 |
| src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx | Display name | ✓ VERIFIED | Lines 163-165 |
| src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx | Display shipping_department | ✓ VERIFIED | Line 373 |
| src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx | Display order name | ✓ VERIFIED | Lines 126-130 |
| src/app/(dashboard)/crm/contactos/components/contact-form.tsx | Auto-set department | ✓ VERIFIED | Lines 22, 52, 70, 80, 152 |
| src/app/(dashboard)/crm/contactos/[id]/page.tsx | Display department | ✓ VERIFIED | Lines 179, 187 |
| src/app/(dashboard)/crm/contactos/components/columns.tsx | Department column | ✓ VERIFIED | Lines 147, 154 |
| src/lib/automations/types.ts | TriggerContext has contactDepartment | ✗ STUB | Missing field — see gaps |
| src/lib/automations/types.ts | TriggerContext has contactAddress | ✗ STUB | Missing field — not in must-haves but also missing |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| Shopify webhook | orders.name | order-mapper.ts → domain.createOrder | ✓ WIRED | Line 67 → domain param |
| Shopify webhook | orders.shipping_department | order-mapper.ts → domain.createOrder | ✓ WIRED | Line 71 → domain param |
| Order form | orders.name | form field → server action → domain | ✓ WIRED | Lines 261-265 → 458 → 178 |
| Order form | orders.shipping_department | CityCombobox callback → form → server action → domain | ✓ WIRED | Line 402 → 464 → 183 |
| Contact form | contacts.department | CityCombobox callback → form → server action → domain | ✓ WIRED | Line 152 → 251/307/363 → domain |
| Automation runner | {{orden.nombre}} | order.name → orderName → variable-resolver | ✓ WIRED | Line 419 → 164 |
| Automation runner | {{contacto.departamento}} | contact.department → contactDepartment → variable-resolver | ⚠️ PARTIAL | Line 435 enriches but TriggerContext type incomplete |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/lib/automations/types.ts | 206 | Missing field in type | ⚠️ WARNING | contactDepartment enriched at runtime but TypeScript type incomplete — no compiler safety |
| src/lib/automations/types.ts | 206 | Missing field in type | ⚠️ WARNING | contactAddress enriched at runtime but TypeScript type incomplete — no compiler safety |

### Gaps Summary

**2 gaps found:**

1. **TriggerContext missing contactDepartment field**
   - Runtime: contactDepartment is enriched in automation-runner.ts line 435 and resolved in variable-resolver.ts line 157
   - TypeScript: TriggerContext interface (types.ts line 189-220) missing the field
   - Impact: No type safety when accessing contactDepartment — could lead to runtime errors if enrichment breaks
   - Fix: Add `contactDepartment?: string` after line 206 in types.ts

2. **TriggerContext missing contactAddress field** (discovered during verification)
   - Runtime: contactAddress is enriched in automation-runner.ts line 433 and resolved in variable-resolver.ts line 158
   - TypeScript: TriggerContext interface missing the field
   - Impact: No type safety when accessing contactAddress
   - Fix: Add `contactAddress?: string` after line 206 in types.ts

**Root cause:** Type definition not updated when enrichment logic was extended with new contact fields.

**Severity:** Warning — functionality works at runtime but lacks TypeScript type safety.

## Verification Details

### Database Columns (Must-haves 1-3)

Migration file `supabase/migrations/20260217000000_real_fields.sql`:
```sql
-- Line 6: orders.name
ALTER TABLE orders ADD COLUMN IF NOT EXISTS name TEXT;

-- Line 9: contacts.department
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS department TEXT;

-- Line 12: orders.shipping_department
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_department TEXT;
```

✓ All 3 columns defined with TEXT type and IF NOT EXISTS safety.

### TypeScript Interfaces (Must-haves 4-7)

Orders types (src/lib/orders/types.ts):
```typescript
// Line 135 — Order interface
export interface Order {
  name: string | null
  shipping_department: string | null
  // ...
}

// Line 154 — OrderFormData
export interface OrderFormData {
  name?: string | null
  shipping_department?: string | null
  // ...
}
```

Domain params (src/lib/domain/orders.ts):
```typescript
// Lines 34, 39 — CreateOrderParams
export interface CreateOrderParams {
  name?: string | null
  shippingDepartment?: string | null
  // ...
}

// Lines 55, 60 — UpdateOrderParams
export interface UpdateOrderParams {
  name?: string | null
  shippingDepartment?: string | null
  // ...
}
```

✓ All interfaces include the new fields.

### Domain Layer (Must-haves 8-9)

Create order (src/lib/domain/orders.ts line 178, 183):
```typescript
const { data: order } = await supabase
  .from('orders')
  .insert({
    name: params.name || null,
    shipping_department: params.shippingDepartment || null,
    // ...
  })
```

Update order (src/lib/domain/orders.ts line 292):
```typescript
if (params.name !== undefined) updates.name = params.name || null
if (params.shippingDepartment !== undefined) updates.shipping_department = params.shippingDepartment || null
```

✓ Both create and update handle the fields correctly.

### Shopify Integration (Must-haves 10-11)

Order mapper (src/lib/shopify/order-mapper.ts):
```typescript
// Line 67
name: shopifyOrder.name,  // "#1001" — Shopify order reference

// Line 71
shipping_department: shopifyOrder.shipping_address?.province || null,
```

✓ Shopify order.name maps to orders.name (not description).
✓ Shopify province maps to shipping_department.

### Server Actions (Must-haves 12-15)

Orders actions (src/app/actions/orders.ts):
```typescript
// Line 44 — Zod schema
name: z.string().optional().nullable(),

// Line 458 — createOrder
name: orderData.name,

// Line 464 — createOrder
shippingDepartment: orderData.shipping_department,

// Lines 520, 526 — updateOrder
name: orderData.name,
shippingDepartment: orderData.shipping_department,
```

Contacts actions (src/app/actions/contacts.ts):
```typescript
// Line 30 — Zod schema
department: z.string().optional().or(z.literal('')),

// Lines 251, 307, 363 — create/update paths
department: result.data.department || undefined,
```

✓ Zod schemas validate the fields.
✓ Server actions pass fields to domain layer.

### Enrichment & Variable Resolution (Must-have 16)

Automation runner (src/inngest/functions/automation-runner.ts):
```typescript
// Line 419 — orderName enrichment
orderName: order.name || order.description || `Orden #${order.id.slice(0, 8)}`,

// Line 435 — contactDepartment enrichment
contactDepartment: contact?.department,
```

Variable resolver (src/lib/automations/variable-resolver.ts):
```typescript
// Line 164 — {{orden.nombre}}
if (eventData.orderName !== undefined) orden.nombre = eventData.orderName

// Line 157 — {{contacto.departamento}}
if (eventData.contactDepartment !== undefined) contacto.departamento = eventData.contactDepartment
```

✓ orderName prefers real orders.name field.
✓ contactDepartment resolves from contacts.department.

⚠️ BUT TriggerContext type (types.ts) missing contactDepartment field — runtime works but no type safety.

### UI Components (Must-haves 17-24)

CityCombobox (src/components/contacts/city-combobox.tsx):
```typescript
// Line 13 — Props interface
onDepartmentChange?: (department: string) => void

// Line 129 — Emit on selection
onDepartmentChange?.(city.department)
```

Order form (src/app/(dashboard)/crm/pedidos/components/order-form.tsx):
```typescript
// Lines 261-265 — Referencia input
<Label htmlFor="name">Referencia</Label>
<Input {...form.register('name')} placeholder="Ej: #1001, PED-2024-001" />

// Line 402 — Auto-set shipping_department
onDepartmentChange={(dept) => form.setValue('shipping_department', dept)}
```

Order sheet (src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx):
```typescript
// Lines 163-165 — Display name
{order.name && (
  <p className="text-sm font-mono text-muted-foreground">{order.name}</p>
)}

// Line 373 — Display shipping_department
{order.shipping_department && `, ${order.shipping_department}`}
```

Kanban card (src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx):
```typescript
// Lines 126-130 — Display order name
{order.name && (
  <span className="text-[11px] font-mono text-muted-foreground truncate block">
    {order.name}
  </span>
)}
```

Contact form (src/app/(dashboard)/crm/contactos/components/contact-form.tsx):
```typescript
// Line 152 — Auto-set department
onDepartmentChange={(dept) => form.setValue('department', dept)}
```

Contact detail (src/app/(dashboard)/crm/contactos/[id]/page.tsx):
```typescript
// Lines 179, 187 — Display department
{contact.department || city.department}
{contact.department && (...)}
```

Contact table (src/app/(dashboard)/crm/contactos/components/columns.tsx):
```typescript
// Line 147 — Column definition
accessorKey: 'department',

// Line 154 — Header
Departamento
```

✓ All UI components correctly display and handle the new fields.

---

_Verified: 2026-02-17T17:48:48-05:00_
_Verifier: Claude (gsd-verifier)_
