# Phase 10: Search, Tasks & Analytics - Research

**Researched:** 2026-02-03
**Domain:** Global search, task management, analytics dashboard
**Confidence:** HIGH

## Summary

This phase implements three interconnected capabilities: global search across entities (contacts, orders, conversations), a task management system with polymorphic entity linking, and a sales metrics dashboard for admins. Research confirms the project already has the foundational libraries installed (cmdk, fuse.js, recharts) and established patterns to follow.

The primary challenge is designing a task schema that efficiently links to multiple entity types (contacts, orders, conversations) while maintaining database integrity. For search, the hybrid approach (Fuse.js for client-side fuzzy matching combined with PostgreSQL for server-side queries) aligns with existing patterns. Analytics requires aggregation queries against the orders table with proper date filtering.

**Primary recommendation:** Use exclusive arc pattern (separate nullable foreign keys) for task-entity relationships instead of polymorphic type+id columns to maintain database referential integrity while preserving query flexibility.

## Standard Stack

The established libraries/tools for this domain:

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| cmdk | ^1.1.1 | Command palette UI | Already in use via shadcn/ui Command component |
| fuse.js | ^7.1.0 | Client-side fuzzy search | Already used for orders/conversations search |
| recharts | ^3.7.0 | Charts and visualization | Already used in costos page |
| date-fns | ^4.1.0 | Date manipulation | Already used throughout project |
| react-day-picker | ^9.13.0 | Date picker component | Already used with shadcn/ui Calendar |

### Supporting (Already Installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @radix-ui/react-dialog | ^1.1.15 | Modal dialogs | Task creation modal |
| @radix-ui/react-tabs | ^1.1.13 | Tab navigation | Search filter tabs |
| @tanstack/react-table | ^8.21.3 | Data tables | Tasks list view |
| lucide-react | ^0.563.0 | Icons | Badge, notification icons |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| fuse.js | PostgreSQL full-text search | FTS better for large datasets, but hybrid approach (client+server) already established |
| recharts | Tremor | Tremor has better defaults but recharts already integrated and working |
| Custom keyboard hook | react-hotkeys-hook | Could add dependency but native useEffect pattern is simpler for one shortcut |

**Installation:**
```bash
# No new packages needed - all libraries already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/(dashboard)/
│   ├── tareas/
│   │   └── page.tsx              # Tasks list page
│   ├── analytics/
│   │   └── page.tsx              # Analytics dashboard (admin only)
│   └── settings/
│       └── tareas/
│           └── page.tsx          # Task configuration
├── components/
│   ├── search/
│   │   ├── global-search.tsx     # Command palette component
│   │   └── search-result-item.tsx
│   ├── tasks/
│   │   ├── task-form.tsx
│   │   ├── task-list.tsx
│   │   └── task-badge.tsx        # Sidebar notification badge
│   └── analytics/
│       ├── metric-card.tsx
│       ├── sales-chart.tsx
│       └── period-selector.tsx   # Reuse from costos
├── lib/
│   ├── tasks/
│   │   └── types.ts
│   └── analytics/
│       └── types.ts
└── hooks/
    ├── use-global-search.ts
    └── use-tasks.ts
```

### Pattern 1: Exclusive Arc for Polymorphic Entity Links
**What:** Instead of polymorphic `entity_type` + `entity_id` columns, use separate nullable foreign keys with a CHECK constraint ensuring exactly one is set.
**When to use:** When a record must link to exactly one of several entity types.
**Example:**
```sql
-- Source: GitLab database guidelines, PostgreSQL best practices
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Exclusive arc: exactly one must be set (or none for standalone tasks)
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,

  -- Optional: enforce at most one is set
  CONSTRAINT task_entity_exclusive CHECK (
    (CASE WHEN contact_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN order_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN conversation_id IS NOT NULL THEN 1 ELSE 0 END) <= 1
  ),

  title TEXT NOT NULL,
  description TEXT,
  due_date TIMESTAMPTZ,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

CREATE INDEX idx_tasks_workspace ON tasks(workspace_id);
CREATE INDEX idx_tasks_contact ON tasks(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX idx_tasks_order ON tasks(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX idx_tasks_conversation ON tasks(conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX idx_tasks_due ON tasks(workspace_id, due_date) WHERE status = 'pending';
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to) WHERE assigned_to IS NOT NULL;
```

