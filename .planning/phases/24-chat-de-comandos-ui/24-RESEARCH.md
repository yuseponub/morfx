# Phase 24: Chat de Comandos UI - Research

**Researched:** 2026-02-22
**Domain:** Next.js UI + Supabase Realtime + Command Dispatch
**Confidence:** HIGH

## Summary

This phase builds a new `/comandos` module in MorfX that provides an operations-oriented command interface for dispatching logistics commands (primarily `subir ordenes coord`) and monitoring robot job progress in real-time. The UI follows the existing Sandbox module's split-panel pattern (Allotment) and MorfX's design system, NOT a dark terminal style.

The primary technical domains are: (1) a new page with split-panel layout matching the Sandbox pattern, (2) a command parser that routes text/button input to server actions, (3) Supabase Realtime subscriptions on `robot_job_items` and `robot_jobs` for live progress updates, and (4) a server action layer that orchestrates order fetching, city validation, PedidoInput building, and Inngest event dispatch.

**Primary recommendation:** Reuse the Sandbox's Allotment split-panel pattern, create a dedicated `useRobotJobProgress` hook for Realtime subscriptions (following `use-messages.ts` pattern), and build server actions that compose existing domain functions (`getCarrierCredentials`, `validateCities`, `createRobotJob`) into a single command flow that emits `robot/job.submitted` to Inngest.

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js 15 | App Router | Page routing, server actions | Project stack |
| React 19 | - | UI components | Project stack |
| Supabase JS | ^2.93.1 | Realtime subscriptions, DB client | Project stack, Realtime already proven in `use-conversations.ts` and `use-messages.ts` |
| @supabase/ssr | ^0.8.0 | Browser client for Realtime | Project stack |
| Allotment | ^1.20.5 | Split panel layout | Already used by Sandbox -- dynamic import with `ssr: false` |
| Tailwind CSS | - | Styling | Project stack |
| lucide-react | ^0.563.0 | Icons | Project stack |
| Inngest | - | Async job dispatch | Project stack, robot-orchestrator already exists |

### Supporting (Already in Project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn/ui | - | UI primitives (ScrollArea, Badge, Card, Table, Tabs, Progress, Button, Textarea) | All UI components |
| Sonner | - | Toast notifications (optional) | Error states |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Allotment split panel | CSS Grid with resize handle | Allotment already in project, proven pattern from Sandbox |
| Supabase Realtime | Polling | Realtime is already enabled on `robot_job_items` in migration, polling would be wasteful |
| Server Actions | API Routes | Server Actions are the project's standard for authenticated mutations |

**Installation:** No new packages needed. Everything is already in the project.

## Architecture Patterns

### Recommended Project Structure
```
src/app/(dashboard)/comandos/
  page.tsx                        # Server component - metadata + layout wrapper
  components/
    comandos-layout.tsx           # Client root - state management + Allotment split panel
    command-panel.tsx             # Left panel - chat-like output + input
    command-input.tsx             # Input bar with command chips + text input
    command-output.tsx            # Scrollable output messages (system, results, progress)
    history-panel.tsx             # Right panel - job history list
    job-detail-row.tsx            # Expandable row in history table
    progress-indicator.tsx        # Live counter "3/20 procesadas..."

src/hooks/
  use-robot-job-progress.ts      # Supabase Realtime hook for robot_job_items + robot_jobs

src/app/actions/
  comandos.ts                    # Server actions: executeSubirOrdenesCoord, getJobHistory, getActiveJob

src/lib/domain/
  robot-jobs.ts                  # (Existing) - may need getActiveJob, getJobHistory queries added
```

### Pattern 1: Split-Panel Layout (Matching Sandbox)
**What:** Dynamic import of Allotment with SSR disabled, left panel for command interaction, right panel for history/logs
**When to use:** Always -- matches the CONTEXT.md decision for "panel split: chat/comandos a la izquierda, historial + logs a la derecha"
**Example:**
```typescript
// Source: Existing sandbox-split-panel.tsx pattern
const CommandosSplitPanel = dynamic(
  () => import('./comandos-split-panel').then(mod => mod.CommandosSplitPanel),
  { ssr: false, loading: () => <div className="flex-1 flex items-center justify-center text-muted-foreground">Cargando...</div> }
)
```

