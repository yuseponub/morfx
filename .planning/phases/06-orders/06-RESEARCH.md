# Phase 6: Orders - Research

**Researched:** 2026-01-29
**Domain:** Kanban Board, Multi-Pipeline CRM, Fuzzy Search, Order-Product Relations, AI Import
**Confidence:** HIGH

## Summary

This phase implements a full order management system with Kanban boards, multiple pipelines, product catalog, and intelligent search. Research confirms the modern React stack for Kanban uses **@dnd-kit** with shadcn/ui integration. For fuzzy search, a hybrid approach works best: **Fuse.js** for client-side intelligent search on loaded data, with optional **pg_trgm** for server-side pre-filtering on large datasets.

The database design follows established patterns: **junction tables** for order-products (storing price-at-time-of-sale), **pipeline and stage tables** with position ordering, and **JSONB custom_fields** column reusing Phase 5 patterns. The existing CSV import/export code from Phase 5 can be extended with AI-powered column mapping using structured OpenAI API calls.

Key architectural insight: The Kanban board is a **view layer** over the orders data - dragging cards updates order stage via Server Action, not complex client state. This keeps the implementation simple and consistent with the project's server-centric approach.

**Primary recommendation:** Use @dnd-kit/core + @dnd-kit/sortable for Kanban DnD, Fuse.js for intelligent search, and extend existing Phase 5 patterns for custom fields and CSV import. Store orders with stage_id foreign key, products in junction table with quantity and price snapshot.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @dnd-kit/core | 6.3+ | Drag-and-drop foundation | Modern, lightweight, accessible React DnD |
| @dnd-kit/sortable | 10.0+ | Sortable columns and cards | Built for Kanban-style boards, multiple containers |
| @dnd-kit/utilities | 3.2+ | CSS transform utilities | Handles transform/translate for drag overlay |
| fuse.js | 7.0+ | Client-side fuzzy search | Zero dependencies, typo tolerance, weighted keys |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @dnd-kit/modifiers | 7.0+ | Restrict drag axis | Optional: constrain to vertical/horizontal |
| pg_trgm (extension) | - | PostgreSQL fuzzy matching | Server-side pre-filtering for large datasets |

### Already Installed (Phases 4-5)
| Library | Version | Purpose |
|---------|---------|---------|
| @tanstack/react-table | 8.21+ | List view of orders |
| papaparse | 5.5+ | CSV parsing for import/export |
| react-csv-importer | 0.8+ | Column mapping wizard |
| zod | 4.3+ | Dynamic validation for custom fields |
| sonner | 2.0+ | Toast notifications |
| cmdk | 1.1+ | Command menu for fuzzy filter UI |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @dnd-kit | @hello-pangea/dnd | hello-pangea is simpler but less flexible for multi-container |
| @dnd-kit | react-beautiful-dnd | react-beautiful-dnd is UNMAINTAINED (do not use) |
| Fuse.js | pg_trgm only | pg_trgm requires RPC calls, Fuse.js gives instant client-side UX |
| Fuse.js | Algolia/Meilisearch | Overkill for workspace-scoped data (<10k orders) |

**Installation:**
```bash
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities fuse.js
```

## Architecture Patterns

### Recommended Project Structure
```
morfx/src/
├── app/
│   └── (dashboard)/
│       └── crm/
│           └── pedidos/
│               ├── page.tsx                    # Main orders page (Kanban + toggle)
│               ├── components/
│               │   ├── kanban-board.tsx        # DndContext + columns
│               │   ├── kanban-column.tsx       # SortableContext + droppable
│               │   ├── kanban-card.tsx         # Draggable order card
│               │   ├── order-sheet.tsx         # Side panel for order detail
│               │   ├── orders-table.tsx        # List view (TanStack Table)
│               │   ├── pipeline-tabs.tsx       # Bottom taskbar for pipelines
│               │   ├── order-filters.tsx       # Filter panel with fuzzy search
│               │   └── view-toggle.tsx         # Kanban/List switch
│               └── [id]/
│                   └── page.tsx                # Direct order detail (optional)
│           └── productos/
│               ├── page.tsx                    # Product catalog
│               └── components/
│                   └── product-form.tsx
│           └── configuracion/
│               └── pipelines/
│                   ├── page.tsx                # Pipeline management
│                   └── components/
│                       ├── stage-list.tsx      # Drag-reorder stages
│                       └── stage-form.tsx      # Stage editor
├── app/
│   └── actions/
│       ├── orders.ts                           # Order CRUD + stage moves
│       ├── products.ts                         # Product CRUD
│       ├── pipelines.ts                        # Pipeline + stage CRUD
│       └── saved-views.ts                      # Saved filter views
├── lib/
│   ├── search/
│   │   ├── fuse-config.ts                      # Fuse.js setup for orders
│   │   └── search-utils.ts                     # Normalize search input
│   └── orders/
│       ├── types.ts                            # Order, Product, Pipeline types
│       └── calculator.ts                       # Order total calculation
└── components/
    └── kanban/
        ├── drag-overlay.tsx                    # Preview during drag
        └── wip-indicator.tsx                   # WIP limit warning
```

