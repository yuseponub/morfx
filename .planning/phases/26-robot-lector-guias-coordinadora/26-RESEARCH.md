# Phase 26: Robot Lector de Guias Coordinadora - Research

**Researched:** 2026-02-21
**Domain:** Robot service integration + CRM order field update + Chat de Comandos command
**Confidence:** HIGH

## Summary

This phase adds a new command `buscar guias coord` to the Chat de Comandos that orchestrates reading guide numbers from the Coordinadora portal and writing them back to CRM orders. The entire infrastructure already exists from Phases 21-24: robot service on Railway (Playwright), Inngest orchestrator, HTTP callback API, domain layer (robot-jobs + orders), and Chat de Comandos UI with realtime progress.

The primary work divides into four areas: (1) a new DB column `carrier_guide_number` on `orders` since `tracking_number` currently stores the Coordinadora pedido number and the guide is a separate identifier; (2) a new endpoint on the robot-coordinadora service (`/api/buscar-guias`) that loads the Coordinadora pedidos page, reads the table, and builds a pedido-to-guide map; (3) a new Inngest orchestrator function and callback flow for guide reading results; (4) a new server action and command handler in Chat de Comandos.

**Primary recommendation:** Follow the exact same architecture as `subir ordenes coord`: server action queries dispatch-stage orders with tracking_number but without carrier_guide_number, creates a robot job, dispatches via Inngest to the robot service, receives per-order callbacks, updates orders through domain layer, and shows realtime progress. The robot service endpoint is a direct port of the reference code's `buscarGuiasPorPedidos` method.

## Standard Stack

### Core (Already Installed -- No New Dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Inngest | (existing) | Durable orchestrator for robot job dispatch + batch completion wait | Already powers `subir ordenes coord` |
| Supabase Realtime | (existing) | Live progress updates to Chat de Comandos UI | Already used by `useRobotJobProgress` hook |
| Playwright | 1.58.2 | Browser automation on robot-coordinadora service | Already deployed on Railway |
| Express | 4.x | Robot service HTTP API | Already running |

### Supporting (Already Installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Supabase JS | (existing) | DB reads/writes via admin client | Domain layer queries |
| Tailwind CSS | (existing) | UI styling for new command output | Chat de Comandos components |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New Inngest function | Extend existing robot-orchestrator | New function is cleaner: different endpoint, different payload, different semantics (read vs write) |
| New DB column `carrier_guide_number` | Reuse `tracking_number` | Cannot reuse -- tracking_number already stores Coordinadora pedido number; overwriting loses the pedido reference |
| Separate robot job type | Same `robot_jobs` table with a `job_type` column | Same table with job_type is simpler than a new table; add a column to distinguish |

**Installation:** No new npm packages needed.

## Architecture Patterns

### Existing Infrastructure (Reused Verbatim)

```
MorfX App                          Railway (robot-coordinadora)
-----------                        ----------------------------
Server Action (comandos.ts)
  → getDispatchStage()
  → getOrdersByStage() [filtered]
  → createRobotJob()
  → inngest.send('robot/guide-lookup.submitted')

Inngest Orchestrator
  → HTTP POST /api/buscar-guias    ──→ Express endpoint
  → step.waitForEvent()                  → CoordinadoraAdapter
                                         → buscarGuiasPorPedidos()
                                         → per-order callback ──→ Robot Callback API
                                                                    → updateGuideResult() [domain]
                                                                    → emitFieldChanged() [automation]
                                                                    → Inngest batch_completed event
```

