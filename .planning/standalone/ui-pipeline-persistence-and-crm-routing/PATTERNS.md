# Standalone: UI Pipeline Persistence + CRM Routing — Pattern Map

**Mapped:** 2026-04-27
**Files analyzed:** 4 (3 modify, 0 create — `crm/page.tsx`, `pedidos/page.tsx`, `orders-view.tsx`, `sidebar.tsx`)
**Analogs found:** 4 / 4 (every new code path has a canonical existing analog in this codebase; ZERO new abstractions introduced)

## File Classification

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|----------------|---------------|
| `src/app/(dashboard)/crm/page.tsx` | RSC redirect | server-resolved | (self — modifying single line in existing v2 branch) | exact (in-file) |
| `src/app/(dashboard)/crm/pedidos/page.tsx` | RSC (server-resolved-prop) | request-response (await `searchParams` + parallel data fetch) | `src/app/(dashboard)/crm/contactos/page.tsx:61-76` (primary) + `src/app/(dashboard)/agentes/routing/audit/page.tsx:22-42` (secondary) | exact |
| `src/app/(dashboard)/crm/pedidos/components/orders-view.tsx` | client component (URL state + persisted preference) | event-driven (handler) + post-mount hydration (effect) | localStorage idiom: same file lines 64-66 + 434-476; URLSearchParams idiom: `src/app/(dashboard)/crm/contactos/components/contacts-table.tsx:53-85`; one-shot mount hydration: `src/app/(dashboard)/crm/pedidos/components/pipeline-tabs.tsx:39-65` | exact (replicates 3 idioms already in repo) |
| `src/components/layout/sidebar.tsx` | client component (nav config) | static config | (self — deleting one line in `navCategoriesV2[0].items`) | exact (in-file) |
| `pedidos/page.tsx` `<Suspense>` wrapper | RSC structural | request-response | `src/app/(dashboard)/configuracion/integraciones/page.tsx:99-104` | role-match (only Suspense usage in `(dashboard)/**/page.tsx` — different fallback shape but identical semantics) |

---

## Pattern Assignments

### `src/app/(dashboard)/crm/page.tsx` (RSC redirect — single-line edit per D-07)

**Analog:** the file itself — only the `if (v2)` redirect target inside lines 22-25 changes. The legacy fall-through (`redirect('/crm/pedidos')` line 25) and the v2 detection block (lines 17-20) stay byte-identical (Regla 6 spirit per D-13).

**Current state** (`src/app/(dashboard)/crm/page.tsx:1-26`):
```typescript
import { redirect } from 'next/navigation'
import { getIsDashboardV2Enabled } from '@/lib/auth/dashboard-v2'
import { getActiveWorkspaceId } from '@/app/actions/workspace'

/**
 * CRM hub root redirect.
 *
 * - v2=false: preserve current behavior (redirect to `/crm/pedidos`).
 * - v2=true:  redirect to `/crm/contactos` — the first tab of the
 *   editorial CRM hub (mock crm.html line 121, `<a class="on">
 *   Contactos`). This matches the mock's default landing tab.
 *
 * Regla 6 byte-identical fail-closed: any error or missing workspace
 * falls through to `/crm/pedidos`.
 */
export default async function CRMPage() {
  const activeWorkspaceId = await getActiveWorkspaceId()
  const v2 = activeWorkspaceId
    ? await getIsDashboardV2Enabled(activeWorkspaceId)
    : false

  if (v2) {
    redirect('/crm/contactos')          // ← LINE 23: change target to '/crm/pedidos'
  }
  redirect('/crm/pedidos')
}
```

**Edit recipe (planner copies verbatim):**
- Line 23: `redirect('/crm/contactos')` → `redirect('/crm/pedidos')`
- Lines 5-15 JSDoc: rewrite the `v2=true` line to read: `*   redirect to /crm/pedidos — kanban is the primary CRM surface in the editorial v2 design (Standalone ui-pipeline-persistence-and-crm-routing D-07). Contactos remains accessible via the <CrmTabs/> strip rendered by crm/layout.tsx.`
- Imports unchanged
- Function signature unchanged
- Legacy fall-through line 25 unchanged

**Diff target:** `git diff src/app/(dashboard)/crm/page.tsx` should show ONLY lines 9-15 (JSDoc) and line 23 (redirect target).

---

### `src/app/(dashboard)/crm/pedidos/page.tsx` (RSC — server-resolved prop + Suspense)