### Pattern 1: Kanban with @dnd-kit Multiple Containers
**What:** DndContext wrapping multiple SortableContext providers (one per stage)
**When to use:** Kanban board where cards move between columns
**Example:**
```typescript
// Source: @dnd-kit docs + Georgegriff template
// components/kanban-board.tsx
'use client'

import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useState } from 'react'
import { KanbanColumn } from './kanban-column'
import { KanbanCard } from './kanban-card'
import { moveOrderToStage } from '@/app/actions/orders'

interface KanbanBoardProps {
  stages: PipelineStage[]
  ordersByStage: Record<string, Order[]>
}

export function KanbanBoard({ stages, ordersByStage }: KanbanBoardProps) {
  const [activeOrder, setActiveOrder] = useState<Order | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }, // Prevent accidental drags
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event
    const order = findOrderById(active.id as string, ordersByStage)
    setActiveOrder(order)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveOrder(null)

    if (!over) return

    const orderId = active.id as string
    const newStageId = over.id as string

    // Call Server Action to update order stage
    await moveOrderToStage(orderId, newStageId)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto p-4">
        {stages.map((stage) => (
          <KanbanColumn
            key={stage.id}
            stage={stage}
            orders={ordersByStage[stage.id] || []}
          />
        ))}
      </div>

      <DragOverlay>
        {activeOrder ? <KanbanCard order={activeOrder} isDragging /> : null}
      </DragOverlay>
    </DndContext>
  )
}
```

### Pattern 2: Sortable Column with useSortable
**What:** Each column is a droppable zone with sortable cards
**When to use:** Cards can be dropped into columns and optionally reordered within
**Example:**
```typescript
// Source: @dnd-kit sortable docs
// components/kanban-column.tsx
'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { KanbanCard } from './kanban-card'

interface KanbanColumnProps {
  stage: PipelineStage
  orders: Order[]
}

export function KanbanColumn({ stage, orders }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
  })

  const orderIds = orders.map(o => o.id)

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'w-72 flex-shrink-0 rounded-lg bg-muted/50 p-2',
        isOver && 'ring-2 ring-primary'
      )}
    >
      <div className="flex items-center justify-between mb-2 px-2">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: stage.color }}
          />
          <span className="font-medium">{stage.name}</span>
          <span className="text-muted-foreground text-sm">
            ({orders.length})
          </span>
        </div>
        {stage.wip_limit && orders.length >= stage.wip_limit && (
          <span className="text-xs text-destructive">WIP limit</span>
        )}
      </div>

      <SortableContext items={orderIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-2 min-h-[200px]">
          {orders.map((order) => (
            <KanbanCard key={order.id} order={order} />
          ))}
        </div>
      </SortableContext>
    </div>
  )
}
```

### Pattern 3: Fuse.js Fuzzy Search
**What:** Client-side fuzzy search with weighted fields and typo tolerance
**When to use:** Intelligent search across loaded orders
**Example:**
```typescript
// Source: Fuse.js docs
// lib/search/fuse-config.ts
import Fuse from 'fuse.js'
import type { Order } from '@/lib/orders/types'

export function createOrderSearcher(orders: Order[]) {
  return new Fuse(orders, {
    // Search these fields
    keys: [
      { name: 'contact.name', weight: 2 },      // Contact name most important
      { name: 'contact.phone', weight: 1.5 },   // Phone number
      { name: 'products.title', weight: 1 },    // Product names
      { name: 'tracking_number', weight: 1 },   // Tracking/guia
      { name: 'contact.city', weight: 0.8 },    // City
      { name: 'description', weight: 0.5 },     // Notes/description
    ],
    // Fuzzy matching config
    threshold: 0.4,           // 0 = exact match, 1 = match anything
    distance: 100,            // How close match must be to location
    ignoreLocation: true,     // Search entire string, not just start
    minMatchCharLength: 2,    // Ignore single character matches
    // Results config
    shouldSort: true,         // Sort by relevance
    includeScore: true,       // Include match score in results
    findAllMatches: true,     // Don't stop at first match
  })
}

// Usage in component
export function useOrderSearch(orders: Order[]) {
  const [query, setQuery] = useState('')
  const fuse = useMemo(() => createOrderSearcher(orders), [orders])

  const results = useMemo(() => {
    if (!query.trim()) return orders
    return fuse.search(query).map(r => r.item)
  }, [fuse, query, orders])

  return { query, setQuery, results }
}
```

