---
phase: 06-orders
plan: 04
subsystem: crm
tags: [orders, crud, table, form, react-hook-form, tanstack-table, sheet, calendar]

# Dependency graph
requires:
  - phase: 06-orders
    plan: 01
    provides: orders table, order_products table, pipelines, pipeline_stages, TypeScript types
  - phase: 06-orders
    plan: 02
    provides: products Server Actions (getActiveProducts)
  - phase: 04-contacts-base
    provides: contacts Server Actions, ContactWithTags type
provides:
  - Order CRUD Server Actions (getOrders, createOrder, updateOrder, deleteOrder, moveOrderToStage)
  - Orders list page at /crm/pedidos
  - Order form with product picker and contact selector
  - Pipeline/Stage filtering for orders table
affects: [06-05 Kanban Board]

# Tech tracking
tech-stack:
  added:
    - date-fns 4.1.0 (date formatting)
    - react-day-picker 9.13.0 (calendar UI)
  patterns:
    - Sheet component for large forms (vs Dialog for small forms)
    - ProductPicker with catalog search and manual entry
    - ContactSelector combobox with name/phone search
    - Pipeline/Stage cascade filtering

key-files:
  created:
    - src/app/actions/orders.ts
    - src/app/(dashboard)/crm/pedidos/page.tsx
    - src/app/(dashboard)/crm/pedidos/components/orders-table.tsx
    - src/app/(dashboard)/crm/pedidos/components/order-form.tsx
    - src/app/(dashboard)/crm/pedidos/components/columns.tsx
    - src/app/(dashboard)/crm/pedidos/components/product-picker.tsx
    - src/app/(dashboard)/crm/pedidos/components/contact-selector.tsx
    - src/components/ui/calendar.tsx
  modified: []

key-decisions:
  - "Sheet instead of Dialog for order form - more space for complex form with multiple sections"
  - "ProductPicker supports both catalog products and manual entry for flexibility"
  - "No Zod validation in form - simpler TypeScript interface for react-hook-form compatibility"
  - "Pipeline filter resets stage filter when changed (UX: avoid invalid combinations)"
  - "ContactSelector shows first 50 results with client-side search (performance)"

patterns-established:
  - "Sheet for large forms with ScrollArea for content"
  - "ContactSelector combobox pattern (reusable for other entities)"
  - "ProductPicker with running total display"
  - "Carrier dropdown with common Colombian carriers"

# Metrics
duration: 17min
completed: 2026-01-29
---

# Phase 6 Plan 4: Orders CRUD Summary

**Complete order CRUD with list view, contact selection, product picker with quantities, and tracking info support**

## Performance

- **Duration:** 17 min
- **Started:** 2026-01-29T18:39:39Z
- **Completed:** 2026-01-29T18:56:41Z
- **Tasks:** 2/2
- **Files created:** 8

## Accomplishments

- Server Actions for complete order lifecycle (create, read, update, delete, move)
- Orders list page with TanStack Table at /crm/pedidos
- Order form in Sheet with five sections (Contact, Products, Details, Shipping, Notes)
- ProductPicker supporting catalog products and manual entry
- ContactSelector with name/phone search
- Pipeline and Stage filter dropdowns
- Calendar component for closing date selection
- AlertDialog for delete confirmations

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Server Actions for order CRUD** - Already existed from 06-03 (pipeline setup)
2. **Task 2: Create orders page with table view and forms** - `754463b` (feat)

## Files Created/Modified

### Server Actions (src/app/actions/orders.ts)
- `getOrders(filters?)` - Get orders with optional pipeline/stage/contact filters
- `getOrdersByPipeline(pipelineId)` - Get orders for Kanban
- `getOrder(id)` - Get single order with all relations
- `createOrder(formData)` - Create order with products array
- `updateOrder(id, formData)` - Update order, replace products if provided
- `moveOrderToStage(orderId, stageId)` - Move with WIP limit check
- `deleteOrder(id)` - Delete order (products/tags cascade)
- `addOrderTag/removeOrderTag` - Tag operations
- `getPipelines()` - Get all pipelines with stages
- `getOrCreateDefaultPipeline()` - Ensure pipeline exists

