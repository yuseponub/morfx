# Research: CRM Orders Performance

## Scroll Bug

**Root cause:** `kanban-board.tsx` line 308:
```
<div className="flex gap-4 overflow-x-auto pb-4 min-h-[calc(100vh-280px)]">
```
Uses `min-h` without `max-h`. Columns grow infinitely, `overflow-y-auto` on column never activates.

**Fix:** Change to `h-[calc(100vh-280px)]` (fixed height, not min).

## Pagination Architecture

**Current state:**
- `getOrders()` fetches ALL orders with heavy joins (contacts, products, tags, stage, pipeline)
- page.tsx loads everything server-side: `await getOrders()`
- orders-view.tsx groups by stage client-side
- No LIMIT, no OFFSET, no cursor

**For 30K orders current approach means:**
- 15-30+ second page load
- 50-100+ MB browser memory
- Slow client-side filtering

**Proposed approach: Per-stage pagination**

Instead of loading all orders then grouping client-side, load per-stage with LIMIT:

1. `getOrdersByStage(stageId, limit=20, offset=0)` — new server action
2. Each KanbanColumn independently fetches its own orders
3. IntersectionObserver at bottom of column triggers next page
4. Total initial load: 20 × N stages (e.g., 20 × 6 = 120 orders instead of 30,000)

**Alternative considered: Single query with LIMIT**
- `getOrders(limit=200)` — simpler but doesn't work well for Kanban
- Some stages would have 0 orders shown while others have 200
- Per-stage is correct for Kanban UX

## Key Decisions

1. Per-stage pagination for Kanban (not global LIMIT)
2. OFFSET-based (simpler than cursor for ordered-by-date data)
3. Keep client-side search on loaded orders only
4. List view gets same pagination benefit
