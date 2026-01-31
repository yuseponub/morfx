# Phase 6: Orders - Learnings

**Completed:** 2026-01-29
**Duration:** ~57 minutes (5 plans across 3 waves)

## Bugs Encountered

### 1. @dnd-kit/sortable Import Error
**Symptom:** TypeScript error importing `verticalListSortingStrategy`
**Root cause:** Using wrong package name
**Fix:** Import from `@dnd-kit/sortable` not `@dnd-kit/core`
**Prevention:** Always check package documentation for correct import paths

### 2. DndContext Drop Detection
**Symptom:** Cards not dropping into columns correctly
**Root cause:** Using `over.id` which returns the card ID, not the column ID
**Fix:** Use `over.data.current?.sortable?.containerId` or implement custom collision detection
**Prevention:** Understand @dnd-kit's data model - droppable zones vs sortable items

### 3. Fuse.js Nested Object Search
**Symptom:** Search not finding nested properties like `contact.name`
**Root cause:** Fuse.js doesn't automatically flatten nested objects
**Fix:** Use dot notation in keys: `{ name: 'contact.name', weight: 2 }`
**Prevention:** Read Fuse.js documentation on nested keys

### 4. Sheet Component Re-render Issues
**Symptom:** Order form losing state when sheet opens
**Root cause:** Sheet content was mounting/unmounting on open/close
**Fix:** Use controlled open state and keep form state in parent
**Prevention:** Lift state up when using modal/sheet patterns

## Decisions Made

### Architectural

1. **Kanban as View Layer**
   - Decision: Kanban board is a pure view over orders data
   - Why: Server Actions handle all mutations, keeps client simple
   - Alternative considered: Complex client state management
   - Outcome: Simple, consistent with project's server-centric approach

2. **Snapshot Pricing in Junction Table**
   - Decision: Store sku, title, unit_price in order_products at order time
   - Why: Historical orders must preserve original pricing
   - Alternative considered: Reference product and add version field
   - Outcome: Simpler, proven pattern for e-commerce

3. **Pipeline Tabs with localStorage**
   - Decision: Persist open pipeline IDs to localStorage
   - Why: UX continuity across page refresh
   - Alternative considered: URL params, database storage
   - Outcome: Fast, no server round-trip, good for MVP

4. **Fuse.js for Client-Side Search**
   - Decision: Fuzzy search on loaded data with Fuse.js
   - Why: Instant results, no API latency, good for <10k orders
   - Alternative considered: pg_trgm server-side
   - Outcome: Excellent UX, will revisit if scale demands

### Technical

1. **@dnd-kit over react-beautiful-dnd**
   - Decision: Use @dnd-kit for all drag-and-drop
   - Why: react-beautiful-dnd is unmaintained, @dnd-kit is active
   - Note: Already confirmed in Phase 6-03 for stage reorder

2. **Combined View Component**
   - Decision: Create `orders-view.tsx` that manages both Kanban and List
   - Why: Shared filters, state, and actions between views
   - Alternative: Separate components with duplicated logic

3. **WIP Limit Enforcement in Server Action**
   - Decision: Check WIP limit in `moveOrderToStage`, not just UI
   - Why: Prevents race conditions, single source of truth
   - Implementation: Return error with toast message

## Tips for AI Agents

### @dnd-kit Patterns

```typescript
// CORRECT: Use DndContext at top level, SortableContext per column
<DndContext onDragEnd={handleDragEnd}>
  {columns.map(col => (
    <SortableContext items={col.items.map(i => i.id)}>
      {/* items */}
    </SortableContext>
  ))}
  <DragOverlay>
    {activeItem && <Card />}
  </DragOverlay>
</DndContext>

// WRONG: SortableContext wrapping everything
<SortableContext items={allItems}>
  {columns.map(col => /* items */)}
</SortableContext>
```

### Fuse.js Configuration