### Pattern 4: Order-Products Junction Table
**What:** Store products per order with quantity and price snapshot
**When to use:** Orders with multiple products, preserving historical pricing
**Example:**
```sql
-- Source: PostgreSQL best practices for order systems
-- supabase/migrations/XXXXXXXX_orders.sql

-- Products catalog
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  title TEXT NOT NULL,
  price DECIMAL(12, 2) NOT NULL,
  shopify_product_id TEXT,                -- Nullable, filled when matched
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(workspace_id, sku)
);

-- Orders
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE RESTRICT,
  stage_id UUID NOT NULL REFERENCES pipeline_stages(id) ON DELETE RESTRICT,

  -- Core fields
  total_value DECIMAL(12, 2) NOT NULL DEFAULT 0,
  closing_date DATE,
  description TEXT,

  -- Shipping/tracking
  carrier TEXT,                           -- Transportadora
  tracking_number TEXT,                   -- Guia

  -- Linked order (for cross-pipeline links)
  linked_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,

  -- Custom fields (reuse Phase 5 pattern)
  custom_fields JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW())
);

-- Order-Products junction (stores price at time of order)
CREATE TABLE order_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,

  -- Snapshot data (preserved even if product changes)
  sku TEXT NOT NULL,
  title TEXT NOT NULL,
  unit_price DECIMAL(12, 2) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),

  -- Calculated
  subtotal DECIMAL(12, 2) GENERATED ALWAYS AS (unit_price * quantity) STORED,

  created_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW())
);

-- Trigger to auto-calculate order total
CREATE OR REPLACE FUNCTION update_order_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE orders
  SET total_value = (
    SELECT COALESCE(SUM(subtotal), 0)
    FROM order_products
    WHERE order_id = COALESCE(NEW.order_id, OLD.order_id)
  )
  WHERE id = COALESCE(NEW.order_id, OLD.order_id);

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER order_products_total_trigger
  AFTER INSERT OR UPDATE OR DELETE ON order_products
  FOR EACH ROW
  EXECUTE FUNCTION update_order_total();
```

### Pattern 5: Pipelines and Stages
**What:** Multi-pipeline support with configurable stages
**When to use:** Different workflows (Sales, Logistics, Support)
**Example:**
```sql
-- Pipelines (one per workflow)
CREATE TABLE pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(workspace_id, name)
);

-- Pipeline stages (ordered columns in Kanban)
CREATE TABLE pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  position INTEGER NOT NULL DEFAULT 0,
  wip_limit INTEGER,                      -- NULL = unlimited
  is_closed BOOLEAN DEFAULT false,        -- "Won", "Lost" stages
  created_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(pipeline_id, position)
);

CREATE INDEX idx_stages_pipeline ON pipeline_stages(pipeline_id, position);
```

### Pattern 6: Saved Views/Filters
**What:** Store filter configurations that can be shared workspace-wide
**When to use:** Admin creates common filter views for team
**Example:**
```sql
-- Saved filter views
CREATE TABLE saved_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL,              -- 'orders', 'contacts'
  filters JSONB NOT NULL,                 -- {stage: [...], tags: [...], dateRange: {...}}
  is_shared BOOLEAN DEFAULT false,        -- If true, visible to all workspace members
  created_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW())
);

-- Only admin/owner can create shared views
CREATE INDEX idx_saved_views_workspace ON saved_views(workspace_id, entity_type);
```