**Closest analog 1 — async `searchParams` idiom:** `src/app/(dashboard)/crm/contactos/page.tsx:61-69`

```typescript
// Source: src/app/(dashboard)/crm/contactos/page.tsx:61-76 (canonical pattern in this codebase)
export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; tags?: string }>
}) {
  const params = await searchParams
  const page = params.page ? Math.max(1, parseInt(params.page, 10)) : 1
  const search = params.q || ''
  const tagIds = params.tags ? params.tags.split(',').filter(Boolean) : []

  const [contactsResult, tags, customFields, activeWorkspaceId] = await Promise.all([
    getContactsPage({ page, pageSize: PAGE_SIZE, search, tagIds }),
    getTags(),
    getCustomFields(),
    getActiveWorkspaceId(),
  ])
```

**Closest analog 2 — same pattern in different module:** `src/app/(dashboard)/agentes/routing/audit/page.tsx:22-42`

```typescript
// Source: src/app/(dashboard)/agentes/routing/audit/page.tsx:22-42
interface AuditPageProps {
  searchParams: Promise<{
    reason?: string
    agent_id?: string
    from?: string
    to?: string
  }>
}

export default async function RoutingAuditPage({ searchParams }: AuditPageProps) {
  const params = await searchParams
  const workspaceId = await getActiveWorkspaceId()
  // …
}
```

**Closest analog 3 — `<Suspense>` wrapper in (dashboard) page:** `src/app/(dashboard)/configuracion/integraciones/page.tsx:7,99-104`

```typescript
// Source: src/app/(dashboard)/configuracion/integraciones/page.tsx:7
import { Suspense } from 'react'

// Source: src/app/(dashboard)/configuracion/integraciones/page.tsx:99-104
<Suspense fallback={<div className="h-96 animate-pulse bg-muted rounded" />}>
  <ShopifyForm
    integration={integration}
    pipelines={pipelines}
  />
</Suspense>
```

> **Note for planner:** This is the ONLY `<Suspense>` import + usage in `src/app/(dashboard)/**/page.tsx` (verified via grep `Suspense` recursive). For our case the fallback is `null` (per RESEARCH.md: "wrap `<OrdersView/>` in `<Suspense fallback={null}>`") — semantically identical to the integraciones pattern, just no skeleton because adjacent layout already shows `<CrmTabs/>` chrome and the kanban is too dynamic for a useful fallback shape.

**Apply to `pedidos/page.tsx` — full new shape (planner replicates):**

Compose 3 analogs:
1. `contactos/page.tsx:61-69` — async `searchParams` Promise type + `await searchParams` line
2. existing `pedidos/page.tsx:1-53` — keep cookies + auth + `Promise.all` block byte-identical
3. `integraciones/page.tsx:99-104` — `<Suspense fallback={…}>` wrapper around the client component

**Validation logic (NEW for this file but reuses existing `pipelines[]` array):**
```typescript
// Validate URL param against fetched pipelines[] (D-03).
// Silent fallback to default if invalid (D-04).
const validRequested = requestedPipelineId
  ? pipelines.find(p => p.id === requestedPipelineId)
  : undefined
const resolvedPipelineId = validRequested?.id ?? defaultPipeline?.id
```
> Same `.find(p => p.id === id)` validation idiom used in `pipeline-tabs.tsx:48` (`pipelines.some((p) => p.id === id)`) — workspace isolation already enforced upstream by `getPipelines()` RLS.

**Diff target — current line 8 signature `export default async function OrdersPage()` becomes:**
```typescript
import { Suspense } from 'react'                       // ← NEW import (top of file)

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    pipeline?: string
    new?: string
    order?: string
    contact_id?: string
  }>
}) {
  // … existing supabase + cookies + isAdminOrOwner logic UNCHANGED (lines 9-25) …

  const params = await searchParams                    // ← NEW
  const requestedPipelineId = params.pipeline          // ← NEW

  const defaultPipeline = await getOrCreateDefaultPipeline()
  const [orders, pipelines, products, tags] = await Promise.all([…])  // UNCHANGED

  // NEW validation
  const validRequested = requestedPipelineId
    ? pipelines.find(p => p.id === requestedPipelineId)
    : undefined
  const resolvedPipelineId = validRequested?.id ?? defaultPipeline?.id

  return (
    <div className="flex flex-col h-full">
      <Suspense fallback={null}>                       {/* ← NEW (Pitfall 4) */}
        <OrdersView
          // … all existing props UNCHANGED except:
          defaultPipelineId={resolvedPipelineId}       // ← CHANGED (was defaultPipeline?.id)
          activeWorkspaceId={workspaceId ?? null}      // ← NEW prop
        />
      </Suspense>
    </div>
  )
}
```

