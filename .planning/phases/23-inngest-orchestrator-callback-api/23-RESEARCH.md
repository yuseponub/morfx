# Phase 23: Inngest Orchestrator + Callback API - Research

**Researched:** 2026-02-20
**Domain:** Inngest durable functions, HTTP callback APIs, domain-layer orchestration
**Confidence:** HIGH

## Summary

This phase connects the MorfX CRM (Next.js on Vercel) to the robot-coordinadora service (Express on Railway) through two mechanisms: (1) an Inngest function that dispatches robot jobs via HTTP and waits for batch results with a timeout, and (2) a Next.js API route that receives per-order callback results from the robot, routes updates through the domain layer, and fires the new `robot.coord.completed` automation trigger.

The standard approach uses the existing Inngest infrastructure (v3.51.0) with `step.waitForEvent()` for timeout-based callback waiting, `step.run()` for durable HTTP calls and domain operations, and a Next.js API route at `/api/webhooks/robot-callback` that receives per-order results from the robot service, calls domain functions, and emits an Inngest event to signal the orchestrator that all results have arrived.

**Primary recommendation:** Build the orchestrator as a single Inngest function triggered by `robot/job.submitted`, use `step.waitForEvent()` to wait for a `robot/job.batch_completed` event with a dynamic timeout, and create a callback API route that accumulates per-order results via domain calls and emits the batch-completed event once all items finish.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| inngest | 3.51.0 | Durable workflow orchestration | Already in use for agent timers + automation runners |
| next | 16.x | API route for callback endpoint | Already the app framework |
| supabase-js | (existing) | Domain layer DB access | Already used in all domain functions |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| crypto (Node built-in) | n/a | HMAC verification for callback auth | Callback authentication |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| step.waitForEvent() for timeout | step.sleep() + polling | waitForEvent is cleaner and event-driven; sleep+poll wastes resources |
| Per-order callback + batch event | Single batch callback | Per-order allows domain updates as they arrive; context decided per-order callbacks from robot |
| HMAC shared secret | Per-job token | HMAC is simpler, proven pattern (WhatsApp/Shopify webhooks already use it), no DB storage needed |

