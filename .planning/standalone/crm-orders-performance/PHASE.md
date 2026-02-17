# Phase: standalone/crm-orders-performance

## Goal

Fix broken Kanban scroll and add infinite scroll pagination to orders, preparing for 30,000+ orders.

## Problems

1. **Scroll roto:** Columnas del Kanban no hacen scroll porque el contenedor padre no tiene max-height
2. **Sin paginacion:** getOrders() carga TODAS las ordenes con joins pesados — inutilizable con 30K+

## Scope

- Fix CSS scroll in kanban-board.tsx
- Add server-side pagination (LIMIT/OFFSET per stage) to getOrders()
- Add infinite scroll in Kanban columns (load 20, scroll for more)
- Maintain list view compatibility

## Out of Scope

- List view pagination (future — currently manageable)
- Server-side search (client-side Fuse.js sufficient for visible orders)
- Order archiving/soft delete

## Key Files

- `src/app/(dashboard)/crm/pedidos/page.tsx` — Server component, loads all data
- `src/app/actions/orders.ts` — getOrders() with no LIMIT
- `src/app/(dashboard)/crm/pedidos/components/orders-view.tsx` — Main client view
- `src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx` — Board container (scroll bug)
- `src/app/(dashboard)/crm/pedidos/components/kanban-column.tsx` — Column with overflow-y-auto
