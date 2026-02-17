---
phase: standalone/real-fields-fix
plan: 02
title: Backend pipeline — Shopify, server actions, enrichment
wave: 2
depends_on: ["01"]
autonomous: true
files_modified:
  - src/lib/shopify/order-mapper.ts
  - src/lib/shopify/webhook-handler.ts
  - src/app/actions/orders.ts
  - src/app/actions/contacts.ts
  - src/inngest/functions/automation-runner.ts
must_haves:
  - Shopify order.name stored as orders.name (not stuffed into description)
  - Shopify shipping_department passed to domain createOrder
  - Server action createOrder passes name + shippingDepartment to domain
  - Server action updateOrder passes name + shippingDepartment to domain
  - Zod schemas include name and shipping_department fields
  - Contact server action passes department to domain
  - Enrichment uses real orders.name for orderName (no description hack)
  - Contact department included in enrichment query (already queried, verify column exists)
---

# Plan 02: Backend Pipeline

## Goal
Wire up the real fields through the entire backend: Shopify webhook → domain → server actions → enrichment.

## Tasks

<task id="02.1" name="Update Shopify order-mapper">
**Action:** Edit `src/lib/shopify/order-mapper.ts`

1. Add `name` to `OrderFormData` output in `mapShopifyOrder()`:
   ```typescript
   const order: OrderFormData = {
     contact_id: contactId,
     pipeline_id: config.default_pipeline_id,
     stage_id: config.default_stage_id,
     name: shopifyOrder.name,  // "#1001" — ADD THIS
     description: buildOrderDescription(shopifyOrder),
     ...
   }
   ```

2. Keep `buildOrderDescription` as-is — it stores notes/payment status as metadata. The `name` field now holds the actual reference.

**Verify:** `MappedOrder.order.name` contains Shopify order name like "#1001".
</task>

<task id="02.2" name="Update Shopify webhook handler">
**Action:** Edit `src/lib/shopify/webhook-handler.ts`

In `createOrderWithProducts()` function, add missing fields to domainCreateOrder call:
```typescript
const result = await domainCreateOrder(ctx, {
  pipelineId: mapped.order.pipeline_id,
  stageId: mapped.order.stage_id,
  contactId: mapped.order.contact_id,
  name: mapped.order.name,  // ADD
  description: mapped.order.description,
  shippingAddress: mapped.order.shipping_address,
  shippingCity: mapped.order.shipping_city,
  shippingDepartment: mapped.order.shipping_department,  // ADD — was being DROPPED
  products: mapped.products.map(p => ({
    ...
  })),
})
```

**Verify:** Both `name` and `shippingDepartment` are passed to domain.
</task>

<task id="02.3" name="Update server action Zod schemas + domain calls">
**Action:** Edit `src/app/actions/orders.ts`

1. Add to `orderSchema`:
   ```typescript
   name: z.string().optional().nullable(),
   shipping_department: z.string().optional().nullable(),
   ```

2. In `createOrder()` server action, add to domainCreateOrder call:
   ```typescript
   name: orderData.name,
   shippingDepartment: orderData.shipping_department,
   ```

3. In `updateOrder()` server action, add to domainUpdateOrder call:
   ```typescript
   name: orderData.name,
   shippingDepartment: orderData.shipping_department,
   ```

**Verify:** Server actions pass both fields through to domain.
</task>

<task id="02.4" name="Update contacts server action">
**Action:** Edit `src/app/actions/contacts.ts`

Verify that `createContact` and `updateContactFromForm` pass `department` to domain. The domain `contacts.ts` already accepts it. Check if the server action passes it:
- In `createContact()`: ensure `department` is included
- In `updateContactFromForm()`: ensure `department` is included

If CityCombobox auto-sets department from city selection, the form will send both city and department.

**Verify:** Department flows from server action to domain on create and update.
</task>

<task id="02.5" name="Fix enrichment to use real orders.name">
**Action:** Edit `src/inngest/functions/automation-runner.ts`

1. Add `name` to the enrichment select query:
   ```typescript
   .select(`
     id, name, pipeline_id, stage_id, total_value,
     shipping_address, shipping_city, shipping_department, description,
     contacts:contact_id (id, name, phone, email, address, city, department)
   `)
   ```

2. Replace the hack `orderName: order.description || 'Orden #${order.id.slice(0, 8)}'` with:
   ```typescript
   orderName: order.name || order.description || `Orden #${order.id.slice(0, 8)}`,
   ```

   Keep fallback chain: real name → description → truncated ID (for old orders without name).

**Verify:** `{{orden.nombre}}` resolves to real order name from DB.
</task>

## Verification
- Shopify order "#1001" stored in `orders.name`
- `orders.shipping_department` populated from Shopify province
- Server actions include `name` and `shipping_department` in validation + domain calls
- Enrichment query includes `name` column
- `orderName` uses real `name` column with safe fallbacks