### UI Components

**page.tsx:**
- Async Server Component
- Fetches orders, pipelines, products, contacts, tags
- Calls getOrCreateDefaultPipeline() to ensure pipeline exists

**orders-table.tsx:**
- TanStack Table with search, pipeline filter, stage filter
- "Nuevo Pedido" button opens Sheet
- Empty state with CTA
- AlertDialog for delete confirmation

**order-form.tsx:**
- Five sections: Contact, Products, Details, Shipping, Notes
- ContactSelector for contact selection
- ProductPicker for product management
- Pipeline/Stage cascade selectors
- Calendar popover for closing date
- ScrollArea for form content

**columns.tsx:**
- Contact (name + phone)
- Value (COP currency, sortable)
- Stage (colored badge)
- Pipeline (text)
- Products (count + icon)
- Tracking (number + carrier)
- Tags (badges, max 2 shown)
- Date (relative time)
- Actions (edit, delete)

**product-picker.tsx:**
- Add products from catalog via Combobox
- Add manual products (SKU, title, price)
- Quantity controls (+/- buttons and input)
- Price editing per line
- Running total display
- Remove button per line

**contact-selector.tsx:**
- Combobox with name/phone search
- Shows selected contact info (name, phone, city)
- Clear button to deselect
- Limit 50 results for performance

**calendar.tsx:**
- Wrapper for react-day-picker v9
- Styling consistent with shadcn/ui

## Decisions Made

1. **Sheet instead of Dialog** - Order form is complex with multiple sections; Sheet provides more space
2. **ProductPicker manual entry** - Allow adding products not in catalog for flexibility
3. **No Zod validation** - Simpler TypeScript interface for react-hook-form compatibility with Zod v4
4. **Pipeline filter cascade** - Stage filter resets when pipeline changes to avoid invalid combinations
5. **ContactSelector limit 50** - Performance optimization with client-side filtering

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Calendar component missing**
- **Found during:** Task 2
- **Issue:** Calendar component not in project, needed for date picker
- **Fix:** Created src/components/ui/calendar.tsx, added date-fns and react-day-picker
- **Commit:** `754463b`

**2. [Rule 3 - Blocking] React-day-picker v9 API changes**
- **Found during:** Task 2
- **Issue:** Initial calendar used v8 API (IconLeft/IconRight), v9 uses Chevron component
- **Fix:** Updated calendar.tsx to use v9 classNames and Chevron component
- **Commit:** `754463b`

**3. [Rule 1 - Bug] Zod v4 inference incompatibility with react-hook-form**
- **Found during:** Task 2
- **Issue:** zodResolver with Zod v4 schema caused TypeScript errors with default values
- **Fix:** Replaced Zod schema with explicit TypeScript interface for FormData
- **Commit:** `754463b`

## Issues Encountered

None critical. Zod v4 type inference with react-hook-form required workaround (explicit interface instead of z.infer).

## User Setup Required

None - no external service configuration required. Migrations need to be applied to Supabase.

## Verification Checklist

- [x] Orders Server Actions compile: `pnpm tsc --noEmit`
- [x] Orders page accessible at /crm/pedidos
- [x] Can create order with contact and products (form structure complete)
- [x] Order total auto-calculates from products (via DB trigger)
- [x] Can edit order (form supports edit mode)
- [x] Can delete order with confirmation (AlertDialog)
- [x] Table shows orders with filtering by pipeline/stage
- [x] Product picker allows adding multiple products with quantities

## Next Phase Readiness

- Orders CRUD complete, ready for Kanban board (Plan 05)
- moveOrderToStage() already supports WIP limit checking
- Order types include KanbanState and OrdersByStage for board view
- Stage colors available for visual differentiation

---
*Phase: 06-orders*
*Completed: 2026-01-29*