---

### `src/app/(dashboard)/crm/pedidos/components/orders-view.tsx` (client — URL state + localStorage)

This file gets 4 distinct edits, each with a SEPARATE existing analog. They compose; no new abstractions.

#### Edit 1 — Add `activeWorkspaceId` prop and storage-key constant

**Closest analog (constants):** `src/app/(dashboard)/crm/pedidos/components/orders-view.tsx:64-66` (same file)

```typescript
// Source: orders-view.tsx:64-66 (existing pattern)
const VIEW_MODE_STORAGE_KEY = 'morfx_orders_view_mode'
const SORT_FIELD_STORAGE_KEY = 'morfx_kanban_sort_field'
const SORT_DIR_STORAGE_KEY = 'morfx_kanban_sort_dir'
```

**New constant follows same `morfx_*` namespace:**
```typescript
// Add at line 67 (next to existing storage keys, alphabetic-adjacent to view/sort family)
const ACTIVE_PIPELINE_STORAGE_KEY_PREFIX = 'morfx_active_pipeline:'   // NEW (D-05)
```
> Trailing colon explicit so the suffix `${activeWorkspaceId}` reads cleanly at call sites.

**Closest analog (props interface):** `orders-view.tsx:114-124` (same file)

```typescript
// Source: orders-view.tsx:114-124
interface OrdersViewProps {
  orders: OrderWithDetails[]
  pipelines: PipelineWithStages[]
  products: Product[]
  tags: Tag[]
  defaultPipelineId?: string
  defaultStageId?: string
  user: User | null
  currentUserId?: string
  isAdminOrOwner?: boolean
  // ← APPEND:
  // activeWorkspaceId: string | null
}
```

**Diff:**
- Line 124 (last prop): append `activeWorkspaceId: string | null`
- Line 138 (function destructure): append `activeWorkspaceId,`

#### Edit 2 — `handlePipelineChange` callback (NEW handler — replaces bare `setActivePipelineId` at PipelineTabs callsite)

**Closest analog 1 — localStorage write idiom:** `orders-view.tsx:454-476` (same file, existing handlers)

```typescript
// Source: orders-view.tsx:454-462 (existing localStorage WRITE idiom — replicate exactly)
const handleViewModeChange = (mode: OrderViewMode) => {
  setViewMode(mode)
  try {
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode)
  } catch {
    // Ignore localStorage errors
  }
}

// Source: orders-view.tsx:464-469 (one-line variant)
const handleSortFieldChange = (value: string) => {
  const field = value as KanbanSortField
  setSortField(field)
  try { localStorage.setItem(SORT_FIELD_STORAGE_KEY, field) } catch {}
}
```

**Closest analog 2 — `URLSearchParams` build:** `src/app/(dashboard)/crm/contactos/components/contacts-table.tsx:53-64`

```typescript
// Source: contacts-table.tsx:53-64 (canonical URLSearchParams idiom in this codebase)
const buildUrl = React.useCallback((updates: Record<string, string | undefined>) => {
  const params = new URLSearchParams(searchParams.toString())
  for (const [key, value] of Object.entries(updates)) {
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
  }
  return `/crm/contactos?${params.toString()}`
}, [searchParams])
```
> **Critical deviation noted:** `contacts-table.tsx:73` uses `router.push(buildUrl(…))` (NEW NAVIGATION → server re-render acceptable for full page-data updates like search/tag filter). For our pipeline switch we replace `router.push`/`router.replace` with `window.history.replaceState` because `OrdersPage` data does NOT change with `?pipeline=` (Pitfall 1, RESEARCH.md). Same `URLSearchParams` build → different commit verb.