### Pattern 1: Parallel Command Flow (Same as `subir ordenes coord`)
**What:** The new `buscar guias coord` command follows the identical lifecycle pattern as the existing command: preview -> confirm -> create job -> dispatch -> realtime progress -> summary.
**When to use:** Always -- consistency with existing command flow is a locked decision.
**Example:**
```typescript
// Source: src/app/actions/comandos.ts (existing pattern)
export async function executeBuscarGuiasCoord(): Promise<CommandResult<BuscarGuiasResult>> {
  // 1. Auth + credentials
  // 2. Get dispatch stage config
  // 3. Check for active jobs
  // 4. Query orders in stage WITH tracking_number but WITHOUT carrier_guide_number
  // 5. Create robot job (job_type: 'guide_lookup')
  // 6. Dispatch to Inngest
  // 7. Return preview data
}
```

### Pattern 2: New DB Column for Guide Number
**What:** Add `carrier_guide_number TEXT` to the `orders` table. This is the Coordinadora guide (rotulo) number, distinct from `tracking_number` (pedido number).
**When to use:** The guide number is a separate identifier assigned by Coordinadora after the shipment is created. The pedido number (stored in `tracking_number`) is the submission reference; the guide number is the actual shipping label identifier.
**Example:**
```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS carrier_guide_number TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_carrier_guide ON orders(carrier_guide_number)
  WHERE carrier_guide_number IS NOT NULL;
```

### Pattern 3: Robot Job Type Discriminator
**What:** Add a `job_type` column to `robot_jobs` to distinguish between 'create_shipment' (existing) and 'guide_lookup' (new) jobs.
**When to use:** The history panel needs to show different labels for different job types, and the active-job detection needs to scope by type (a guide lookup job should not block a shipment creation job and vice versa).
**Example:**
```sql
ALTER TABLE robot_jobs ADD COLUMN IF NOT EXISTS job_type TEXT NOT NULL DEFAULT 'create_shipment';
```

### Pattern 4: Robot Endpoint for Guide Lookup
**What:** New `/api/buscar-guias` endpoint on the robot-coordinadora service. Receives a list of pedido numbers, navigates to `ff.coordinadora.com/panel/pedidos`, reads the table, and builds a map of pedido -> guide.
**When to use:** Called by the new Inngest orchestrator function.
**Example:**
```typescript
// Source: Reference code (GitHub robot-coordinadora, adapted)
// Robot service endpoint
app.post('/api/buscar-guias', async (req, res) => {
  const { workspaceId, credentials, callbackUrl, callbackSecret, jobId, pedidoNumbers } = req.body;

  // Acknowledge immediately
  res.json({ success: true, jobId });

  // Background: login, navigate to pedidos page, read table
  processBuscarGuias(workspaceId, credentials, callbackUrl, callbackSecret, jobId, pedidoNumbers)
    .catch(err => console.error('[buscar-guias] Fatal error:', err));
});
```

### Pattern 5: Callback Reuse with Extended Payload
**What:** The existing `/api/webhooks/robot-callback` route handles per-order results. For guide lookup, the callback carries the guide number in a new field (e.g., `carrierGuideNumber`) alongside the existing `trackingNumber` (pedido) field.
**When to use:** The callback route needs to be extended to handle guide lookup results in addition to shipment creation results.
**Example:**
```typescript
// Extended callback payload
interface CallbackBody {
  itemId: string
  status: 'success' | 'error'
  trackingNumber?: string      // pedido number (existing)
  carrierGuideNumber?: string  // guide number (NEW)
  errorType?: string
  errorMessage?: string
  jobType?: 'create_shipment' | 'guide_lookup'  // discriminator
}
```

