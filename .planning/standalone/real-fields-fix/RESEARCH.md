# Research: Real Fields Fix

## Audit Results

### Orders Table — Current Columns (from migrations)
- id, workspace_id, contact_id, pipeline_id, stage_id, total_value, closing_date, description, carrier, tracking_number, shipping_address, shipping_city, linked_order_id, source_order_id, custom_fields, shopify_order_id, created_at, updated_at
- `shipping_department`: EXISTS in TypeScript type, script `scripts/add-department.sql` exists but NOT in migrations — uncertain if in production DB
- `name`: DOES NOT EXIST anywhere — no migration, no type

### Contacts Table — Current Columns (from migrations)
- id, workspace_id, name, phone, email, address, city, custom_fields, created_at, updated_at
- `department`: EXISTS in TypeScript type + domain layer, but NO migration ever created it

### Shopify Mapping (order-mapper.ts)
- `order.name` ("#1001") → currently concatenated into `description` as "Pedido Shopify #1001"
- `shipping_address.province` → mapped to `shippingDepartment` param (correct)
- `shipping_address.city` → mapped to `shippingCity` param (correct)

### Enrichment (automation-runner.ts)
- Queries `shipping_department` from orders (may fail if column doesn't exist)
- Had `name` in query which caused silent failure — was removed as hotfix
- `orderName` currently uses hack: `order.description || 'Orden #${order.id.slice(0,8)}'`

### Variable Resolution
- `orden.nombre` → from `eventData.orderName` → currently hack value
- `orden.departamento_envio` → from `eventData.shippingDepartment` → may be empty
- `contacto.departamento` → from enriched contact.department → empty (column doesn't exist)

### UI Gaps
- Order form: NO name field, NO shipping_department field
- Order sheet: NO name display, NO shipping_department display
- Kanban card: NO order name
- Contact form: NO department field
- Contact detail: shows city but NOT department
- Contact columns: NO department column

## Key Files to Modify

### DB
- New migration: `supabase/migrations/YYYYMMDD_real_fields.sql`

### Types
- `src/lib/orders/types.ts` — Add `name` to Order interface + OrderWithDetails
- `src/lib/types/database.ts` — Verify Contact type (already has department)

### Domain
- `src/lib/domain/orders.ts` — Add `name` to CreateOrderParams, UpdateOrderParams, insert/update queries

### Shopify
- `src/lib/shopify/order-mapper.ts` — Map order.name → name field (not description)

### Enrichment
- `src/inngest/functions/automation-runner.ts` — Add `name` to select, use real name for orderName

### UI - Orders
- `src/app/(dashboard)/crm/pedidos/components/order-form.tsx` — Add name input, shipping_department dropdown
- `src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx` — Display name, shipping_department
- `src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx` — Show order name

### UI - Contacts
- `src/app/(dashboard)/crm/contactos/components/contact-form.tsx` — Add department dropdown
- `src/app/(dashboard)/crm/contactos/[id]/page.tsx` — Display department
- `src/app/(dashboard)/crm/contactos/components/columns.tsx` — Add department column

### Server Actions
- `src/app/actions/orders.ts` — Include name in create/update actions
- `src/app/actions/contacts.ts` — Include department in server actions (verify)

## Department Dropdown
Colombia has 32 departments + Bogotá D.C. The city combobox already exists (CityCombobox). Need to check if there's already a department list or if city selection auto-sets department.