### Pattern 2: Supabase Realtime Hook (Matching use-messages.ts)
**What:** Client-side hook that subscribes to postgres_changes on `robot_job_items` filtered by `job_id`, plus `robot_jobs` for job-level status changes
**When to use:** When a job is active and the user needs to see per-order progress
**Example:**
```typescript
// Source: Existing use-messages.ts + use-conversations.ts patterns
function useRobotJobProgress(jobId: string | null) {
  const [items, setItems] = useState<RobotJobItem[]>([])
  const [job, setJob] = useState<RobotJob | null>(null)

  useEffect(() => {
    if (!jobId) return
    const supabase = createClient()

    const channel = supabase
      .channel(`robot-job:${jobId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'robot_job_items',
        filter: `job_id=eq.${jobId}`,
      }, (payload) => {
        // Surgical update: update specific item in array
        const item = payload.new as RobotJobItem
        setItems(prev => {
          const idx = prev.findIndex(i => i.id === item.id)
          if (idx === -1) return [...prev, item]
          return prev.map((i, j) => j === idx ? item : i)
        })
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'robot_jobs',
        filter: `id=eq.${jobId}`,
      }, (payload) => {
        setJob(payload.new as RobotJob)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [jobId])

  return { job, items, successCount: items.filter(i => i.status === 'success').length, errorCount: items.filter(i => i.status === 'error').length }
}
```

### Pattern 3: Command Parser (Simple string matching)
**What:** Parse user input against fixed command set. Not AI -- simple prefix matching.
**When to use:** When user types in the command input
**Example:**
```typescript
type ParsedCommand =
  | { type: 'subir_ordenes_coord' }
  | { type: 'estado' }
  | { type: 'ayuda' }
  | { type: 'unknown'; input: string }

function parseCommand(input: string): ParsedCommand {
  const normalized = input.trim().toLowerCase()
  if (normalized === 'subir ordenes coord') return { type: 'subir_ordenes_coord' }
  if (normalized === 'estado') return { type: 'estado' }
  if (normalized === 'ayuda') return { type: 'ayuda' }
  return { type: 'unknown', input }
}
```

### Pattern 4: Server Action Orchestrating Domain Functions
**What:** A server action that composes multiple domain functions into a single command flow
**When to use:** For `subir ordenes coord` -- fetches orders, validates cities, creates robot job, dispatches to Inngest
**Example:**
```typescript
// src/app/actions/comandos.ts
'use server'
export async function executeSubirOrdenesCoord(): Promise<CommandResult> {
  const auth = await getAuthContext()
  if ('error' in auth) return { success: false, error: auth.error }
  const ctx: DomainContext = { workspaceId: auth.workspaceId, source: 'server-action' }

  // 1. Get carrier credentials
  const creds = await getCarrierCredentials(ctx)
  if (!creds.success) return { success: false, error: creds.error! }

  // 2. Get preconfigured stage orders
  // ... fetch orders from preconfigured stage

  // 3. Validate cities in batch
  const validation = await validateCities(ctx, { cities: ... })

  // 4. Create robot job with valid orders only
  const job = await createRobotJob(ctx, { orderIds: validOrderIds })

  // 5. Dispatch to Inngest
  await inngest.send({ name: 'robot/job.submitted', data: { ... } })

  return { success: true, data: { jobId, totalOrders, validCount, invalidCount, invalidOrders } }
}
```

### Pattern 5: Message-Based Output (Not Chat)
**What:** The command panel shows system messages chronologically -- command echoes, status updates, results. Not a bi-directional chat.
**When to use:** All command panel output
**Example:**
```typescript
type CommandMessage =
  | { type: 'command'; text: string; timestamp: string }        // User command echo
  | { type: 'system'; text: string; timestamp: string }         // System message (info)
  | { type: 'progress'; current: number; total: number; timestamp: string }  // Live counter
  | { type: 'result'; success: number; error: number; details: OrderResult[]; timestamp: string }  // Batch result
  | { type: 'error'; text: string; timestamp: string }          // Error message
  | { type: 'help'; commands: CommandDef[]; timestamp: string } // Help listing