### Anti-Patterns to Avoid
- **Overwriting tracking_number with guide number:** The tracking_number field stores the Coordinadora pedido number. The guide number is a different identifier. Never overwrite one with the other.
- **Creating a separate robot_jobs table for guide lookups:** Reuse the existing table with a job_type discriminator. Separate tables would duplicate all the domain logic.
- **Blocking shipment creation jobs while guide lookup runs:** These are independent operations. The active-job check should be scoped by job_type.
- **Treating "no guide found" as an error:** A pedido without an assigned guide is normal (Coordinadora hasn't processed it yet). Report as "pendiente" in the summary, not as an error.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Portal table reading | Custom page parsing | CoordinadoraAdapter.buscarGuiasPorPedidos() | Reference code has proven selectors and optimized batch loading |
| Job lifecycle tracking | Custom state machine | Existing robot_jobs + robot_job_items domain layer | Already handles idempotency, counters, auto-completion |
| Realtime progress | Custom WebSocket | Existing useRobotJobProgress hook + Supabase Realtime | Hook is battle-tested, handles reconnect |
| Command UI | Custom chat component | Existing CommandOutput + CommandInput + ProgressIndicator | Consistent UX is a locked decision |
| Automation triggers | Manual event emission | updateOrder() domain function with emitFieldChanged | Already emits field.changed for tracking_number; add carrier_guide_number to field mappings |

**Key insight:** This phase is 90% infrastructure reuse. The new code is primarily: one SQL migration, one server action, one Inngest function, one robot endpoint, and UI wiring. All patterns are established.

## Common Pitfalls

### Pitfall 1: Order Filter Logic (Which Orders to Look Up)
**What goes wrong:** Looking up guides for orders that don't have a pedido number, or re-looking up orders that already have a guide.
**Why it happens:** The query needs two conditions: `tracking_number IS NOT NULL` (has pedido) AND `carrier_guide_number IS NULL` (no guide yet).
**How to avoid:** Add a dedicated query function `getOrdersPendingGuide(ctx, stageId)` in the orders domain that filters by both conditions.
**Warning signs:** Robot returns all "pendiente" results because it's looking up orders that never had pedidos.

### Pitfall 2: Pedido Number Format Mismatch
**What goes wrong:** The `tracking_number` stored in the order doesn't match the format in the Coordinadora portal table.
**Why it happens:** When `subir ordenes coord` saves the tracking_number from the robot callback, it may include or exclude leading zeros, dashes, or spaces compared to what the portal shows in the pedidos table.
**How to avoid:** Normalize both the stored tracking_number and the portal's pedido column before comparison (trim, uppercase).
**Warning signs:** Robot reports "not found" for pedidos that visually appear in the portal.

### Pitfall 3: Active Job Type Collision
**What goes wrong:** Running `buscar guias coord` blocks `subir ordenes coord` or vice versa, because getActiveJob() doesn't distinguish job types.
**Why it happens:** The current getActiveJob() query checks for `status IN ('pending', 'processing')` without filtering by job_type.
**How to avoid:** Add job_type filter to getActiveJob() or create a type-specific version. Both commands can run independently.
**Warning signs:** User gets "Ya hay un job activo en progreso" when trying to look up guides while a shipment job is running.

### Pitfall 4: Callback Route Dispatching Wrong Update
**What goes wrong:** A guide lookup callback updates tracking_number instead of carrier_guide_number, or vice versa.
**Why it happens:** The callback route doesn't know what type of job the item belongs to and applies the wrong field update.
**How to avoid:** Include `jobType` in the callback payload so the route knows which domain function to call. Alternatively, look up the job's job_type from robot_job_items -> robot_jobs.
**Warning signs:** Orders lose their pedido number after guide lookup, or guide number is written to tracking_number field.

### Pitfall 5: Batch Completion Timing with Mixed Results
**What goes wrong:** Job never completes because "pendiente" items (no guide found) are not counted as processed.
**Why it happens:** Unlike shipment creation where every order gets success/error, guide lookup has three outcomes: success (guide found), pendiente (no guide yet), and error (robot failed).
**How to avoid:** Treat "pendiente" as a success variant (status = 'success', carrierGuideNumber = null) so the counter increments. The job completes when all items have been processed, regardless of whether guides were found.
**Warning signs:** Job status stays at 'processing' forever; UI spinner never stops.

### Pitfall 6: Supabase Realtime on New Column
**What goes wrong:** UI doesn't show updated guide numbers because the Realtime subscription doesn't include the new column.
**Why it happens:** Supabase Realtime delivers full row payloads by default, so this is actually NOT an issue. But if the UI reads from a query that doesn't SELECT the new column, it won't appear.
**How to avoid:** Ensure all queries that read orders (order-sheet, orders-table, etc.) include `carrier_guide_number` in their SELECT.
**Warning signs:** Guide numbers are saved in DB but don't appear in the order detail view.

## Code Examples

### New Server Action: executeBuscarGuiasCoord
```typescript
// Source: Pattern from existing executeSubirOrdenesCoord in src/app/actions/comandos.ts
export async function executeBuscarGuiasCoord(): Promise<CommandResult<BuscarGuiasResult>> {
  const auth = await getAuthContext()
  if ('error' in auth) return { success: false, error: auth.error }

  const ctx: DomainContext = { workspaceId: auth.workspaceId, source: 'server-action' }

  // 1. Carrier credentials (same portal credentials)
  const creds = await getCarrierCredentials(ctx)
  if (!creds.success) return { success: false, error: creds.error! }

  // 2. Dispatch stage config
  const stageResult = await getDispatchStage(ctx)
  if (!stageResult.success || !stageResult.data) {
    return { success: false, error: 'Etapa de despacho no configurada' }
  }

  // 3. Check for active guide lookup job
  const activeJob = await getActiveJobByType(ctx, 'guide_lookup')
  if (activeJob.data) return { success: false, error: 'Ya hay una busqueda de guias en progreso' }

  // 4. Get orders with tracking_number but no carrier_guide_number
  const ordersResult = await getOrdersPendingGuide(ctx, stageResult.data.stageId)
  if (!ordersResult.success) return { success: false, error: ordersResult.error! }
  if (ordersResult.data!.length === 0) {
    return { success: false, error: 'No hay ordenes pendientes de guia' }
  }

  // 5. Create robot job
  const jobResult = await createRobotJob(ctx, {
    orderIds: ordersResult.data!.map(o => o.id),
    carrier: 'coordinadora',
    jobType: 'guide_lookup',
  })
  if (!jobResult.success) return { success: false, error: jobResult.error! }

  // 6. Dispatch to Inngest
  await (inngest.send as any)({
    name: 'robot/guide-lookup.submitted',
    data: {
      jobId: jobResult.data!.jobId,
      workspaceId: ctx.workspaceId,
      credentials: creds.data,
      pedidoNumbers: ordersResult.data!.map(o => ({
        itemId: jobResult.data!.items.find(i => i.orderId === o.id)!.itemId,
        orderId: o.id,
        pedidoNumber: o.tracking_number,
      })),
    },
  })

  return {
    success: true,
    data: {
      jobId: jobResult.data!.jobId,
      totalOrders: ordersResult.data!.length,
    },
  }
}
```

### New Domain Query: getOrdersPendingGuide
```typescript
// Source: Pattern from existing getOrdersByStage in src/lib/domain/orders.ts
export async function getOrdersPendingGuide(
  ctx: DomainContext,
  stageId: string
): Promise<DomainResult<OrderPendingGuide[]>> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('orders')
    .select('id, name, tracking_number, contacts(name)')
    .eq('workspace_id', ctx.workspaceId)
    .eq('stage_id', stageId)
    .not('tracking_number', 'is', null)
    .is('carrier_guide_number', null)

  if (error) return { success: false, error: error.message }

  return {
    success: true,
    data: (data ?? []).map(row => ({
      id: row.id,
      name: row.name,
      tracking_number: row.tracking_number!,
      contact_name: (row.contacts as any)?.name ?? null,
    })),
  }
}
```

### New Inngest Function: Guide Lookup Orchestrator
```typescript
// Source: Pattern from existing robot-orchestrator.ts
const guideLookupOrchestrator = inngest.createFunction(
  {
    id: 'guide-lookup-orchestrator',
    retries: 0,
    onFailure: async ({ event }) => {
      // Same pattern as robot-orchestrator onFailure
    },
  },
  { event: 'robot/guide-lookup.submitted' as any },
  async ({ event, step }) => {
    const { jobId, workspaceId, credentials, pedidoNumbers } = event.data

    await step.run('mark-processing', async () => {
      await updateJobStatus({ workspaceId, source: 'inngest-orchestrator' }, { jobId, status: 'processing' })
    })

    await step.run('dispatch-to-robot', async () => {
      const robotUrl = process.env.ROBOT_COORDINADORA_URL
      const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/robot-callback`
      const callbackSecret = process.env.ROBOT_CALLBACK_SECRET

      const response = await fetch(`${robotUrl}/api/buscar-guias`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Callback-Secret': callbackSecret! },
        body: JSON.stringify({
          workspaceId, credentials, callbackUrl, callbackSecret,
          jobId,
          pedidoNumbers: pedidoNumbers.map((p: any) => ({
            itemId: p.itemId,
            orderId: p.orderId,
            pedidoNumber: p.pedidoNumber,
          })),
        }),
      })

      if (!response.ok) throw new Error(`Robot error: ${response.status}`)
      return response.json()
    })

    await step.sleep('settle', '2s')

    const timeoutMs = (pedidoNumbers.length * 10_000) + (3 * 60_000)
    const batchCompleted = await step.waitForEvent('wait-for-batch', {
      event: 'robot/job.batch_completed',
      timeout: `${timeoutMs}ms`,
      if: `async.data.jobId == "${jobId}"`,
    })

    if (!batchCompleted) {
      await step.run('mark-timeout', async () => {
        await updateJobStatus({ workspaceId, source: 'inngest-orchestrator' }, { jobId, status: 'failed' })
      })
      return { status: 'failed', reason: 'timeout' }
    }

    return { status: 'completed', jobId }
  }
)
```

### Updated Callback: Handle Guide Lookup Results
```typescript
// Source: Pattern from existing robot-callback route.ts
// The callback route needs to distinguish between shipment creation and guide lookup results.
// The simplest approach: look up the job's job_type from the item's parent job.

