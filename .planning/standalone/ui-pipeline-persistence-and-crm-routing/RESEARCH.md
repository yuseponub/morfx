# Standalone: UI Pipeline Persistence + CRM Routing — Research

**Researched:** 2026-04-27
**Domain:** Next.js 16 App Router URL state + localStorage hydration in client component (no DB, no domain)
**Confidence:** HIGH

## Summary

Two coupled UX bugs with locked decisions in CONTEXT.md (D-01..D-13). The work is small (~4 files, no DB, no domain) but has one non-trivial technical question: **how to wire URL ↔ localStorage ↔ React state for the active pipeline without re-render loops, hydration mismatches, or unnecessary server re-fetches.**

The codebase already contains an EXACT canonical pattern for this in `src/app/(dashboard)/crm/contactos/components/contacts-table.tsx:53-85` (server reads `searchParams` async → passes resolved value as prop → client uses `useSearchParams()` + `useRouter()` to mutate URL via `router.push(buildUrl({...}))`). We replicate this idiom for consistency, with one critical refinement: for the pipeline-change handler we use **`window.history.replaceState`** instead of `router.replace`, because the server `OrdersPage` reads `searchParams.pipeline` and we do NOT want to re-trigger the data fetch (`getOrders`, `getPipelines`, `getActiveProducts`, `getTagsForScope`) every time the user clicks a pipeline tab. This is the canonical Next.js 16 "shallow URL update" idiom documented at `nextjs.org/docs/app/getting-started/linking-and-navigating#native-history-api`.

For localStorage hydration on first load (URL has no `?pipeline=`), we follow the textbook "stable server default + post-mount client island read" pattern: server resolves `defaultPipelineId` (already does this today); client mounts with that default; one-shot `useEffect` reads `morfx_active_pipeline:<workspaceId>`, validates against `pipelines[]`, and calls `setActivePipelineId` + `window.history.replaceState` (no `router.replace`, no re-fetch).

**Primary recommendation:**
1. **Server `pedidos/page.tsx`:** Type `searchParams: Promise<{ pipeline?: string }>`, await it, validate against fetched `pipelines[]`, pass `defaultPipelineId = validParam ?? defaultPipeline?.id` to `<OrdersView/>`. No new types or libs.
2. **Client `orders-view.tsx`:** Replace `setActivePipelineId` with a wrapper that ALSO writes localStorage + `window.history.replaceState` (NOT `router.replace`). Add a one-shot post-mount `useEffect` to hydrate from localStorage when URL was empty. Wrap the entire `<OrdersView/>` in `<Suspense fallback={null}>` at the parent `page.tsx` (mandatory in Next 16 for prod build — currently missing).
3. **Sidebar + redirect:** 1-line edits per D-07 and D-08, wrapped in the existing `if (v2)` branches.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** URL query param `?pipeline=<uuid>` is source of truth + localStorage `morfx_active_pipeline:<workspaceId>` as "last visit" fallback.
- **D-02:** Server resolves in `page.tsx` to avoid flash; client `useEffect` on mount can `router.replace` (or equivalent) to hydrate from localStorage if URL empty.
- **D-03:** Validate query param / localStorage value against `pipelines[]` (workspace-scoped via RLS). Invalid → silent fallback to default; no toast.
- **D-04:** Deleted pipeline → silent fallback to default; localStorage gets overwritten on next user click.
- **D-05:** localStorage key format: `morfx_active_pipeline:${workspaceId}` (workspace-scoped).
- **D-06:** `pipeline-tabs.tsx` `morfx_open_pipelines` localStorage NOT touched. New key is independent.
- **D-07:** `crm/page.tsx:23` change `redirect('/crm/contactos')` → `redirect('/crm/pedidos')` ONLY in `if (v2)` branch. Legacy untouched.
- **D-08:** Delete `{ href: '/crm/pedidos', label: 'Pedidos', icon: Package }` from `navCategoriesV2[0].items` (`sidebar.tsx:146`). Legacy `navItems[]` untouched.
- **D-09:** Contactos remains accessible via `<CrmTabs/>` strip (rendered by `crm/layout.tsx` when v2). No tab additions.
- **D-10:** Sidebar legacy NOT touched (Regla 6 byte-identical fail-closed).
- **D-11:** Single standalone, manual QA (5 cases listed in CONTEXT). No automated tests required.
- **D-12:** Regla 5 N/A (no DB migrations).
- **D-13:** Regla 6 N/A directly (no agents) but byte-identical legacy branch must be preserved.

### Claude's Discretion
- Exact `useEffect` shape for hydration (deps, cleanup, ordering).
- Choice between `router.replace` vs `window.history.replaceState` for in-page pipeline switching.
- Race-condition handling between server-resolved default and client localStorage hydrate.

