---
phase: standalone/real-fields-fix
plan: 01
title: Database migrations + TypeScript types
wave: 1
depends_on: []
autonomous: true
files_modified:
  - supabase/migrations/20260217000000_real_fields.sql
  - src/lib/orders/types.ts
  - src/lib/domain/orders.ts
must_haves:
  - orders table has `name TEXT` column
  - contacts table has `department TEXT` column
  - orders table has `shipping_department TEXT` column (verified or added)
  - Order TypeScript interface includes `name: string | null`
  - OrderFormData includes `name` field
  - OrderWithDetails unchanged (name comes from base Order)
  - CreateOrderParams has `name` field
  - UpdateOrderParams has `name` and `shippingDepartment` fields
  - Domain createOrder inserts `name`
  - Domain updateOrder handles `name` and `shipping_department`
---

# Plan 01: Database Migrations + TypeScript Types

## Goal
Add missing real columns to database and update TypeScript types/domain params to support them.

## Tasks

<task id="01.1" name="Create SQL migration">
**Action:** Create migration file `supabase/migrations/20260217000000_real_fields.sql`

```sql
-- Add name column to orders (order reference/identifier)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS name TEXT;

-- Add department column to contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS department TEXT;

-- Add shipping_department to orders (may already exist from manual script)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_department TEXT;

-- Index for department lookups
CREATE INDEX IF NOT EXISTS idx_contacts_department ON contacts(department);
CREATE INDEX IF NOT EXISTS idx_orders_shipping_department ON orders(shipping_department);
```

**Verify:** File exists and SQL is valid.
</task>

<task id="01.2" name="Update Order TypeScript interface">
**Action:** Edit `src/lib/orders/types.ts`

Add `name: string | null` to the `Order` interface (after `description`):
```typescript
name: string | null
```

Add `name?: string | null` to `OrderFormData` interface.

**Verify:** `Order` has `name`, `OrderFormData` has `name`.
</task>

<task id="01.3" name="Update domain CreateOrderParams">
**Action:** Edit `src/lib/domain/orders.ts`

1. Add `name?: string | null` to `CreateOrderParams` (after `description`)
2. Add `name?: string | null` and `shippingDepartment?: string | null` to `UpdateOrderParams`
3. In `createOrder()` insert: add `name: params.name || null`
4. In `updateOrder()` updates builder: add `if (params.name !== undefined) updates.name = params.name || null` and `if (params.shippingDepartment !== undefined) updates.shipping_department = params.shippingDepartment || null`
5. In `updateOrder()` previous state select: add `shipping_department` to the select list

**Verify:** Domain accepts and persists `name` and `shippingDepartment` on create and update.
</task>

## Verification
- Migration file has all 3 ALTER TABLE statements with IF NOT EXISTS
- TypeScript types include `name` field
- Domain layer handles `name` in both create and update paths
- Domain update handles `shippingDepartment`