// In the callback handler, AFTER looking up the item:
const { data: parentJob } = await supabase
  .from('robot_jobs')
  .select('job_type')
  .eq('id', item.job_id)
  .single()

if (parentJob?.job_type === 'guide_lookup' && status === 'success' && body.carrierGuideNumber) {
  // Update order with guide number via domain
  await updateOrder(ctx, {
    orderId: item.order_id,
    carrierGuideNumber: body.carrierGuideNumber,
  })
}
```

## State of the Art

| Old Approach (Bigin/n8n) | New Approach (MorfX Phase 26) | Why Changed |
|--------------------------|-------------------------------|-------------|
| n8n workflow reads portal | Inngest orchestrator calls robot service | Integrated platform |
| Bigin "Guia" field holds both pedido and guide | Separate `tracking_number` (pedido) and `carrier_guide_number` (guide) | Clean data model |
| Manual check of portal | `buscar guias coord` command | One-click automation |
| No progress visibility | Realtime progress via Supabase | User sees each order update live |

## Open Questions

### 1. Guide Lookup for Orders Outside Dispatch Stage
- **What we know:** The locked decision says "filter orders by dispatch stage configured in Pipeline Config."
- **What's unclear:** Should the guide lookup also check orders in the NEXT stage (e.g., orders that were moved from dispatch to a "sent" stage after pedido creation but before guide assignment)?
- **Recommendation:** Start with dispatch-stage-only filtering per the locked decision. If users need to look up guides for orders in other stages, this can be added later by querying all orders with tracking_number and no carrier_guide_number regardless of stage.

### 2. Robot Service: New Endpoint vs Reuse
- **What we know:** The reference code has `buscarGuiaPorPedido` and `buscarGuiasPorPedidos` methods already implemented in the adapter.
- **What's unclear:** Is the robot-coordinadora service on Railway already deployed with these endpoints, or does the adapter code need to be ported/added?
- **Recommendation:** Check the deployed service. If the endpoints don't exist, add them following the reference code. The adapter methods are proven and only need to be wired to an Express endpoint with the MorfX callback pattern.

### 3. Automation Trigger for Guide Number Update
- **What we know:** The existing `robot.coord.completed` trigger fires when a shipment is created. The `field.changed` trigger fires for any order field update.
- **What's unclear:** Should guide lookup completion fire `robot.coord.completed` (with guide data) or only `field.changed` for the carrier_guide_number field?
- **Recommendation:** Use `field.changed` only, since that's what `updateOrder()` already emits. The `robot.coord.completed` trigger is semantically about shipment creation, not guide reading. If a dedicated trigger is needed later, it can be added, but `field.changed` on `carrier_guide_number` is sufficient for automation rules (e.g., "when guide assigned, send WhatsApp to customer").

### 4. Result Detail: Guide Number in Summary
- **What we know:** The existing command output shows `#{trackingNumber}` per order. The guide lookup needs to show the guide number found.
- **What's unclear:** Should the summary show pedido -> guide mapping, or just the guide?
- **Recommendation:** Show both: `Pedido 9597 -> Guia 1234567890`. This matches the mental model of "I submitted pedido X, its guide is Y." Orders without guides show as "Pedido 9597 -> Pendiente."