**Composed `handlePipelineChange` (NEW pattern — flagged below):**
```typescript
// Place IMMEDIATELY after `setActivePipelineId` declaration at line 156 (so it's visually
// grouped with the state it wraps).
//
// New handler — composes the two existing idioms:
//   • localStorage WRITE pattern from handleViewModeChange (lines 454-462)
//   • URLSearchParams BUILD pattern from contacts-table.tsx buildUrl (lines 53-64)
// with one critical deviation: window.history.replaceState INSTEAD of
// router.push/router.replace, because OrdersPage's 4-way Promise.all
// (getOrders, getPipelines, getActiveProducts, getTagsForScope) does NOT
// depend on ?pipeline= and we don't want an RSC re-fetch per click (Pitfall 1).
const handlePipelineChange = React.useCallback((newId: string) => {
  setActivePipelineId(newId)

  // Persist to localStorage scoped by workspace (D-05).
  // Try/catch matches lines 454-462 / 464-469 / 471-476 idiom.
  if (activeWorkspaceId) {
    try {
      localStorage.setItem(
        `${ACTIVE_PIPELINE_STORAGE_KEY_PREFIX}${activeWorkspaceId}`,
        newId,
      )
    } catch {
      // localStorage disabled / quota — silent.
    }
  }

  // Reflect in URL (D-01). Use replaceState to avoid RSC re-fetch.
  // window.history.replaceState integrates with Next 16's useSearchParams.
  try {
    const params = new URLSearchParams(searchParams.toString())
    params.set('pipeline', newId)
    window.history.replaceState(null, '', `/crm/pedidos?${params.toString()}`)
  } catch {
    // Defensive — should never throw on the client.
  }
}, [activeWorkspaceId, searchParams])
```

> **NEW PATTERN FLAG:** The `handlePipelineChange` shape (state setter + localStorage + `window.history.replaceState`) does NOT exist anywhere in this codebase. The codebase has localStorage handlers (above) and URL-mutating handlers (`contacts-table.tsx`), but NEVER both combined, and NEVER using `replaceState` instead of `router.push/replace`. Rationale for introducing it: RESEARCH.md Pitfall 1 — `router.replace` would trigger an RSC re-fetch of `OrdersPage`'s 4-way `Promise.all` on every pipeline tab click. The `replaceState` idiom is the canonical Next 16 fix. This is the SINGLE new abstraction in the standalone, and it's inlined (not a custom hook), per the "Don't Hand-Roll" mandate in RESEARCH.md (`Custom usePersistedState/useUrlState hook | Codebase grep returned ZERO matches`).

#### Edit 3 — Post-mount hydration `useEffect` (NEW effect)

**Closest analog 1 — one-shot post-mount localStorage READ idiom:** `orders-view.tsx:434-452` (same file)

```typescript
// Source: orders-view.tsx:434-452 (existing one-shot post-mount localStorage READ)
React.useEffect(() => {
  try {
    const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY)
    if (saved === 'kanban' || saved === 'list') {
      setViewMode(saved)
    }
    const savedField = localStorage.getItem(SORT_FIELD_STORAGE_KEY)
    if (savedField && SORT_OPTIONS.some(o => o.value === savedField)) {
      setSortField(savedField as KanbanSortField)
    }
    const savedDir = localStorage.getItem(SORT_DIR_STORAGE_KEY)
    if (savedDir === 'asc' || savedDir === 'desc') {
      setSortDirection(savedDir)
    }
  } catch {
    // Ignore localStorage errors
  }
}, [])
```

**Closest analog 2 — pipeline-array validation on mount:** `pipeline-tabs.tsx:39-65` (sibling file)

```typescript
// Source: pipeline-tabs.tsx:39-65 (validation against pipelines[] on mount, with early return guards)
React.useEffect(() => {
  if (hasLoaded) return

  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (stored) {
      const ids = JSON.parse(stored) as string[]
      // Filter to only valid pipeline IDs
      const validIds = ids.filter((id) =>
        pipelines.some((p) => p.id === id)
      )
      if (validIds.length > 0) {
        setOpenPipelineIds(validIds)
        onOpenPipelines(validIds)
        // If no active pipeline, set first open one
        if (!activePipelineId) {
          onPipelineChange(validIds[0])
        }
        setHasLoaded(true)
        return
      }
    }
  } catch {
    // Ignore localStorage errors
  }
  setHasLoaded(true)
}, [pipelines, hasLoaded])
```
> Note this analog uses `pipelines.some((p) => p.id === id)` — same validation predicate (D-03) we'll replicate.