### Deferred Ideas (OUT OF SCOPE)
- DB-backed user-level pipeline preference (`user_preferences`) for multi-device sync.
- Cross-device "open pipelines" UI state.
- Activating the "Pipelines" tab (currently `comingSoon` in `crm-tabs.tsx:48`).
- Cleanup of legacy v1 sidebar branch.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PERSIST-01 | F5 on `/crm/pedidos?pipeline=X` keeps pipeline X active | Server reads `searchParams.pipeline` → passes resolved id as `defaultPipelineId` prop. Verified against existing pattern `contactos/page.tsx:62-66`. |
| PERSIST-02 | Sharing URL `/crm/pedidos?pipeline=X` to coworker (same workspace) loads pipeline X | Same as PERSIST-01 — URL is source of truth. Workspace isolation via RLS in `getPipelines()`. |
| PERSIST-03 | Returning to `/crm/pedidos` (no query) loads "last visited" pipeline from localStorage | Post-mount `useEffect` reads `morfx_active_pipeline:<workspaceId>`, validates against `pipelines[]`, applies via `setActivePipelineId` + `history.replaceState`. |
| PERSIST-04 | Switching pipeline via UI updates URL without server re-fetch | `window.history.replaceState` (NOT `router.replace`) — verified at `nextjs.org/.../linking-and-navigating#native-history-api`. |
| ROUTING-01 | Sidebar "CRM" v2 → `/crm/pedidos` directly | Edit `crm/page.tsx:23` redirect target inside `if (v2)`. |
| ROUTING-02 | Sidebar v2 no longer shows duplicate "Pedidos" item | Delete line `sidebar.tsx:146` from `navCategoriesV2[0].items`. |
| ROUTING-03 | Sidebar legacy (v1) byte-identical (Regla 6) | All edits scoped to `if (v2)` branches and `navCategoriesV2`. `navItems[]` and legacy render block (lines 399+) untouched. |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Resolve initial pipeline from URL | Frontend Server (RSC) | — | `searchParams` is server-provided in Next 16 App Router; resolving in `page.tsx` avoids client flash and keeps the prop contract identical to today. |
| Validate pipeline id against workspace scope | API/Domain (`getPipelines()`) | Frontend Server | Domain layer (`@/app/actions/orders`) already filters by workspace via RLS. Server `page.tsx` does the membership check (id ∈ pipelines[]). |
| Mutate URL on pipeline tab click | Browser/Client | — | `window.history.replaceState` runs in-browser only; integrates with Next.js Router so `useSearchParams` stays in sync without RSC payload re-fetch. |
| Persist "last visited" preference | Browser/Client (localStorage) | — | No DB column; per-user-per-device acceptable per D-01 deferred decision. |
| Hydrate from localStorage on first mount | Browser/Client (`useEffect`) | — | localStorage is a browser-only API; reading during SSR causes hydration mismatch. Mount-time effect is the canonical fix per Next.js docs. |
| `/crm` v2 redirect | Frontend Server (RSC `crm/page.tsx`) | — | Already a server component using `redirect()` from `next/navigation`. |
| Sidebar v2 nav rendering | Browser/Client (`sidebar.tsx`) | — | Already `'use client'` because of `usePathname()`. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | `^16.1.6` | App Router, server components, navigation hooks, `redirect()` | Already in repo. No upgrade. [VERIFIED: `package.json:64`] |
| `react` | `19.2.3` | `useState`, `useEffect`, `useCallback`, `useMemo` | Already in repo. [VERIFIED: `package.json:69`] |
| `next/navigation` | (built-in) | `useRouter`, `useSearchParams`, `usePathname`, `redirect` | Already imported in `orders-view.tsx:4`, `sidebar.tsx:5`, `crm/page.tsx:1`. [VERIFIED: codebase grep] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `window.history.replaceState` | (browser DOM API) | Shallow URL update without RSC re-fetch | Pipeline tab click — see Pitfall 1 below. [CITED: nextjs.org/docs/app/getting-started/linking-and-navigating#native-history-api] |
| `URLSearchParams` | (browser DOM API) | Build/parse query strings idempotently | When constructing the new URL passed to `replaceState`. Already used in `contacts-table.tsx:55` and `automatizaciones/components/execution-history.tsx:113`. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `window.history.replaceState` | `router.replace(url, { scroll: false })` | `router.replace` triggers a full RSC payload re-fetch (re-runs `OrdersPage` server component → `getOrders`, `getPipelines`, `getActiveProducts`, `getTagsForScope` all 4 in parallel). For an in-page pipeline switch this is wasteful AND causes a brief loading state every click. `replaceState` is the canonical Next.js 16 idiom for "URL changes, server doesn't re-render." [VERIFIED: docs URL above] |
| Custom `usePersistedState`/`useUrlState` hook | None — none exists in `src/hooks/` | Codebase grep `grep -rn "usePersistedState\|useUrlState" src/` returned ZERO matches. The existing `pipeline-tabs.tsx:39-74` and `orders-view.tsx:434-476` localStorage idioms are inlined `useEffect`s with try/catch. We replicate the same idiom — DO NOT introduce a new hook abstraction (Pitfall 5 below). [VERIFIED: codebase grep] |
| `useSyncExternalStore` for localStorage | Plain `useEffect` + `useState` | `useSyncExternalStore` is overkill for a single-component preference. The codebase doesn't use it anywhere else for localStorage. Plain `useEffect` is what `pipeline-tabs.tsx`, `orders-view.tsx` already do. Stay consistent. |
| Server-action-driven cookie persistence | localStorage | Cookie write requires a server roundtrip per click. localStorage is sync, zero-roundtrip, and per-device — exactly what D-01 wants. |
| Redux/zustand for active pipeline | React `useState` | Single-component scope. No cross-page state needed. |

**Installation:**
```bash
# No new dependencies. All required packages already in package.json.
```

**Version verification:** Confirmed Next.js `^16.1.6` and React `19.2.3` from `package.json` lines 64 and 69. Next 16.2.4 docs (latest at research date 2026-04-27) confirm `window.history.replaceState` integration with `useSearchParams` is stable since v13. [VERIFIED: WebFetch of nextjs.org/docs/app/api-reference/functions/use-router showing v15.4.0 changelog as latest entry, no breaking changes to `router.replace` since.]

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                  USER LANDS ON /crm/pedidos[?pipeline=X]            │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  RSC: crm/pedidos/page.tsx                                          │
│  ─────────────────────────────────────────                          │
│  1. await searchParams → { pipeline?: string }                      │
│  2. parallel fetch: getOrders, getPipelines, getProducts, getTags   │
│  3. resolve defaultPipelineId:                                       │
│       const requested = params.pipeline                             │
│       const valid = pipelines.find(p => p.id === requested)         │
│       const defaultPipelineId = valid?.id                           │
│         ?? (await getOrCreateDefaultPipeline()).id                  │
│  4. pass defaultPipelineId as prop                                  │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  <Suspense fallback={null}> (NEW — required for Next 16 prod build) │
│    <OrdersView                                                       │
│      defaultPipelineId={defaultPipelineId}                          │
│      activeWorkspaceId={activeWorkspaceId}  (NEW prop)              │
│      ...rest unchanged                                               │
│    />                                                                │
│  </Suspense>                                                         │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  CLIENT: OrdersView                                                  │
│  ─────────────────────────────────────────                          │
│  React state: activePipelineId initialized from defaultPipelineId   │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  ON MOUNT effect (one-shot, runs once after hydration):    │    │
│  │  IF searchParams.get('pipeline') is null                   │    │
│  │    AND localStorage has 'morfx_active_pipeline:<wsId>'     │    │
│  │    AND that id ∈ pipelines[]                               │    │
│  │  THEN                                                       │    │
│  │    setActivePipelineId(storedId)                           │    │
│  │    history.replaceState(null, '',                          │    │
│  │      `/crm/pedidos?pipeline=${storedId}`)                  │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  onPipelineChange(newId):  (handler used by PipelineTabs)  │    │
│  │  1. setActivePipelineId(newId)                             │    │
│  │  2. localStorage.setItem(`morfx_active_pipeline:${wsId}`,  │    │
│  │       newId)                                                │    │
│  │  3. const params = new URLSearchParams(                    │    │
│  │       searchParams.toString())                              │    │
│  │     params.set('pipeline', newId)                          │    │
│  │     window.history.replaceState(null, '',                  │    │
│  │       `/crm/pedidos?${params.toString()}`)                 │    │
│  │  ⚠️ NO router.replace — would re-fetch RSC payload          │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  REDIRECT FLOW (independent capability)                             │
│  ─────────────────────────────────────────                          │
│  GET /crm                                                            │
│    ↓ crm/page.tsx (RSC)                                             │
│    ↓ await getActiveWorkspaceId() → wsId                            │
│    ↓ await getIsDashboardV2Enabled(wsId) → v2: boolean              │
│    ↓ if (v2) redirect('/crm/pedidos')   ◄── CHANGE per D-07         │
│    ↓ redirect('/crm/pedidos')   ◄── legacy unchanged                │
└─────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

No new files. All edits in existing locations:

```
src/
├── app/(dashboard)/
│   ├── crm/
│   │   ├── page.tsx                       # EDIT line 23 only (D-07)
│   │   └── pedidos/
│   │       ├── page.tsx                   # EDIT — add searchParams + Suspense
│   │       └── components/
│   │           └── orders-view.tsx        # EDIT — URL/localStorage sync
│   └── (other modules unchanged)
├── components/layout/
│   └── sidebar.tsx                        # EDIT line 146 only (D-08)
└── (everything else unchanged)
```

### Pattern 1: Server resolves URL state from async `searchParams`
**What:** Server component reads `searchParams` (Promise<…> in Next 15+/16), validates, and passes resolved value as a plain prop to a client component. The client component renders identical HTML on server and client (no hydration mismatch).
**When to use:** Whenever a URL param drives initial UI state that needs to survive F5 / be shareable.
**Example:**
```typescript
// Source: src/app/(dashboard)/crm/contactos/page.tsx:61-69 (existing canonical pattern in this codebase)
export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; tags?: string }>
}) {
  const params = await searchParams
  const page = params.page ? Math.max(1, parseInt(params.page, 10)) : 1
  const search = params.q || ''
  // …
}

// Source: src/app/(dashboard)/agentes/routing/audit/page.tsx:23-42 (same pattern, different module)
type AuditPageProps = {
  searchParams: Promise<{ reason?: string; agent_id?: string; from?: string; to?: string }>
}
export default async function RoutingAuditPage({ searchParams }: AuditPageProps) {
  const params = await searchParams
  // …
}
```

**Apply to `pedidos/page.tsx`:**
```typescript
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ pipeline?: string; new?: string; order?: string; contact_id?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  // …existing role check…

  const params = await searchParams                   // ← NEW
  const requestedPipelineId = params.pipeline         // ← NEW

  const defaultPipeline = await getOrCreateDefaultPipeline()

  const [orders, pipelines, products, tags] = await Promise.all([
    getOrders(),
    getPipelines(),
    getActiveProducts(),
    getTagsForScope('orders')
  ])

  // Validate query param against workspace pipelines (D-03).
  // Fallback silent to default if invalid (D-03/D-04).
  const validRequested = requestedPipelineId
    ? pipelines.find(p => p.id === requestedPipelineId)
    : undefined
  const resolvedPipelineId = validRequested?.id ?? defaultPipeline?.id

  return (
    <div className="flex flex-col h-full">
      <Suspense fallback={null}>                       {/* ← NEW (Pitfall 4) */}
        <OrdersView
          orders={orders}
          pipelines={pipelines}
          products={products}
          tags={tags}
          defaultPipelineId={resolvedPipelineId}       // ← CHANGED (was defaultPipeline?.id)
          defaultStageId={defaultPipeline?.stages[0]?.id}
          user={user}
          currentUserId={user?.id}
          isAdminOrOwner={isAdminOrOwner}
          activeWorkspaceId={workspaceId ?? null}      // ← NEW prop for localStorage scoping
        />
      </Suspense>
    </div>
  )
}
```

### Pattern 2: Client `window.history.replaceState` for shallow URL updates
**What:** Update URL query string in browser without triggering Next.js Router transition (no RSC payload fetch, no `loading.tsx` flicker, no parent layout re-render).
**When to use:** UI state that should be reflected in URL for F5/share, but where the underlying server-rendered data doesn't change with the param.
**Why critical here:** `OrdersPage` fetches 4 things in parallel (`getOrders`, `getPipelines`, `getActiveProducts`, `getTagsForScope`). None of those change based on `?pipeline=`. If we used `router.replace`, every pipeline click re-runs all 4 server actions. `replaceState` updates the address bar AND keeps `useSearchParams` in sync (verified — Next.js docs explicit: "pushState and replaceState calls integrate into the Next.js Router, allowing you to sync with usePathname and useSearchParams").
**Example:**
```typescript
// Source: nextjs.org/docs/app/getting-started/linking-and-navigating#native-history-api (verified 2026-04-27, Next 16.2.4 docs)
'use client'
import { useSearchParams } from 'next/navigation'

export default function SortProducts() {
  const searchParams = useSearchParams()

  function updateSorting(sortOrder: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('sort', sortOrder)
    window.history.pushState(null, '', `?${params.toString()}`)
  }
  // …
}
```

**Apply to `orders-view.tsx`:** Replace `onPipelineChange={setActivePipelineId}` (line 950) with a wrapper:
```typescript
const handlePipelineChange = React.useCallback((newId: string) => {
  setActivePipelineId(newId)

  // Persist to localStorage (D-05). Try/catch matches existing idiom (lines 434-476).
  if (activeWorkspaceId) {
    try {
      localStorage.setItem(
        `morfx_active_pipeline:${activeWorkspaceId}`,
        newId,
      )
    } catch { /* localStorage disabled / quota — silent */ }
  }

  // Shallow URL update — NO router.replace (would re-fetch RSC payload).
  // history.replaceState integrates with useSearchParams per Next 16 docs.
  try {
    const params = new URLSearchParams(searchParams.toString())
    params.set('pipeline', newId)
    window.history.replaceState(null, '', `/crm/pedidos?${params.toString()}`)
  } catch { /* SSR safety — should never run, component is 'use client' */ }
}, [activeWorkspaceId, searchParams])

// …in JSX (line 947-952):
<PipelineTabs
  pipelines={pipelines}
  activePipelineId={activePipelineId}
  onPipelineChange={handlePipelineChange}        // ← was setActivePipelineId
  onOpenPipelines={setOpenPipelineIds}
/>
```

**ALSO update line 273** in the existing `?order=<id>` effect — `setActivePipelineId(order.pipeline_id)` should similarly persist + replaceState. Refactor: replace that direct setter with `handlePipelineChange(order.pipeline_id)`.

### Pattern 3: Post-mount localStorage hydration with no SSR mismatch
**What:** Initial render uses server-resolved value. After mount, a one-shot effect reads localStorage and may swap to a stored value.
**When to use:** Persisted client-only preference that augments (not replaces) a sensible server default.
**Example (verified pattern from this codebase):**
```typescript
// Source: src/app/(dashboard)/crm/pedidos/components/orders-view.tsx:434-452 (existing pattern for view mode)
React.useEffect(() => {
  try {
    const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY)
    if (saved === 'kanban' || saved === 'list') {
      setViewMode(saved)
    }
    // …
  } catch {
    // Ignore localStorage errors
  }
}, [])
```

**Apply to active pipeline:** Add ONE-SHOT effect with empty dep array. Only fires when URL had no `?pipeline=` (i.e., user landed via sidebar click, not deep link).
```typescript
// New effect, place near line 452 (next to existing localStorage effect for consistency)
React.useEffect(() => {
  // Only hydrate from localStorage if the URL did NOT specify a pipeline.
  // The server has already resolved the URL pipeline (or fallen back to default)
  // and passed the result as defaultPipelineId.
  if (searchParams.get('pipeline')) return
  if (!activeWorkspaceId) return

  try {
    const stored = localStorage.getItem(`morfx_active_pipeline:${activeWorkspaceId}`)
    if (!stored) return
    // Validate against current pipelines[] (D-03).
    if (!pipelines.some(p => p.id === stored)) return
    // Don't bother if it equals the current state.
    if (stored === activePipelineId) return

    setActivePipelineId(stored)
    // Reflect in URL so subsequent F5 keeps the choice.
    const params = new URLSearchParams(searchParams.toString())
    params.set('pipeline', stored)
    window.history.replaceState(null, '', `/crm/pedidos?${params.toString()}`)
  } catch {
    // Silent — localStorage unavailable / quota / parse error.
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])  // ← empty deps: one-shot post-mount, intentional. See Pitfall 2.
```

### Anti-Patterns to Avoid
- **Reading `localStorage` in `useState` initializer.** `const [x] = useState(() => localStorage.getItem(...))` runs during SSR → `ReferenceError: localStorage is not defined`. Even with `'use client'`, RSC payload still serializes initial state. ALWAYS use mount-time `useEffect`.
- **Calling `router.replace` on every pipeline click.** Triggers RSC re-fetch of `getOrders/getPipelines/getActiveProducts/getTagsForScope` — wasteful and causes loading flicker. Use `window.history.replaceState`.
- **Putting `searchParams` in dep array of an effect that calls `router.replace`.** Effect → `router.replace` → URL changes → `searchParams` reference changes → effect runs again → infinite loop. Documented at github.com/vercel/next.js/discussions/46616. Mitigate via empty deps + early-return guard, OR use `replaceState` which doesn't change `searchParams` reference.
- **Writing localStorage during SSR.** Anywhere outside an effect/handler. Same `ReferenceError` failure mode as reads.
- **Forgetting `<Suspense>` around components that call `useSearchParams()`.** Next 16 prod build fails with "Missing Suspense boundary with useSearchParams". Currently `OrdersView` uses `useSearchParams` and is NOT wrapped — this only works because the route is dynamically rendered today (it uses cookies()). Adding the boundary is defensive and matches official guidance.
- **Storing a pipeline id without scoping by workspace.** A user with two workspaces would see workspace-A's last pipeline in workspace-B → silent leak of UI affordance. Always suffix `:<workspaceId>`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sync URL with React state | Custom `useUrlState` hook | `useSearchParams()` + `window.history.replaceState` | Next.js docs explicitly endorse this combo. Adding an abstraction adds review burden for one call site. [CITED: nextjs.org/docs/app/getting-started/linking-and-navigating#native-history-api] |
| Persist preference to localStorage | Custom `usePersistedState` hook | Inline `useEffect` + try/catch (3 lines) | The codebase already uses inline pattern in 4+ places (`orders-view.tsx:434-476`, `pipeline-tabs.tsx:39-74`). Be consistent. |
| Validate pipeline id ownership | Custom server action | Existing `getPipelines()` (returns workspace-scoped via RLS) + array `.find()` | RLS already enforces workspace boundary. Re-checking server-side is a redundant query. |
| URL parsing | String concat / `replace()` | `new URLSearchParams(searchParams.toString())` | Idempotent param mutation. Already used in `contacts-table.tsx:55` and `automatizaciones/components/execution-history.tsx:113`. |
| Detect "first mount" | Custom `useDidMount` hook | `useEffect(() => { … }, [])` | Standard React. The codebase uses this idiom in `pipeline-tabs.tsx:39-65` and `orders-view.tsx:434-452`. |

**Key insight:** All required primitives exist in `next/navigation` and DOM standards. The phase introduces **zero new abstractions** — it composes existing primitives with the same try/catch idioms already in `orders-view.tsx`. This minimizes review burden and matches "Regla 6 byte-identical fail-closed" spirit even though Regla 6 itself doesn't apply directly (D-13).

## Common Pitfalls

### Pitfall 1: `router.replace` causes RSC re-fetch on every pipeline click
**What goes wrong:** Using `router.replace('/crm/pedidos?pipeline=X', { scroll: false })` for in-page pipeline switches re-runs `OrdersPage` server component, which re-executes `getOrders`, `getPipelines`, `getActiveProducts`, `getTagsForScope` (all 4 in parallel) on every click. User sees brief loading state, server load multiplies, and existing kanban infinite-scroll state in `kanbanOrders` state may flicker.
**Why it happens:** `router.replace` is a Next.js Router transition — it re-fetches the RSC payload for the current URL. Any change to `searchParams` of the current page invalidates the cached RSC.
**How to avoid:** Use `window.history.replaceState`. This updates the address bar and IS observed by `useSearchParams()` (per Next 16 docs), but does NOT trigger a Next.js Router transition — so the server component does not re-render.
**Warning signs:** Network tab shows `/crm/pedidos?_rsc=...` request on every pipeline tab click. Brief flash of stage skeletons.
[VERIFIED: nextjs.org/docs/app/getting-started/linking-and-navigating#native-history-api (Next 16.2.4 docs, retrieved 2026-04-27): "pushState and replaceState calls integrate into the Next.js Router, allowing you to sync with usePathname and useSearchParams."]

### Pitfall 2: `useEffect` with `searchParams` in deps + `router.replace` inside → infinite loop
**What goes wrong:** Effect reads `searchParams.get('pipeline')`, decides to update URL, calls `router.replace`. URL update changes `searchParams` reference. Effect runs again. Infinite loop. (React Strict Mode in dev makes this even more aggressive — double-invocation.)
**Why it happens:** `useSearchParams()` returns a new object reference whenever the URL changes. Effects depending on it fire on every URL change. Calling `router.replace` from inside changes the URL.
**How to avoid:**
1. **For the hydration effect:** Empty dep array `[]`. The effect should run exactly once after mount. Document with `// eslint-disable-next-line react-hooks/exhaustive-deps` and a comment explaining intent (the existing `orders-view.tsx:434-452` does this implicitly).
2. **For the click handler:** It's a `useCallback`, not an effect. No dependency loop possible. Still, prefer `window.history.replaceState` over `router.replace` — `replaceState` doesn't change the `searchParams` REFERENCE in a way that would trigger downstream effects (it does push the new URL into the Router's tracking, but at the next render `useSearchParams` returns equivalent — see Pitfall 5).
3. **For existing effects** (lines 257-263, 266-280): they already use `[searchParams, router]` deps and self-clear with `router.replace('/crm/pedidos', { scroll: false })`. They work because they only run when `?new=true` or `?order=<id>` are present, and the `replace` clears them. Don't follow this pattern for `?pipeline=` — that param is meant to STAY in the URL.
[CITED: github.com/vercel/next.js/discussions/46616 — "Router.replace in useEffect creates infinite loop"]

### Pitfall 3: Hydration mismatch from reading `localStorage` during render
**What goes wrong:** Initial server HTML uses default pipeline. Client tries to render with localStorage value during hydration. React detects mismatch and either errors (dev) or silently breaks tree (prod).
**Why it happens:** Server has no `localStorage`. Any code path that reads it during render must run only on the client AFTER hydration completes.
**How to avoid:** ALWAYS read localStorage inside `useEffect` (not in `useState` initializer, not in render body). The render body should produce IDENTICAL output server-side and client-side initially. Then the post-mount effect can call `setActivePipelineId(storedId)` to swap state — React handles this as a regular state update, not a hydration mismatch.
**Warning signs:** Console error "Hydration failed because the server rendered HTML didn't match the client" or visual flash of the wrong pipeline content.
[CITED: fluentreact.com/blog/nextjs-localstorage-hydration-errors-fix — "Choose a stable server default, render that first, then layer the browser preference after hydration in the smallest client island that needs it."]

### Pitfall 4: Missing `<Suspense>` boundary breaks production build (Next 16)
**What goes wrong:** `useSearchParams()` in a client component without an enclosing `<Suspense>` boundary causes Next 16 production build to fail with "Missing Suspense boundary with useSearchParams" — OR opts the entire route into client-side rendering, hurting performance.
**Why it happens:** Next 16 enforces this for static prerendering. Currently `OrdersView` calls `useSearchParams()` (line 141) and the parent `pedidos/page.tsx` does NOT wrap it. Production builds work today only because `pedidos/page.tsx` is dynamic (it calls `cookies()` and Supabase auth — opting out of prerender). Adding `?pipeline=` doesn't change that, but defensively adding the Suspense boundary aligns with official guidance and prevents future regression if any optimization (e.g., partial prerendering) is enabled.
**How to avoid:** Wrap `<OrdersView/>` in `<Suspense fallback={null}>` at `pedidos/page.tsx` (the change is in Pattern 1 example above).
**Warning signs:** Production build error message; `npm run build` failure; `dev` works fine but `start` after `build` shows error.
[CITED: nextjs.org/docs/app/api-reference/functions/use-search-params — "During production builds, a static page that calls `useSearchParams` from a Client Component must be wrapped in a `Suspense` boundary, otherwise the build fails."]

### Pitfall 5: `useSearchParams()` reference identity vs. `window.history.replaceState`
**What goes wrong:** Engineer assumes calling `replaceState` will cause `useSearchParams()` to return the new value immediately. It does, but only after the next render — and only because Next.js patches `replaceState`/`pushState` to integrate with the Router. If any code calls `replaceState` from a non-Next-aware context (e.g., a plain DOM library), `useSearchParams` may not update.
**Why it happens:** `useSearchParams` is backed by Next.js Router state, NOT directly by `window.location.search`. The Next.js patch is the bridge.
**How to avoid:** Always call `replaceState`/`pushState` directly via `window.history.*` — Next.js patches the global `History.prototype` so calls anywhere are observed. Don't worry about reference identity; the canonical idiom shown in Pattern 2 just works. Verified by the canonical `SortProducts` example in Next 16.2.4 docs.
[CITED: nextjs.org/docs/app/getting-started/linking-and-navigating#native-history-api]

### Pitfall 6: localStorage scoping leaks between workspaces
**What goes wrong:** User on workspace-A picks pipeline X. Switches to workspace-B (different cookie `morfx_workspace`, fresh `OrdersView`). localStorage key without workspace suffix returns X — but X doesn't exist in workspace-B's pipelines. Validation guard (D-03) saves us, but the user briefly sees default → flicker.
**Why it happens:** localStorage is per-origin, not per-workspace. The cookie `morfx_workspace` defines the active workspace context.
**How to avoid:** Suffix the key with `:${workspaceId}` per D-05. The `activeWorkspaceId` prop must be passed from the server (it's already read from the cookie at `pedidos/page.tsx:14`). Don't fall back to `null` for the suffix — if `workspaceId` is missing, skip both read and write (a missing workspace cookie is an auth-edge anyway, not a normal flow).
**Warning signs:** Engineer debug-tests on one workspace, ships, second workspace shows weird pipeline on first visit.

## Code Examples

### Server `pedidos/page.tsx` — full new shape

```typescript
// Source pattern: src/app/(dashboard)/crm/contactos/page.tsx:61-69 +
//                  src/app/(dashboard)/agentes/routing/audit/page.tsx:23-42
// Verified canonical Next 16 idiom: searchParams as Promise<…>, awaited inline.

import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { getOrders, getPipelines, getOrCreateDefaultPipeline } from '@/app/actions/orders'
import { getActiveProducts } from '@/app/actions/products'
import { getTagsForScope } from '@/app/actions/tags'
import { OrdersView } from './components/orders-view'

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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value

  let isAdminOrOwner = false
  if (user && workspaceId) {
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single()
    isAdminOrOwner = membership?.role === 'admin' || membership?.role === 'owner'
  }

  // Read URL state (D-01/D-02). Promise-shaped per Next 15+/16 App Router.
  const params = await searchParams
  const requestedPipelineId = params.pipeline

  // Ensure default pipeline exists (existing behavior).
  const defaultPipeline = await getOrCreateDefaultPipeline()

  // Fetch all data in parallel.
  const [orders, pipelines, products, tags] = await Promise.all([
    getOrders(),
    getPipelines(),
    getActiveProducts(),
    getTagsForScope('orders'),
  ])

  // Validate URL param against workspace pipelines (D-03).
  // Silent fallback to default if invalid (D-04).
  const validRequested = requestedPipelineId
    ? pipelines.find(p => p.id === requestedPipelineId)
    : undefined
  const resolvedPipelineId = validRequested?.id ?? defaultPipeline?.id

  return (
    <div className="flex flex-col h-full">
      {/* Suspense boundary required by Next 16 for any client component that
          calls useSearchParams(). Currently OrdersView does (line 141), but
          no boundary exists today — works only because this route is
          dynamically rendered. Adding the boundary defensively (Pitfall 4). */}
      <Suspense fallback={null}>
        <OrdersView
          orders={orders}
          pipelines={pipelines}
          products={products}
          tags={tags}
          defaultPipelineId={resolvedPipelineId}
          defaultStageId={defaultPipeline?.stages[0]?.id}
          user={user}
          currentUserId={user?.id}
          isAdminOrOwner={isAdminOrOwner}
          activeWorkspaceId={workspaceId ?? null}
        />
      </Suspense>
    </div>
  )
}
```

### Client `orders-view.tsx` — diff at the relevant lines

**Add prop to interface (line 114-124):**
```typescript
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
  activeWorkspaceId: string | null   // ← NEW
}

export function OrdersView({
  // …existing destructure…
  activeWorkspaceId,                  // ← NEW
}: OrdersViewProps) {
```

**New constant near other localStorage keys (lines 64-66):**
```typescript
const VIEW_MODE_STORAGE_KEY = 'morfx_orders_view_mode'
const SORT_FIELD_STORAGE_KEY = 'morfx_kanban_sort_field'
const SORT_DIR_STORAGE_KEY = 'morfx_kanban_sort_dir'
const ACTIVE_PIPELINE_STORAGE_KEY_PREFIX = 'morfx_active_pipeline:'   // ← NEW (D-05)
```

**Replace bare `setActivePipelineId` with `handlePipelineChange` (insert after the `setActivePipelineId` declaration, ~line 156):**
```typescript
// New handler that mirrors changes to localStorage + URL (D-01).
// Use window.history.replaceState (NOT router.replace) to avoid re-fetching
// the RSC payload on every tab click (Pitfall 1).
const handlePipelineChange = React.useCallback((newId: string) => {
  setActivePipelineId(newId)

  // Persist to localStorage scoped by workspace (D-05).
  if (activeWorkspaceId) {
    try {
      localStorage.setItem(
        `${ACTIVE_PIPELINE_STORAGE_KEY_PREFIX}${activeWorkspaceId}`,
        newId,
      )
    } catch {
      // localStorage disabled / quota — silent (matches existing idiom L460).
    }
  }

  // Reflect in URL so F5 keeps the choice (D-01). replaceState integrates
  // with Next 16's useSearchParams without triggering RSC re-fetch.
  try {
    const params = new URLSearchParams(searchParams.toString())
    params.set('pipeline', newId)
    window.history.replaceState(null, '', `/crm/pedidos?${params.toString()}`)
  } catch {
    // Should never throw on the client; defensive.
  }
}, [activeWorkspaceId, searchParams])
```

**Add hydration effect (place near existing localStorage effect at line 434, after it for ordering clarity):**
```typescript
// Hydrate active pipeline from localStorage on mount IF the URL doesn't
// already specify ?pipeline= (D-02). One-shot post-mount; deps intentionally
// empty (Pitfall 2). The server already used the URL value when present,
// so this only fires for "user landed via sidebar" / fresh visit.
React.useEffect(() => {
  if (searchParams.get('pipeline')) return
  if (!activeWorkspaceId) return

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
    // Silent (matches existing idiom).
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
```

**Update existing `?order=<id>` effect at line 273** — change `setActivePipelineId(order.pipeline_id)` to `handlePipelineChange(order.pipeline_id)` so the URL-driven order open also persists the pipeline choice:
```typescript
React.useEffect(() => {
  const orderId = searchParams.get('order')
  if (orderId) {
    const order = orders.find(o => o.id === orderId)
    if (order) {
      if (order.pipeline_id !== activePipelineId) {
        handlePipelineChange(order.pipeline_id)   // ← was setActivePipelineId
      }
      setViewingOrder(order)
      router.replace('/crm/pedidos', { scroll: false })
    }
  }
}, [searchParams, router, orders, activePipelineId, handlePipelineChange])
```

**Update `<PipelineTabs/>` JSX at line 947-952:**
```typescript
<PipelineTabs
  pipelines={pipelines}
  activePipelineId={activePipelineId}
  onPipelineChange={handlePipelineChange}    // ← was setActivePipelineId
  onOpenPipelines={setOpenPipelineIds}
/>
```

### `crm/page.tsx` — D-07 single-line change

```typescript
// BEFORE (line 22-25):
//   if (v2) {
//     redirect('/crm/contactos')
//   }
//   redirect('/crm/pedidos')

// AFTER:
import { redirect } from 'next/navigation'
import { getIsDashboardV2Enabled } from '@/lib/auth/dashboard-v2'
import { getActiveWorkspaceId } from '@/app/actions/workspace'

/**
 * CRM hub root redirect.
 *
 * - v2=false: preserve current behavior (redirect to `/crm/pedidos`).
 * - v2=true:  redirect to `/crm/pedidos` — kanban is the primary CRM
 *   surface in the editorial v2 design (Standalone
 *   ui-pipeline-persistence-and-crm-routing D-07). Contactos remains
 *   accessible via the <CrmTabs/> strip rendered by crm/layout.tsx.
 *
 * Regla 6 byte-identical: the v2=false branch is unchanged.
 */
export default async function CRMPage() {
  const activeWorkspaceId = await getActiveWorkspaceId()
  const v2 = activeWorkspaceId
    ? await getIsDashboardV2Enabled(activeWorkspaceId)
    : false

  if (v2) {
    redirect('/crm/pedidos')      // ← CHANGED from '/crm/contactos'
  }
  redirect('/crm/pedidos')
}
```

### `sidebar.tsx` — D-08 delete one line

```typescript
// BEFORE (lines 140-151):
const navCategoriesV2: SidebarCategoryV2[] = [
  {
    label: 'Operación',
    items: [
      { href: '/crm', label: 'CRM', icon: Building2 },
      { href: '/whatsapp', label: 'WhatsApp', icon: MessageSquare },
      { href: '/crm/pedidos', label: 'Pedidos', icon: Package },     // ← DELETE this line
      { href: '/tareas', label: 'Tareas', icon: ListTodo, badgeType: 'tasks' },
      { href: '/confirmaciones', label: 'Confirmaciones', icon: CalendarCheck },
      { href: '/sms', label: 'SMS', icon: MessageSquareText },
    ],
  },
  // …rest unchanged…
]

// AFTER:
const navCategoriesV2: SidebarCategoryV2[] = [
  {
    label: 'Operación',
    items: [
      { href: '/crm', label: 'CRM', icon: Building2 },
      { href: '/whatsapp', label: 'WhatsApp', icon: MessageSquare },
      { href: '/tareas', label: 'Tareas', icon: ListTodo, badgeType: 'tasks' },
      { href: '/confirmaciones', label: 'Confirmaciones', icon: CalendarCheck },
      { href: '/sms', label: 'SMS', icon: MessageSquareText },
    ],
  },
  // …rest unchanged…
]
```

The `Package` icon import (line 6) becomes unused after this delete — verify with `grep -n "Package" src/components/layout/sidebar.tsx` and remove from the import if no other reference. If retained for future use, fine — TS will warn but build passes; preference is to remove unused imports per project's strict TS norms.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `searchParams` as plain object on RSC props | `searchParams: Promise<{...}>` (must `await`) | Next 15 (released Q4 2024) | This codebase already migrated — see `crm/contactos/page.tsx`, `agentes/routing/audit/page.tsx`. Apply same idiom to `pedidos/page.tsx`. |
| `router.replace(url, { scroll: false })` for shallow updates | `window.history.replaceState(null, '', url)` | Next 13.5+ (stable in 14, 15, 16) | Avoids RSC re-fetch entirely. Official Next.js docs (16.2.4) explicitly endorse for shallow URL state. |
| Custom `useUrlState` hooks (e.g., nuqs, query-string libs) | `useSearchParams` + `URLSearchParams` + `replaceState` | Native Next 13+ | nuqs is fine for complex param management but overkill here (1 param, 1 component). Stay with native. |
| `'use client'` reading localStorage in initial render | Mount-time `useEffect` with try/catch | React 18 / Next 13 (consistent with concurrent rendering) | The codebase already uses this idiom (`pipeline-tabs.tsx`, `orders-view.tsx:434-476`). Replicate. |

**Deprecated/outdated:**
- `next/router` (Pages Router) — not relevant; this codebase is App Router.
- Synchronous `searchParams` access in RSC — broken since Next 15. Don't try to be clever.
- `force-dynamic` export to opt out of static rendering — Next 16 prefers `connection()`. Not relevant here (the route is already dynamic via `cookies()`).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| (none) | All claims in this research were verified against the codebase or Next.js 16.2.4 docs (retrieved 2026-04-27). | — | — |

## Open Questions

1. **Should `?pipeline=` survive across navigation back from order detail?**
   - What we know: User opens `?order=<id>` → existing effect (line 277) calls `router.replace('/crm/pedidos', { scroll: false })` which CLEARS all query params, including `pipeline`. After our change, the URL becomes `/crm/pedidos` without `pipeline` — the next render's `useSearchParams.get('pipeline')` returns `null`. Local React state `activePipelineId` is unaffected (still set by the order-effect via `handlePipelineChange`), so the kanban shows the correct pipeline. localStorage was just written, so a subsequent F5 still works.
   - What's unclear: Slight inconsistency — for ~ms the URL doesn't reflect state. Probably invisible to users.
   - Recommendation: **Accept as-is.** The existing `router.replace('/crm/pedidos', …)` clears `?order=<id>` cleanly; our `handlePipelineChange` fires before, so `?pipeline=` is set briefly then cleared. If we wanted strict parity, we could change line 277 to preserve `pipeline`:
     ```typescript
     const cleared = new URLSearchParams(searchParams.toString())
     cleared.delete('order')
     const url = cleared.toString() ? `/crm/pedidos?${cleared.toString()}` : '/crm/pedidos'
     router.replace(url, { scroll: false })
     ```
     But this expands scope. Defer to manual QA — if the test "open from WhatsApp shortcut → close sheet → F5" loses pipeline preference, then add this refinement.

2. **Is the `?new=true` effect (line 257-263) similarly affected?**
   - What we know: That effect also calls `router.replace('/crm/pedidos', { scroll: false })` to clear `?new=true`. Same scope-expansion question.
   - Recommendation: Same as #1 — defer to manual QA. localStorage path means real preference is preserved across the click.

3. **Should we remove the `Package` icon import from sidebar.tsx?**
   - What we know: After D-08, `Package` is unused in `navCategoriesV2`. Other items use other icons.
   - Recommendation: Remove the import in the same commit (one-line cleanup, prevents lint warning).

## Environment Availability

> Skipping — no external dependencies. All changes are TypeScript edits to existing files. `npm run build` and `npm run dev -p 3020` (already in `package.json`) are sufficient.

## Validation Architecture

> `workflow.nyquist_validation` setting confirmed absent in `.planning/config.json` for this standalone path; treated as enabled per researcher protocol. However, **D-11 explicitly waives automated tests** for this work in favor of 5 manual QA cases. Recording sampling structure here for the planner's reference.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.2.4 (per `package.json`); test command `npm run test` |
| Config file | (not used for this standalone — D-11 waives) |
| Quick run command | `npm run lint && npm run build` (TS + ESLint gate) |
| Full suite command | `npm run test` (existing suite — should pass unchanged) |
| Manual QA | 5 cases listed in CONTEXT D-11 |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Verification Command | File Exists? |
|--------|----------|-----------|----------------------|-------------|
| PERSIST-01 | F5 on `/crm/pedidos?pipeline=X` keeps X | manual | Browser: navigate → switch pipeline → F5 | N/A |
| PERSIST-02 | URL share works | manual | Open `/crm/pedidos?pipeline=<valid-uuid>` directly | N/A |
| PERSIST-03 | Last-visit fallback | manual | Switch pipeline → close tab → fresh `/crm/pedidos` (no query) | N/A |
| PERSIST-04 | No re-fetch on tab click | manual | DevTools Network → click pipeline tabs → no `_rsc` request to `/crm/pedidos?_rsc=…` | N/A |
| ROUTING-01 | Sidebar CRM → /pedidos | manual | Click "CRM" in v2 sidebar → URL shows `/crm/pedidos` | N/A |
| ROUTING-02 | No duplicate Pedidos | manual | Visual inspect sidebar v2 | N/A |
| ROUTING-03 | Legacy byte-identical | automated | `git diff --stat src/components/layout/sidebar.tsx` should show only the `navCategoriesV2` line removed; `git diff src/app/(dashboard)/crm/page.tsx` shows only line 23 changed | (TS build) |

### Sampling Rate
- **Per task commit:** `npm run lint` (catches TS errors / unused imports).
- **Per merge:** `npm run build` (validates Suspense boundary requirement under prod build constraints).
- **Phase gate:** Manual QA of 5 cases on Vercel preview deploy with Somnio workspace + `ui_dashboard_v2.enabled=true`.

### Wave 0 Gaps
- None — D-11 explicitly waives automated test creation. Existing vitest suite must remain green.

## Project Constraints (from CLAUDE.md)

The planner MUST verify task plans honor these directives:

- **Regla 0 — GSD complete:** This research is the GSD step before plan-phase. No shortcuts.
- **Regla 1 — Push to Vercel:** After implementation tasks, plan must include `git push origin main` step before asking user to test (Vercel deploy preview triggers automatically on `main`).
- **Regla 3 — Domain Layer:** N/A — no DB mutations. Read-only `getPipelines()` already lives in domain (`@/app/actions/orders`); we just consume its result.
- **Regla 4 — Documentación:** This standalone is UX polish, NOT a module status change. The change does NOT require updating `docs/analysis/04-estado-actual-plataforma.md` (no module gains/loses functionality, no new tech debt). The change MAY warrant a one-line note in LEARNINGS.md of the standalone (URL-state pattern using `replaceState` for v2 module). Planner: include LEARNINGS update task at end.
- **Regla 5 — Migration before deploy:** N/A — D-12 confirmed.
- **Regla 6 — Proteger comportamiento legacy:** Apply byte-identical principle even though no agent exists in scope. Specifically:
  - `crm/page.tsx`: ONLY change line 23 (the redirect target inside `if (v2)`). The legacy fall-through `redirect('/crm/pedidos')` line 25 stays.
  - `sidebar.tsx`: ONLY remove from `navCategoriesV2[0].items`. The `navItems[]` array (lines 44-122) and the legacy render block (lines 399+) MUST be untouched.
  - Verification: `git diff src/components/layout/sidebar.tsx` should show ONE deleted line (the `Package` Pedidos item) plus optionally the icon import cleanup. `git diff src/app/(dashboard)/crm/page.tsx` should show ONE changed line.
- **Code changes rules** (`.claude/rules/code-changes.md`): All edits gated through `/gsd:execute-phase` after PLAN approval; commits atomic, in Spanish, co-authored Claude.
- **GSD workflow** (`.claude/rules/gsd-workflow.md`): Already followed (discuss → research → plan → execute).

## Sources

### Primary (HIGH confidence)
- **Codebase grep + Read** (verified 2026-04-27, all line numbers confirmed):
  - `src/app/(dashboard)/crm/pedidos/page.tsx` — 53 lines, current shape
  - `src/app/(dashboard)/crm/pedidos/components/orders-view.tsx` — 1000+ lines, lines 4, 64-66, 140-156, 257-280, 434-476, 947-952 verified
  - `src/app/(dashboard)/crm/pedidos/components/pipeline-tabs.tsx` — 196 lines, line 15 (`LOCAL_STORAGE_KEY = 'morfx_open_pipelines'`) verified
  - `src/app/(dashboard)/crm/page.tsx` — 26 lines, line 23 verified
  - `src/app/(dashboard)/crm/layout.tsx` — 53 lines, RSC + CrmTabs flow verified
  - `src/app/(dashboard)/crm/components/crm-tabs.tsx` — 91 lines, 4-tab structure verified
  - `src/components/layout/sidebar.tsx` — 593 lines, line 146 + `navItems`/`navCategoriesV2` separation verified
  - `src/app/(dashboard)/crm/contactos/page.tsx:61-69` — canonical async-searchParams pattern (in this exact codebase)
  - `src/app/(dashboard)/crm/contactos/components/contacts-table.tsx:53-85` — canonical `useSearchParams + buildUrl + router.push` pattern (in this exact codebase)
  - `src/lib/auth/dashboard-v2.ts` — flag resolver pattern, fail-closed
  - `package.json:64,69` — Next `^16.1.6`, React `19.2.3`
- **Next.js 16.2.4 official docs** (retrieved via WebFetch 2026-04-27):
  - `nextjs.org/docs/app/getting-started/linking-and-navigating#native-history-api` — `window.history.pushState`/`replaceState` integration with Next.js Router
  - `nextjs.org/docs/app/api-reference/functions/use-search-params` — Suspense boundary requirement, prerendering behavior
  - `nextjs.org/docs/app/api-reference/functions/use-router` — `router.replace`/`router.push` behavior, `scroll` option

### Secondary (MEDIUM confidence)
- WebSearch 2026-04-27, "Next.js 16 useSearchParams Suspense boundary client component pattern 2026" — confirmed Suspense requirement holds in Next 16
- WebSearch 2026-04-27, "Next.js 16 router.replace useEffect searchParams infinite loop pattern" — confirmed loop pitfall is well-documented
- WebSearch 2026-04-27, "Next.js App Router router.replace client URL state localStorage hydration pattern 2026" — confirmed hydration mismatch + localStorage best practice
- `fluentreact.com/blog/nextjs-localstorage-hydration-errors-fix` — articulation of "stable server default + post-mount client island" pattern

### Tertiary (LOW confidence)
- None — all critical claims verified by either the codebase OR official Next.js docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All required APIs already imported in target files (`next/navigation`, React 19 hooks). Zero new packages.
- Architecture: HIGH — Canonical pattern exists in same codebase (`contactos/page.tsx` + `contacts-table.tsx`). Replicate for consistency.
- Pitfalls: HIGH — All 6 pitfalls verified against either Next.js 16.2.4 official docs or known GitHub discussions / community articles.
- Code examples: HIGH — Diffs reference actual line numbers verified by Read tool.

**Research date:** 2026-04-27
**Valid until:** 2026-05-27 (30 days — Next.js 16 is stable, this research will not go stale absent a major Next.js release).