```typescript
// Good threshold values:
threshold: 0.4  // Balance between fuzzy and relevant
threshold: 0.3  // More strict, fewer false positives
threshold: 0.6  // Very fuzzy, for typo tolerance

// Weight your most important fields higher
keys: [
  { name: 'name', weight: 2 },      // Most important
  { name: 'phone', weight: 1.5 },   // Important
  { name: 'notes', weight: 0.5 },   // Less important
]
```

### PostgreSQL Trigger for Computed Columns

```sql
-- For auto-calculating totals, use a trigger instead of application code
CREATE OR REPLACE FUNCTION update_order_total()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE orders SET total_value = (
    SELECT COALESCE(SUM(subtotal), 0)
    FROM order_products
    WHERE order_id = COALESCE(NEW.order_id, OLD.order_id)
  ) WHERE id = COALESCE(NEW.order_id, OLD.order_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger on INSERT, UPDATE, DELETE
CREATE TRIGGER order_products_total_trigger
  AFTER INSERT OR UPDATE OR DELETE ON order_products
  FOR EACH ROW EXECUTE FUNCTION update_order_total();
```

### Sheet Component Best Practices

```typescript
// GOOD: Controlled state in parent
const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)

<OrderSheet
  order={selectedOrder}
  open={!!selectedOrder}
  onClose={() => setSelectedOrder(null)}
/>

// BAD: Internal open state
const [isOpen, setIsOpen] = useState(false)
// Then passing order separately - leads to stale data
```

## Context for Future Phases

### For Phase 7 (WhatsApp Core)
- Tags system from Phase 4 is already workspace-global
- order_tags junction table shows the pattern for linking tags to any entity
- Use same revalidatePath pattern for real-time updates

### For Phase 9 (CRM-WhatsApp Sync)
- orders.contact_id links orders to contacts
- contacts.phone in E.164 format matches WhatsApp phone format
- Pipeline stage changes can trigger WhatsApp notifications
- linked_order_id enables cross-pipeline order relationships

### For Phase 10 (Search, Tasks & Analytics)
- Fuse.js pattern can be extended for global search
- orders.total_value and pipeline stages provide analytics data
- saved_views table can store dashboard widget configurations

## Files Reference

**Database:**
- `supabase/migrations/20260129000003_orders_foundation.sql` (482 lines)

**Types:**
- `src/lib/orders/types.ts` - Order, Product, Pipeline, Stage types

**Server Actions:**
- `src/app/actions/orders.ts` (608 lines) - Full order CRUD
- `src/app/actions/products.ts` (297 lines) - Product CRUD
- `src/app/actions/pipelines.ts` (474 lines) - Pipeline and stage management

**UI Components:**
- `src/app/(dashboard)/crm/pedidos/components/kanban-board.tsx` - DndContext wrapper
- `src/app/(dashboard)/crm/pedidos/components/kanban-column.tsx` - Droppable column
- `src/app/(dashboard)/crm/pedidos/components/kanban-card.tsx` - Sortable card
- `src/app/(dashboard)/crm/pedidos/components/order-sheet.tsx` - Detail panel
- `src/app/(dashboard)/crm/pedidos/components/order-form.tsx` - Create/edit form
- `src/app/(dashboard)/crm/pedidos/components/product-picker.tsx` - Multi-product selection
- `src/app/(dashboard)/crm/pedidos/components/orders-view.tsx` - Main view orchestrator

**Search:**
- `src/lib/search/fuse-config.ts` - Fuse.js configuration and hooks

## Metrics

- **Plans:** 5
- **Waves:** 3 (parallel execution)
- **Duration:** ~57 minutes
- **Files created:** 25+
- **Lines of code:** ~4,000+
- **Components:** 14 new React components
- **Server Actions:** 20+ new actions
- **Database tables:** 6 (products, pipelines, pipeline_stages, orders, order_products, order_tags)

---

*Phase 6 establishes the order management system, the second pillar of the CRM module. Combined with Phase 4/5 (Contacts), users can now manage their complete sales workflow. Phase 7 will add WhatsApp integration, leading to Phase 9 where CRM and WhatsApp sync together.*