**Installation:**
No new packages needed -- all required libraries are already installed.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── inngest/
│   ├── events.ts                     # Add robot/job.batch_completed event type
│   └── functions/
│       └── robot-orchestrator.ts     # New: orchestrator function
├── app/api/webhooks/
│   └── robot-callback/
│       └── route.ts                  # New: callback API endpoint
├── lib/
│   ├── domain/
│   │   └── robot-jobs.ts            # Existing: update with carrier field update
│   └── automations/
│       ├── trigger-emitter.ts       # Add emitRobotCoordCompleted
│       ├── constants.ts             # Add robot.coord.completed trigger + variable catalog
│       └── types.ts                 # Add 'robot.coord.completed' to TriggerType union
```

### Pattern 1: Orchestrator as Event-Driven Workflow
**What:** A single Inngest function that: (1) marks job as processing, (2) calls robot service HTTP endpoint, (3) waits for batch-completed event with dynamic timeout, (4) handles timeout by marking job failed.
**When to use:** When MorfX submits a robot job.
**Example:**
```typescript
// Source: Existing automation-runner.ts pattern + Inngest docs
export const robotOrchestrator = inngest.createFunction(
  {
    id: 'robot-orchestrator',
    retries: 0, // FAIL-FAST: no retries to prevent duplicate submissions
  },
  { event: 'robot/job.submitted' as any },
  async ({ event, step }) => {
    const { jobId, workspaceId, carrier, credentials, orders } = event.data

    // Step 1: Mark job as processing
    await step.run('mark-processing', async () => {
      await updateJobStatus(
        { workspaceId, source: 'inngest-orchestrator' },
        { jobId, status: 'processing' }
      )
    })

    // Step 2: Call robot service
    const dispatchResult = await step.run('dispatch-to-robot', async () => {
      const robotUrl = process.env.ROBOT_COORDINADORA_URL
      const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/robot-callback`

      const response = await fetch(`${robotUrl}/api/crear-pedidos-batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Callback-Secret': process.env.ROBOT_CALLBACK_SECRET!,
        },
        body: JSON.stringify({
          workspaceId,
          credentials,
          callbackUrl,
          jobId,
          orders: orders.map(o => ({
            itemId: o.itemId,
            orderId: o.orderId,
            pedidoInput: o.pedidoInput,
          })),
        }),
      })

      if (!response.ok) {
        throw new Error(`Robot service error: ${response.status}`)
      }
      return await response.json()
    })

    // Step 3: Wait for batch completion with dynamic timeout
    const timeoutMs = (orders.length * 30_000) + (5 * 60_000)
    const batchCompleted = await step.waitForEvent('wait-for-batch', {
      event: 'robot/job.batch_completed',
      timeout: `${timeoutMs}ms`,
      if: `async.data.jobId == "${jobId}"`,
    })

    if (!batchCompleted) {
      // Timeout: mark job as failed
      await step.run('mark-timeout-failed', async () => {
        await updateJobStatus(
          { workspaceId, source: 'inngest-orchestrator' },
          { jobId, status: 'failed' }
        )
      })
      return { status: 'failed', reason: 'timeout' }
    }

    return {
      status: 'completed',
      successCount: batchCompleted.data.successCount,
      errorCount: batchCompleted.data.errorCount,
    }
  }
)
```

### Pattern 2: Callback API as Domain-First Route
**What:** A Next.js API route that receives per-order results from the robot, updates each item via the domain layer (which fires automation triggers), and checks if all items are done to emit the batch-completed Inngest event.
**When to use:** When the robot-coordinadora service reports a per-order result.
**Example:**
```typescript
// Source: Existing webhook patterns (Shopify, WhatsApp)
export async function POST(request: NextRequest) {
  // 1. Verify callback authentication
  const secret = request.headers.get('x-callback-secret')
  if (secret !== process.env.ROBOT_CALLBACK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Parse payload (BatchItemResult from robot)
  const body = await request.json()

  // 3. Look up item to get workspace context
  // 4. Call domain layer: updateJobItemResult
  // 5. On success: also update order carrier via domain
  // 6. Fire automation trigger: robot.coord.completed
  // 7. Check if all items done -> emit robot/job.batch_completed Inngest event

  return NextResponse.json({ received: true })
}
```

### Pattern 3: New Automation Trigger Type
**What:** Add `robot.coord.completed` as a new trigger type that fires per-order when the robot successfully processes it. Follows the exact same pattern as existing triggers (Shopify, task, etc.).
**When to use:** When an order's tracking number is set by the robot.
**Example:**
```typescript
// In trigger-emitter.ts (follows existing pattern)
export async function emitRobotCoordCompleted(data: {
  workspaceId: string
  orderId: string
  orderName?: string
  trackingNumber: string
  carrier: string
  contactId: string | null
  contactName?: string
  contactPhone?: string
  orderValue?: number
  shippingCity?: string
  cascadeDepth?: number
}): Promise<void> {
  const depth = data.cascadeDepth ?? 0
  if (isCascadeSuppressed('robot.coord.completed', data.workspaceId, depth)) return
  await sendEvent(
    'automation/robot.coord.completed',
    { ...data, cascadeDepth: depth },
    'robot.coord.completed',
    data.workspaceId
  )
}
```

### Anti-Patterns to Avoid
- **Inngest retries for robot dispatch:** NEVER enable retries on the orchestrator function. The fail-fast strategy prevents duplicate order submissions. If the robot is unreachable, mark failed immediately.
- **Fire-and-forget inngest.send in serverless:** ALWAYS await `inngest.send()` in the callback API route (Vercel serverless can terminate before async send completes). This is a known project pattern from MEMORY.md.
- **Polling for job completion:** Do NOT use step.sleep() + DB polling to check if all items completed. Use step.waitForEvent() which is event-driven and efficient.
- **Direct DB writes from callback route:** NEVER write directly to Supabase from the API route. ALL mutations go through the domain layer (robot-jobs.ts, orders.ts). This ensures automation triggers fire.
- **Mixed contexts (TriggerContext vs variableContext):** The automation runner uses both flat TriggerContext and nested variableContext. The new trigger must populate both correctly.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Callback authentication | Custom token generation | HMAC shared secret via env var | Project already uses this pattern (WhatsApp webhook, Shopify webhook). Simple, no DB storage needed. |
| Job completion detection | Custom counter logic | Existing `updateJobItemResult` auto-completes | The domain function already increments counters and sets job status to 'completed' when success_count + error_count >= total_items |
| Timeout with dynamic duration | Manual setTimeout + polling | `step.waitForEvent(timeout: \`${ms}ms\`)` | Inngest handles durability, retries, and state persistence natively |
| Automation trigger emission | Custom event dispatch | Existing `trigger-emitter.ts` + `automation-runner.ts` factory | The factory pattern creates runners automatically; just add the new trigger type |
| Order carrier update | Direct DB update | Existing `updateOrder` domain function | Already handles field change triggers, workspace isolation |

**Key insight:** 80% of this phase wires together existing patterns. The domain layer, automation system, and Inngest infrastructure are already built. The new code is thin orchestration glue.

## Common Pitfalls

### Pitfall 1: Race Condition Between Callback and WaitForEvent
**What goes wrong:** The robot finishes processing very fast (or has few orders) and the callback fires the batch_completed event BEFORE the Inngest orchestrator reaches `step.waitForEvent()`.
**Why it happens:** Inngest `step.waitForEvent()` only listens for events AFTER the step executes. Events sent before the step starts are lost.
**How to avoid:** The robot-coordinadora server processes orders sequentially with 2s delays between orders. The Inngest orchestrator's Step 2 (HTTP dispatch) returns as soon as the robot acknowledges (200 response). The robot then processes in the background. This means `step.waitForEvent()` will always be reached before any results arrive. Additionally, the Inngest event for batch_completed is only emitted by the callback API AFTER the last item result is processed, which takes at minimum N*2 seconds. However, for safety with very small batches (1 order), add a brief `step.sleep('settle', '2s')` between dispatch and waitForEvent.
**Warning signs:** Orchestrator times out even though all items were processed successfully.

### Pitfall 2: Duplicate Callback Processing
**What goes wrong:** The callback API route processes the same item result twice, leading to incorrect counters.
**Why it happens:** Network retries, robot bugs, or concurrent requests.
**How to avoid:** The `updateJobItemResult` domain function checks item status before updating. If an item is already in 'success' or 'error' state, the update should be idempotent. Add a guard: if `item.status !== 'pending' && item.status !== 'processing'`, skip the update and return success (already processed).
**Warning signs:** success_count + error_count exceeds total_items.

### Pitfall 3: Callback Authentication Bypass
**What goes wrong:** Unauthorized requests hit the callback endpoint and corrupt job data.
**Why it happens:** The callback URL is public (Vercel endpoint).
**How to avoid:** Use a shared secret in the `x-callback-secret` header. The robot sends it, the callback verifies it. Use timing-safe comparison (crypto.timingSafeEqual). Store the secret in `ROBOT_CALLBACK_SECRET` env var.
**Warning signs:** Unexpected job item updates, items updating without corresponding robot activity.

### Pitfall 4: Missing Workspace Context in Callback
**What goes wrong:** The callback receives an `itemId` but doesn't know the workspace_id, so it can't create a DomainContext.
**Why it happens:** The robot's `BatchItemResult` only contains `itemId` and `status`, not `workspaceId`.
**How to avoid:** Look up the workspace_id by joining robot_job_items -> robot_jobs. The domain function `updateJobItemResult` already does this join (line 252 of robot-jobs.ts): `robot_jobs!inner(workspace_id)`.
**Warning signs:** "Item no pertenece a este workspace" errors.

### Pitfall 5: Order Updates Without Contact Data for Trigger
**What goes wrong:** The `robot.coord.completed` trigger fires but has no contact data, so automations that send WhatsApp or reference `{{contacto.nombre}}` fail silently.
**Why it happens:** The callback only has itemId and trackingNumber. Contact data must be enriched from the order.
**How to avoid:** When processing a successful callback, load the order with its contact join (same pattern as automation-runner.ts enrichment). Include contact data in the trigger emission.
**Warning signs:** Automation variables resolve to empty strings, WhatsApp templates fail.

### Pitfall 6: Inngest Event Type Mismatch
**What goes wrong:** TypeScript compilation errors when sending events with custom names.
**Why it happens:** The Inngest client is typed with `AllAgentEvents`. New event names must be added to the type.
**How to avoid:** Add `robot/job.batch_completed` to `RobotEvents` type in events.ts. For `automation/robot.coord.completed`, add it to `AutomationEvents`. Use `(inngest.send as any)` type assertion if needed (existing project pattern from MEMORY.md).
**Warning signs:** TypeScript errors on `inngest.send()` calls.

## Code Examples

### Example 1: New Event Type Definition
```typescript
// In src/inngest/events.ts - Add to RobotEvents
/**
 * Emitted by callback API when all items in a batch have been processed.
 * Consumed by robot-orchestrator to unblock step.waitForEvent().
 */
'robot/job.batch_completed': {
  data: {
    jobId: string
    workspaceId: string
    successCount: number
    errorCount: number
  }
}
```

### Example 2: New Trigger Type Registration
```typescript
// In src/lib/automations/types.ts - Add to TriggerType union
| 'robot.coord.completed'

// In src/lib/automations/constants.ts - Add to TRIGGER_CATALOG
{
  type: 'robot.coord.completed',
  label: 'Robot Coordinadora completado',
  category: 'Logistica',
  description: 'Se dispara cuando el robot crea exitosamente un pedido en Coordinadora',
  configFields: [],
  variables: [
    'orden.id', 'orden.nombre', 'orden.valor',
    'orden.tracking_number', 'orden.carrier',
    'orden.ciudad_envio', 'orden.direccion_envio',
    'contacto.nombre', 'contacto.telefono',
  ],
}

// In VARIABLE_CATALOG
'robot.coord.completed': [
  { path: 'orden.id', label: 'ID de la orden' },
  { path: 'orden.nombre', label: 'Nombre de la orden' },
  { path: 'orden.valor', label: 'Valor total' },
  { path: 'orden.tracking_number', label: 'Numero de pedido Coordinadora' },
  { path: 'orden.carrier', label: 'Transportadora' },
  { path: 'orden.ciudad_envio', label: 'Ciudad de envio' },
  { path: 'orden.direccion_envio', label: 'Direccion de envio' },
  { path: 'contacto.nombre', label: 'Nombre del contacto' },
  { path: 'contacto.telefono', label: 'Telefono del contacto' },
  { path: 'contacto.email', label: 'Email del contacto' },
]
```

### Example 3: Callback Idempotency Guard
```typescript
// In updateJobItemResult domain function - add idempotency check
// After fetching the item, before updating:
if (item.status === 'success' || item.status === 'error') {
  // Already processed -- idempotent return
  return {
    success: true,
    data: { itemId: params.itemId, orderId: item.order_id },
  }
}
```

### Example 4: Callback API Route Authentication
```typescript
// In src/app/api/webhooks/robot-callback/route.ts
// Follows WhatsApp webhook HMAC pattern
import crypto from 'crypto'

function verifyCallbackSecret(received: string, expected: string): boolean {
  try {
    return crypto.timingSafeEqual(
      Buffer.from(received),
      Buffer.from(expected)
    )
  } catch {
    return false
  }
}
```

### Example 5: Dynamic Timeout Calculation
```typescript
// Timeout proportional to batch size
// (N orders x 30 seconds) + 5 minutes margin
const timeoutMs = (orders.length * 30_000) + (5 * 60_000)
// Examples:
//   1 order  = 30s + 300s = 330s (5.5 min)
//   5 orders = 150s + 300s = 450s (7.5 min)
//   20 orders = 600s + 300s = 900s (15 min)
//   50 orders = 1500s + 300s = 1800s (30 min)
```

### Example 6: Batch Summary Data Structure
```typescript
// The callback API should store enough data to build the Chat de Comandos summary
// This is built from the robot_job_items + orders + contacts joins:
interface BatchSummaryData {
  successOrders: Array<{
    trackingNumber: string  // # pedido Coordinadora
    contactName: string
    address: string
    city: string           // CITY (DEPT) format
    phone: string
    amount: number
  }>
  failedOrders: Array<{
    contactName: string
    address: string
    city: string
    phone: string
    amount: number
    errorMessage: string
  }>
  counts: {
    success: number
    error: number
    total: number
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Polling for completion | step.waitForEvent() | Inngest v3.x | Event-driven, no wasted resources |
| inngest.send() inside functions | step.sendEvent() | Inngest v3.x | Reliable delivery within function context |
| Manual timeout tracking | step.waitForEvent timeout param | Inngest v3.x | Automatic timeout handling, returns null on expire |

**Deprecated/outdated:**
- None applicable -- all Inngest v3.51.0 APIs are current

## Decision Recommendations (Claude's Discretion)

### Callback URL Strategy: Passed in Payload
**Recommendation:** Pass callbackUrl in the request payload to the robot service.
**Rationale:** The robot already expects `callbackUrl` as a required field in `BatchRequest`. Using env var would require robot-coordinadora to have a hardcoded MorfX URL, which is less flexible for dev/staging environments. The payload approach lets MorfX control the callback destination per-request.

### Callback Authentication: Shared Secret via Header
**Recommendation:** Use a shared secret in the `x-callback-secret` HTTP header, verified with `crypto.timingSafeEqual`.
**Rationale:** This is the simplest approach, matches the project's existing webhook authentication patterns (WhatsApp uses HMAC, Shopify uses HMAC), requires no DB storage, and is sufficient for a service-to-service callback. The secret is stored in `ROBOT_CALLBACK_SECRET` env var on both MorfX (Vercel) and robot-coordinadora (Railway).

### Inngest Function Structure
**Recommendation:** Three steps: (1) `step.run('mark-processing')` to update job status, (2) `step.run('dispatch-to-robot')` for HTTP call, (3) `step.waitForEvent('wait-for-batch')` for timeout-based wait. A brief `step.sleep('settle', '2s')` between dispatch and wait prevents race conditions on tiny batches.
**Rationale:** This mirrors the existing agent-timer pattern (mark state -> do work -> wait). The settle sleep is a safety net -- in practice, even 1-order batches take 10+ seconds because of Playwright browser automation.

### HTTP Client for Robot Service
**Recommendation:** Use the built-in `fetch` API (available in Node 18+ which Vercel provides).
**Rationale:** No need for axios or node-fetch. The project already uses `fetch` in the robot-coordinadora server.ts for callback reporting. Keeping it consistent.

### Batch Completion Signal
**Recommendation:** The callback API emits `robot/job.batch_completed` Inngest event when the last item result arrives (detected by checking if `success_count + error_count >= total_items` after each updateJobItemResult). The orchestrator's `step.waitForEvent()` catches this event.
**Rationale:** This avoids the robot having to know about Inngest events. The robot reports per-order results via HTTP callbacks. MorfX's callback handler translates them into the Inngest event system. Clean separation of concerns.

## Open Questions

1. **Robot callback header forwarding**
   - What we know: The robot's `reportResult` function in server.ts does NOT currently forward any authentication headers -- it just POSTs the result JSON.
   - What's unclear: The robot needs to be updated to include `x-callback-secret` in its callback requests.
   - Recommendation: Modify the robot's `reportResult` function to accept and forward a `callbackSecret` parameter, passed from the batch request. This is a small Phase 22 patch (1 line in reportResult, 1 line in BatchRequest type). Can be done as part of Phase 23 since robot-coordinadora is in the same repo.

2. **Batch summary storage**
   - What we know: The batch summary needs to be available for Chat de Comandos (Phase 24).
   - What's unclear: Whether to store a summary JSONB on robot_jobs or compute it on-the-fly from items+orders.
   - Recommendation: Compute on-the-fly. The data is already in robot_job_items (status, tracking_number, error_message) and orders (contact, address, city, amount). No new DB column needed. Phase 24 will query and format.

3. **Step.sendEvent vs inngest.send**
   - What we know: `step.sendEvent()` is the recommended approach inside Inngest functions for reliable delivery. The project currently uses `inngest.send()` everywhere via trigger-emitter.ts.
   - What's unclear: Whether the callback API route (a Next.js API route, NOT an Inngest function) should use `inngest.send()` or `step.sendEvent()`.
   - Recommendation: The callback API route is NOT inside an Inngest function, so it MUST use `inngest.send()`. Use `await (inngest.send as any)(...)` with the type assertion pattern (project standard from MEMORY.md). This is safe because the callback route will always await the send.

## Sources

### Primary (HIGH confidence)
- Inngest v3.51.0 (installed) -- `step.waitForEvent()`, `step.run()`, `step.sleep()` APIs verified via official docs
- [Inngest step.waitForEvent reference](https://www.inngest.com/docs/reference/functions/step-wait-for-event) -- timeout, match, if expressions
- [Inngest step.sendEvent reference](https://www.inngest.com/docs/reference/functions/step-send-event) -- reliable event delivery from functions
- [Inngest step.sleep reference](https://www.inngest.com/docs/reference/functions/step-sleep) -- dynamic timeout support
- [Inngest wait-for-event guide](https://www.inngest.com/docs/features/inngest-functions/steps-workflows/wait-for-event) -- patterns, race condition notes

### Codebase (HIGH confidence -- direct source code analysis)
- `src/inngest/client.ts` -- Inngest client setup with EventSchemas
- `src/inngest/events.ts` -- RobotEvents type with `robot/job.submitted`, `robot/item.completed`, `robot/job.completed`
- `src/inngest/functions/automation-runner.ts` -- Factory pattern for trigger runners, enrichment, condition evaluation
- `src/inngest/functions/agent-timers.ts` -- step.waitForEvent() + step.sleep() patterns in production
- `src/app/api/inngest/route.ts` -- serve() with function registration
- `src/lib/domain/robot-jobs.ts` -- Domain functions: createRobotJob, updateJobItemResult, updateJobStatus, retryFailedItems
- `src/lib/domain/orders.ts` -- updateOrder with field.changed trigger emission
- `src/lib/domain/carrier-configs.ts` -- getCarrierCredentials for dispatch
- `src/lib/automations/trigger-emitter.ts` -- Pattern for emitting automation events
- `src/lib/automations/constants.ts` -- TRIGGER_CATALOG, VARIABLE_CATALOG, ACTION_CATALOG
- `src/lib/automations/types.ts` -- TriggerType union, TriggerContext, TriggerConfig
- `src/lib/automations/variable-resolver.ts` -- buildTriggerContext for nested variable namespace
- `src/app/api/webhooks/shopify/route.ts` -- Webhook route pattern with HMAC verification
- `src/app/api/webhooks/whatsapp/route.ts` -- Webhook route pattern with HMAC verification
- `robot-coordinadora/src/api/server.ts` -- Robot batch endpoint, reportResult per-order callbacks
- `robot-coordinadora/src/types/index.ts` -- BatchRequest, BatchItemResult, BatchResponse types
- `supabase/migrations/20260222000003_robot_jobs.sql` -- DB schema for robot_jobs + robot_job_items

### Secondary (MEDIUM confidence)
- Project MEMORY.md -- Inngest patterns: always await send, type assertion, initializeTools safety net

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and used in the project
- Architecture: HIGH -- patterns directly observed in existing codebase (automation-runner, agent-timers, Shopify/WhatsApp webhooks)
- Pitfalls: HIGH -- known from codebase analysis (race conditions, idempotency, workspace context) and project MEMORY.md (Vercel serverless + Inngest patterns)

**Research date:** 2026-02-20
**Valid until:** 2026-03-20 (stable -- Inngest v3.x API is mature)