### Anti-Patterns to Avoid
- **Storing order total in products list:** Calculate from junction table with trigger, not manually
- **Using ON DELETE CASCADE for order->product:** Use SET NULL to preserve historical order data
- **Building Kanban state in React only:** Persist stage changes to DB immediately via Server Action
- **Full re-render on drag:** Use DragOverlay for preview, update only changed items
- **Loading all orders for fuzzy search:** Paginate server-side, fuzzy search on loaded page
- **Creating new Fuse instance on every search:** Memoize Fuse instance, only recreate when data changes

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag-and-drop | HTML5 drag events | @dnd-kit | Accessibility, touch support, keyboard nav, animation |
| Fuzzy search | String.includes() | Fuse.js | Typo tolerance, phonetic matching, weighted fields |
| Column reorder | Manual position swap | @dnd-kit/sortable | Handles edge cases, animations, concurrent users |
| Order total calc | JavaScript sum | PostgreSQL trigger | Single source of truth, no sync issues |
| CSV column mapping | Manual dropdowns | react-csv-importer | Auto-detection, preview, validation |
| Stage colors | Hex input | Color picker + presets | UX consistency, accessible contrast |
| Drag overlay | Clone element | @dnd-kit DragOverlay | Handles scroll containers, z-index, animation |

**Key insight:** Kanban boards and fuzzy search have massive hidden complexity around edge cases (concurrent updates, scroll during drag, touch vs mouse, accessibility). @dnd-kit and Fuse.js handle these; hand-rolled solutions will miss cases.

## Common Pitfalls

### Pitfall 1: Kanban Cards Reorder on Every Drag
**What goes wrong:** Cards jump around chaotically during drag
**Why it happens:** Using onDragOver to update state on every hover
**How to avoid:** Only update state in onDragEnd, use DragOverlay for visual preview
**Warning signs:** Visible state changes during drag, not after drop

### Pitfall 2: Fuse.js Recreated on Every Keystroke
**What goes wrong:** Search is slow, browser lags on typing
**Why it happens:** Creating new Fuse instance inside render without memoization
**How to avoid:** `useMemo(() => new Fuse(data, options), [data])`
**Warning signs:** Performance degradation as data grows

### Pitfall 3: Order Total Desyncs from Products
**What goes wrong:** total_value doesn't match sum of products
**Why it happens:** Updating total in application code, missing some code paths
**How to avoid:** Use PostgreSQL trigger on order_products to auto-calculate
**Warning signs:** Inconsistent totals between list and detail views

### Pitfall 4: Product Price Changes Affect Old Orders
**What goes wrong:** Historical orders show wrong amounts after product price update
**Why it happens:** Junction table references product_id without storing price snapshot
**How to avoid:** Store unit_price in order_products at time of order creation
**Warning signs:** Reports showing different totals than when order was placed

### Pitfall 5: Stage Delete Breaks Orders
**What goes wrong:** Deleting a stage leaves orders in invalid state
**Why it happens:** ON DELETE CASCADE on stage_id
**How to avoid:** Use ON DELETE RESTRICT, require moving orders before stage delete
**Warning signs:** Orders disappear or error when viewing after stage deletion

### Pitfall 6: WIP Limit Not Enforced on Drag
**What goes wrong:** User can drop card into column at WIP limit
**Why it happens:** Client-side check only, no server validation
**How to avoid:** Check WIP limit in Server Action, reject if exceeded, show toast
**Warning signs:** Columns exceed their WIP limits

### Pitfall 7: Fuzzy Search Returns Too Many Results
**What goes wrong:** Searching "Juan" returns hundreds of unrelated results
**Why it happens:** threshold too high (close to 1.0)
**How to avoid:** Use threshold: 0.4 or lower, test with real data
**Warning signs:** Results don't feel relevant to search term

### Pitfall 8: Pipeline Tabs Don't Persist
**What goes wrong:** Refreshing page loses which pipelines were "open"
**Why it happens:** Tab state in React only, not persisted
**How to avoid:** Store open pipeline IDs in URL params or localStorage
**Warning signs:** User frustration after page refresh

## Code Examples

Verified patterns from official sources:

