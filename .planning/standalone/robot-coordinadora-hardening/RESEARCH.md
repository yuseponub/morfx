# Robot Coordinadora Hardening - Research

**Researched:** 2026-02-24
**Domain:** Inngest orchestration, Supabase atomic operations, webhook robustness
**Confidence:** HIGH

## Summary

This research investigates the technical patterns needed to harden the existing Robot Coordinadora flow (subir ordenes, buscar guias, leer guias OCR, generar guias PDF, generar excel). The scope is strictly bug fixes and robustness improvements -- NO new features.

The primary issues fall into three categories: (1) race conditions in counter updates and event handling, (2) missing error handling around Inngest send calls, and (3) missing validation/timeout controls on the webhook callback and robot service fetch calls. All bugs are confirmed by direct code review of `robot-jobs.ts`, `robot-orchestrator.ts`, `robot-callback/route.ts`, `comandos.ts`, `comandos-layout.tsx`, and `use-robot-job-progress.ts`.

The standard fix for counter race conditions is a PostgreSQL RPC function using `SET count = count + 1` (atomic SQL increment). For Inngest `waitForEvent` race conditions, the current 2-second settle sleep is the recommended workaround since Inngest has a known open issue (#1433) with events arriving before listener registration. For fetch timeouts, `AbortSignal.timeout()` is the modern Node.js pattern already partially used in the codebase.

**Primary recommendation:** Replace read-then-write counter updates with a single Supabase RPC function (`increment_job_counter`), wrap all `inngest.send()` calls in try-catch with job cleanup on failure, and add `AbortSignal.timeout()` to all robot service fetch calls.

## Standard Stack

No new libraries needed. This is purely a hardening phase using existing stack.

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Supabase JS | @supabase/supabase-js (already installed) | DB operations + RPC | `.rpc()` method for atomic increments |
| Inngest | inngest (already installed) | Durable orchestration | step.waitForEvent, step.run, onFailure |
| Next.js | 15 (already installed) | API routes for webhooks | NextRequest/NextResponse |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| AbortSignal (native) | Node.js built-in | Fetch timeout | Robot service HTTP calls |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Supabase RPC for atomic increment | Advisory locks / SELECT FOR UPDATE | RPC is simpler, single SQL statement, no lock management |
| AbortController + setTimeout | AbortSignal.timeout() | .timeout() is cleaner, fewer lines, already available in Node 18+ |

**Installation:** No new packages needed.

## Architecture Patterns

### Existing Project Structure (No Changes)
```
src/
├── app/actions/comandos.ts          # Server actions for commands
├── app/api/webhooks/robot-callback/ # Callback webhook route
├── inngest/functions/robot-orchestrator.ts  # Inngest orchestrators
├── lib/domain/robot-jobs.ts         # Domain layer for robot jobs
├── hooks/use-robot-job-progress.ts  # Realtime progress hook
└── app/(dashboard)/comandos/        # UI components
supabase/
└── migrations/                      # SQL migrations
```

### Pattern 1: Atomic Counter Increment via Supabase RPC
**What:** Replace the read-then-write pattern in `updateJobItemResult` (robot-jobs.ts:324-357) with a single SQL function that atomically increments counters and optionally marks the job as completed.
**When to use:** Any time you need to increment a counter in a concurrent environment.
**Current buggy code (robot-jobs.ts:324-357):**
```typescript
// BUG: Read-then-write race condition
const { data: job } = await supabase
  .from('robot_jobs')
  .select('success_count, error_count, total_items')
  .eq('id', item.job_id)
  .single()

const newSuccessCount = params.status === 'success'
  ? (job.success_count + 1) : job.success_count
const newErrorCount = params.status === 'error'
  ? (job.error_count + 1) : job.error_count

await supabase.from('robot_jobs').update({
  success_count: newSuccessCount,
  error_count: newErrorCount,
}).eq('id', item.job_id)
```
**Fixed pattern:**
```sql
-- Migration: Create RPC function
CREATE OR REPLACE FUNCTION increment_robot_job_counter(
  p_job_id UUID,
  p_is_success BOOLEAN
)
RETURNS TABLE(
  new_success_count INTEGER,
  new_error_count INTEGER,
  total_items INTEGER,
  is_now_complete BOOLEAN
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_success INTEGER;
  v_error INTEGER;
  v_total INTEGER;
  v_complete BOOLEAN;
BEGIN
  UPDATE robot_jobs
  SET
    success_count = CASE WHEN p_is_success THEN success_count + 1 ELSE success_count END,
    error_count = CASE WHEN NOT p_is_success THEN error_count + 1 ELSE error_count END
  WHERE id = p_job_id
  RETURNING
    robot_jobs.success_count,
    robot_jobs.error_count,
    robot_jobs.total_items
  INTO v_success, v_error, v_total;

  v_complete := (v_success + v_error) >= v_total;

  -- Auto-complete if all items done
  IF v_complete THEN
    UPDATE robot_jobs
    SET status = 'completed',
        completed_at = timezone('America/Bogota', NOW())
    WHERE id = p_job_id
    AND status != 'completed'; -- idempotent guard
  END IF;

  RETURN QUERY SELECT v_success, v_error, v_total, v_complete;
END;
$$;
```
**TypeScript call:**
```typescript
// Source: Supabase docs - https://supabase.com/docs/reference/javascript/rpc
const { data, error } = await supabase.rpc('increment_robot_job_counter', {
  p_job_id: item.job_id,
  p_is_success: params.status === 'success',
}).single()

if (error) {
  return { success: false, error: `Error actualizando contadores: ${error.message}` }
}

// data.is_now_complete tells us if we just completed the job
```

### Pattern 2: Try-Catch Inngest Send with Job Cleanup
**What:** Wrap `inngest.send()` in try-catch. On failure, delete the orphaned job.
**When to use:** Every `inngest.send()` in `comandos.ts` server actions.
**Example (comandos.ts):**
```typescript
// Step 9: Dispatch to Inngest with cleanup on failure
try {
  await (inngest.send as any)({
    name: 'robot/job.submitted',
    data: { jobId: jobResult.data.jobId, /* ... */ },
  })
} catch (sendError) {
  // Cleanup: mark job as failed so it's not orphaned
  console.error('[comandos] Inngest send failed, cleaning up job:', sendError)
  await updateJobStatus(ctx, {
    jobId: jobResult.data.jobId,
    status: 'failed',
  })
  return {
    success: false,
    error: 'Error enviando job al procesador. El job fue cancelado. Intente nuevamente.',
  }
}
```

### Pattern 3: Fetch Timeout with AbortSignal.timeout()
**What:** Add timeout to robot service HTTP calls using `AbortSignal.timeout()`.
**When to use:** Every `fetch()` call to the robot service in orchestrator functions.
**Timeout formula:** 60 seconds per order + 10 minutes base margin.
**Example (robot-orchestrator.ts):**
```typescript
// Source: MDN - https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static
const timeoutMs = (orders.length * 60_000) + (10 * 60_000) // 60s/order + 10min margin

const response = await fetch(`${robotUrl}/api/crear-pedidos-batch`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Callback-Secret': callbackSecret },
  body: JSON.stringify({ /* ... */ }),
  signal: AbortSignal.timeout(timeoutMs),
})
```
**Note:** The codebase already uses `AbortController` in `action-executor.ts:1022`. The `AbortSignal.timeout()` pattern is cleaner (fewer lines, auto-cleanup) and available since Node.js 18+.

### Pattern 4: Idempotency Flag for batch_completed
**What:** Add a `batch_completed_emitted` boolean column to `robot_jobs` to prevent duplicate `robot/job.batch_completed` events.
**When to use:** In the callback webhook when emitting the batch_completed event.
**Example (robot-callback/route.ts):**
```typescript
// Atomically set flag + check in one query
const { data: flagResult, error: flagError } = await supabase
  .from('robot_jobs')
  .update({ batch_completed_emitted: true })
  .eq('id', item.job_id)
  .eq('batch_completed_emitted', false) // Only if not already emitted
  .eq('status', 'completed')
  .select('id')
  .maybeSingle()

if (flagResult) {
  // We won the race -- emit the event
  await (inngest.send as any)({
    name: 'robot/job.batch_completed',
    data: { jobId: item.job_id, /* ... */ },
  })
}
// If flagResult is null, another callback already emitted it
```

### Pattern 5: Callback Payload Validation
**What:** Strict validation of all callback payload fields before processing.
**When to use:** At the top of the callback webhook handler.
**Example:**
```typescript
// Validate required fields
if (!itemId || typeof itemId !== 'string') {
  return NextResponse.json({ error: 'Invalid itemId: must be a non-empty string' }, { status: 400 })
}

if (status !== 'success' && status !== 'error') {
  return NextResponse.json({ error: 'Invalid status: must be "success" or "error"' }, { status: 400 })
}

// Validate UUID format
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
if (!UUID_REGEX.test(itemId)) {
  return NextResponse.json({ error: 'Invalid itemId: not a valid UUID' }, { status: 400 })
}

// Validate tracking number format on success
if (status === 'success' && trackingNumber) {
  if (typeof trackingNumber !== 'string' || trackingNumber.length < 3 || trackingNumber.length > 50) {
    return NextResponse.json({ error: 'Invalid trackingNumber format' }, { status: 400 })
  }
}

// Validate errorType enum
if (status === 'error' && errorType) {
  const validErrorTypes = ['validation', 'portal', 'timeout', 'unknown']
  if (!validErrorTypes.includes(errorType)) {
    return NextResponse.json({ error: `Invalid errorType: must be one of ${validErrorTypes.join(', ')}` }, { status: 400 })
  }
}
```

### Anti-Patterns to Avoid
- **Read-then-write for counters:** Two callbacks processing simultaneously read the same count, both increment, and one increment is lost. Always use atomic SQL increment.
- **Fire-and-forget inngest.send without cleanup:** If send fails, the job sits in `pending` forever with no way for the user to know.
- **Non-null assertion on nullable data:** `order.tracking_number!` crashes if null. Always use optional chaining.
- **Swallowing inngest.send errors in callbacks:** The callback route catches inngest.send failure for batch_completed but returns 200 OK, meaning the robot service thinks everything is fine. The orchestrator then times out waiting for an event that was never sent.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic counter increment | Read-then-write in JS | PostgreSQL RPC function | Race condition with concurrent callbacks |
| Fetch timeout | Manual setTimeout + clearTimeout | `AbortSignal.timeout(ms)` | Built-in, cleaner, auto-cleanup |
| UUID validation | Custom regex per handler | Shared `isValidUUID()` util | Reusable, tested once |
| Idempotency guard | Application-level check + race | DB-level atomic `UPDATE...WHERE flag=false` | SQL atomicity prevents all races |

**Key insight:** The robot callback webhook is inherently concurrent -- the robot service sends multiple per-order callbacks simultaneously. Every write operation in the callback path MUST be atomic at the database level, not at the application level.

## Common Pitfalls

### Pitfall 1: Inngest waitForEvent Race Condition
**What goes wrong:** The robot service processes a tiny batch (1-2 orders) so fast that the `batch_completed` event arrives BEFORE the orchestrator reaches `step.waitForEvent()`.
**Why it happens:** Inngest has a known open issue (#1433 on GitHub) where events arriving before `waitForEvent` registration are not buffered. The current 2-second `step.sleep('settle', '2s')` mitigates this but is not guaranteed for very fast batches.
**How to avoid:**
- Keep the 2-second settle sleep (current workaround).
- Increase to 5 seconds for added safety margin.
- The orchestrator already has `onFailure` to mark job as failed, so worst case is timeout + clear error to user.
**Warning signs:** Small batch jobs (1-3 orders) timing out despite the robot completing successfully.

### Pitfall 2: Duplicate batch_completed Events
**What goes wrong:** Two concurrent callback requests both check `status === 'completed'` and both emit the `batch_completed` Inngest event.
**Why it happens:** The current code reads job status AFTER domain update, but two callbacks racing can both see `completed` status.
**How to avoid:** Use a `batch_completed_emitted` boolean column with an atomic `UPDATE ... WHERE batch_completed_emitted = false` guard. Only the first callback to flip the flag emits the event.
**Warning signs:** Inngest function completes twice or logs duplicate completion events.

### Pitfall 3: Counter Race Condition (P0)
**What goes wrong:** Two concurrent callbacks read `success_count = 5`, both compute `5 + 1 = 6`, both write `6`. Final count is 6 instead of 7. Job never reaches `total_items`, never completes.
**Why it happens:** The read-then-write pattern in `updateJobItemResult` (robot-jobs.ts:324-357) is not atomic.
**How to avoid:** Use the `increment_robot_job_counter` RPC function that does `SET count = count + 1` in a single SQL statement.
**Warning signs:** Jobs stuck in `processing` state with `success_count + error_count < total_items` even though all items have terminal status.

### Pitfall 4: Orphaned Jobs from Inngest Send Failure
**What goes wrong:** `inngest.send()` throws (network issue, Inngest down), but the job was already created in the database. It sits in `pending` forever.
**Why it happens:** No try-catch around `inngest.send()` in `comandos.ts`. The outer try-catch returns a generic error but doesn't clean up the job.
**How to avoid:** Wrap `inngest.send()` in its own try-catch. On failure, call `updateJobStatus(ctx, { jobId, status: 'failed' })` before returning error.
**Warning signs:** Jobs in `pending` status with no corresponding Inngest function run.

### Pitfall 5: Fetch Timeout Absence
**What goes wrong:** Robot service hangs (browser automation stuck), the orchestrator fetch call waits indefinitely (Node.js fetch default: no timeout), consuming Inngest execution time.
**Why it happens:** No `signal` parameter on fetch calls in robot-orchestrator.ts.
**How to avoid:** Add `signal: AbortSignal.timeout(timeoutMs)` with formula: `orders.length * 60_000 + 10 * 60_000`.
**Warning signs:** Inngest function execution time is extremely long (> 30 minutes) for normal batch sizes.

### Pitfall 6: Callback inngest.send Failure Silently Swallowed
**What goes wrong:** The callback webhook sends `batch_completed` event but `inngest.send()` throws. The catch block (robot-callback:203-205) only logs the error and returns 200 OK. The orchestrator then waits until timeout.
**Why it happens:** Current code catches the error but doesn't re-throw or return an error status.
**How to avoid:** Return 500 status on inngest.send failure so the robot service can retry the callback.
**Warning signs:** Orchestrator times out even though all items were processed.

### Pitfall 7: executeLeerGuias Bypassing Domain Layer
**What goes wrong:** `executeLeerGuias` (comandos.ts:503-537) inserts directly into `robot_jobs` and `robot_job_items` using raw Supabase queries instead of calling `createRobotJob()`.
**Why it happens:** OCR jobs have `order_id = NULL` which the original `createRobotJob()` doesn't support (it requires orderIds).
**How to avoid:** Extend `createRobotJob()` to accept items without order IDs (or create a `createOcrRobotJob()` variant), then refactor `executeLeerGuias` to use it.
**Warning signs:** Inconsistent job creation patterns, potential workspace_id validation gaps.

### Pitfall 8: Active Job Check Race Condition
**What goes wrong:** Two simultaneous command submissions both check `getActiveJob()` and both get `null` (no active job), then both create jobs. Now two concurrent jobs for the same type.
**Why it happens:** Check-then-act pattern is not atomic.
**How to avoid:** Handle this gracefully -- if a second job creation fails due to the check, return a clear error. The DB UNIQUE constraint on `(workspace_id, idempotency_key)` provides a safety net if idempotency keys are used.
**Warning signs:** Two concurrent jobs of the same type running simultaneously.

## Code Examples

### Example 1: Complete Atomic Counter RPC Function
```sql
-- Source: Supabase RPC docs + PostgreSQL RETURNING clause
CREATE OR REPLACE FUNCTION increment_robot_job_counter(
  p_job_id UUID,
  p_is_success BOOLEAN
)
RETURNS TABLE(
  new_success_count INTEGER,
  new_error_count INTEGER,
  total_items INTEGER,
  is_now_complete BOOLEAN
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_success INTEGER;
  v_error INTEGER;
  v_total INTEGER;
  v_complete BOOLEAN;
BEGIN
  UPDATE robot_jobs
  SET
    success_count = CASE WHEN p_is_success THEN success_count + 1 ELSE success_count END,
    error_count = CASE WHEN NOT p_is_success THEN error_count + 1 ELSE error_count END
  WHERE id = p_job_id
  RETURNING robot_jobs.success_count, robot_jobs.error_count, robot_jobs.total_items
  INTO v_success, v_error, v_total;

  v_complete := (v_success + v_error) >= v_total;

  IF v_complete THEN
    UPDATE robot_jobs
    SET status = 'completed',
        completed_at = timezone('America/Bogota', NOW())
    WHERE id = p_job_id
      AND status NOT IN ('completed', 'failed');
  END IF;

  RETURN QUERY SELECT v_success, v_error, v_total, v_complete;
END;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION increment_robot_job_counter(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_robot_job_counter(UUID, BOOLEAN) TO service_role;
```

### Example 2: Updated updateJobItemResult Counter Section
```typescript
// Replace lines 324-357 in robot-jobs.ts
// OLD: read-then-write race condition
// NEW: atomic RPC call
const { data: counterResult, error: rpcError } = await supabase
  .rpc('increment_robot_job_counter', {
    p_job_id: item.job_id,
    p_is_success: params.status === 'success',
  })
  .single()

if (rpcError) {
  console.error(`[robot-jobs] Counter increment failed for job ${item.job_id}:`, rpcError.message)
  return { success: false, error: `Error actualizando contadores: ${rpcError.message}` }
}
// counterResult.is_now_complete indicates if job just completed
```

### Example 3: Inngest Send with Cleanup
```typescript
// Pattern for all inngest.send() calls in comandos.ts
try {
  await (inngest.send as any)({
    name: 'robot/job.submitted',
    data: {
      jobId: jobResult.data.jobId,
      workspaceId: ctx.workspaceId,
      // ... rest of payload
    },
  })
} catch (sendError) {
  console.error(`[comandos] Inngest send failed for job ${jobResult.data.jobId}:`, sendError)
  // Clean up: mark job as failed so it doesn't linger
  try {
    await updateJobStatus(ctx, { jobId: jobResult.data.jobId, status: 'failed' })
  } catch (cleanupError) {
    console.error(`[comandos] Job cleanup also failed:`, cleanupError)
  }
  return {
    success: false,
    error: 'Error iniciando el procesamiento. El job fue cancelado. Intente nuevamente.',
  }
}
```

### Example 4: Fetch with AbortSignal.timeout()
```typescript
// Source: MDN AbortSignal.timeout()
// In robot-orchestrator.ts dispatch-to-robot step
const fetchTimeoutMs = (orders.length * 60_000) + (10 * 60_000)

const response = await fetch(`${robotUrl}/api/crear-pedidos-batch`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Callback-Secret': callbackSecret,
  },
  body: JSON.stringify({ /* payload */ }),
  signal: AbortSignal.timeout(fetchTimeoutMs),
})
```

### Example 5: Idempotent batch_completed Emission
```typescript
// In robot-callback/route.ts, replace section 6
// Use atomic UPDATE with flag guard
const { data: emitGuard } = await supabase
  .from('robot_jobs')
  .update({ batch_completed_emitted: true })
  .eq('id', item.job_id)
  .eq('status', 'completed')
  .eq('batch_completed_emitted', false)
  .select('id, success_count, error_count')
  .maybeSingle()

if (emitGuard) {
  // This callback won the race - emit event
  try {
    await (inngest.send as any)({
      name: 'robot/job.batch_completed',
      data: {
        jobId: item.job_id,
        workspaceId,
        successCount: emitGuard.success_count,
        errorCount: emitGuard.error_count,
      },
    })
  } catch (err) {
    console.error(`[robot-callback] Failed to emit batch_completed:`, err)
    // Return 500 so robot service retries
    return NextResponse.json({ error: 'Failed to notify orchestrator' }, { status: 500 })
  }
}
```

### Example 6: Safe Access Fix for buscarGuias
```typescript
// OLD (comandos.ts:375-382): Non-null assertion crash
pedidoNumbers: orders.map(order => {
  const item = jobResult.data!.items.find(i => i.orderId === order.id)!  // CRASH if not found
  return {
    itemId: item.itemId,
    orderId: order.id,
    pedidoNumber: order.tracking_number,  // Could be null
  }
})

// NEW: Safe access with filter
pedidoNumbers: orders
  .map(order => {
    const item = jobResult.data?.items.find(i => i.orderId === order.id)
    if (!item || !order.tracking_number) return null
    return {
      itemId: item.itemId,
      orderId: order.id,
      pedidoNumber: order.tracking_number,
    }
  })
  .filter((p): p is NonNullable<typeof p> => p !== null)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `AbortController` + `setTimeout` | `AbortSignal.timeout(ms)` | Node.js 18+ | Cleaner API, auto-cleanup |
| Read-then-write counters | Supabase `.rpc()` with SQL atomic increment | Always available | Eliminates race condition |
| Manual settle sleep for event timing | Still sleep (Inngest #1433 open) | N/A | No better solution available yet |

**Deprecated/outdated:**
- Manual `AbortController` + `setTimeout` + `clearTimeout` pattern: Use `AbortSignal.timeout()` instead (Node.js 18+, available in this project's runtime).

## Open Questions

1. **Inngest waitForEvent lookback feature**
   - What we know: Inngest has an open issue (#1433) confirming events before `waitForEvent` are not buffered. They plan a "lookback" feature but it requires a new event database not yet built.
   - What's unclear: Timeline for the fix. The 2-5 second settle sleep is a workaround, not a guarantee.
   - Recommendation: Increase settle sleep from 2s to 5s. Keep `onFailure` handler for timeout marking. Accept that very fast batches may occasionally timeout (the user can recheck status).

2. **Rate limiting on robot-callback webhook**
   - What we know: No rate limiting exists currently. The robot service is the only caller but the endpoint is public (authenticated by shared secret only).
   - What's unclear: Whether Vercel or Inngest provide any built-in rate limiting for this endpoint.
   - Recommendation: Add basic rate limiting via IP check (robot service IP) or just rely on the shared secret + payload validation. Defer advanced rate limiting to a future phase.

3. **Realtime disconnect detection**
   - What we know: The `useRobotJobProgress` hook subscribes to Supabase Realtime but the `.subscribe()` callback only logs errors -- it doesn't expose error state to the UI.
   - What's unclear: How Supabase Realtime handles reconnections internally (auto-reconnect behavior).
   - Recommendation: Expose an `isDisconnected` state from the hook. Show a warning banner in the UI when disconnected.

## Sources

### Primary (HIGH confidence)
- **Codebase analysis** - Direct code review of all 6 key files (robot-jobs.ts, robot-orchestrator.ts, robot-callback/route.ts, comandos.ts, comandos-layout.tsx, use-robot-job-progress.ts)
- **Supabase RPC docs** - https://supabase.com/docs/reference/javascript/rpc - Confirmed `.rpc()` syntax and return format
- **Supabase migration files** - `20260222000003_robot_jobs.sql`, `20260223000000_ocr_nullable_order_id.sql`, `20260222000005_guide_lookup_columns.sql` - Current schema verified
- **MDN AbortSignal.timeout()** - https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static - Confirmed availability and usage pattern

### Secondary (MEDIUM confidence)
- **Inngest waitForEvent docs** - https://www.inngest.com/docs/reference/functions/step-wait-for-event - API reference confirmed but silent on early event buffering
- **Inngest Issue #1433** - https://github.com/inngest/inngest/issues/1433 - Confirmed race condition is known, no fix available yet (Jan 2025 maintainer comment)
- **Inngest Discussion #986** - https://github.com/orgs/inngest/discussions/986 - Unanswered question about early event resolution

### Tertiary (LOW confidence)
- **Supabase Realtime auto-reconnect behavior** - Not verified in official docs. Assumed based on general WebSocket library patterns.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All tools already in project, no new dependencies
- Architecture patterns: HIGH - Atomic SQL increment is well-established PostgreSQL pattern, verified with Supabase RPC docs
- Pitfalls: HIGH - All 18 bugs confirmed by direct code review, race conditions verified against PostgreSQL concurrency model
- Inngest waitForEvent workaround: MEDIUM - Known open issue, settle sleep is best available option but not guaranteed

**Research date:** 2026-02-24
**Valid until:** 2026-03-24 (stable patterns, no library upgrades needed)

## Bug-to-Fix Mapping Summary

For the planner's convenience, here is the full list of bugs with their recommended fix patterns:

| # | Priority | Bug | Fix Pattern | Files Changed |
|---|----------|-----|-------------|---------------|
| 1 | P0 | Counter race condition | RPC atomic increment | migration + robot-jobs.ts |
| 2 | P0 | Orphaned jobs on inngest.send failure | Try-catch + cleanup | comandos.ts (6 actions) |
| 3 | P0 | retries:0 with poor error reporting | Improve onFailure + error message to chat | robot-orchestrator.ts |
| 4 | P0 | waitForEvent race condition | Increase settle to 5s | robot-orchestrator.ts |
| 5 | P1 | Duplicate batch_completed events | batch_completed_emitted flag | migration + robot-callback |
| 6 | P1 | Inngest emit failure silenced in callback | Return 500 on failure | robot-callback |
| 7 | P1 | Non-null assertion crash buscarGuias | Safe access + filter | comandos.ts |
| 8 | P1 | Active job check race condition | Graceful handling (informational) | comandos.ts |
| 9 | P1 | No fetch timeout to robot service | AbortSignal.timeout() | robot-orchestrator.ts |
| 10 | P1 | executeLeerGuias bypasses domain | Refactor to use domain function | comandos.ts + robot-jobs.ts |
| 11 | P2 | No Realtime disconnect detection | Expose error state from hook | use-robot-job-progress.ts + UI |
| 12 | P2 | Timeout calculation needs margin | 60s/order + 10min margin | robot-orchestrator.ts |
| 13 | P2 | Idempotency doesn't cover order updates | Handle mid-way item failures | robot-jobs.ts |
| 14 | P2 | Callback payload validation missing | Strict field + UUID validation | robot-callback |
| 15 | P2 | No rate limiting on webhook | Basic shared-secret-only (defer advanced) | robot-callback |
| 16 | P2 | No cleanup for old jobs | DEFERRED (out of scope) | -- |
| 17 | P2 | Async race in document URL | Fix state order in completion effect | comandos-layout.tsx |
| 18 | P2 | No tracking number format validation | Basic format check | robot-callback |