**Composed hydration effect (place immediately after lines 434-452 for visual grouping):**
```typescript
// Hydrate active pipeline from localStorage on mount IF the URL doesn't
// already specify ?pipeline= (D-02). One-shot post-mount; deps intentionally
// empty (Pitfall 2 — searchParams in deps would loop).
//
// Composes:
//   • localStorage READ + try/catch from lines 434-452 (same file)
//   • pipelines.some(p => p.id === stored) validation from pipeline-tabs.tsx:48 (D-03)
// New: replaceState mirror so subsequent F5 keeps the choice.
React.useEffect(() => {
  if (searchParams.get('pipeline')) return       // URL takes precedence
  if (!activeWorkspaceId) return                  // can't scope without workspace

  try {
    const stored = localStorage.getItem(
      `${ACTIVE_PIPELINE_STORAGE_KEY_PREFIX}${activeWorkspaceId}`,
    )
    if (!stored) return
    if (!pipelines.some(p => p.id === stored)) return  // D-03 validation
    if (stored === activePipelineId) return            // already correct

    setActivePipelineId(stored)
    const params = new URLSearchParams(searchParams.toString())
    params.set('pipeline', stored)
    window.history.replaceState(null, '', `/crm/pedidos?${params.toString()}`)
  } catch {
    // Silent — matches lines 449-451 idiom.
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])  // empty deps: one-shot post-mount, intentional. See Pitfall 2.
```

> **NEW PATTERN FLAG (minor):** The combination of "empty-deps hydration + replaceState mirror" is novel for this codebase. The two halves separately exist (`orders-view.tsx:434-452` for empty-deps read; `handlePipelineChange` above for replaceState write). Rationale: RESEARCH.md D-02 + Pitfall 2 — empty deps avoids the documented infinite-loop pitfall, and the replaceState mirror makes F5 work after first hydration.

#### Edit 4 — Wire `<PipelineTabs/>` callback + line 273 setter swap

**Closest analog (in same file):** `orders-view.tsx:947-952` (current PipelineTabs callsite)

```typescript
// Source: orders-view.tsx:947-952 (current state)
<PipelineTabs
  pipelines={pipelines}
  activePipelineId={activePipelineId}
  onPipelineChange={setActivePipelineId}        // ← change to handlePipelineChange
  onOpenPipelines={setOpenPipelineIds}
/>
```

**Diff target:**
- Line 950: `onPipelineChange={setActivePipelineId}` → `onPipelineChange={handlePipelineChange}`
- Line 273 (inside `?order=<id>` effect): `setActivePipelineId(order.pipeline_id)` → `handlePipelineChange(order.pipeline_id)`
- Line 280 deps: append `, handlePipelineChange` to the dep array (currently `[searchParams, router, orders, activePipelineId]` → `[searchParams, router, orders, activePipelineId, handlePipelineChange]`).

**Existing context for line 273 edit (`orders-view.tsx:266-280`):**
```typescript
// Source: orders-view.tsx:266-280 (existing — modify only line 273 + line 280 deps)
React.useEffect(() => {
  const orderId = searchParams.get('order')
  if (orderId) {
    const order = orders.find(o => o.id === orderId)
    if (order) {
      // Switch to the order's pipeline if different
      if (order.pipeline_id !== activePipelineId) {
        setActivePipelineId(order.pipeline_id)         // ← LINE 273: swap to handlePipelineChange
      }
      setViewingOrder(order)
      // Clear the URL param after opening
      router.replace('/crm/pedidos', { scroll: false })
    }
  }
}, [searchParams, router, orders, activePipelineId])  // ← LINE 280: add handlePipelineChange dep
```

> **Open question (RESEARCH.md, Q1):** the `router.replace('/crm/pedidos', { scroll: false })` at line 277 wipes ALL query params including `?pipeline=`. This is acceptable per the research's recommendation (manual QA will confirm). DO NOT expand scope to refactor this — `handlePipelineChange` runs BEFORE the clear, so localStorage is already updated; F5 still works via the hydration effect.

---

### `src/components/layout/sidebar.tsx` (client nav config — single-line delete per D-08)

**Analog:** the file itself — only `navCategoriesV2[0].items` line 146 changes. The legacy `navItems[]` (lines 44-122) and the entire legacy render block (lines 399+) are byte-identical (Regla 6 fail-closed per D-13/RESEARCH).