### Pattern 2: Global Search with Hybrid Approach
**What:** Combine client-side Fuse.js for fast fuzzy matching with server-side search for initial data load.
**When to use:** When searching across multiple entity types with moderate data volumes (<10k records).
**Example:**
```typescript
// Source: Existing project pattern from src/lib/search/fuse-config.ts
interface GlobalSearchResult {
  type: 'contact' | 'order' | 'conversation'
  id: string
  title: string      // Primary display text
  subtitle: string   // Secondary info (phone, amount, preview)
  href: string       // Navigation target
}

const globalSearchOptions: IFuseOptions<GlobalSearchResult> = {
  keys: [
    { name: 'title', weight: 2 },
    { name: 'subtitle', weight: 1 },
  ],
  threshold: 0.4,
  ignoreLocation: true,
  minMatchCharLength: 2,
  shouldSort: true,
  includeScore: true,
}
```

### Pattern 3: Command Palette with Keyboard Shortcut
**What:** Command palette that opens with Cmd+K, shows filtered results, navigates with keyboard.
**When to use:** Global search UX similar to Linear/Notion.
**Example:**
```typescript
// Source: cmdk documentation, project's existing Command component
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command'
import { Dialog, DialogContent } from '@/components/ui/dialog'

export function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  // Keyboard shortcut: Cmd+K or Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 max-w-lg">
        <Command>
          <CommandInput placeholder="Buscar contactos, pedidos, chats..." />
          <CommandList>
            <CommandEmpty>Sin resultados</CommandEmpty>
            <CommandGroup heading="Contactos">
              {/* Results */}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
```

### Pattern 4: Analytics Metrics with SQL Aggregations
**What:** Server-side aggregation queries for dashboard metrics.
**When to use:** Computing KPIs from orders table.
**Example:**
```typescript
// Source: PostgreSQL aggregate functions documentation
// Server action for analytics
export async function getOrderMetrics(workspaceId: string, startDate: Date, endDate: Date) {
  const supabase = await createClient()

  // Total orders and value
  const { data: totals } = await supabase
    .from('orders')
    .select('id, total_value, stage:pipeline_stages(is_closed)')
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString())

  const totalOrders = totals?.length ?? 0
  const totalValue = totals?.reduce((sum, o) => sum + (o.total_value || 0), 0) ?? 0
  const closedWon = totals?.filter(o => o.stage?.is_closed).length ?? 0
  const conversionRate = totalOrders > 0 ? (closedWon / totalOrders) * 100 : 0
  const avgTicket = totalOrders > 0 ? totalValue / totalOrders : 0

  return { totalOrders, totalValue, conversionRate, avgTicket }
}
```

### Anti-Patterns to Avoid
- **Polymorphic type+id columns:** Don't use `entity_type TEXT, entity_id UUID` pattern - breaks referential integrity
- **Client-side analytics calculation:** Don't fetch all orders to client and calculate metrics - use SQL aggregations
- **Recreating Fuse instance on every render:** Memoize Fuse instance with useMemo
- **Search on every keystroke:** Debounce search queries for better performance
- **Blocking UI for search:** Use transitions or defer search to avoid input lag

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fuzzy search | String matching algorithm | Fuse.js (already installed) | Handles Unicode, typos, weighted fields |
| Command palette UI | Custom modal with keyboard nav | cmdk + Command component | Handles focus, a11y, keyboard navigation |
| Date range presets | Manual date calculation | date-fns helpers | startOfDay, subDays, startOfMonth are robust |
| Chart rendering | Canvas/SVG from scratch | Recharts (already installed) | Handles responsive, tooltips, animations |
| Keyboard shortcuts | Raw event listeners | Existing useEffect pattern | Project already has clean pattern to follow |