### Draggable Order Card
```typescript
// Source: @dnd-kit useSortable docs
// components/kanban-card.tsx
'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Card } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils/format'

interface KanbanCardProps {
  order: Order
  isDragging?: boolean
}

export function KanbanCard({ order, isDragging }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: order.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging ? 0.5 : 1,
  }

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'p-3 cursor-grab active:cursor-grabbing',
        isDragging && 'shadow-lg ring-2 ring-primary'
      )}
    >
      <div className="flex flex-col gap-1">
        <span className="font-medium truncate">
          {order.contact?.name || 'Sin contacto'}
        </span>
        <span className="text-lg font-bold text-primary">
          {formatCurrency(order.total_value)}
        </span>
        <div className="flex flex-wrap gap-1">
          {order.products?.slice(0, 2).map(p => (
            <span key={p.id} className="text-xs text-muted-foreground">
              {p.title}
            </span>
          ))}
          {order.products && order.products.length > 2 && (
            <span className="text-xs text-muted-foreground">
              +{order.products.length - 2} mas
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {new Date(order.created_at).toLocaleDateString('es-CO')}
        </span>
      </div>
    </Card>
  )
}
```

### Server Action for Stage Move
```typescript
// Source: Next.js Server Actions + Supabase pattern
// app/actions/orders.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function moveOrderToStage(orderId: string, newStageId: string) {
  const supabase = await createClient()

  // Get stage to check WIP limit
  const { data: stage } = await supabase
    .from('pipeline_stages')
    .select('id, wip_limit, pipeline_id')
    .eq('id', newStageId)
    .single()

  if (!stage) {
    return { error: 'Etapa no encontrada' }
  }

  // Check WIP limit
  if (stage.wip_limit) {
    const { count } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('stage_id', newStageId)

    if (count && count >= stage.wip_limit) {
      return { error: `Esta etapa tiene limite de ${stage.wip_limit} pedidos` }
    }
  }

  // Update order stage
  const { error } = await supabase
    .from('orders')
    .update({
      stage_id: newStageId,
      updated_at: new Date().toISOString()
    })
    .eq('id', orderId)

  if (error) {
    return { error: 'Error moviendo pedido' }
  }

  revalidatePath('/crm/pedidos')
  return { success: true }
}
```

### AI Column Mapping Suggestion
```typescript
// Source: OpenAI Structured Outputs docs
// lib/csv/ai-mapper.ts
import OpenAI from 'openai'

interface ColumnMapping {
  csvColumn: string
  targetField: string | null
  confidence: number
}

export async function suggestColumnMappings(
  csvColumns: string[],
  targetSchema: { key: string; name: string; description?: string }[]
): Promise<ColumnMapping[]> {
  const openai = new OpenAI()

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are a CSV column mapper. Given CSV column headers and a target schema, suggest the best mapping for each CSV column. Return JSON with this structure:
{
  "mappings": [
    { "csvColumn": "string", "targetField": "string|null", "confidence": 0-100 }
  ]
}
Set targetField to null if no good match exists. Confidence is how sure you are (0-100).`
      },
      {
        role: 'user',
        content: `CSV columns: ${JSON.stringify(csvColumns)}

Target schema:
${targetSchema.map(f => `- ${f.key}: ${f.name}${f.description ? ` (${f.description})` : ''}`).join('\n')}

Map each CSV column to the best matching target field.`
      }
    ]
  })

  const result = JSON.parse(response.choices[0].message.content || '{}')
  return result.mappings || []
}
```

### Pipeline Taskbar Component
```typescript
// Source: Project requirement (Windows taskbar pattern)
// components/pipeline-tabs.tsx
'use client'

import { cn } from '@/lib/utils'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PipelineTabsProps {
  pipelines: Pipeline[]
  openPipelineIds: string[]
  activePipelineId: string
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onAdd: () => void
}

