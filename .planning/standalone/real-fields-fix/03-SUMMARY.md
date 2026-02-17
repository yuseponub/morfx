---
phase: standalone/real-fields-fix
plan: 03
subsystem: ui, crm
tags: react-hook-form, city-combobox, kanban, order-form, contact-form

# Dependency graph
requires:
  - phase: standalone/real-fields-fix plan 01
    provides: DB columns (orders.name, orders.shipping_department, contacts.department) + TypeScript types
  - phase: standalone/real-fields-fix plan 02
    provides: Backend pipeline (server actions, Shopify enrichment, Zod schemas accept new fields)
provides:
  - CRM UI surfaces all real fields (name, shipping_department, department)
  - CityCombobox auto-derives department from city selection
  - Department column in contacts table
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "onDepartmentChange callback pattern for auto-deriving department from city"
    - "Font-mono styling for order references across kanban + sheet"

# File tracking
key-files:
  modified:
    - src/components/contacts/city-combobox.tsx
    - src/app/(dashboard)/crm/pedidos/components/order-form.tsx
    - src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx
    - src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx
    - src/app/(dashboard)/crm/contactos/components/contact-form.tsx
    - src/app/(dashboard)/crm/contactos/[id]/page.tsx
    - src/app/(dashboard)/crm/contactos/components/columns.tsx

# Decisions
decisions:
  - id: dept-auto-derive
    decision: "Department auto-derived from city selection, not shown as separate input"
    rationale: "Department is metadata of the city — showing it separately would be redundant and confusing"
  - id: order-name-ref
    decision: "Order name field labeled 'Referencia' with monospace placeholder examples"
    rationale: "Users think of order references as codes (#1001, PED-2024-001), not names"
  - id: dept-fallback
    decision: "Contact detail prefers stored department over city-derived department"
    rationale: "Shopify imports may have department values not matching our city list"

# Metrics
metrics:
  duration: ~8 min
  completed: 2026-02-17
---

# Phase standalone/real-fields-fix Plan 03: CRM UI Summary

**CityCombobox onDepartmentChange + order name/department in forms, sheets, and kanban cards**

## What was done

### Task 03.1: Extend CityCombobox with onDepartmentChange (ca488d0)
Added `onDepartmentChange?: (department: string) => void` prop to CityCombobox. When a city is selected, the callback fires with the city's department string. This enables parent forms to auto-derive department without manual input.

### Task 03.2: Add name + shipping_department to order form (6484367)
- Added `name` and `shipping_department` to the order form's FormData interface
- Added "Referencia" text input in the Details section (before pipeline/stage selectors)
- Connected CityCombobox's `onDepartmentChange` to auto-set `shipping_department`
- Both fields submitted to the server action via OrderFormData

### Task 03.3: Display name + shipping_department in order sheet (645a01b)
- Order name shown as monospace text below contact name in the sheet header
- Shipping department appended to shipping_city in the shipping section (e.g., "Bogota, Bogota D.C.")

### Task 03.4: Show order name on kanban card (99ee88d)
- Order name (reference) displayed below contact name in kanban card header
- Uses 11px monospace font for visual distinction from contact name

### Task 03.5: Add department to contact form (5d60b8b)
- Added `department` to Zod schema and default values
- Connected CityCombobox's `onDepartmentChange` to auto-set department
- Department passed in both create (object) and edit (FormData) code paths

### Task 03.6: Show department in contact detail (97c104e)
- Contact detail page now prefers stored `contact.department` over city-derived department
- Falls back to city lookup department when stored department is null
- Handles non-standard city values (e.g., Shopify imports) by showing stored department

### Task 03.7: Add department column to contacts table (933bb83)
- Added sortable "Departamento" column after Ciudad in the contacts data table
- Shows department string or dash placeholder when empty

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Department auto-derived from city, not shown as separate input | Department is metadata of city -- separate input is redundant |
| Order name labeled "Referencia" | Users think of order refs as codes, not names |
| Contact detail prefers stored department | Shopify imports may not match our city list |

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- [x] Order form has "Referencia" field and auto-sets shipping_department from city
- [x] Order sheet shows name and department
- [x] Kanban card shows order name
- [x] Contact form auto-fills department when city is selected
- [x] Contact detail shows department
- [x] Contact table has department column
- [x] Build succeeds with no errors