**Key insight:** The project already has working implementations of search (orders, conversations) and analytics (costos page). Copy and adapt these patterns rather than inventing new approaches.

## Common Pitfalls

### Pitfall 1: N+1 Queries in Task List
**What goes wrong:** Fetching tasks, then separately fetching linked entities causes many queries.
**Why it happens:** Not using Supabase's relationship queries.
**How to avoid:** Use single query with joins:
```typescript
const { data } = await supabase
  .from('tasks')
  .select(`
    *,
    contact:contacts(id, name, phone),
    order:orders(id, total_value, contact:contacts(name)),
    conversation:conversations(id, phone, contact:contacts(name)),
    assigned_user:workspace_members!assigned_to(user:auth.users(email))
  `)
  .eq('workspace_id', workspaceId)
```
**Warning signs:** Slow task list load, many network requests in DevTools.

### Pitfall 2: Search Not Updating After Data Changes
**What goes wrong:** Search index becomes stale when contacts/orders are added/updated.
**Why it happens:** Fuse instance created once and not refreshed.
**How to avoid:** Recreate Fuse instance when data changes (useMemo with data as dependency).
**Warning signs:** New records don't appear in search results.

### Pitfall 3: Analytics Query Performance
**What goes wrong:** Dashboard takes seconds to load with large order volumes.
**Why it happens:** Aggregating large datasets without proper indexes.
**How to avoid:**
1. Add index on `orders(workspace_id, created_at)`
2. Consider materialized view for frequently-accessed metrics
3. Cache results for short periods
**Warning signs:** Query times > 500ms in Supabase dashboard.

### Pitfall 4: Role-Based Access Not Enforced
**What goes wrong:** Agents can access /analytics by typing URL directly.
**Why it happens:** Only hiding sidebar link, not protecting route.
**How to avoid:** Check role in page component AND/OR use middleware:
```typescript
// In analytics/page.tsx
const { permissions } = useWorkspacePermissions()
if (!permissions.isAdmin) {
  redirect('/crm/pedidos')
}
```
**Warning signs:** Security audit finds unauthorized access.

### Pitfall 5: Task Badge Counter Gets Out of Sync
**What goes wrong:** Badge shows wrong count after task completion.
**Why it happens:** Not using real-time subscription or proper invalidation.
**How to avoid:** Either use Supabase real-time subscription OR refetch on relevant actions.
**Warning signs:** Users report badge doesn't update after completing tasks.

## Code Examples

Verified patterns from official sources and project conventions:

### Period Selector (Reuse from Costos)
```typescript
// Source: src/app/(dashboard)/configuracion/whatsapp/costos/components/period-selector.tsx
export type Period = 'today' | '7days' | '30days' | 'month' | 'custom'

const periods: { value: Period; label: string }[] = [
  { value: 'today', label: 'Hoy' },
  { value: '7days', label: '7 dias' },
  { value: '30days', label: '30 dias' },
  { value: 'month', label: 'Este mes' },
]
```

### Metric Card Pattern
```typescript
// Source: Project conventions + Tremor patterns
interface MetricCardProps {
  title: string
  value: string | number
  subtitle?: string
  trend?: {
    value: number  // percentage change
    isPositive: boolean
  }
}

function MetricCard({ title, value, subtitle, trend }: MetricCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
        {trend && (
          <p className={cn("text-xs", trend.isPositive ? "text-green-600" : "text-red-600")}>
            {trend.isPositive ? '+' : ''}{trend.value}% vs periodo anterior
          </p>
        )}
      </CardContent>
    </Card>
  )
}
```