export function PipelineTabs({
  pipelines,
  openPipelineIds,
  activePipelineId,
  onSelect,
  onClose,
  onAdd,
}: PipelineTabsProps) {
  const openPipelines = pipelines.filter(p => openPipelineIds.includes(p.id))

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background border-t flex items-center h-10 px-2">
      <div className="flex items-center gap-1 overflow-x-auto">
        {openPipelines.map(pipeline => (
          <div
            key={pipeline.id}
            className={cn(
              'flex items-center gap-1 px-3 py-1 rounded-t-md cursor-pointer',
              'hover:bg-muted transition-colors',
              pipeline.id === activePipelineId && 'bg-muted'
            )}
            onClick={() => onSelect(pipeline.id)}
          >
            <span className="text-sm truncate max-w-[120px]">
              {pipeline.name}
            </span>
            <button
              className="p-0.5 hover:bg-muted-foreground/20 rounded"
              onClick={(e) => {
                e.stopPropagation()
                onClose(pipeline.id)
              }}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="ml-2"
        onClick={onAdd}
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  )
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-beautiful-dnd | @dnd-kit | 2022+ | r-b-d is unmaintained, dnd-kit is the standard |
| Elasticsearch for CRM search | Fuse.js + pg_trgm hybrid | 2023+ | Simpler stack, sufficient for <100k records |
| Manual column mapping | AI-suggested mapping | 2024+ | LLMs can suggest with 80%+ accuracy |
| Single pipeline CRM | Multi-pipeline support | 2023+ | Modern CRMs (Pipedrive, Bigin) all support |
| Separate search endpoint | Client-side Fuse.js | 2024+ | Instant results, no API latency |

**Deprecated/outdated:**
- **react-beautiful-dnd:** Unmaintained since 2022, do NOT use
- **Redux for Kanban state:** Server Actions + revalidation is simpler
- **Full-text search via API:** For workspace-scoped data, client-side is faster

## Open Questions

Things that couldn't be fully resolved:

1. **AI Import Token Costs**
   - What we know: GPT-4o-mini is cheap (~$0.15/1M tokens)
   - What's unclear: How many tokens per CSV import?
   - Recommendation: Estimate ~500 tokens per import, budget $0.01/import max

2. **Kanban Performance at Scale**
   - What we know: @dnd-kit handles hundreds of items well
   - What's unclear: Performance with 1000+ orders visible
   - Recommendation: Paginate to 100 orders per column, load more on scroll

3. **Cross-Pipeline Order Links**
   - What we know: linked_order_id column enables linking
   - What's unclear: UI/UX for creating and viewing links
   - Recommendation: Simple "Ver pedido vinculado" link, auto-create during phase transition

## Sources

### Primary (HIGH confidence)
- [@dnd-kit Official Docs](https://docs.dndkit.com/) - DndContext, Sortable, collision detection
- [@dnd-kit Sortable](https://docs.dndkit.com/presets/sortable) - Multiple containers pattern
- [Fuse.js Official](https://www.fusejs.io/) - Options, weighted keys, threshold tuning
- [Georgegriff/react-dnd-kit-tailwind-shadcn-ui](https://github.com/Georgegriff/react-dnd-kit-tailwind-shadcn-ui) - Reference implementation
- [OpenAI Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs) - JSON schema enforcement

### Secondary (MEDIUM confidence)
- [PostgreSQL pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html) - Trigram fuzzy matching
- [Supabase Full Text Search](https://supabase.com/docs/guides/database/full-text-search) - pg_trgm with Supabase
- [Marmelab Kanban Tutorial](https://marmelab.com/blog/2026/01/15/building-a-kanban-board-with-shadcn.html) - shadcn/ui integration

### Tertiary (LOW confidence - marked for validation)
- AI column mapping accuracy claims (need testing with real CSV files)
- WIP limit enforcement patterns (need to test concurrent user scenarios)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - @dnd-kit and Fuse.js are well-documented industry standards
- Architecture: HIGH - Patterns from official docs and verified reference implementations
- Pitfalls: HIGH - Common issues documented in GitHub issues and tutorials
- AI Import: MEDIUM - OpenAI docs are clear, but real-world accuracy needs testing

**Research date:** 2026-01-29
**Valid until:** 2026-03-29 (60 days - stable patterns)

---

## Research Notes

**Key discoveries:**
1. @dnd-kit is the definitive replacement for react-beautiful-dnd
2. Fuse.js threshold of 0.4 provides good balance of fuzzy matching and relevance
3. Order-products junction table MUST store price snapshot for historical accuracy
4. PostgreSQL trigger for total calculation prevents sync issues
5. Stage deletion requires RESTRICT constraint to protect orders

**What makes this phase unique:**
- First DnD implementation in the project
- First fuzzy search beyond simple text match
- Junction table pattern for order-products
- Multi-pipeline architecture with linked orders
- AI integration for import suggestions

**Implementation risks:**
- LOW: Kanban board (@dnd-kit is mature, reference implementations exist)
- LOW: Fuzzy search (Fuse.js is well-documented)
- LOW: Database design (standard patterns)
- MEDIUM: AI import (need to test accuracy, handle API failures)
- MEDIUM: Multi-pipeline UX (taskbar pattern is custom)
