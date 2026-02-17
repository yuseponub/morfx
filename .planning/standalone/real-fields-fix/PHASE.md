# Standalone Phase: Real Fields Fix

## Goal

Make all CRM fields REAL — every field shown in UI or used in automations must correspond to a real database column with real data. No hacks, no decorative fields.

## Must-Haves

1. `orders.name` column exists and stores order reference (e.g., Shopify "#1001")
2. `contacts.department` column exists and stores Colombian department
3. `orders.shipping_department` column exists (verify, add if missing)
4. Shopify webhook maps `order.name` → `orders.name` (not into description)
5. Enrichment uses real `orders.name` for `orden.nombre` variable
6. CRM order form shows: name, shipping_department fields
7. CRM order detail/sheet shows: name, shipping_department
8. CRM kanban card shows order name
9. CRM contact form shows department dropdown
10. CRM contact detail shows department
11. `{{orden.nombre}}` automation variable resolves from real `orders.name`
12. `{{contacto.departamento}}` resolves from real `contacts.department`

## Background

Multiple fields were defined in TypeScript types and domain layer code but never created as actual database columns. The code "works" by silently ignoring the missing columns, resulting in empty/undefined data that breaks automations (specifically WhatsApp template variables resolving to empty strings, causing Meta API #131008 errors).

## Scope

- DB migrations for missing columns
- Backend: types, domain, Shopify mapper, enrichment, variable resolver
- UI: order form, order sheet, kanban card, contact form, contact detail, contact columns