**Current state** (`src/components/layout/sidebar.tsx:140-151`):
```typescript
const navCategoriesV2: SidebarCategoryV2[] = [
  {
    label: 'Operación',
    items: [
      { href: '/crm', label: 'CRM', icon: Building2 },
      { href: '/whatsapp', label: 'WhatsApp', icon: MessageSquare },
      { href: '/crm/pedidos', label: 'Pedidos', icon: Package },     // ← LINE 146: DELETE
      { href: '/tareas', label: 'Tareas', icon: ListTodo, badgeType: 'tasks' },
      { href: '/confirmaciones', label: 'Confirmaciones', icon: CalendarCheck },
      { href: '/sms', label: 'SMS', icon: MessageSquareText },
    ],
  },
  // …rest unchanged…
]
```

**Edit recipe:**
- Delete line 146 (the `Pedidos` item)
- Verify: `grep -n "Package" src/components/layout/sidebar.tsx` — if the only remaining reference is the `lucide-react` import (line 6), remove `Package` from that import list. If `Package` is referenced elsewhere, keep the import.
- The 4 remaining items in `navCategoriesV2[0].items` (CRM, WhatsApp, Tareas, Confirmaciones, SMS) stay in their existing order.

> **Verified:** Reading `sidebar.tsx:1-160`, `Package` ONLY appears at line 6 (import) and line 146 (the item being deleted). After delete, the import is unused — must be removed.

**Imports edit (line 6):**
```typescript
// BEFORE:
import { Building2, MessageSquare, MessageSquareText, Settings, Users, LogOut, ListTodo, BarChart3, Bot, Zap, Sparkles, Terminal, CalendarCheck, TrendingUp, Package, FlaskConical } from 'lucide-react'

// AFTER:
import { Building2, MessageSquare, MessageSquareText, Settings, Users, LogOut, ListTodo, BarChart3, Bot, Zap, Sparkles, Terminal, CalendarCheck, TrendingUp, FlaskConical } from 'lucide-react'
```

**Diff target:** `git diff src/components/layout/sidebar.tsx` should show exactly TWO line changes — line 6 (import — `Package` removed) and line 146 (item deleted). Nothing else.

---

## Shared Patterns

### Pattern A — `morfx_*` localStorage namespace + try/catch silent
**Source:** `src/app/(dashboard)/crm/pedidos/components/orders-view.tsx:64-66, 434-476`
**Apply to:** every localStorage read/write in this standalone (handlePipelineChange + hydration effect)

```typescript
// Constant declaration (existing convention)
const ACTIVE_PIPELINE_STORAGE_KEY_PREFIX = 'morfx_active_pipeline:'

// Write idiom (canonical for this file)
try {
  localStorage.setItem(KEY, value)
} catch {
  // Ignore localStorage errors (or: localStorage disabled / quota — silent.)
}

// Read idiom (canonical for this file)
try {
  const saved = localStorage.getItem(KEY)
  if (saved /* validate */ ) { setX(saved) }
} catch {
  // Ignore localStorage errors
}
```

### Pattern B — `URLSearchParams` query mutation
**Source:** `src/app/(dashboard)/crm/contactos/components/contacts-table.tsx:53-64`
**Apply to:** any URL update in `orders-view.tsx` (both `handlePipelineChange` and the hydration effect)

```typescript
const params = new URLSearchParams(searchParams.toString())
params.set('pipeline', newId)
// for our case: window.history.replaceState (NOT router.push/replace)
window.history.replaceState(null, '', `/crm/pedidos?${params.toString()}`)
```
> Verb difference vs analog: `contacts-table.tsx:73,84,101` use `router.push(buildUrl(…))`; we use `window.history.replaceState` because pipeline switching does NOT change `OrdersPage` data (Pitfall 1).

### Pattern C — async `searchParams: Promise<…>` + inline await
**Source:** `src/app/(dashboard)/crm/contactos/page.tsx:61-66`, `src/app/(dashboard)/agentes/routing/audit/page.tsx:22-42`
**Apply to:** `pedidos/page.tsx`

```typescript
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ pipeline?: string; new?: string; order?: string; contact_id?: string }>
}) {
  const params = await searchParams
  const requestedPipelineId = params.pipeline
  // …
}
```

### Pattern D — `<Suspense fallback={…}>` around client child of RSC
**Source:** `src/app/(dashboard)/configuracion/integraciones/page.tsx:7,99-104`
**Apply to:** `pedidos/page.tsx` wrapping `<OrdersView/>`

```typescript
import { Suspense } from 'react'
// …
<Suspense fallback={null}>
  <OrdersView … />
</Suspense>
```
> Fallback choice: `null` (not skeleton) because the route is dynamically rendered (cookies + auth); `<Suspense>` here is defensive against Next 16 prerender enforcement of `useSearchParams` boundary (Pitfall 4). Skeleton would only flash on rare static-prerender future regression.