### Task Types Definition
```typescript
// Source: Project type conventions
export interface Task {
  id: string
  workspace_id: string
  title: string
  description: string | null
  due_date: string | null
  priority: 'low' | 'medium' | 'high'
  status: 'pending' | 'completed'
  assigned_to: string | null
  created_by: string | null

  // Exclusive arc - only one populated
  contact_id: string | null
  order_id: string | null
  conversation_id: string | null

  created_at: string
  updated_at: string
}

export interface TaskWithDetails extends Task {
  contact?: { id: string; name: string; phone: string } | null
  order?: { id: string; total_value: number; contact?: { name: string } } | null
  conversation?: { id: string; phone: string; contact?: { name: string } } | null
  assigned_user?: { email: string } | null
}

export interface CreateTaskInput {
  title: string
  description?: string
  due_date?: string
  priority?: 'low' | 'medium' | 'high'
  assigned_to?: string
  contact_id?: string
  order_id?: string
  conversation_id?: string
}
```

### Recharts Area Chart (Existing Pattern)
```typescript
// Source: src/app/(dashboard)/configuracion/whatsapp/costos/components/usage-chart.tsx
<ResponsiveContainer width="100%" height="100%">
  <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
    <defs>
      <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
      </linearGradient>
    </defs>
    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
    <XAxis dataKey="date" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
    <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
    <Tooltip content={<CustomTooltip />} />
    <Area
      type="monotone"
      dataKey="value"
      stroke="hsl(var(--primary))"
      fillOpacity={1}
      fill="url(#colorValue)"
      strokeWidth={2}
    />
  </AreaChart>
</ResponsiveContainer>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Polymorphic associations (type+id) | Exclusive arc pattern (separate FKs) | Always preferred for integrity | Enables database-level referential integrity |
| Full-text search everywhere | Hybrid (Fuse.js client + PG server) | 2024+ | Better UX with client-side fuzzy matching |
| Custom chart libraries | Recharts/Tremor composables | 2023+ | Faster development, better defaults |
| Modal-based search | Command palette (Cmd+K) | 2022+ | Standard UX pattern, users expect it |

**Deprecated/outdated:**
- `react-select` for search: Use cmdk/Command instead for command-palette UX
- `moment.js`: Project already uses date-fns (smaller, tree-shakeable)
- Client-side only analytics: Server-side aggregation is more performant

## Open Questions

Things that couldn't be fully resolved:

1. **Task notification timing**
   - What we know: User wants badge when tasks are "proximas a vencer"
   - What's unclear: Exact definition of "proxima" - 1 hour? 1 day? Configurable?
   - Recommendation: Make configurable in /settings/tareas, default to 24 hours before due

2. **Conversion rate calculation**
   - What we know: Dashboard needs "tasa de conversion"
   - What's unclear: What counts as converted? Orders in closed/won stages only?
   - Recommendation: Use is_closed=true stages as "converted", document this clearly

3. **Search result limits**
   - What we know: Need to search across contacts, orders, conversations
   - What's unclear: Maximum results per category? Total limit?
   - Recommendation: 5 results per category, 15 total, with "Ver todos" link

## Sources

### Primary (HIGH confidence)
- Existing project code: `src/lib/search/fuse-config.ts` - Fuse.js patterns
- Existing project code: `src/app/(dashboard)/configuracion/whatsapp/costos/` - Recharts and period selector
- Existing project code: `src/components/ui/command.tsx` - cmdk integration
- [Supabase Full Text Search Docs](https://supabase.com/docs/guides/database/full-text-search) - PostgreSQL FTS patterns

### Secondary (MEDIUM confidence)
- [GitLab Database Guidelines](https://docs.gitlab.com/development/database/polymorphic_associations/) - Exclusive arc recommendation
- [cmdk GitHub](https://cmdk.paco.me/) - Command palette patterns
- [Recharts Documentation](https://recharts.org/) - Chart component API

### Tertiary (LOW confidence)
- WebSearch results for keyboard shortcut hooks - patterns vary by project
- WebSearch results for KPI card designs - design patterns are subjective

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed and in use
- Architecture: HIGH - Follows existing project patterns
- Pitfalls: MEDIUM - Based on general best practices, not project-specific incidents
- Task schema: MEDIUM - Exclusive arc is best practice but needs validation in implementation

**Research date:** 2026-02-03
**Valid until:** 2026-03-03 (30 days - patterns are stable)