## Sources

### Primary (HIGH confidence)
- **MorfX codebase** -- All files referenced and analyzed:
  - `src/inngest/functions/robot-orchestrator.ts` -- Existing orchestrator pattern
  - `src/app/api/webhooks/robot-callback/route.ts` -- Callback handling
  - `src/lib/domain/robot-jobs.ts` -- Job lifecycle, item results
  - `src/lib/domain/orders.ts` -- Order mutations, field.changed triggers
  - `src/app/actions/comandos.ts` -- Server actions for commands
  - `src/app/(dashboard)/comandos/components/` -- Complete UI infrastructure
  - `src/hooks/use-robot-job-progress.ts` -- Realtime subscription hook
  - `src/inngest/events.ts` -- Event type definitions
  - `src/lib/automations/trigger-emitter.ts` -- Trigger emission pattern
  - `src/lib/domain/carrier-configs.ts` -- Dispatch stage config
  - `supabase/migrations/20260129000003_orders_foundation.sql` -- Orders schema
  - `supabase/migrations/20260222000003_robot_jobs.sql` -- Robot jobs schema

- **Reference robot code** (GitHub: yuseponub/AGENTES-IA-FUNCIONALES-v3):
  - `src/api/server.ts` -- `/api/buscar-guia` and `/api/buscar-guias` endpoints
  - `src/adapters/coordinadora-adapter.ts` -- `buscarGuiaPorPedido` and `buscarGuiasPorPedidos` methods

### Secondary (MEDIUM confidence)
- **Phase 22 Research** (`.planning/phases/22-robot-coordinadora-service/22-RESEARCH.md`) -- Robot architecture, adapter pattern, Playwright selectors
- **Phase 22 Context** (`.planning/phases/22-robot-coordinadora-service/22-CONTEXT.md`) -- Deployment decisions, existing robot as blueprint
- **Phase 25 Context** (`.planning/phases/25-pipeline-integration-docs/25-CONTEXT.md`) -- Dispatch stage config UI

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Zero new libraries; entire stack already proven in existing command flow
- Architecture: HIGH -- Direct replication of existing `subir ordenes coord` pattern with minor adaptations
- Pitfalls: HIGH -- All pitfalls identified from analysis of existing code and data model review
- DB schema: HIGH -- Column needs verified by examining actual DB, but migration approach is standard

**Research date:** 2026-02-21
**Valid until:** 2026-03-21 (stable domain, all infrastructure already deployed)