### Pattern E — One-shot post-mount effect with empty deps
**Source:** `src/app/(dashboard)/crm/pedidos/components/orders-view.tsx:434-452` and `src/app/(dashboard)/crm/pedidos/components/pipeline-tabs.tsx:39-65`
**Apply to:** localStorage hydration of active pipeline

```typescript
React.useEffect(() => {
  // … read localStorage, validate against pipelines[], setState …
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
```
> Empty deps + eslint-disable comment is the project convention for "intentional one-shot mount" (Pitfall 2 prevents loop with `searchParams` ref).

### Pattern F — v2 vs legacy fail-closed branching (Regla 6 spirit per D-13)
**Source:** `src/app/(dashboard)/crm/page.tsx:22-25` (existing pattern), `src/app/(dashboard)/crm/contactos/page.tsx:78-99` (existing larger ternary), `src/components/layout/sidebar.tsx:140-151` (categories config)
**Apply to:** all 4 files in this standalone

Rule: every change touches ONLY the v2 code path. Concretely:
- `crm/page.tsx`: only line 23 (inside `if (v2) {…}` block).
- `pedidos/page.tsx`: the route serves both v1 and v2 today (`OrdersView` is shared), so changes are scoped to feature additions (URL state + Suspense), not branching.
- `orders-view.tsx`: same — additions are feature-level. The standalone's "v2-only effect" is achieved via the `<CrmTabs/>` rendered by `crm/layout.tsx` (already gated by v2) and the sidebar nav being v2-specific.
- `sidebar.tsx`: only `navCategoriesV2` array. The legacy `navItems[]` array (lines 44-122) and the legacy `else` render block (lines 399+) MUST be untouched.

**Verification command (per file):** `git diff <file> | grep -E '^[+-]' | wc -l` — expect a small constant number.

---

## No Analog Found

Files with NO close existing analog (planner uses RESEARCH.md / official docs instead):

| File | Role | Data Flow | Reason | Alternative source |
|------|------|-----------|--------|--------------------|
| `orders-view.tsx` `handlePipelineChange` callback | composed handler (state + storage + URL) | event-driven | NO existing handler combines all three (state + localStorage + URL mutation). Closest fragments: `handleViewModeChange` (state + localStorage) and `contacts-table.tsx:buildUrl` (state + URL). Combining them is intentional and inlined per "Don't Hand-Roll" mandate. | RESEARCH.md Pattern 2 + Next 16 docs `nextjs.org/docs/app/getting-started/linking-and-navigating#native-history-api` |
| `orders-view.tsx` `window.history.replaceState` call | shallow URL update | client-only side effect | NO existing call to `window.history.*` in this codebase (verified — codebase uses `router.push` / `router.replace` exclusively). | RESEARCH.md Pitfall 1 + Next 16.2.4 docs (verified 2026-04-27) |

> Both new patterns are flagged in their respective edit sections above. They are inlined into existing handlers/effects (no new abstraction file, no custom hook, no helper utility) — matching the project's anti-abstraction stance for this scope.

---

## Metadata

**Analog search scope:**
- `src/app/(dashboard)/**/page.tsx` (RSC analogs for `searchParams: Promise<…>` + Suspense)
- `src/app/(dashboard)/crm/**/components/*.tsx` (URL state + localStorage idioms)
- `src/components/layout/sidebar.tsx` (nav config structure)

**Files scanned:** 7 read in full or relevant ranges (`crm/page.tsx`, `crm/pedidos/page.tsx`, `crm/pedidos/components/orders-view.tsx` lines 1-170, 250-350, 430-480, 935-955, `crm/pedidos/components/pipeline-tabs.tsx` lines 1-90, `crm/contactos/page.tsx` lines 1-120, `crm/contactos/components/contacts-table.tsx` lines 1-110, `agentes/routing/audit/page.tsx` lines 1-60, `components/layout/sidebar.tsx` lines 1-160, `configuracion/integraciones/page.tsx` line 7 + 90-110).

**Pattern extraction date:** 2026-04-27

**Confidence:** HIGH — every edit composes ≤2 existing in-codebase idioms, plus 2 well-documented Next 16 official primitives (`window.history.replaceState`, `<Suspense>` boundary) for the parts no analog covers.