```

### Anti-Patterns to Avoid
- **AI-powered command parsing:** Commands are FIXED, not AI-interpreted. Simple string matching. Don't use Claude or any LLM for command parsing.
- **Dark terminal styling:** CONTEXT.md explicitly says "Not dark terminal -- follows MorfX design system". Match Sandbox look & feel.
- **Polling for progress:** Supabase Realtime is already enabled on `robot_job_items` -- use it. Polling would be wasteful.
- **Direct DB writes from components:** All mutations go through server actions -> domain layer. Never call `createAdminClient()` from components.
- **Multiple Inngest events for a single command:** The `subir ordenes coord` flow should prepare ALL data in the server action, then emit a SINGLE `robot/job.submitted` event. The orchestrator handles the rest.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Split panel resize | Custom CSS/JS resize | Allotment (already in project) | Browser compat, accessibility, tested |
| Real-time subscriptions | Custom WebSocket or polling | Supabase Realtime postgres_changes | Already enabled on `robot_job_items`, proven pattern |
| City validation | Custom matching logic | `validateCities()` from `carrier-coverage.ts` | Already handles normalization, department mapping, batch lookup |
| Job creation + counter tracking | Custom job tracking | `createRobotJob()` + `updateJobItemResult()` from `robot-jobs.ts` | Already handles idempotency, counter aggregation, auto-completion |
| Carrier credentials | Custom config fetching | `getCarrierCredentials()` from `carrier-configs.ts` | Already validates existence, enabled state, completeness |
| Robot dispatch | Custom HTTP call | Inngest `robot/job.submitted` event | Orchestrator already handles dispatch, timeout, failure marking |
| Scroll to bottom | Custom scroll logic | `scrollIntoView({ behavior: 'smooth' })` with bottom ref | Already proven in `sandbox-chat.tsx` |

**Key insight:** Phase 24 is primarily a UI layer that composes existing domain functions and infrastructure (Phases 21-23). Almost no new business logic is needed -- only the UI components, command parser, server actions, Realtime hook, and the "preconfigured stage" setting.

## Common Pitfalls

### Pitfall 1: RLS on robot_job_items Blocking Realtime
**What goes wrong:** Supabase Realtime respects RLS. The `robot_job_items` RLS policy requires a JOIN through `robot_jobs` to check workspace membership. Complex RLS on Realtime tables can cause events to not fire.
**Why it happens:** Realtime evaluates the RLS policy for each subscriber on each change. Cross-table JOIN in RLS policy can be expensive and sometimes fail silently.
**How to avoid:** The current RLS policy uses `EXISTS (SELECT 1 FROM robot_jobs rj WHERE rj.id = robot_job_items.job_id AND is_workspace_member(rj.workspace_id))` which should work but needs testing. If Realtime events don't fire, consider adding a direct `workspace_id` column to `robot_job_items` for simpler RLS.
**Warning signs:** Realtime subscription connects successfully but no events arrive when items are updated via the admin client.

### Pitfall 2: robot_jobs NOT in Supabase Realtime Publication
**What goes wrong:** The migration only adds `robot_job_items` to `supabase_realtime` publication. Job-level status changes (pending -> processing -> completed) won't be received via Realtime.
**Why it happens:** Phase 21 migration only anticipated per-item progress, not job-level status display.
**How to avoid:** Add `robot_jobs` to the Realtime publication via a new migration. This is REQUIRED for showing job-level status changes in the UI.
**Warning signs:** Items update in real-time but the job status badge stays on "processing" even after completion.

### Pitfall 3: Stale Closure in Realtime Callbacks
**What goes wrong:** Realtime event handlers capture stale state values because React state is closed over at subscription time.
**Why it happens:** `useEffect` creates the subscription once, but the callback references state from that render.
**How to avoid:** Use `useRef` to keep a mutable reference to current state, read from ref inside callbacks. This pattern is used extensively in `use-conversations.ts` and `sandbox-layout.tsx`.
**Warning signs:** Progress counter shows wrong numbers, items array doesn't accumulate correctly.

### Pitfall 4: Missing Preconfigured Stage Setting
**What goes wrong:** `subir ordenes coord` needs to know which pipeline stage to pull orders from. There's no existing setting for this.
**Why it happens:** Phases 21-23 focused on infrastructure, not UI configuration.
**How to avoid:** The Phase 24 implementation MUST include a way to configure which pipeline + stage the command pulls orders from. Options: (a) add `dispatch_stage_id` to `carrier_configs` table, or (b) create a new `workspace_settings` key-value pair. Option (a) is simpler since it's carrier-specific.
**Warning signs:** Command runs but finds zero orders because no stage is configured.

### Pitfall 5: Race Condition on Reconnect
**What goes wrong:** If user leaves and returns during an active job, the progress might show incomplete data.
**Why it happens:** Realtime only sends events that happen AFTER subscription. Items that were updated while the user was away are missed.
**How to avoid:** On mount (or when detecting an active job), ALWAYS fetch the full current state via `getJobWithItems()` server action first, THEN subscribe to Realtime for incremental updates. This is the same pattern as `use-conversations.ts` (initial fetch + realtime overlay).
**Warning signs:** User returns to see partial progress (e.g., 5/20 instead of 15/20 that actually completed).

### Pitfall 6: Building PedidoInput from Order Data
**What goes wrong:** Orders in the CRM have data split across multiple fields and the contact record. Building `PedidoInput` requires assembling data from order + contact + products + contact fields + city validation result.
**Why it happens:** PedidoInput needs: identificacion (from contact custom field or "N/A"), nombres/apellidos (from contact name, split), direccion (order.shipping_address), ciudad (from validateCities result), departamento (from coverage lookup), celular (contact.phone), email (contact.email), referencia (order.name), unidades (sum of product quantities), totalConIva (order.total_value), valorDeclarado (order.total_value), esRecaudoContraentrega (needs config or default), peso/alto/largo/ancho (need defaults).
**How to avoid:** Build a `buildPedidoInputFromOrder()` helper function that takes OrderWithDetails + CityValidationItem and returns PedidoInput. Use sensible defaults for missing fields (weight=1kg, dimensions=10x10x10, no COD by default).
**Warning signs:** Robot service rejects orders due to missing or malformed PedidoInput fields.

### Pitfall 7: Allotment SSR Crash
**What goes wrong:** Allotment uses browser-only APIs. Importing it directly in a server component or without `ssr: false` causes build/hydration errors.
**Why it happens:** Allotment measures DOM elements, which don't exist in SSR.
**How to avoid:** ALWAYS use `dynamic(() => import(...), { ssr: false })` for the split panel component, exactly as `sandbox-split-panel.tsx` does.
**Warning signs:** Build errors mentioning "window is not defined" or hydration mismatches.

## Code Examples

### Sidebar Navigation Entry
```typescript
// Source: Existing sidebar.tsx pattern
// Add between Tareas and Automatizaciones in navItems array
{
  href: '/comandos',
  label: 'Comandos',
  icon: Terminal, // from lucide-react
}
```

### Server Action Auth Pattern
```typescript
// Source: Existing src/app/actions/orders.ts pattern
async function getAuthContext(): Promise<{ workspaceId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return { error: 'No hay workspace seleccionado' }

  return { workspaceId }
}
```

### Inngest Event Dispatch Pattern
```typescript
// Source: Existing robot-callback/route.ts pattern
// MUST await inngest.send in serverless (Vercel can terminate early)
await (inngest.send as any)({
  name: 'robot/job.submitted',
  data: {
    jobId,
    workspaceId,
    carrier: 'coordinadora',
    credentials: { username, password },
    orders: validOrders.map(o => ({
      itemId: o.itemId,
      orderId: o.orderId,
      pedidoInput: buildPedidoInput(o),
    })),
  },
})
```

### Job History Query Pattern
```typescript
// Source: New query following existing domain patterns
export async function getJobHistory(
  ctx: DomainContext,
  limit: number = 20
): Promise<DomainResult<RobotJob[]>> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('robot_jobs')
    .select('*')
    .eq('workspace_id', ctx.workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return { success: false, error: error.message }
  return { success: true, data: data as RobotJob[] }
}
```

### Active Job Detection Pattern
```typescript
// Source: New query following existing domain patterns
export async function getActiveJob(
  ctx: DomainContext
): Promise<DomainResult<GetJobWithItemsResult | null>> {
  const supabase = createAdminClient()
  const { data: activeJob, error } = await supabase
    .from('robot_jobs')
    .select('*')
    .eq('workspace_id', ctx.workspaceId)
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return { success: false, error: error.message }
  if (!activeJob) return { success: true, data: null }

  // Fetch items for active job
  return getJobWithItems(ctx, activeJob.id)
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| n8n + Slack for robot commands | MorfX integrated UI | Phase 24 | Eliminates external tool dependency |
| Batch-only result callback | Per-order callbacks via robot-callback API | Phase 23 | Enables real-time per-order progress display |
| ENV vars for robot credentials | Per-workspace `carrier_configs` table | Phase 21 | Multi-tenant support |

**Deprecated/outdated:**
- n8n workflow for robot dispatch (replaced by Inngest orchestrator)
- Slack for robot result display (replaced by Chat de Comandos UI)

## Open Questions

1. **Preconfigured Stage Storage**
   - What we know: `subir ordenes coord` takes orders from a "preconfigured stage" (CONTEXT.md). No existing setting stores this.
   - What's unclear: Whether to add `dispatch_stage_id` to `carrier_configs` table (carrier-specific) or create a separate workspace setting.
   - Recommendation: Add `dispatch_pipeline_id` and `dispatch_stage_id` columns to `carrier_configs`. This keeps it carrier-specific and avoids a new table. Requires a migration.

2. **PedidoInput Default Values**
   - What we know: PedidoInput needs weight, dimensions, COD flag, identification. Orders may not have all these fields.
   - What's unclear: What default values the business uses for missing fields (weight, dimensions, COD).
   - Recommendation: Use hardcoded sensible defaults for v3.0: peso=1, alto=10, largo=10, ancho=10, esRecaudoContraentrega=false, identificacion="N/A". These can be made configurable later.

3. **Contact Name Splitting**
   - What we know: PedidoInput needs separate `nombres` and `apellidos`. CRM stores a single `name` field on contacts.
   - What's unclear: The exact splitting logic when names have >2 parts.
   - Recommendation: Split on first space: first token = nombres, rest = apellidos. If single word, nombres = name, apellidos = "".

4. **Role Access Control**
   - What we know: CONTEXT.md says "Accesible para admin y equipo de operaciones (ambos roles)". The project has roles: owner, admin, agent.
   - What's unclear: Whether "equipo de operaciones" maps to the `agent` role.
   - Recommendation: Allow access for `owner` and `admin` roles (like `adminOnly` in sidebar). The `agent` role sees different modules. Sidebar entry should use `adminOnly: true` or similar filtering.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `src/app/(dashboard)/sandbox/` -- Full Sandbox module structure, split-panel pattern, chat component architecture
- Codebase analysis: `src/lib/domain/robot-jobs.ts` -- Domain functions for job CRUD, item updates, counter aggregation
- Codebase analysis: `src/inngest/functions/robot-orchestrator.ts` -- Inngest function structure, event dispatch, timeout handling
- Codebase analysis: `src/app/api/webhooks/robot-callback/route.ts` -- Per-order callback flow, domain updates, batch completion detection
- Codebase analysis: `src/hooks/use-conversations.ts` + `use-messages.ts` -- Supabase Realtime subscription patterns with stale closure prevention
- Codebase analysis: `src/components/layout/sidebar.tsx` -- Navigation structure, role-based filtering, icon imports
- Codebase analysis: `src/lib/domain/carrier-configs.ts` -- Credential management per workspace
- Codebase analysis: `src/lib/domain/carrier-coverage.ts` -- City validation with batch support
- Codebase analysis: `supabase/migrations/20260222000003_robot_jobs.sql` -- DB schema, RLS policies, Realtime publication
- Codebase analysis: `src/inngest/events.ts` -- All event type definitions including RobotEvents

### Secondary (MEDIUM confidence)
- Supabase Realtime docs (https://supabase.com/docs/guides/realtime/postgres-changes) -- Confirmed filter syntax, channel creation, cleanup patterns match what codebase uses

### Tertiary (LOW confidence)
- None -- all findings verified against existing codebase and official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- entire stack already in project, no new dependencies
- Architecture: HIGH -- follows proven patterns from Sandbox module and existing hooks
- Pitfalls: HIGH -- identified from real patterns in codebase (RLS + Realtime, stale closures, SSR crashes all documented in existing code)
- Command flow: HIGH -- all domain functions exist and are tested (Phases 21-23)
- Preconfigured stage: MEDIUM -- storage location is an open question but solution is straightforward

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (30 days -- stable domain, no external library changes expected)
